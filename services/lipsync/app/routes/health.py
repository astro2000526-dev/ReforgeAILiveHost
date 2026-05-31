from __future__ import annotations

import os
import time

from fastapi import APIRouter

from ..config import settings

router = APIRouter()
_started = time.time()


@router.get("/health")
def health() -> dict:
    gpu = {"available": False}
    try:
        import torch

        gpu = {
            "available": torch.cuda.is_available(),
            "device_count": torch.cuda.device_count(),
            "device_name": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
        }
    except Exception:
        pass
    return {
        "status": "ok",
        "uptime_s": round(time.time() - _started, 1),
        "model": settings.model_name,
        "fp16": settings.fp16,
        "gpu": gpu,
        "pid": os.getpid(),
    }
