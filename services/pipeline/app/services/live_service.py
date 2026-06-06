"""24/7 live streamer — look-ahead segment pre-rendering + gapless RTMP emit.

Design (the "natural feel" loop):

    script text ──┐
                  ▼
    ┌──────────── renderer (async task) ────────────┐
    │ while buffered < LOOKAHEAD (~30s) and queue:  │
    │   text → TTS → lip-sync (gpu) → seg_NNN.ts    │
    └──────────────────┬────────────────────────────┘
                       ▼  deque[(path, dur)]
    ┌──────────── feeder (thread) ──────────────────┐
    │ pops segments → appends raw MPEG-TS bytes     │
    │ into a fifo; when starved, replays filler.ts  │
    └──────────────────┬────────────────────────────┘
                       ▼  named pipe
    ┌──────────── emitter (ffmpeg Popen) ───────────┐
    │ -re -f mpegts -i fifo -c copy -f flv rtmp://  │
    └───────────────────────────────────────────────┘

All segments are encoded with IDENTICAL codec params + canvas, so raw TS
concatenation is gapless and the emitter never re-encodes (cheap, stable).
The feeder never starves the emitter: with an empty queue it replays the
session's filler segment (template loop, silent) until new text arrives.

Feed new text any time via POST /live/feed — this is the hook the Qwen
continuous-script loop (web side) calls to keep a stream going 24/7.
"""
from __future__ import annotations

import asyncio
import logging
import os
import shutil
import subprocess
import threading
import time
from collections import deque
from dataclasses import dataclass, field
from pathlib import Path

from ..config import FFMPEG_BIN, TMP_DIR
from ..gpu import get_gpu
from ..media import lipsync_max_edge, local_path_for, loudnorm_af, probe_duration, probe_stream
from . import tts_service

log = logging.getLogger("pipeline.live")

LOOKAHEAD_SECONDS = float(os.getenv("LIVE_LOOKAHEAD_SECONDS", "30"))
# Canvas per quality (portrait-first; landscape inputs get letterboxed).
_CANVAS = {"1080p": (1080, 1920), "720p": (720, 1280), "480p": (480, 854)}


@dataclass
class LiveSession:
    session_id: str
    rtmp_url: str
    stream_key: str
    voice: str
    rate: str
    avatar_image_url: str | None
    template_url: str | None
    lipsync_url: str | None
    lipsync_model: str | None
    video_quality: str
    sound_mode: str
    lip_blend: int
    azure_key: str | None
    azure_region: str | None
    tts_engine: str | None
    tts_pitch: float
    tts_emotion: str | None
    work: Path
    canvas: tuple[int, int] = (720, 1280)
    queue: deque = field(default_factory=deque)      # pending text chunks
    segments: deque = field(default_factory=deque)   # (path, dur) rendered, unfed
    buffered: float = 0.0                            # seconds rendered but not yet fed
    rendered_count: int = 0
    fed_count: int = 0
    filler_fed: int = 0
    state: str = "starting"   # starting | live | stopping | stopped | failed
    error: str | None = None
    emitter: subprocess.Popen | None = None
    feeder: threading.Thread | None = None
    renderer: asyncio.Task | None = None
    filler: Path | None = None
    filler_dur: float = 0.0
    stop_flag: bool = False
    lock: threading.Lock = field(default_factory=threading.Lock)


_sessions: dict[str, LiveSession] = {}


def _canvas_vf(w: int, h: int) -> str:
    """Scale + letterbox to the exact session canvas (identical dims for every
    segment — required for gapless raw-TS concatenation)."""
    return (f"scale={w}:{h}:force_original_aspect_ratio=decrease,"
            f"pad={w}:{h}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=25")


def _ts_encode_args(w: int, h: int) -> list[str]:
    return [
        "-vf", _canvas_vf(w, h),
        "-c:v", "libx264", "-preset", "veryfast",
        "-b:v", "2500k", "-maxrate", "2500k", "-bufsize", "5000k",
        "-force_key_frames", "expr:gte(t,n_forced*2)",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "2",
        "-f", "mpegts",
    ]


def _run(cmd: list[str], what: str) -> None:
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"{what} failed: {(r.stderr or '')[-300:]}")


