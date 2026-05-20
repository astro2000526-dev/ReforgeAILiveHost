"""MuseTalk lip-sync adapter.

This is a stub on local dev (Windows). The real implementation runs on the
RunPod GPU box; see services/pipeline/README.md for the inference invocation.

Decision (Day 0 review #1): pass the FULL concatenated audio to a SINGLE
MuseTalk run. Do not loop over segments.
"""
import asyncio
from pathlib import Path

from .config import MUSETALK_ENABLED, FFMPEG_BIN
from .ffmpeg_ops import mux_audio_onto_video


async def run_lipsync(template_video: Path, full_audio: Path, output_path: Path) -> Path:
    if not MUSETALK_ENABLED:
        # Fallback for local dev: just mux audio onto the looped template.
        # The avatar's mouth won't move correctly — that's the GPU box's job.
        return await mux_audio_onto_video(template_video, full_audio, output_path)

    # Real call on RunPod. Adjust to your MuseTalk install path.
    proc = await asyncio.create_subprocess_exec(
        "python", "-m", "musetalk.inference",
        "--video", str(template_video),
        "--audio", str(full_audio),
        "--output", str(output_path),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    _, stderr = await proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(f"MuseTalk failed: {stderr.decode('utf-8', errors='replace')}")
    return output_path
