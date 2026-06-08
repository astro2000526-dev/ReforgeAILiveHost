"""Live render orchestration (/render path).

Stream-only / demo path: produce an N-second mp4. mode="ai" runs the full
TTS → voice-clone → lip-sync chain; otherwise we loop/trim the template (or a
test pattern). GPU work goes through app/gpu only; ffmpeg through app/media.
Progress is published into state.render_jobs with the SAME pct bands as
before the layer split (web pollers depend on them).
"""
import asyncio
import logging
import subprocess
from pathlib import Path

import httpx

from .. import state
from ..config import FFMPEG_BIN, OUTPUT_DIR, PUBLIC_BASE_URL
from ..gpu import get_gpu
from ..media import (
    apply_speed_sync,
    lipsync_max_edge,
    local_path_for,
    loudnorm_af,
    run_ffmpeg_progress,
    scale_vf,
)
from ..schemas import RenderRequest
from . import tts_service

log = logging.getLogger("pipeline.render")


async def resolve_template(url: str | None) -> tuple[str | None, str | None]:
    """Return (ffmpeg_input, error). Prefers a local path; else HEAD-checks http."""
    if not url:
        return None, "no template video URL on this avatar"
    local = local_path_for(url)
    if local:
        return local, None
    if not url.startswith(("http://", "https://")):
        return None, f"template URL is not http(s): {url}"
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=8) as c:
            r = await c.head(url)
            if r.status_code >= 400:
                return None, f"template video returned HTTP {r.status_code}: {url}"
            return url, None
    except Exception as e:
        return None, f"template video unreachable ({type(e).__name__}): {url}"


def _run_ffmpeg_progress(cmd: list[str], dur: int, pid: str, source: str) -> subprocess.CompletedProcess:
    """Run ffmpeg with -progress and publish % into state.render_jobs."""
    state.render_jobs[pid] = {"status": "rendering", "pct": 0, "duration": dur, "source": source}

    def _on_pct(pct: int) -> None:
        state.render_jobs[pid]["pct"] = pct

    proc = run_ffmpeg_progress(cmd, dur, _on_pct)
    rc = proc.returncode
    state.render_jobs[pid] = {**state.render_jobs[pid], "status": "done" if rc == 0 else "failed",
                              "pct": 100 if rc == 0 else state.render_jobs[pid].get("pct", 0)}
    return proc


