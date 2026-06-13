"""Google Cloud Text-to-Speech provider — REST API, API-key auth.

Why the REST API with a plain API key (not the google-cloud SDK + service
account JSON):
  - "key in Settings" UX: the user pastes ONE API key into the web Settings
    page, exactly like Azure. No service-account JSON, no GOOGLE_APPLICATION_
    CREDENTIALS file, no OAuth dance — the key goes straight in the `?key=`
    query param of the synth endpoint.
  - Keeps the Docker image small (no google-cloud-texttospeech / grpc / its
    native deps), same rationale as azure.py avoiding the Azure Speech SDK.

Docs: https://cloud.google.com/text-to-speech/docs/reference/rest/v1/text/synthesize

Cost-per-performance (why we add Google at all, and route to it first when a
key is set):
  - Standard voices  : ~$4 / 1M chars   — cheapest neural-grade option here
  - WaveNet/Neural2  : ~$16 / 1M chars  — same tier as Azure Neural
  - Chirp3-HD        : ~$30 / 1M chars  — top quality
  Azure Neural is ~$16/1M with no cheaper tier, so Google Standard cuts TTS
  spend ~4x at good Thai quality. The chain prefers Google when a key exists.

Voice format: full Google voice name, e.g.
  - th-TH-Standard-A       泰语女声 (cheapest)
  - th-TH-Neural2-C        泰语 (high quality)
  - th-TH-Chirp3-HD-Achernar   泰语 (top quality, conversational)
  - id-ID-Standard-A / vi-VN-Standard-A / en-US-Neural2-F …
languageCode is derived from the first two hyphen-segments (th-TH).

Rate: edge-tts-style "+10%" / "-5%" / "+0%" -> Google `speakingRate` float
(1.10 / 0.95 / 1.00), clamped to Google's [0.25, 4.0].

Chirp3-HD / Chirp-HD voices reject the `pitch` field — we only send pitch for
non-Chirp voices so a Chirp voice never 400s.
"""
from __future__ import annotations

import base64
import os
from pathlib import Path

import httpx

from .base import TTSError


DEFAULT_ENDPOINT = "https://texttospeech.googleapis.com/v1/text:synthesize"


def _voice_to_lang(voice: str) -> str:
    """th-TH-Standard-A -> th-TH"""
    parts = (voice or "").split("-")
    if len(parts) >= 2:
        return f"{parts[0]}-{parts[1]}"
    return "en-US"


def _rate_to_speaking_rate(rate: str) -> float:
    rate = (rate or "+0%").strip()
    if rate.endswith("%"):
        try:
            pct = float(rate.rstrip("%"))
            return max(0.25, min(4.0, 1.0 + pct / 100.0))
        except ValueError:
            return 1.0
    try:
        return max(0.25, min(4.0, float(rate)))
    except ValueError:
        return 1.0


class GoogleTTSProvider:
    name = "google"

    def __init__(
        self,
        api_key: str | None = None,
        endpoint: str | None = None,
        timeout_sec: float = 30.0,
    ) -> None:
        # Chain `or` so a set-but-empty env var falls through to the next source.
        self.api_key = api_key or os.getenv("GOOGLE_TTS_API_KEY") or ""
        self.endpoint = endpoint or os.getenv("GOOGLE_TTS_ENDPOINT") or DEFAULT_ENDPOINT
        self.timeout_sec = timeout_sec
        if not self.api_key:
            raise TTSError(
                "GOOGLE_TTS_API_KEY must be set to use the google TTS provider. "
                "Create one at console.cloud.google.com -> APIs & Services -> "
                "Credentials (enable the Cloud Text-to-Speech API first)."
            )

    async def synthesize(
        self, text: str, voice: str, rate: str, output_path: Path
    ) -> Path:
        lang = _voice_to_lang(voice)
        audio_config: dict = {
            "audioEncoding": "MP3",
            "speakingRate": _rate_to_speaking_rate(rate),
        }
        # Chirp(3)-HD voices don't accept `pitch`; everything else does.
        if "chirp" not in voice.lower():
            audio_config["pitch"] = 0.0
        payload = {
            "input": {"text": text},
            "voice": {"languageCode": lang, "name": voice},
            "audioConfig": audio_config,
        }
        # API key goes in the query param — never in a header or the body.
        params = {"key": self.api_key}
        headers = {"Content-Type": "application/json; charset=utf-8"}
        async with httpx.AsyncClient(timeout=self.timeout_sec) as client:
            r = await client.post(
                self.endpoint, params=params, json=payload, headers=headers
            )
        if r.status_code != 200:
            # Google returns a JSON error body — surface its message, not the key.
            raise TTSError(f"Google TTS HTTP {r.status_code}: {r.text[:300]}")
        body = r.json()
        audio_b64 = body.get("audioContent")
        if not audio_b64:
            raise TTSError(f"Google TTS returned no audioContent: {str(body)[:300]}")
        output_path.write_bytes(base64.b64decode(audio_b64))
        return output_path
