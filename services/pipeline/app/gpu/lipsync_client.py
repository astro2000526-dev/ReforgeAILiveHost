"""HTTP client for the lip-sync service (Wav2Lip/MuseTalk, port 8001).

Extracted verbatim from the old _render_ai inline block — pass avatar by URL
(service fetches it), audio inline as base64, ask for the file back.
"""
import base64
import os
from pathlib import Path

import httpx


async def lipsync_via_http(
    *, lipsync_url: str, avatar_url: str, audio_path: Path, out_path: Path,
    max_edge: int, lip_blend: int, model: str | None,
) -> None:
    audio_b64 = base64.b64encode(audio_path.read_bytes()).decode()
    payload = {
        "avatar_url": avatar_url,
        "audio_base64": audio_b64,
        "return_mode": "file",
        "max_edge": max_edge,
        "lip_blend": int(lip_blend if lip_blend is not None else 30),
        "model": model or None,
    }
    base = lipsync_url.rstrip("/")
    # MuseTalk reloads its models per request and is much slower than Wav2Lip,
    # so allow a longer wait via env (default 900s; bump for musetalk).
    _ls_timeout = float(os.getenv("LIPSYNC_HTTP_TIMEOUT", "900"))
    async with httpx.AsyncClient(timeout=_ls_timeout) as c:
        r = await c.post(f"{base}/lip-sync", json=payload)
        if r.status_code >= 400:
            raise RuntimeError(f"lipsync HTTP {r.status_code}: {r.text[:200]}")
        # return_mode=file → mp4 bytes
        out_path.write_bytes(r.content)
