"""TTS provider package.

Public API:
    get_provider()       — returns the configured provider instance
    synthesize_all(...)  — renders a list of segments in parallel

Provider selection: env var TTS_PROVIDER ∈ {"azure", "volcengine", "edge"}.
Default is "azure" — chosen because:
  - Volcengine gates Thai behind a ¥1000/month subscription (not viable for MVP)
  - edge-tts is broken upstream (Sec-MS-GEC 403 since late 2024)
  - Azure has Thai/Indonesian/Vietnamese neural voices on a pay-as-you-go model
    with a 500K char/month free tier — covers MVP usage at no cost
"""
from __future__ import annotations

import asyncio
import os
from pathlib import Path

from .azure import AzureTTSProvider
from .base import TTSError, TTSProvider
from .edge import EdgeTTSProvider
from .volcengine import VolcengineTTSProvider

__all__ = ["TTSError", "TTSProvider", "get_provider", "synthesize_all"]


_cached: TTSProvider | None = None


def get_provider(name: str | None = None) -> TTSProvider:
    """Return a provider instance. Caches per process."""
    global _cached
    target = (name or os.getenv("TTS_PROVIDER") or "azure").lower()
    if _cached is not None and _cached.name == target:
        return _cached
    if target == "azure":
        _cached = AzureTTSProvider()
    elif target == "volcengine":
        _cached = VolcengineTTSProvider()
    elif target == "edge":
        _cached = EdgeTTSProvider()
    else:
        raise TTSError(
            f"unknown TTS_PROVIDER={target!r} (expected 'azure', 'volcengine', or 'edge')"
        )
    return _cached


async def synthesize_all(
    segments: list[str],
    voice: str,
    rate: str,
    work_dir: Path,
    basename: str,
) -> list[Path]:
    work_dir.mkdir(parents=True, exist_ok=True)
    provider = get_provider()
    paths: list[Path] = []
    tasks: list[asyncio.Task[Path]] = []
    for i, text in enumerate(segments):
        out = work_dir / f"{basename}_seg{i:02d}.mp3"
        paths.append(out)
        tasks.append(asyncio.create_task(provider.synthesize(text, voice, rate, out)))
    await asyncio.gather(*tasks)
    return paths
