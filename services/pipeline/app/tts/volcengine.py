"""Volcengine (字节火山引擎) TTS provider — 小模型 HTTP 非流式 接口.

Why this specific API (confirmed from console docs 2026-05-19):
  - Thai / Vietnamese / Indonesian voices are ONLY in the "小模型" voice list
    under 豆包语音 → 历史文档 → 历史语音合成接口 → 小模型音色列表.
  - Volcengine has no large-model TTS for these SEA languages yet.
  - WebSocket V1 is marked "不推荐" by Volcengine themselves; HTTP non-streaming
    is the recommended path for our use case (per-segment short text).

Voice IDs confirmed in console docs:
  - 泰语 (Thai):       BV421_streaming  "天才少女"   (multilingual voice)
  - 越南语 (Vietnamese): BV421_streaming  "天才少女"   (same multilingual voice)
  - 印尼语 (Indonesian): BV421_streaming  "天才少女"   (same)
                        BV702_streaming  "Stefan"   (male alt)
                        BV700_streaming  "灿灿"     (female alt)

Things to verify on first real call (these may still bite):
  1. Endpoint host. Mainland CN appid uses `openspeech.bytedance.com`;
     overseas/SG appid uses `openspeech-sg.bytedance.com`. Override via
     VOLCENGINE_ENDPOINT in .env if needed.
  2. Authorization header: currently "Bearer;<token>" (semicolon, not space).
     If you get HTTP 401, double-check the docs page in case format changed.
  3. Cluster name. For the small-model HTTP API the docs usually specify
     "volcano_tts"; if you see code=3050 "invalid cluster", try the cluster
     name displayed in your application's detail page.
  4. Multilingual voices: BV421_streaming may auto-detect language from text,
     or may need an explicit language hint. If Thai input produces Chinese
     output, add a `language` field to the request body per the API docs.

Rate handling:
  - Caller passes `rate` as an edge-tts-style string ("+10%", "-5%", "+0%").
  - We translate to Volcengine's `speed_ratio` float (1.10, 0.95, 1.00),
    clamped to [0.5, 2.0].
"""
from __future__ import annotations

import base64
import os
import uuid
from pathlib import Path

import httpx

from .base import TTSError


DEFAULT_ENDPOINT = "https://openspeech.bytedance.com/api/v1/tts"


def _rate_to_speed_ratio(rate: str) -> float:
    rate = (rate or "+0%").strip()
    if rate.endswith("%"):
        try:
            pct = float(rate.rstrip("%"))
            return max(0.5, min(2.0, 1.0 + pct / 100.0))
        except ValueError:
            return 1.0
    try:
        return max(0.5, min(2.0, float(rate)))
    except ValueError:
        return 1.0


class VolcengineTTSProvider:
    name = "volcengine"

    def __init__(
        self,
        appid: str | None = None,
        access_token: str | None = None,
        cluster: str | None = None,
        endpoint: str | None = None,
        timeout_sec: float = 30.0,
    ) -> None:
        # Chain `or` so empty strings in .env fall through to the next source.
        # os.getenv("X", default) returns "" (not default) when X is set-but-empty,
        # which is exactly what .env files give you for blank keys.
        self.appid = appid or os.getenv("VOLCENGINE_APPID") or ""
        self.access_token = access_token or os.getenv("VOLCENGINE_ACCESS_TOKEN") or ""
        self.cluster = cluster or os.getenv("VOLCENGINE_CLUSTER") or "volcano_tts"
        self.endpoint = endpoint or os.getenv("VOLCENGINE_ENDPOINT") or DEFAULT_ENDPOINT
        self.timeout_sec = timeout_sec
        if not self.appid or not self.access_token:
            raise TTSError(
                "VOLCENGINE_APPID and VOLCENGINE_ACCESS_TOKEN must be set "
                "to use the volcengine TTS provider."
            )

    async def synthesize(
        self, text: str, voice: str, rate: str, output_path: Path
    ) -> Path:
        payload = {
            "app": {
                "appid": self.appid,
                "token": self.access_token,
                "cluster": self.cluster,
            },
            "user": {"uid": "reforge-ai-livehost"},
            "audio": {
                "voice_type": voice,
                "encoding": "mp3",
                "speed_ratio": _rate_to_speed_ratio(rate),
                "volume_ratio": 1.0,
                "pitch_ratio": 1.0,
                "rate": 24000,
            },
            "request": {
                "reqid": str(uuid.uuid4()),
                "text": text,
                "text_type": "plain",
                "operation": "query",
            },
        }
        headers = {
            "Authorization": f"Bearer;{self.access_token}",
            "Content-Type": "application/json",
        }

        async with httpx.AsyncClient(timeout=self.timeout_sec) as client:
            r = await client.post(self.endpoint, json=payload, headers=headers)

        if r.status_code != 200:
            raise TTSError(
                f"volcengine HTTP {r.status_code}: {r.text[:300]}"
            )
        body = r.json()
        if body.get("code") not in (3000, 0):
            # Volcengine returns 3000 on success per their docs;
            # other codes (e.g., 3001 invalid params, 3050 invalid voice) are errors.
            raise TTSError(
                f"volcengine code={body.get('code')} msg={body.get('message')!r}"
            )
        audio_b64 = body.get("data")
        if not audio_b64:
            raise TTSError(f"volcengine returned no audio data: {body}")
        output_path.write_bytes(base64.b64decode(audio_b64))
        return output_path
