"""TTS provider package.

Public API:
    get_provider()       — returns the configured provider instance
    synthesize_all(...)  — renders a list of segments in parallel

Provider selection: by default we route per-voice — voices that look like
Azure (`th-TH-PremwadeeNeural`, `zh-CN-YunfengNeural`, …) go to Azure; voices
that look like Volcengine (`BV001_streaming`, `BV421_streaming`, …) go to
Volcengine. This lets the frontend offer Thai + Chinese voices in the same
dropdown without the user having to fiddle with .env.

When the voice doesn't match either pattern we fall back to TTS_PROVIDER from
.env (default "azure"). Provider construction is lazy and cached per provider,
so only the providers actually used need credentials configured.

Why per-voice routing (vs the old single-cached provider):
  - SEA market wants Thai voices (Azure has best ones; Volcengine charges
    ¥1000/month for Thai)
  - Chinese market wants Volcengine BV001/BV700 (free for Chinese)
  - Forcing one provider per .env switch made the frontend have to know which
    provider was hot — fragile across deploys.
"""
from __future__ import annotations

import asyncio
import os
import re
from pathlib import Path

from .azure import AzureTTSProvider
from .base import TTSError, TTSProvider
from .edge import EdgeTTSProvider
from .google import GoogleTTSProvider
from .volcengine import VolcengineTTSProvider

__all__ = ["TTSError", "TTSProvider", "get_provider", "synthesize_all"]


# Cache one instance per provider name. Initialization can fail (missing key),
# so we only build the providers we actually use.
_cached: dict[str, TTSProvider] = {}

# Azure AND Google neural voice IDs both look like "xx-XX-..." — two-letter
# lang, two-letter region, name. The first 5 chars disambiguate them from
# Volcengine's "BV###_streaming" naming, but NOT from each other, so we use the
# name suffix/tokens below to tell Azure from Google.
_LOCALE_VOICE_RE = re.compile(r"^[a-z]{2}-[A-Z]{2}-")
_AZURE_VOICE_RE = _LOCALE_VOICE_RE  # back-compat alias

# Google voice families (e.g. th-TH-Standard-A, th-TH-Neural2-C,
# th-TH-Chirp3-HD-Achernar, en-US-Wavenet-F). Azure voices instead END with
# "Neural" (th-TH-PremwadeeNeural) and never carry these tokens.
_GOOGLE_VOICE_TOKENS = (
    "standard", "wavenet", "neural2", "chirp", "studio",
    "news", "polyglot", "journey", "casual",
)


def get_provider(name: str | None = None) -> TTSProvider:
    """Return a provider by name. Defaults to TTS_PROVIDER env or 'azure'."""
    target = (name or os.getenv("TTS_PROVIDER") or "azure").lower()
    if target in _cached:
        return _cached[target]
    if target == "azure":
        _cached[target] = AzureTTSProvider()
    elif target == "google":
        _cached[target] = GoogleTTSProvider()
    elif target == "volcengine":
        _cached[target] = VolcengineTTSProvider()
    elif target == "edge":
        _cached[target] = EdgeTTSProvider()
    else:
        raise TTSError(
            f"unknown TTS_PROVIDER={target!r} "
            "(expected 'azure', 'google', 'volcengine', or 'edge')"
        )
    return _cached[target]


def _provider_for_voice(voice: str) -> str:
    """Heuristic: pick provider by voice ID format.

    Volcengine voices start with `BV` (e.g. BV001_streaming).
    Google voices match `xx-XX-...` AND carry a family token (Standard/
    Wavenet/Neural2/Chirp/…), e.g. th-TH-Standard-A.
    Azure voices match `xx-XX-...` and END with "Neural" (th-TH-PremwadeeNeural).
    Anything else falls back to TTS_PROVIDER env.
    """
    v = (voice or "").strip()
    if v.upper().startswith("BV"):
        return "volcengine"
    if _LOCALE_VOICE_RE.match(v):
        vl = v.lower()
        if any(tok in vl for tok in _GOOGLE_VOICE_TOKENS):
            return "google"
        if v.endswith("Neural"):
            return "azure"
    return (os.getenv("TTS_PROVIDER") or "azure").lower()


async def synthesize_all(
    segments: list[str],
    voice: str,
    rate: str,
    work_dir: Path,
    basename: str,
) -> list[Path]:
    work_dir.mkdir(parents=True, exist_ok=True)
    provider = get_provider(_provider_for_voice(voice))
    paths: list[Path] = []
    tasks: list[asyncio.Task[Path]] = []
    for i, text in enumerate(segments):
        out = work_dir / f"{basename}_seg{i:02d}.mp3"
        paths.append(out)
        tasks.append(asyncio.create_task(provider.synthesize(text, voice, rate, out)))
    # return_exceptions=True so the first failure does NOT leave the other
    # in-flight synth tasks running detached (orphan HTTP requests + partial
    # mp3s). On any failure, cancel the rest, let cancellations settle, then
    # raise the first error.
    results = await asyncio.gather(*tasks, return_exceptions=True)
    errs = [r for r in results if isinstance(r, BaseException)]
    if errs:
        for t in tasks:
            if not t.done():
                t.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        for p in paths:                       # drop partial/empty segment files
            try:
                if p.exists() and p.stat().st_size == 0:
                    p.unlink()
            except OSError:
                pass
        raise errs[0]
    return paths
