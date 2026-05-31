"""RunPod Serverless handler stub.

Activate later by deploying this image to a RunPod Serverless endpoint
and setting the container start command to ``python -u handler.py``.

The MVP target is a RunPod Pod (long-running) using ``app.main:app``,
so this handler is intentionally minimal.
"""
from __future__ import annotations

import asyncio
import base64
import os

from app.config import settings
from app.logging_setup import get_logger, setup_logging
from app.models import build_model
from app.pipeline import run_batch

setup_logging()
log = get_logger("handler")

_model = None


def _get_model():
    global _model
    if _model is None:
        _model = build_model()
        _model.load()
        _model.warmup()
    return _model


def handler(event):
    """Entry point used by RunPod Serverless.

    Expected event["input"]:
        avatar_base64 (str), audio_base64 (str)
    Returns dict with mp4_base64, timings_ms, avatar_key.
    """
    payload = event.get("input", {})
    avatar_b64 = payload.get("avatar_base64")
    audio_b64 = payload.get("audio_base64")
    if not avatar_b64 or not audio_b64:
        return {"error": "avatar_base64 and audio_base64 required"}

    model = _get_model()
    image_bytes = base64.b64decode(avatar_b64)
    audio_bytes = base64.b64decode(audio_b64)
    out_path, timings, key = run_batch(model, image_bytes, audio_bytes)
    with open(out_path, "rb") as f:
        mp4_b64 = base64.b64encode(f.read()).decode("ascii")
    try:
        os.remove(out_path)
    except OSError:
        pass
    return {
        "mp4_base64": mp4_b64,
        "timings_ms": timings.as_dict(),
        "avatar_key": key,
    }


if __name__ == "__main__":
    try:
        import runpod
    except ImportError as e:  # pragma: no cover
        raise SystemExit(
            "runpod SDK not installed. Add `runpod` to requirements.txt to enable Serverless."
        ) from e
    runpod.serverless.start({"handler": handler})
