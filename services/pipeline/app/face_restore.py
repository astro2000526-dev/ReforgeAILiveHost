"""GFPGAN face restoration to clean up MuseTalk's mouth-edge artifacts.

We extract every frame from the lip-synced video, run GFPGAN over each one,
then re-encode with the original audio track. Costs ~50-100ms/frame on a 4090,
so a 30s 25fps clip adds ~30-60s to total generation time.

Toggle via GFPGAN_ENABLED=1 in .env. When disabled the function copies the
input through unchanged, so pipeline.py doesn't need to branch.
"""
from __future__ import annotations

import asyncio
import logging
import os
import shutil
import subprocess
from pathlib import Path

from .config import FFMPEG_BIN

log = logging.getLogger("pipeline.face_restore")


class FaceRestoreError(RuntimeError):
    pass


def _enabled() -> bool:
    return os.getenv("GFPGAN_ENABLED", "0").strip() == "1"


def _weight_path() -> Path:
    raw = os.getenv("GFPGAN_WEIGHT", "").strip()
    if raw:
        return Path(raw).expanduser()
    # Default colocates with the MuseTalk install on the pod.
    return Path(__file__).resolve().parent.parent / "MuseTalk" / "gfpgan_weights" / "GFPGANv1.4.pth"


# Process-wide cache; loading the model + face detector takes ~5s
_RESTORER = None


def _get_restorer():
    global _RESTORER
    if _RESTORER is not None:
        return _RESTORER

    import torch
    from gfpgan import GFPGANer

    weight = _weight_path()
    if not weight.exists():
        raise FaceRestoreError(
            f"GFPGAN weight not found at {weight}. "
            f"Set GFPGAN_WEIGHT or download GFPGANv1.4.pth."
        )

    device = "cuda" if torch.cuda.is_available() else "cpu"
    log.info("loading GFPGAN from %s on %s", weight, device)
    _RESTORER = GFPGANer(
        model_path=str(weight),
        upscale=1,
        arch="clean",
        channel_multiplier=2,
        device=device,
    )
    return _RESTORER


def _restore_sync(input_video: Path, output_video: Path) -> None:
    """Extract frames → enhance each → re-mux with original audio."""
    import cv2

    restorer = _get_restorer()
    work_dir = output_video.parent / f".restore-{output_video.stem}"
    if work_dir.exists():
        shutil.rmtree(work_dir, ignore_errors=True)
    work_dir.mkdir(parents=True, exist_ok=True)

    frames_in = work_dir / "in"
    frames_out = work_dir / "out"
    frames_in.mkdir()
    frames_out.mkdir()

    # 1. Frames
    r = subprocess.run(
        [FFMPEG_BIN, "-y", "-i", str(input_video), str(frames_in / "%08d.png")],
        capture_output=True, text=True,
    )
    if r.returncode != 0:
        raise FaceRestoreError(f"ffmpeg extract failed: {r.stderr[-400:]}")

    # 2. Audio (may be empty if input has no audio track; that's fine)
    audio_path = work_dir / "audio.aac"
    subprocess.run(
        [FFMPEG_BIN, "-y", "-i", str(input_video), "-vn", "-acodec", "copy",
         str(audio_path)],
        capture_output=True,
    )

    # 3. Probe input fps so re-encode keeps timing
    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=r_frame_rate", "-of", "csv=p=0",
         str(input_video)],
        capture_output=True, text=True,
    )
    fps_str = probe.stdout.strip() or "25/1"

    # 4. Enhance each frame. Don't abort on a single bad frame — fall back
    # to the original so the timeline doesn't break.
    frame_files = sorted(frames_in.glob("*.png"))
    log.info("enhancing %d frames", len(frame_files))
    for i, frame_file in enumerate(frame_files):
        img = cv2.imread(str(frame_file))
        if img is None:
            log.warning("skipping unreadable frame %s", frame_file)
            continue
        try:
            _, _, restored = restorer.enhance(
                img, has_aligned=False, only_center_face=False, paste_back=True,
            )
        except Exception as e:  # face detector occasionally returns nothing
            log.warning("frame %d enhance failed (%s); keeping original", i, e)
            restored = img
        cv2.imwrite(str(frames_out / frame_file.name), restored)

    # 5. Re-encode + remux audio
    cmd = [
        FFMPEG_BIN, "-y",
        "-framerate", fps_str,
        "-i", str(frames_out / "%08d.png"),
    ]
    if audio_path.exists() and audio_path.stat().st_size > 0:
        cmd += ["-i", str(audio_path), "-c:a", "aac"]
    cmd += [
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "18",
        "-pix_fmt", "yuv420p",
        str(output_video),
    ]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise FaceRestoreError(f"ffmpeg re-encode failed: {r.stderr[-400:]}")

    shutil.rmtree(work_dir, ignore_errors=True)


async def restore_faces(input_video: Path, output_video: Path) -> Path:
    """Run GFPGAN over each frame to clean up mouth-edge artifacts.

    When GFPGAN_ENABLED is not '1' (e.g. local dev without weights), copies
    the input through unchanged so the rest of the pipeline doesn't care.
    """
    if not _enabled():
        shutil.copy(input_video, output_video)
        return output_video
    await asyncio.to_thread(_restore_sync, input_video, output_video)
    return output_video
