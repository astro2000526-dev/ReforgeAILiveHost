"""CPU media layer — every ffmpeg/ffprobe invocation that does NOT need a GPU.

Absorbs the old ffmpeg_ops.py plus the ffmpeg helpers that used to live in
main.py. No torch / no inference here; GPU-class work lives in app/gpu/.
"""
import asyncio
import subprocess
from pathlib import Path
from typing import Callable

from .config import FFMPEG_BIN, FFPROBE_BIN, OUTPUT_DIR, PUBLIC_BASE_URL


class FFmpegError(RuntimeError):
    pass


def _run_sync(args: list[str]) -> None:
    try:
        r = subprocess.run(args, capture_output=True)
    except FileNotFoundError as e:
        # Empty str(e) on Windows; rephrase so the job error message is useful.
        raise FFmpegError(
            f"ffmpeg executable not found: {args[0]!r}. "
            f"Install it (winget install Gyan.FFmpeg) or set FFMPEG_BIN to a full path."
        ) from e
    if r.returncode != 0:
        raise FFmpegError(
            r.stderr.decode("utf-8", errors="replace") or f"ffmpeg exited {r.returncode}"
        )


async def _run(args: list[str]) -> None:
    # We don't use asyncio.create_subprocess_exec because uvicorn on Windows
    # often runs on SelectorEventLoop, which raises NotImplementedError() on
    # any subprocess call. Running subprocess.run in a worker thread sidesteps
    # the entire event-loop-policy mess.
    await asyncio.to_thread(_run_sync, args)


# --- Source resolution --------------------------------------------------------

def local_path_for(url: str | None) -> str | None:
    """If `url` points at our own /files mount, return the local file path so
    ffmpeg reads from disk instead of looping back through http (much faster +
    avoids the nginx proxy timeout)."""
    if not url or not PUBLIC_BASE_URL:
        return None
    prefix = f"{PUBLIC_BASE_URL}/files/"
    if not url.startswith(prefix):
        return None
    rel = url[len(prefix):].split("?", 1)[0]
    p = (OUTPUT_DIR / rel).resolve()
    try:
        if str(p).startswith(str(OUTPUT_DIR.resolve())) and p.is_file():
            return str(p)
    except Exception:
        pass
    return None


def probe_duration(path: Path) -> float:
    """Container duration in seconds (0.0 if unknown)."""
    r = subprocess.run(
        [FFPROBE_BIN, "-v", "error", "-show_entries", "format=duration",
         "-of", "csv=p=0", str(path)],
        capture_output=True, text=True,
    )
    try:
        return float((r.stdout or "").strip().splitlines()[0])
    except Exception:
        return 0.0


def probe_stream(path: Path, entry: str) -> str:
    """First value of an ffprobe stream entry (e.g. 'r_frame_rate'), '' if unknown."""
    r = subprocess.run(
        [FFPROBE_BIN, "-v", "error", "-select_streams", "v:0",
         "-show_entries", f"stream={entry}", "-of", "csv=p=0", str(path)],
        capture_output=True, text=True,
    )
    out = (r.stdout or "").strip()
    return out.splitlines()[0] if out else ""


# --- Filter builders ----------------------------------------------------------

# Cap to Full-HD on the long edge; keep aspect; even dims for H.264.
FIT_FHD = (
    "scale='min(1920,iw)':'min(1920,ih)':force_original_aspect_ratio=decrease,"
    "scale=trunc(iw/2)*2:trunc(ih/2)*2"
)


def scale_vf(quality: str) -> str:
    edge = {"1080p": (1080, 1920), "720p": (720, 1280), "480p": (480, 854)}.get(quality, (1080, 1920))
    return (f"scale='min({edge[0]},iw)':'min({edge[1]},ih)':force_original_aspect_ratio=decrease,"
            "scale=trunc(iw/2)*2:trunc(ih/2)*2")


# Quality-tier H.264 encode settings. CRF drives visual quality (lower = better)
# at ~constant CPU cost, so we drop from the old flat crf=28 (visibly soft on a
# 1080p product clip) to a per-tier crf for a big quality lift with a negligible
# speed hit — the realtime lever is `preset`, NOT crf, and we keep preset fast.
_QUALITY_CRF = {"1080p": 21, "720p": 22, "480p": 24}
_QUALITY_MAXRATE = {"1080p": "6000k", "720p": "3500k", "480p": "1500k"}
_QUALITY_BUFSIZE = {"1080p": "12000k", "720p": "7000k", "480p": "3000k"}


