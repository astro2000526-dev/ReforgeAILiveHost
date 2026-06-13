"""Azure Speech TTS provider.

Uses the Speech REST API directly (no Azure SDK). This avoids the native binary
dependencies of `azure-cognitiveservices-speech` and keeps the Docker image on
RunPod small.

Docs: https://learn.microsoft.com/en-us/azure/ai-services/speech-service/rest-text-to-speech

Auth: `Ocp-Apim-Subscription-Key: <speech_key>` header. The Speech key is the
"Key 1" or "Key 2" value from the Azure portal's Speech resource → "Keys and
Endpoint" tab. Either key works.

Voice format: full Azure neural voice name. Examples for SEA markets:
  - 泰语女声:    th-TH-PremwadeeNeural   (this is the same voice edge-tts wraps)
  - 泰语男声:    th-TH-NiwatNeural
  - 印尼语女声:  id-ID-GadisNeural
  - 印尼语男声:  id-ID-ArdiNeural
  - 越南语女声:  vi-VN-HoaiMyNeural
  - 越南语男声:  vi-VN-NamMinhNeural
  - 英语女声:    en-US-JennyNeural / en-SG-LunaNeural

Rate: edge-tts-style "+10%" / "-5%" / "+0%" — passed straight through to SSML
`<prosody rate="...">`, which accepts the same syntax.

SSML safety: text is XML-escaped before splicing into the SSML envelope. So
quotes, &, <, > in LLM-generated copy can't break the markup.
"""
from __future__ import annotations

import os
from pathlib import Path
from xml.sax.saxutils import escape as xml_escape

import httpx

from .base import TTSError


def _voice_to_lang(voice: str) -> str:
    """th-TH-PremwadeeNeural -> th-TH"""
    parts = voice.split("-")
    if len(parts) >= 2:
        return f"{parts[0]}-{parts[1]}"
    return "en-US"


def _build_ssml(text: str, voice: str, rate: str) -> str:
    lang = _voice_to_lang(voice)
    escaped = xml_escape(text)
    rate_str = (rate or "+0%").strip() or "+0%"
    return (
        '<speak version="1.0" '
        'xmlns="http://www.w3.org/2001/10/synthesis" '
        f'xml:lang="{lang}">'
        f'<voice name="{voice}">'
        f'<prosody rate="{rate_str}">{escaped}</prosody>'
        '</voice></speak>'
    )


class AzureTTSProvider:
    name = "azure"

    # 96kbit (was 48kbit) — the synth output is loudnorm-filtered then re-encoded
    # to AAC downstream, so a higher-bitrate source avoids compounding mp3 loss on
    # the product voice. Azure bills per character, not bitrate — quality is free.
    DEFAULT_OUTPUT_FORMAT = "audio-24khz-96kbitrate-mono-mp3"

    def __init__(
        self,
        speech_key: str | None = None,
        region: str | None = None,
        output_format: str | None = None,
        timeout_sec: float = 30.0,
    ) -> None:
        self.speech_key = speech_key or os.getenv("AZURE_SPEECH_KEY") or ""
        self.region = region or os.getenv("AZURE_SPEECH_REGION") or "southeastasia"
        self.output_format = (
            output_format
            or os.getenv("AZURE_SPEECH_FORMAT")
            or self.DEFAULT_OUTPUT_FORMAT
        )
        self.timeout_sec = timeout_sec
        if not self.speech_key:
            raise TTSError(
                "AZURE_SPEECH_KEY must be set to use the azure TTS provider. "
                "Get it from portal.azure.com → your Speech resource → 'Keys and Endpoint'."
            )

    @property
    def endpoint(self) -> str:
        return f"https://{self.region}.tts.speech.microsoft.com/cognitiveservices/v1"

    async def synthesize(
        self, text: str, voice: str, rate: str, output_path: Path
    ) -> Path:
        ssml = _build_ssml(text, voice, rate)
        headers = {
            "Ocp-Apim-Subscription-Key": self.speech_key,
            "Content-Type": "application/ssml+xml",
            "X-Microsoft-OutputFormat": self.output_format,
            "User-Agent": "reforge-ai-livehost/0.1",
        }
        async with httpx.AsyncClient(timeout=self.timeout_sec) as client:
            r = await client.post(
                self.endpoint, content=ssml.encode("utf-8"), headers=headers
            )
        if r.status_code != 200:
            raise TTSError(f"Azure TTS HTTP {r.status_code}: {r.text[:300]}")
        output_path.write_bytes(r.content)
        return output_path
