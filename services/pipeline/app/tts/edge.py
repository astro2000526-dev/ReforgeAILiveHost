"""Edge TTS provider — free but currently broken upstream (Sec-MS-GEC 403).

Kept around for local dev once Microsoft / the edge-tts library mend fences.
"""
from __future__ import annotations

from pathlib import Path

import edge_tts

from .base import TTSError


class EdgeTTSProvider:
    name = "edge"

    async def synthesize(
        self, text: str, voice: str, rate: str, output_path: Path
    ) -> Path:
        try:
            communicate = edge_tts.Communicate(text=text, voice=voice, rate=rate)
            await communicate.save(str(output_path))
        except Exception as e:
            raise TTSError(f"edge-tts failed: {e}") from e
        return output_path