def x264_args(quality: str, *, preset: str = "veryfast",
              audio_bitrate: str = "128k", gop_keyframes: bool = True,
              faststart: bool = True) -> list[str]:
    """Shared libx264 + AAC encode args, tuned per video_quality tier.

    One source of truth for encode quality so every path (AI render, loop
    fallback, speed-sync re-encode) lands on the same crf/maxrate for a tier
    instead of the old scattered crf=28. `preset` stays the realtime knob."""
    q = quality if quality in _QUALITY_CRF else "1080p"
    args = [
        "-c:v", "libx264", "-preset", preset, "-crf", str(_QUALITY_CRF[q]),
        "-maxrate", _QUALITY_MAXRATE[q], "-bufsize", _QUALITY_BUFSIZE[q],
        "-pix_fmt", "yuv420p",
    ]
    if gop_keyframes:
        # Fixed 2s keyframe cadence — RTMP-friendly + clean -stream_loop joins.
        args += ["-force_key_frames", "expr:gte(t,n_forced*2)"]
    args += ["-c:a", "aac", "-b:a", audio_bitrate, "-ar", "44100"]
    if faststart:
        args += ["-movflags", "+faststart"]
    return args


def lipsync_max_edge(quality: str) -> int:
    # Lip-sync long-edge cap follows the requested video_quality so we never
    # process at a higher res than the final encode keeps (wasted GPU/RAM),
    # nor lower (final would upscale → blur). Matches scale_vf's long edges.
    return {"1080p": 1920, "720p": 1280, "480p": 854}.get(quality, 1280)


def loudnorm_af(sound_mode: str) -> str:
    # target integrated loudness: louder I = louder output
    i = {"soft": "-18", "normal": "-14", "boost": "-10"}.get(sound_mode, "-14")
    vol = {"soft": "1.0", "normal": "1.3", "boost": "1.8"}.get(sound_mode, "1.3")
    return f"loudnorm=I={i}:TP=-1.0,volume={vol},alimiter=limit=0.97"


def zoom_vf(zoom: float) -> str | None:
    """Center crop-zoom. Crop first (iw/z), then scale back up — the chained
    scale sees the cropped dims, so iw*z ≈ original size. Even dims for H.264."""
    z = max(1.0, min(3.0, float(zoom or 1.0)))
    if z < 1.01:
        return None
    return (f"crop=trunc(iw/{z}/2)*2:trunc(ih/{z}/2)*2,"
            f"scale=trunc(iw*{z}/2)*2:trunc(ih*{z}/2)*2:flags=lanczos")


# --- Encode / mux operations ---------------------------------------------------

async def concat_audio(audio_paths: list[Path], output_path: Path) -> Path:
    """Concatenate multiple mp3s into one, re-encoding to a uniform format.

    Decision (Day 0 review #1): we concat all TTS audio first, then run MuseTalk
    ONCE over the full audio. This avoids visible seams between separately-
    inferred video segments, and skips MuseTalk's ~10-20s cold start per call.
    """
    list_file = output_path.with_suffix(".concat.txt")
    list_file.write_text(
        "\n".join(f"file '{p.as_posix()}'" for p in audio_paths), encoding="utf-8"
    )
    await _run([
        FFMPEG_BIN, "-y",
        "-f", "concat", "-safe", "0",
        "-i", str(list_file),
        "-c:a", "libmp3lame", "-b:a", "192k",
        str(output_path),
    ])
    return output_path


async def mux_audio_onto_video(
    video_path: Path, audio_path: Path, output_path: Path
) -> Path:
    """Stub fallback for when MuseTalk is disabled.

    Loops the avatar template video to cover the audio duration and mixes the
    TTS audio in. Used for local Day 1 smoke testing; real lip-sync happens on
    the GPU box via MuseTalk.
    """
    await _run([
        FFMPEG_BIN, "-y",
        "-stream_loop", "-1", "-i", str(video_path),
        "-i", str(audio_path),
        "-map", "0:v:0", "-map", "1:a:0",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
        "-c:a", "aac", "-b:a", "128k",
        "-shortest",
        "-pix_fmt", "yuv420p",
        str(output_path),
    ])
    return output_path


