"""TTS provider abstraction.

A provider takes (text, voice, rate) and writes an mp3 to output_path.
- `voice` and `rate` are provider-specific opaque strings; callers should
  configure them per provider (edge uses "th-TH-PremwadeeNeural" / "+10%",
  Volcengine uses voice IDs like "BV421_streaming" / a float speed ratio).
- All providers must be safe to call with arbitrary text containing quotes,
  newlines, $, etc. — no shell-out.
"""
from __future__ import annotations

from pathlib import Path
from typing import Protocol


class TTSProvider(Protocol):
    name: str

    async def synthesize(
        self, text: str, voice: str, rate: str, output_path: Path
    ) -> Path: ...


class TTSError(RuntimeError):
    """Raised when a provider can't fulfill the request (auth, quota, network)."""
