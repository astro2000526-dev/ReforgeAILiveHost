"""GPU-call boundary — the ONLY layer that touches GPU inference.

Capabilities (each independently switchable local|remote):
    lipsync     — Wav2Lip/MuseTalk HTTP service (already network-based)
    sovits      — GPT-SoVITS HTTP service (network-based, like lipsync)
    tts         — MMS-TTS (torch VitsModel) local neural TTS
    voice_clone — OpenVoice tone-color conversion
    restore     — GFPGAN face restoration
    matte       — rembg person matting + background composite + zoom
    musetalk    — legacy file-based MuseTalk inference (/generate path)

Switching: GPU_BACKEND=local|remote (global) or GPU_<CAP>_BACKEND per
capability; remote needs GPU_BASE_URL pointing at another instance of THIS
image (it exposes /gpu/* worker routes) + GPU_TOKEN (defaults PIPELINE_TOKEN).
Default = local = exactly today's behavior, so unset env changes nothing.

Heavy imports (torch/rembg/gfpgan/transformers/openvoice/cv2) are allowed
ONLY inside this package, and stay lazy inside functions so the FastAPI
worker doesn't pay CUDA init at boot. scripts/check_gpu_seam.sh enforces it.
"""
from __future__ import annotations

import asyncio
import os
import shutil
from pathlib import Path
from typing import Callable

from ..config import gpu_backend_for


class GpuError(RuntimeError):
    pass


class GpuRouter:
    """Facade every other layer calls. No torch here — only dispatch."""

    # --- lip-sync (HTTP service; per-request URL from system_config) ---------
    async def lipsync(
        self, *, avatar_url: str, audio_path: Path, out_path: Path,
        max_edge: int, lip_blend: int, model: str | None,
        lipsync_url: str | None,
    ) -> None:
        # Precedence: GPU_LIPSYNC_URL env wins in remote mode; otherwise the
        # per-request lipsync_url (Settings → system_config) — today's behavior.
        url = lipsync_url
        if gpu_backend_for("lipsync") == "remote":
            url = (os.getenv("GPU_LIPSYNC_URL") or "").rstrip("/") or lipsync_url
        if not url:
            raise GpuError("no lipsync service URL configured")
        from .lipsync_client import lipsync_via_http
        await lipsync_via_http(
            lipsync_url=url, avatar_url=avatar_url, audio_path=audio_path,
            out_path=out_path, max_edge=max_edge, lip_blend=lip_blend, model=model,
        )

    # --- GPT-SoVITS HTTP TTS (sibling service; remote-by-nature like lipsync) --
    async def tts_sovits(
        self, *, text: str, voice: str, out_path: Path,
        pitch: float = 0.0, emotion: str | None = None, speed: float = 1.0,
        sovits_url: str | None = None,
    ) -> None:
        # Mirror lipsync() URL precedence: in remote mode GPU_SOVITS_URL wins;
        # otherwise the per-request sovits_url (param) > env GPT_SOVITS_URL
        # (the client itself reads GPT_SOVITS_URL when handed None).
        url = sovits_url
        if gpu_backend_for("sovits") == "remote":
            url = (os.getenv("GPU_SOVITS_URL") or "").rstrip("/") or sovits_url
        from .sovits_client import tts_sovits
        await tts_sovits(
            text=text, voice=voice, out_path=out_path,
            pitch=pitch, emotion=emotion, speed=speed, sovits_url=url,
        )

    # --- local neural TTS (MMS VitsModel, torch) ------------------------------
    async def tts_local(self, *, text: str, voice: str, out_path: Path) -> None:
        if gpu_backend_for("tts") == "remote":
            from . import remote
            await remote.tts(text=text, voice=voice, out_path=out_path)
            return
        from .mms_tts import tts_mms
        await tts_mms(text, voice, out_path)

    # --- voice clone (OpenVoice tone conversion) ------------------------------
    async def voice_clone(self, *, src_wav: Path, ref_wav: Path, out_wav: Path) -> None:
        if gpu_backend_for("voice_clone") == "remote":
            from . import remote
            await remote.voice_clone(src_wav=src_wav, ref_wav=ref_wav, out_wav=out_wav)
            return
        from .openvoice import voice_clone
        await voice_clone(src_wav, ref_wav, out_wav)

    # --- face restoration (GFPGAN) --------------------------------------------
    async def restore_faces(self, *, input_video: Path, output_video: Path) -> Path:
        # GFPGAN_ENABLED gate lives here so remote mode also skips the network
        # round-trip when restoration is off.
        if os.getenv("GFPGAN_ENABLED", "0").strip() != "1":
            shutil.copy(input_video, output_video)
            return output_video
        if gpu_backend_for("restore") == "remote":
            from . import remote
            return await remote.restore_faces(input_video=input_video, output_video=output_video)
        from .face_restore import restore_faces
        return await restore_faces(input_video, output_video)

    # --- matting + background composite + zoom + frame layout (rembg) ---------
    async def matte_composite(
        self, *, video_path: Path, bg_remove: bool, background_url: str | None,
        background_type: str | None, camera_zoom: float,
        frame_position: str = "center", frame_scale: float = 1.0,
        progress: Callable[[int], None] | None = None,
    ) -> list[str]:
        if gpu_backend_for("matte") == "remote":
            from . import remote
            return await remote.matte_composite(
                video_path=video_path, bg_remove=bg_remove,
                background_url=background_url, background_type=background_type,
                camera_zoom=camera_zoom,
                frame_position=frame_position, frame_scale=frame_scale,
            )
        # Prefer reading the background from disk (same trick as templates).
        from ..media import local_path_for
        bg = local_path_for(background_url) or background_url
        from .compositing import apply_composite
        return await asyncio.to_thread(
            apply_composite, video_path,
            bg_remove=bg_remove, background=bg, background_type=background_type,
            camera_zoom=camera_zoom,
            frame_position=frame_position, frame_scale=frame_scale,
            progress=progress,
        )

    # --- legacy file-based MuseTalk lip-sync (/generate path) -----------------
    async def musetalk_lipsync(
        self, *, template_video: Path, full_audio: Path, output_path: Path
    ) -> Path:
        if gpu_backend_for("musetalk") == "remote":
            from . import remote
            return await remote.musetalk_lipsync(
                template_video=template_video, full_audio=full_audio, output_path=output_path
            )
        from .musetalk import run_lipsync
        return await run_lipsync(template_video, full_audio, output_path)


_gpu: GpuRouter | None = None


def get_gpu() -> GpuRouter:
    global _gpu
    if _gpu is None:
        _gpu = GpuRouter()
    return _gpu
