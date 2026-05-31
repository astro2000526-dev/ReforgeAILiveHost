from __future__ import annotations

import io
import os
import subprocess
import tempfile
import uuid
from pathlib import Path
from typing import Tuple

import numpy as np

from .config import settings
from .logging_setup import get_logger
from .models.base import InferenceResult
from .timing import Timings, stage

log = get_logger(__name__)


def decode_audio_to_pcm16k(audio_bytes: bytes) -> np.ndarray:
    """Decode arbitrary audio bytes to float32 mono 16kHz using ffmpeg."""
    cmd = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        "pipe:0",
        "-f",
        "f32le",
        "-ac",
        "1",
        "-ar",
        str(settings.sample_rate),
        "pipe:1",
    ]
    proc = subprocess.run(cmd, input=audio_bytes, capture_output=True, check=True)
    return np.frombuffer(proc.stdout, dtype=np.float32)


def encode_video(result: InferenceResult, out_path: str) -> str:
    """Encode RGB frames + PCM audio into a self-contained mp4."""
    work = Path(tempfile.mkdtemp(prefix="lipsync_", dir=settings.work_dir if os.path.isdir(settings.work_dir) else None))
    wav_path = work / "audio.wav"

    import soundfile as sf

    sf.write(str(wav_path), result.audio, result.sample_rate, subtype="PCM_16")

    h, w = result.frames.shape[1], result.frames.shape[2]
    cmd = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgb24",
        "-s",
        f"{w}x{h}",
        "-r",
        str(result.fps),
        "-i",
        "pipe:0",
        "-i",
        str(wav_path),
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-tune",
        "zerolatency",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-shortest",
        out_path,
    ]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    assert proc.stdin is not None
    proc.stdin.write(result.frames.tobytes())
    proc.stdin.close()
    rc = proc.wait()
    if rc != 0:
        raise RuntimeError(f"ffmpeg encode failed rc={rc}")
    return out_path


def run_batch(
    model, image_bytes: bytes, audio_bytes: bytes, out_dir: str | None = None,
    max_edge: int | None = None, lip_blend: int = 30,
) -> Tuple[str, Timings, str]:
    t = Timings()
    with stage("audio_decode", t):
        pcm = decode_audio_to_pcm16k(audio_bytes)
    with stage("avatar_prepare", t):
        key = model.prepare_avatar(image_bytes, max_edge)
    with stage("inference", t):
        result = model.infer(key, pcm, lip_blend=lip_blend)
    with stage("video_encode", t):
        out_dir = out_dir or settings.work_dir
        Path(out_dir).mkdir(parents=True, exist_ok=True)
        out_path = str(Path(out_dir) / f"out_{uuid.uuid4().hex}.mp4")
        encode_video(result, out_path)
    log.info("batch done timings=%s", t.as_dict())
    return out_path, t, key
