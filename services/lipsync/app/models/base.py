from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Iterable

import numpy as np


@dataclass
class InferenceResult:
    frames: np.ndarray  # (T, H, W, 3) uint8 RGB
    fps: int
    audio: np.ndarray  # (N,) float32 mono, matches sample_rate
    sample_rate: int


class LipSyncModel(ABC):
    """Common interface for lip-sync backends."""

    name: str = "base"

    @abstractmethod
    def load(self) -> None:
        """Load weights to GPU. Called once at startup."""

    @abstractmethod
    def warmup(self) -> None:
        """Run a dummy inference to allocate kernels and stabilize timing."""

    @abstractmethod
    def prepare_avatar(self, image_bytes: bytes, max_edge: int | None = None) -> str:
        """Detect face / compute landmarks / encode latents. Return cache key.

        `max_edge` caps the working long-edge resolution (follows video_quality).
        """

    @abstractmethod
    def infer(
        self, avatar_key: str, audio_pcm16k_mono: np.ndarray, lip_blend: int = 30
    ) -> InferenceResult:
        """Run lip-sync inference. Audio must be float32 mono 16kHz.

        `lip_blend` (0..100) feathers the face-crop edge into the frame.
        """

    def infer_stream(
        self, avatar_key: str, audio_chunks: Iterable[np.ndarray]
    ) -> Iterable[InferenceResult]:
        """Default streaming impl: per-chunk batch infer.

        Subclasses can override with a state-preserving streaming path.
        """
        for chunk in audio_chunks:
            yield self.infer(avatar_key, chunk)
