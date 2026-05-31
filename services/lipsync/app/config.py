from __future__ import annotations

import os
from dataclasses import dataclass


def _bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    model_name: str = os.getenv("LIPSYNC_MODEL", "musetalk")
    models_dir: str = os.getenv("MODELS_DIR", "/workspace/models")
    work_dir: str = os.getenv("WORK_DIR", "/workspace/runtime")
    device: str = os.getenv("DEVICE", "cuda")
    fp16: bool = _bool("FP16", True)
    api_token: str | None = os.getenv("API_TOKEN") or None
    max_cache_avatars: int = int(os.getenv("MAX_CACHE_AVATARS", "8"))
    log_level: str = os.getenv("LOG_LEVEL", "INFO")
    target_fps: int = int(os.getenv("TARGET_FPS", "25"))
    sample_rate: int = int(os.getenv("SAMPLE_RATE", "16000"))


settings = Settings()
