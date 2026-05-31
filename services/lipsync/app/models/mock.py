"""CPU-only mock model for local smoke tests.

Skips face detection and inference: pastes the avatar image into every
frame so the full pipeline (decode → cache → encode → mp4) can be
exercised on a laptop without GPU or model weights.
"""
from __future__ import annotations

import io

import numpy as np

from ..cache import avatar_key, cache
from ..config import settings
from ..logging_setup import get_logger
from .base import InferenceResult, LipSyncModel

log = get_logger(__name__)


class MockModel(LipSyncModel):
    name = "mock"

    def __init__(self) -> None:
        self._loaded = False

    def load(self) -> None:
        log.info("mock model load (no-op)")
        self._loaded = True

    def warmup(self) -> None:
        log.info("mock model warmup (no-op)")

    def prepare_avatar(self, image_bytes: bytes, max_edge: int | None = None) -> str:
        key = avatar_key(image_bytes)
        if cache.get(key) is not None:
            return key
        import imageio.v3 as iio  # imported here so test_imports works without it

        img = iio.imread(io.BytesIO(image_bytes))
        if img.ndim == 2:
            img = np.stack([img, img, img], axis=-1)
        if img.shape[-1] == 4:
            img = img[:, :, :3]
        # Round dimensions to even numbers (libx264 yuv420p requirement).
        h, w = img.shape[:2]
        if h % 2:
            img = img[:-1]
        if w % 2:
            img = img[:, :-1]
        cache.put(key, {"image": img.astype(np.uint8)})
        log.info("mock avatar prepared key=%s shape=%s", key[:12], img.shape)
        return key

    def infer(
        self, avatar_key: str, audio_pcm16k_mono: np.ndarray, lip_blend: int = 30
    ) -> InferenceResult:
        ctx = cache.get(avatar_key)
        if ctx is None:
            raise KeyError(f"avatar not prepared: {avatar_key}")
        img = ctx["image"]
        n_samples = int(audio_pcm16k_mono.shape[0])
        duration_s = n_samples / float(settings.sample_rate)
        n_frames = max(1, int(round(duration_s * settings.target_fps)))
        frames = np.broadcast_to(img[None, ...], (n_frames,) + img.shape).copy()
        return InferenceResult(
            frames=frames,
            fps=settings.target_fps,
            audio=audio_pcm16k_mono.astype(np.float32),
            sample_rate=settings.sample_rate,
        )