async def _render_segment(s: LiveSession, text: str, idx: int) -> Path:
    """text → TTS → presenter video → normalized .ts segment."""
    seg_dir = s.work / "segs"
    seg_dir.mkdir(exist_ok=True)
    raw_audio = seg_dir / f".{idx:06d}.raw"
    wav = seg_dir / f".{idx:06d}.wav"
    mp4 = seg_dir / f".{idx:06d}.mp4"
    ts = seg_dir / f"{idx:06d}.ts"

    # 1) TTS (same chain as renders; sovits-first when enabled)
    await tts_service.tts_to_file(
        text.strip(), s.voice, s.rate, raw_audio,
        azure_key=s.azure_key, azure_region=s.azure_region,
        sovits=(s.tts_engine == "sovits"), pitch=s.tts_pitch, emotion=s.tts_emotion,
    )
    await asyncio.to_thread(_run, [
        FFMPEG_BIN, "-y", "-i", str(raw_audio),
        "-af", loudnorm_af(s.sound_mode), "-ar", "16000", "-ac", "1", str(wav),
    ], "live tts normalize")
    raw_audio.unlink(missing_ok=True)

    # 2) presenter video for this chunk
    if s.lipsync_url and s.avatar_image_url:
        await get_gpu().lipsync(
            avatar_url=s.avatar_image_url, audio_path=wav, out_path=mp4,
            max_edge=lipsync_max_edge(s.video_quality), lip_blend=s.lip_blend,
            model=s.lipsync_model, lipsync_url=s.lipsync_url,
        )
    else:
        template = local_path_for(s.template_url) or s.template_url
        done = False
        if template:
            # No lip-sync available: loop the template under the TTS audio.
            try:
                await asyncio.to_thread(_run, [
                    FFMPEG_BIN, "-y", "-stream_loop", "-1", "-i", str(template),
                    "-i", str(wav), "-map", "0:v:0", "-map", "1:a:0",
                    "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
                    "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", str(mp4),
                ], "live template mux")
                done = True
            except Exception as e:
                log.warning("live %s: template mux failed (%s) — test pattern", s.session_id, e)
        if not done:
            dur = max(1.0, probe_duration(wav))
            await asyncio.to_thread(_run, [
                FFMPEG_BIN, "-y",
                "-f", "lavfi", "-i", f"testsrc2=size={s.canvas[0]}x{s.canvas[1]}:rate=25:duration={dur:.2f}",
                "-i", str(wav), "-map", "0:v:0", "-map", "1:a:0",
                "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
                "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", str(mp4),
            ], "live testpattern mux")
    wav.unlink(missing_ok=True)

    # 3) normalize to the session canvas as MPEG-TS (gapless concat unit)
    await asyncio.to_thread(_run, [
        FFMPEG_BIN, "-y", "-i", str(mp4), *_ts_encode_args(*s.canvas), str(ts),
    ], "live ts encode")
    mp4.unlink(missing_ok=True)
    return ts


async def _render_filler(s: LiveSession) -> None:
    """Idle segment replayed when the text queue runs dry (silent template loop).
    MUST always succeed — a dead filler would kill the whole stream, so an
    unreachable/broken template falls back to a test pattern."""
    out = s.work / "filler.ts"

    async def _encode(src: list[str]) -> None:
        await asyncio.to_thread(_run, [
            FFMPEG_BIN, "-y", *src,
            "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
            "-map", "0:v:0", "-map", "1:a:0", "-t", "8",
            *_ts_encode_args(*s.canvas), str(out),
        ], "live filler")

    template = local_path_for(s.template_url) or s.template_url
    if template:
        try:
            await _encode(["-stream_loop", "-1", "-i", str(template), "-t", "8"])
        except Exception as e:
            log.warning("live %s: filler template failed (%s) — using test pattern", s.session_id, e)
            template = None
    if not template:
        await _encode(["-f", "lavfi", "-i", f"testsrc2=size={s.canvas[0]}x{s.canvas[1]}:rate=25:duration=8"])
    s.filler = out
    s.filler_dur = probe_duration(out) or 8.0


async def _renderer_loop(s: LiveSession) -> None:
    idx = 0
    try:
        await _render_filler(s)
        s.state = "live"
        while not s.stop_flag:
            if s.buffered < LOOKAHEAD_SECONDS and s.queue:
                text = s.queue.popleft()
                try:
                    seg = await _render_segment(s, text, idx)
                except Exception as e:
                    # One bad chunk must not kill the stream — log and move on.
                    log.warning("live %s: segment %d failed: %s", s.session_id, idx, e)
                    s.error = f"segment {idx} failed: {type(e).__name__}: {str(e)[:160]}"
                    idx += 1
                    continue
                dur = probe_duration(seg)
                with s.lock:
                    s.segments.append((seg, dur))
                    s.buffered += dur
                s.rendered_count += 1
                idx += 1
            else:
                await asyncio.sleep(0.5)
    except asyncio.CancelledError:
        pass
    except Exception as e:
        log.exception("live %s: renderer died", s.session_id)
        s.error = f"renderer: {type(e).__name__}: {str(e)[:160]}"
        s.state = "failed"


def _feeder_loop(s: LiveSession, fifo: Path) -> None:
    """Thread: append TS bytes into the fifo; replay filler when starved."""
    try:
        with open(fifo, "wb") as f:  # blocks until the emitter opens the read end
            while not s.stop_flag:
                item: tuple[Path, float] | None = None
                with s.lock:
                    if s.segments:
                        item = s.segments.popleft()
                if item is None:
                    if s.filler is not None:
                        f.write(s.filler.read_bytes())
                        f.flush()
                        s.filler_fed += 1
                        continue
                    time.sleep(0.2)
                    continue
                path, dur = item
                f.write(path.read_bytes())
                f.flush()
                with s.lock:
                    s.buffered = max(0.0, s.buffered - dur)
                s.fed_count += 1
                path.unlink(missing_ok=True)
    except BrokenPipeError:
        if not s.stop_flag:
            s.error = "emitter closed the pipe (RTMP push died)"
            s.state = "failed"
    except Exception as e:
        if not s.stop_flag:
            s.error = f"feeder: {type(e).__name__}: {str(e)[:160]}"
            s.state = "failed"


