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


async def transcode_for_streaming(input_path: Path, output_path: Path) -> Path:
    """Prepare a stream-friendly version of the final video.

    Decision (Day 0 review #3): bake fixed-cadence keyframes (GOP=2s) and clean
    PTS so that `-stream_loop -1` doesn't produce PTS jumps that Shopee's
    ingestion treats as freezes/disconnects.
    """
    await _run([
        FFMPEG_BIN, "-y",
        "-i", str(input_path),
        "-c:v", "libx264", "-preset", "veryfast", "-b:v", "3000k",
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


def apply_speed_sync(path: Path, speed: float) -> None:
    """Slow/speed the finished clip while KEEPING A/V sync (video setpts +
    audio atempo by the same factor). speed<1 = slower. No-op if ~1.0."""
    if abs(speed - 1.0) < 0.01:
        return
    speed = max(0.25, min(2.0, speed))
    setpts = round(1.0 / speed, 4)
    tmp = path.with_suffix(".spd.mp4")
    cmd = [
        FFMPEG_BIN, "-y", "-i", str(path),
        "-filter_complex", f"[0:v]setpts={setpts}*PTS[v];[0:a]atempo={speed}[a]",
        "-map", "[v]", "-map", "[a]",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", str(tmp),
    ]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode == 0 and tmp.exists():
        tmp.replace(path)


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
