"""Edge TTS provider — free but geo-blocked (403) in China.

Set EDGE_TTS_PROXY to a proxy outside CN (http://host:port or
socks5://host:port) to route around the block.
"""
from __future__ import annotations

import os
from pathlib import Path

import edge_tts

from .base import TTSError


class EdgeTTSProvider:
    name = "edge"

    async def synthesize(
        self, text: str, voice: str, rate: str, output_path: Path
    ) -> Path:
        proxy = (os.getenv("EDGE_TTS_PROXY") or "").strip() or None
        try:
            communicate = edge_tts.Communicate(text=text, voice=voice, rate=rate, proxy=proxy)
            await communicate.save(str(output_path))
        except Exception as e:
            raise TTSError(f"edge-tts failed: {e}") from e
        return output_path