def _start_emitter(s: LiveSession, fifo: Path) -> subprocess.Popen:
    target = f"{s.rtmp_url.rstrip('/')}/{s.stream_key}" if s.stream_key else s.rtmp_url
    cmd = [
        FFMPEG_BIN, "-re", "-fflags", "+genpts+igndts",
        "-f", "mpegts", "-i", str(fifo),
        "-c", "copy", "-f", "flv", target,
    ]
    err = (s.work / "emitter.log").open("wb")
    return subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=err)


async def start_live(
    *, session_id: str, rtmp_url: str, stream_key: str = "",
    script_texts: list[str] | None = None,
    voice: str = "th-TH-PremwadeeNeural", rate: str = "+0%",
    avatar_image_url: str | None = None, template_url: str | None = None,
    lipsync_url: str | None = None, lipsync_model: str | None = None,
    video_quality: str = "720p", sound_mode: str = "normal", lip_blend: int = 30,
    azure_key: str | None = None, azure_region: str | None = None,
    tts_engine: str | None = None, tts_pitch: float = 0.0, tts_emotion: str | None = None,
) -> dict:
    if session_id in _sessions and _sessions[session_id].state in ("starting", "live"):
        raise RuntimeError(f"live session {session_id} already running")

    work = TMP_DIR / "live" / session_id
    shutil.rmtree(work, ignore_errors=True)
    work.mkdir(parents=True, exist_ok=True)

    s = LiveSession(
        session_id=session_id, rtmp_url=rtmp_url, stream_key=stream_key,
        voice=voice, rate=rate, avatar_image_url=avatar_image_url,
        template_url=template_url, lipsync_url=lipsync_url, lipsync_model=lipsync_model,
        video_quality=video_quality, sound_mode=sound_mode, lip_blend=lip_blend,
        azure_key=azure_key, azure_region=azure_region,
        tts_engine=tts_engine, tts_pitch=tts_pitch, tts_emotion=tts_emotion,
        work=work, canvas=_CANVAS.get(video_quality, _CANVAS["720p"]),
    )
    # Landscape templates: keep the template's orientation so we don't letterbox
    # a 16:9 source into a portrait canvas unnecessarily.
    template = local_path_for(template_url) or template_url
    if template and str(template).startswith("/"):
        tw = int(probe_stream(Path(template), "width") or 0)
        th = int(probe_stream(Path(template), "height") or 0)
        if tw > th > 0:
            s.canvas = (s.canvas[1], s.canvas[0])

    s.queue.extend([t for t in (script_texts or []) if (t or "").strip()])

    fifo = work / "stream.fifo"
    os.mkfifo(fifo)
    s.emitter = _start_emitter(s, fifo)
    s.feeder = threading.Thread(target=_feeder_loop, args=(s, fifo), daemon=True,
                                name=f"live-feeder-{session_id}")
    s.feeder.start()
    s.renderer = asyncio.create_task(_renderer_loop(s))
    _sessions[session_id] = s
    return live_status(session_id)


def feed_live(session_id: str, texts: list[str]) -> dict:
    s = _sessions.get(session_id)
    if not s or s.state in ("stopped", "failed"):
        raise KeyError(f"no running live session {session_id}")
    s.queue.extend([t for t in texts if (t or "").strip()])
    return live_status(session_id)


def live_status(session_id: str) -> dict:
    s = _sessions.get(session_id)
    if not s:
        raise KeyError(f"unknown live session {session_id}")
    emitter_alive = s.emitter is not None and s.emitter.poll() is None
    if s.state == "live" and not emitter_alive and not s.stop_flag:
        s.state = "failed"
        s.error = s.error or f"emitter exited rc={s.emitter.returncode if s.emitter else '?'}"
    return {
        "session_id": s.session_id,
        "state": s.state,
        "error": s.error,
        "buffered_seconds": round(s.buffered, 1),
        "lookahead_target": LOOKAHEAD_SECONDS,
        "queue_len": len(s.queue),
        "segments_ready": len(s.segments),
        "rendered": s.rendered_count,
        "fed": s.fed_count,
        "filler_fed": s.filler_fed,
        "emitter_alive": emitter_alive,
    }


def list_live() -> list[dict]:
    return [live_status(sid) for sid in list(_sessions)]


async def stop_live(session_id: str) -> dict:
    s = _sessions.get(session_id)
    if not s:
        raise KeyError(f"unknown live session {session_id}")
    s.state = "stopping"
    s.stop_flag = True
    if s.renderer:
        s.renderer.cancel()
    if s.emitter and s.emitter.poll() is None:
        s.emitter.terminate()
        try:
            s.emitter.wait(timeout=5)
        except subprocess.TimeoutExpired:
            s.emitter.kill()
    if s.feeder and s.feeder.is_alive():
        s.feeder.join(timeout=5)
    shutil.rmtree(s.work, ignore_errors=True)
    s.state = "stopped"
    return live_status(session_id)