async def render_ai(req: RenderRequest, out_path: Path) -> list[str]:
    """AI lip-sync path: script → TTS → lipsync service → mp4 at out_path.
    Returns a list of non-fatal warnings. Raises on hard failure so the caller
    can fall back to the loop/testpattern path."""
    warnings: list[str] = []
    pid = req.project_id
    state.render_jobs[pid] = {"status": "rendering", "pct": 5, "duration": req.duration_seconds, "source": "ai-tts"}

    if not req.script_text or not req.script_text.strip():
        raise RuntimeError("ai mode requires script_text")
    if not req.avatar_image_url:
        raise RuntimeError("ai mode requires avatar_image_url")
    if not req.lipsync_url:
        raise RuntimeError("ai mode requires lipsync_url")

    # 1) TTS → audio, then trim to the requested duration so we don't lip-sync
    #    a 3-minute script into a huge frame array (mock OOMs, musetalk slow).
    raw_audio = OUTPUT_DIR / f".{pid}.tts.raw"
    await tts_service.tts_to_file(req.script_text.strip(), req.voice, req.rate, raw_audio,
                                  azure_key=req.azure_key, azure_region=req.azure_region,
                                  sovits=(req.tts_engine == "sovits"),
                                  pitch=req.tts_pitch, emotion=req.tts_emotion)
    audio_path = OUTPUT_DIR / f".{pid}.tts.wav"
    dur_cap = max(1, min(int(req.duration_seconds or 15), 1800))  # AI clips: cap 30 min
    trim = await asyncio.to_thread(
        subprocess.run,
        [FFMPEG_BIN, "-y", "-i", str(raw_audio), "-t", str(dur_cap),
         "-af", loudnorm_af(req.sound_mode),
         "-ar", "16000", "-ac", "1", str(audio_path)],
        capture_output=True, text=True,
    )
    raw_audio.unlink(missing_ok=True)
    if trim.returncode != 0 or not audio_path.exists():
        raise RuntimeError(f"audio trim failed: {(trim.stderr or '')[-200:]}")

    # 1b) Voice clone (optional): convert TTS timbre → the avatar's own voice,
    #     using a reference clip extracted from the avatar video. Best-effort —
    #     on any failure we keep the plain TTS audio.
    if req.voice_clone and req.avatar_image_url:
        state.render_jobs[pid] = {**state.render_jobs[pid], "pct": 20, "source": "ai-clone"}
        try:
            ref_wav = OUTPUT_DIR / f".{pid}.ref.wav"
            if await tts_service.extract_ref_audio(req.avatar_image_url, ref_wav, seconds=10):
                cloned = OUTPUT_DIR / f".{pid}.clone.wav"
                await get_gpu().voice_clone(src_wav=audio_path, ref_wav=ref_wav, out_wav=cloned)
                # resample clone back to 16k mono for lip-sync
                trim2 = await asyncio.to_thread(
                    subprocess.run,
                    [FFMPEG_BIN, "-y", "-i", str(cloned),
                     "-af", loudnorm_af(req.sound_mode),
                     "-ar", "16000", "-ac", "1", str(audio_path)],
                    capture_output=True, text=True,
                )
                ref_wav.unlink(missing_ok=True)
                cloned.unlink(missing_ok=True)
                if trim2.returncode == 0:
                    log.info("voice clone applied for %s", pid)
                else:
                    warnings.append("voice clone resample failed, used plain TTS")
            else:
                warnings.append("could not extract reference audio for voice clone")
        except Exception as e:
            warnings.append(f"voice clone failed ({type(e).__name__}), used plain TTS")
            log.warning("voice clone failed for %s: %s", pid, e)

    state.render_jobs[pid] = {**state.render_jobs[pid], "pct": 35, "source": "ai-lipsync"}

    # 2) lip-sync via the GPU boundary (HTTP service; URL precedence handled there).
    raw = OUTPUT_DIR / f".{pid}.lipsync.mp4"
    await get_gpu().lipsync(
        avatar_url=req.avatar_image_url,
        audio_path=audio_path,
        out_path=raw,
        max_edge=lipsync_max_edge(req.video_quality or "1080p"),
        lip_blend=int(req.lip_blend if req.lip_blend is not None else 30),
        model=req.lipsync_model or None,
        lipsync_url=req.lipsync_url,
    )
    state.render_jobs[pid] = {**state.render_jobs[pid], "pct": 80, "source": "ai-encode"}

    # 3) normalize for streaming (faststart, quality-capped) → out_path
    cmd = [
        FFMPEG_BIN, "-y", "-i", str(raw),
        "-vf", scale_vf(req.video_quality),
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "96k", "-ar", "44100", "-movflags", "+faststart",
        str(out_path),
    ]
    proc = await asyncio.to_thread(subprocess.run, cmd, capture_output=True, text=True)
    audio_path.unlink(missing_ok=True)
    raw.unlink(missing_ok=True)
    if proc.returncode != 0:
        raise RuntimeError(f"ai encode failed: {(proc.stderr or '')[-300:]}")
    # NOTE: do NOT set status=done here — do_render finalizes (speed + url).
    # Setting done prematurely makes the poller catch a done state with no url.
    state.render_jobs[pid] = {**state.render_jobs[pid], "pct": 95, "source": "ai-finalize"}
    return warnings


async def apply_composite_stage(req: RenderRequest, out_path: Path) -> list[str]:
    """Per-avatar background / camera zoom / frame layout (GPU boundary).
    Best-effort: on any failure the un-composited clip is kept and a warning
    returned, so the render never dies on a missing rembg dep or a bad bg URL."""
    zoom = float(req.camera_zoom or 1.0)
    fscale = float(req.frame_scale or 1.0)
    fpos = (req.frame_position or "center").lower()
    needs_layout = fscale < 0.995 or fpos != "center"
    if not req.bg_remove and zoom < 1.01 and not needs_layout:
        return []
    pid = req.project_id
    base = state.render_jobs.get(pid, {})
    state.render_jobs[pid] = {**base, "status": "rendering",
                              "pct": min(96, int(base.get("pct") or 90)), "source": "composite"}

    def _pct(p: int):
        cur = state.render_jobs.get(pid, {})
        state.render_jobs[pid] = {**cur, "pct": 90 + int(p * 0.09)}  # 90..99 band

    try:
        return await get_gpu().matte_composite(
            video_path=out_path,
            bg_remove=bool(req.bg_remove),
            background_url=req.background_url,
            background_type=req.background_type,
            camera_zoom=zoom,
            frame_position=fpos,
            frame_scale=fscale,
            progress=_pct,
        )
    except Exception as e:
        log.warning("composite failed for %s: %s", pid, e)
        return [f"background composite failed ({type(e).__name__}): {str(e)[:160]} — kept original"]


