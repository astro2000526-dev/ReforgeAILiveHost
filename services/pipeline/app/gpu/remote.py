"""Remote GPU backend — HTTP calls to another instance of this same image.

The worker side is app/api/gpu_worker.py (/gpu/* routes, token-protected).
Moving GPU compute to a new server = run this image there with GPU_BACKEND
unset (local), then point THIS box at it: GPU_BACKEND=remote +
GPU_BASE_URL=http://new-gpu-box:8000. Nothing else changes.

Every call fails LOUDLY (GpuError) when GPU_BASE_URL is missing or the worker
errors — never a silent local fallback, so a mis-config can't hide.
"""
import json
import os
from pathlib import Path

import httpx

from ..config import gpu_base_url, gpu_token
from . import GpuError


def _base() -> str:
    base = gpu_base_url()
    if not base:
        raise GpuError("GPU_BACKEND=remote but GPU_BASE_URL is not set")
    return base


def _headers() -> dict:
    return {"Authorization": f"Bearer {gpu_token()}"}


def _timeout() -> float:
    return float(os.getenv("GPU_HTTP_TIMEOUT", "1800"))


async def _post_files(
    path: str, *, files: dict, data: dict, out_path: Path
) -> list[str]:
    """POST multipart to the worker; write the returned video/audio bytes to
    out_path. Non-fatal warnings ride back in the X-Warnings header (json)."""
    async with httpx.AsyncClient(timeout=_timeout()) as c:
        r = await c.post(f"{_base()}{path}", headers=_headers(), files=files, data=data)
        if r.status_code >= 400:
            raise GpuError(f"GPU worker {path} HTTP {r.status_code}: {r.text[:200]}")
        out_path.write_bytes(r.content)
    try:
        return json.loads(r.headers.get("x-warnings", "[]"))
    except Exception:
        return []


async def tts(*, text: str, voice: str, out_path: Path) -> None:
    async with httpx.AsyncClient(timeout=_timeout()) as c:
        r = await c.post(f"{_base()}/gpu/tts", headers=_headers(),
                         json={"text": text, "voice": voice})
        if r.status_code >= 400:
            raise GpuError(f"GPU worker /gpu/tts HTTP {r.status_code}: {r.text[:200]}")
        out_path.write_bytes(r.content)


async def voice_clone(*, src_wav: Path, ref_wav: Path, out_wav: Path) -> None:
    await _post_files(
        "/gpu/voice-clone",
        files={"src": ("src.wav", src_wav.read_bytes(), "audio/wav"),
               "ref": ("ref.wav", ref_wav.read_bytes(), "audio/wav")},
        data={},
        out_path=out_wav,
    )


async def restore_faces(*, input_video: Path, output_video: Path) -> Path:
    await _post_files(
        "/gpu/restore",
        files={"video": ("in.mp4", input_video.read_bytes(), "video/mp4")},
        data={},
        out_path=output_video,
    )
    return output_video


async def matte_composite(
    *, video_path: Path, bg_remove: bool, background_url: str | None,
    background_type: str | None, camera_zoom: float,
    frame_position: str = "center", frame_scale: float = 1.0,
) -> list[str]:
    # background travels as a URL (PUBLIC_BASE_URL /files is publicly
    # reachable); the worker's ffmpeg ingests http directly.
    warnings = await _post_files(
        "/gpu/matte",
        files={"video": ("in.mp4", video_path.read_bytes(), "video/mp4")},
        data={
            "bg_remove": "1" if bg_remove else "0",
            "background_url": background_url or "",
            "background_type": background_type or "",
            "camera_zoom": str(camera_zoom),
            "frame_position": frame_position or "center",
            "frame_scale": str(frame_scale),
        },
        out_path=video_path,  # composited in place, same contract as local
    )
    return warnings


async def musetalk_lipsync(
    *, template_video: Path, full_audio: Path, output_path: Path
) -> Path:
    await _post_files(
        "/gpu/musetalk",
        files={"video": ("template.mp4", template_video.read_bytes(), "video/mp4"),
               "audio": ("audio.mp3", full_audio.read_bytes(), "audio/mpeg")},
        data={},
        out_path=output_path,
    )
    return output_path