# Per-tier streaming bitrate ceiling (was a flat uncapped -b:v 3000k: too low for
# clean 1080p motion, wasteful for 480p, and uncapped ABR can spike and trip RTMP
# ingest). maxrate/bufsize give an RTMP-safe ceiling.
_STREAM_BV = {"1080p": "6000k", "720p": "3500k", "480p": "1500k"}
_STREAM_MAXRATE = {"1080p": "7000k", "720p": "4000k", "480p": "1800k"}
_STREAM_BUFSIZE = {"1080p": "12000k", "720p": "7000k", "480p": "3000k"}


async def transcode_for_streaming(
    input_path: Path, output_path: Path, video_quality: str = "1080p"
) -> Path:
    """Prepare a stream-friendly version of the final video.

    Decision (Day 0 review #3): bake fixed-cadence keyframes (GOP=2s) and clean
    PTS so that `-stream_loop -1` doesn't produce PTS jumps that Shopee's
    ingestion treats as freezes/disconnects.
    """
    q = video_quality if video_quality in _STREAM_BV else "1080p"
    await _run([
        FFMPEG_BIN, "-y",
        "-i", str(input_path),
        "-c:v", "libx264", "-preset", "veryfast",
        "-b:v", _STREAM_BV[q], "-maxrate", _STREAM_MAXRATE[q], "-bufsize", _STREAM_BUFSIZE[q],
        "-force_key_frames", "expr:gte(t,n_forced*2)",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "128k", "-ar", "44100",
        "-fflags", "+genpts",
        str(output_path),
    ])
    return output_path


def compress_video(src: Path, dst: Path) -> bool:
    """Compress/normalize an upload to ≤ Full-HD H.264 mp4. False on failure."""
    cmd = [
        FFMPEG_BIN, "-y", "-i", str(src),
        "-vf", FIT_FHD,
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "24",
        "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart",
        str(dst),
    ]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True)
        return r.returncode == 0 and dst.exists()
    except Exception:
        return False


def apply_speed_sync(path: Path, speed: float, quality: str = "1080p") -> bool:
    """Slow/speed the finished clip while KEEPING A/V sync (video setpts +
    audio atempo by the same factor). speed<1 = slower. No-op if ~1.0.

    This is a SECOND pass over an already-encoded clip, so it must not be the
    quality bottleneck: it re-encodes at the same per-tier crf as the main
    encode (was a flat crf=28 that visibly degraded the finished video).

    Returns True on success or no-op; False if the re-encode failed (so the
    caller can surface a warning instead of silently shipping original speed)."""
    if abs(speed - 1.0) < 0.01:
        return True
    speed = max(0.25, min(2.0, speed))
    setpts = round(1.0 / speed, 4)
    tmp = path.with_suffix(".spd.mp4")
    cmd = [
        FFMPEG_BIN, "-y", "-i", str(path),
        "-filter_complex", f"[0:v]setpts={setpts}*PTS[v];[0:a]atempo={speed}[a]",
        "-map", "[v]", "-map", "[a]",
        *x264_args(quality, gop_keyframes=False),
        str(tmp),
    ]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True)
    except Exception:
        return False
    if r.returncode == 0 and tmp.exists():
        tmp.replace(path)
        return True
    tmp.unlink(missing_ok=True)
    return False


def run_ffmpeg_progress(
    cmd: list[str], dur: int, on_pct: Callable[[int], None]
) -> subprocess.CompletedProcess:
    """Run ffmpeg with -progress and report % of `dur` via on_pct (0..99).
    State writes are the CALLER's job — this layer only runs media.

    stderr goes to a temp FILE, not a pipe: an unread stderr pipe deadlocks
    against our stdout progress loop once it fills (reproduced on macOS;
    same hazard class as the compositing image2pipe fix)."""
    import tempfile

    full = cmd + ["-progress", "pipe:1", "-nostats"]
    err_lines: list[str] = []
    with tempfile.NamedTemporaryFile(mode="w+", suffix=".ffmpeg.log", delete=True) as err_f:
        proc = subprocess.Popen(full, stdout=subprocess.PIPE, stderr=err_f, text=True)
        assert proc.stdout is not None
        for line in proc.stdout:
            line = line.strip()
            if line.startswith("out_time_us=") or line.startswith("out_time_ms="):
                try:
                    micros = int(line.split("=", 1)[1])
                    secs = micros / 1_000_000.0
                    pct = max(0, min(99, int(secs / dur * 100)))
                    on_pct(pct)
                except Exception:
                    pass
        proc.wait()
        err_f.seek(0)
        err_lines = err_f.read().splitlines()
    rc = proc.returncode
    return subprocess.CompletedProcess(full, rc, "", "\n".join(err_lines[-20:]))
