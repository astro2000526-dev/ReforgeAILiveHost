from __future__ import annotations

from ..config import settings
from .base import LipSyncModel


def build_model(name: str | None = None) -> LipSyncModel:
    model_name = (name or settings.model_name).lower()
    if model_name == "musetalk":
        from .musetalk import MuseTalkModel

        return MuseTalkModel()
    if model_name == "wav2lip":
        from .wav2lip import Wav2LipModel

        return Wav2LipModel()
    if model_name == "mock":
        from .mock import MockModel

        return MockModel()
    raise ValueError(f"Unknown LIPSYNC_MODEL={model_name!r}")