async def do_render(req: RenderRequest) -> None:
    """Run the full render (ai → fallback loop/testpattern) and record the
    final result in state.render_jobs[pid]. Long-running → called as a
    background task so the HTTP request returns immediately (avoids nginx 504)."""
    pid = req.project_id
    errors: list[str] = []
    dur = max(1, min(int(req.duration_seconds or 30), 3600))
    # Versioned output: each render keeps its own file (output_name = generation
    # id) so old versions aren't overwritten and can be listed.
    name = req.output_name or pid
    out_path = OUTPUT_DIR / f"{name}.mp4"
    output_url = f"{PUBLIC_BASE_URL}/files/{name}.mp4" if PUBLIC_BASE_URL else None
    state.render_cancel.discard(pid)  # fresh start

    def _cancelled():
        return pid in state.render_cancel

    try:
        # AI lip-sync path first (falls through to loop on any failure).
        if req.mode == "ai":
            try:
                warns = await render_ai(req, out_path)
                if _cancelled():
                    state.render_jobs[pid] = {"status": "cancelled", "pct": 0}
                    return
                warns += await apply_composite_stage(req, out_path)
                await asyncio.to_thread(apply_speed_sync, out_path, req.playback_speed)
                state.render_jobs[pid] = {"status": "done", "pct": 100, "source": "ai",
                                          "output_url": output_url, "errors": warns}
                return
            except Exception as e:
                errors.append(f"AI render failed, fell back to loop: {type(e).__name__}: {str(e)[:200]}")
                log.warning("AI render failed for %s: %s", pid, e)

        template_input, err = await resolve_template(req.template_url)
        if err:
            errors.append(err)

        _ENCODE = [
            "-vf", "scale='min(1080,iw)':'min(1920,ih)':force_original_aspect_ratio=decrease:flags=lanczos,"
                   "scale=trunc(iw/2)*2:trunc(ih/2)*2",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-pix_fmt", "yuv420p",
            "-maxrate", "4000k", "-bufsize", "8000k",
            "-force_key_frames", "expr:gte(t,n_forced*2)",
            "-c:a", "aac", "-b:a", "96k", "-ar", "44100", "-movflags", "+faststart",
        ]
        if template_input:
            source = "template"
            cmd = [FFMPEG_BIN, "-y", "-stream_loop", "-1", "-i", template_input, "-t", str(dur), *_ENCODE, "-shortest", str(out_path)]
        else:
            source = "testpattern"
            cmd = [FFMPEG_BIN, "-y",
                   "-f", "lavfi", "-i", f"testsrc2=size=720x1280:rate=25:duration={dur}",
                   "-f", "lavfi", "-i", f"anullsrc=channel_layout=stereo:sample_rate=44100:duration={dur}",
                   "-t", str(dur), *_ENCODE, "-shortest", str(out_path)]

        log.info("render project=%s dur=%ss source=%s", pid, dur, source)
        proc = await asyncio.to_thread(_run_ffmpeg_progress, cmd, dur, pid, source)
        if proc.returncode != 0:
            state.render_jobs[pid] = {"status": "failed", "pct": 0, "source": source,
                                      "errors": errors + [f"ffmpeg failed: {proc.stderr[-300:]}"]}
            return
        errors += await apply_composite_stage(req, out_path)
        await asyncio.to_thread(apply_speed_sync, out_path, req.playback_speed)
        state.render_jobs[pid] = {"status": "done", "pct": 100, "source": source,
                                  "output_url": output_url, "errors": errors}
    except Exception as e:
        state.render_jobs[pid] = {"status": "failed", "pct": 0, "errors": errors + [f"{type(e).__name__}: {str(e)[:200]}"]}
        log.exception("render failed for %s", pid)
