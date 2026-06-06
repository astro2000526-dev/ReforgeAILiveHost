"""HTTP client for GPT-SoVITS — high-quality zero-shot TTS (sibling service).

Deploy
------
The worker box runs the upstream **RVC-Boss/GPT-SoVITS `api.py`** server
(see services/sovits/README.md). That server is started with `python api.py
-p 9880` and exposes its OWN request contract — we call it DIRECTLY, no shim
process in between. This module IS our adapter onto api.py's real contract.

api.py real contract (what we actually POST)
--------------------------------------------
    POST /  json {
        "text":            <text to speak>,
        "text_language":   "th" | "zh" | "en",   ← inference language
        "refer_wav_path":  <path ON THE WORKER BOX to a 3-10s reference wav>,
        "prompt_text":     <transcript of that reference wav>,
        "prompt_language": "th" | "zh" | "en",    ← language of the reference
    }
    → 200 with raw WAV bytes (Content-Type: audio/wav)
    → 400 {"message": ...} on bad input

api.py also accepts top-level `speed` (GPT-SoVITS v2+) which we pass through.
NOTE: upstream api.py has no pitch/emotion knobs. We still ACCEPT `pitch` and
`emotion` in our signature (the OUR-side contract the rest of the pipeline
speaks) and forward them as best-effort extra json fields; an api.py build that
ignores unknown keys simply renders without them. This keeps the GPU-boundary
signature stable while leaving room for a pitch/emotion-capable fork later.

Voice → reference mapping
-------------------------
Our callers pass a plain `voice` string. We resolve it to a reference wav +
its prompt transcript under SOVITS_REF_DIR on the worker box:

    SOVITS_REF_DIR/<voice>.wav   ← the reference clip
    SOVITS_REF_DIR/<voice>.txt   ← line 1 = prompt_text, optional line 2 = lang

`refer_wav_path` is a path on the WORKER's filesystem (api.py reads it locally),
so SOVITS_REF_DIR must match where the references live next to the api.py box.
If `voice` already looks like an absolute/relative .wav path we use it verbatim.
"""
from __future__ import annotations

import os
from pathlib import Path

import httpx

# Map our voice-id / language hints onto GPT-SoVITS language codes.
_LANGS = {"th", "zh", "en", "ja", "ko", "yue"}


def _guess_language(voice: str) -> str:
    """Best-effort inference language from a voice id (th default)."""
    v = (voice or "").lower()
    if v.startswith("zh") or v.startswith("bv") or "cmn" in v or "chinese" in v:
        return "zh"
    if v.startswith("en") or "english" in v:
        return "en"
    return "th"


def _resolve_ref(voice: str) -> tuple[str, str, str]:
    """Resolve a voice id → (refer_wav_path, prompt_text, prompt_language).

    Convention: SOVITS_REF_DIR/<voice>.wav + <voice>.txt (line1 prompt_text,
    optional line2 prompt language). Paths are WORKER-local (api.py reads them).
    """
    ref_dir = (os.getenv("SOVITS_REF_DIR") or "/workspace/sovits/refs").rstrip("/")
    lang = _guess_language(voice)

    # voice given directly as a .wav path → use as-is; sibling .txt for prompt.
    if voice and voice.lower().endswith(".wav"):
        wav_path = voice
        txt_path = Path(voice).with_suffix(".txt")
    else:
        wav_path = f"{ref_dir}/{voice}.wav"
        txt_path = Path(f"{ref_dir}/{voice}.txt")

    prompt_text = ""
    prompt_lang = lang
    try:
        # The .txt may live on this box (shared mount) — read if reachable;
        # otherwise leave prompt_text empty and let api.py error clearly.
        if txt_path.exists():
            lines = txt_path.read_text(encoding="utf-8").splitlines()
            if lines:
                prompt_text = lines[0].strip()
            if len(lines) >= 2 and lines[1].strip().lower() in _LANGS:
                prompt_lang = lines[1].strip().lower()
    except Exception:
        pass

    return wav_path, prompt_text, prompt_lang


async def tts_sovits(
    *,
    text: str,
    voice: str,
    out_path: Path,
    pitch: float = 0.0,
    emotion: str | None = None,
    speed: float = 1.0,
    sovits_url: str | None = None,
) -> None:
    """Synthesize `text` via the GPT-SoVITS api.py server → WAV at out_path.

    URL precedence: explicit `sovits_url` arg > env GPT_SOVITS_URL.
    `pitch` (semitones -12..12) and `emotion` are forwarded best-effort; plain
    upstream api.py ignores unknown json keys. Raises RuntimeError on >=400.
    """
    base = (sovits_url or os.getenv("GPT_SOVITS_URL") or "").strip().rstrip("/")
    if not base:
        raise RuntimeError("no GPT-SoVITS service URL configured (GPT_SOVITS_URL)")

    refer_wav_path, prompt_text, prompt_language = _resolve_ref(voice)
    text_language = _guess_language(voice)

    payload: dict = {
        "text": text,
        "text_language": text_language,
        "refer_wav_path": refer_wav_path,
        "prompt_text": prompt_text,
        "prompt_language": prompt_language,
        # GPT-SoVITS v2+ honors top-level speed; clamp to a sane band.
        "speed": max(0.5, min(float(speed or 1.0), 2.0)),
        # OUR-contract extras — forwarded best-effort (ignored by plain api.py).
        "pitch": max(-12.0, min(float(pitch or 0.0), 12.0)),
    }
    if emotion:
        payload["emotion"] = emotion

    timeout = float(os.getenv("SOVITS_HTTP_TIMEOUT", "300"))
    async with httpx.AsyncClient(timeout=timeout) as c:
        r = await c.post(f"{base}/", json=payload)
        if r.status_code >= 400:
            raise RuntimeError(f"sovits HTTP {r.status_code}: {r.text[:200]}")
        out_path.write_bytes(r.content)
    if not out_path.exists() or out_path.stat().st_size == 0:
        raise RuntimeError("sovits produced empty audio")
