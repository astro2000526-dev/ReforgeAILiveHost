import asyncio
import subprocess
from pathlib import Path

from .config import FFMPEG_BIN


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
    RunPod via MuseTalk.
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
