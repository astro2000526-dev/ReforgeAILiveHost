"""TTS orchestration — engine fallback chain + voice-clone reference helpers.

Engines, by layer:
    azure / edge  → app/tts providers (external network APIs)
    mms           → app/gpu (torch — GPU layer)
    espeak        → local CPU subprocess (offline last resort)
"""
import asyncio
import logging
import os
import secrets
import subprocess
from pathlib import Path

import httpx

from ..config import FFMPEG_BIN, OUTPUT_DIR
from ..gpu import get_gpu
from ..media import local_path_for

log = logging.getLogger("pipeline.tts")


# --- espeak-ng (offline, CPU) -------------------------------------------------

def _espeak_lang(voice: str) -> str:
    """Map our voice IDs to an espeak-ng language code."""
    v = (voice or "").lower()
    if v.startswith("th") or "premwadee" in v or "niwat" in v:
        return "th"
    if v.startswith("zh") or v.startswith("bv") or "cmn" in v:
        return "cmn"
    return "en"


async def _espeak_available_langs() -> set[str]:
    try:
        p = await asyncio.to_thread(subprocess.run, ["espeak-ng", "--voices"], capture_output=True, text=True)
        langs: set[str] = set()
        for line in p.stdout.splitlines()[1:]:
            parts = line.split()
            if len(parts) >= 4:
                langs.add(parts[1])
        return langs
    except Exception:
        return set()


async def tts_espeak(text: str, voice: str, out_path: Path) -> None:
    """Offline TTS via espeak-ng → wav. Works without network (CN-safe).
    espeak-ng has no Thai voice — fall back to English so we still get audio."""
    lang = _espeak_lang(voice)
    avail = await _espeak_available_langs()
    if avail and lang not in avail:
        lang = "en"  # Thai not supported by espeak-ng; English keeps the chain alive
    cmd = ["espeak-ng", "-v", lang, "-s", "150", "-w", str(out_path), text]
    proc = await asyncio.to_thread(subprocess.run, cmd, capture_output=True, text=True)
    if proc.returncode != 0 or not out_path.exists() or out_path.stat().st_size == 0:
        # last resort: plain default voice
        proc2 = await asyncio.to_thread(subprocess.run, ["espeak-ng", "-w", str(out_path), text], capture_output=True, text=True)
        if proc2.returncode != 0 or not out_path.exists() or out_path.stat().st_size == 0:
            raise RuntimeError(f"espeak-ng failed: {(proc.stderr or '')[-200:]}")


# --- network providers (app/tts clients) ---------------------------------------

async def tts_edge(text: str, voice: str, rate: str, out_path: Path) -> None:
    """edge-tts via the EdgeTTSProvider client (honors EDGE_TTS_PROXY)."""
    from ..tts.edge import EdgeTTSProvider
    await EdgeTTSProvider().synthesize(text, voice, rate, out_path)
    if out_path.stat().st_size == 0:
        raise RuntimeError("edge-tts produced empty audio")


async def tts_azure(text: str, voice: str, rate: str, out_path: Path,
                    azure_key: str | None = None, azure_region: str | None = None) -> None:
    """Azure Neural TTS (REST) — best Thai voices (Premwadee/Niwat), reads
    embedded English too. Key/region come from Settings (per-request) or env."""
    from ..tts.azure import AzureTTSProvider
    # explicit args win; AzureTTSProvider falls back to env when given None.
    prov = AzureTTSProvider(speech_key=(azure_key or None), region=(azure_region or None))
    # Azure needs a full neural voice name (xx-XX-NameNeural); fall back to a
    # sane Thai voice if we were handed an MMS-style id.
    az_voice = voice if (voice and voice.count("-") >= 2 and voice.endswith("Neural")) else "th-TH-PremwadeeNeural"
    await prov.synthesize(text, az_voice, rate, out_path)
    if not out_path.exists() or out_path.stat().st_size == 0:
        raise RuntimeError("azure TTS produced empty audio")


# --- fallback chain -------------------------------------------------------------

async def tts_to_file(text: str, voice: str, rate: str, out_path: Path,
                      azure_key: str | None = None, azure_region: str | None = None,
                      *, sovits: bool = False, pitch: float = 0.0,
                      emotion: str | None = None,
                      engine_prefs: dict | None = None) -> None:
    """TTS chain, China-safe:
      0. GPT-SoVITS (highest quality, pitch/emotion)  ← only when `sovits` on
      1. Azure Neural (best quality)                  ← when an Azure key is set
      2. MMS-TTS (Meta, offline neural — real Thai)   ← offline primary (GPU layer)
      3. edge-tts (good, but 403 in China)
      4. espeak-ng (robotic, last resort)
    Always writes audio to out_path or raises if all fail.

    `engine_prefs` is an optional override dict; recognized keys: ``sovits``
    (bool), ``pitch`` (float), ``emotion`` (str), ``speed`` (float). It layers
    on top of the same-named keyword args so a caller can pass either form.
    When sovits is disabled (default) the chain is byte-identical to before."""
    prefs = engine_prefs or {}
    use_sovits = bool(prefs.get("sovits", sovits))
    p_pitch = float(prefs.get("pitch", pitch) or 0.0)
    p_emotion = prefs.get("emotion", emotion)
    p_speed = float(prefs.get("speed", 1.0) or 1.0)
    sovits_url = prefs.get("sovits_url")

    has_azure = bool((azure_key or os.getenv("AZURE_SPEECH_KEY") or "").strip())
    has_proxy = bool((os.getenv("EDGE_TTS_PROXY") or "").strip())
    if has_azure:
        order = ["azure", "mms", "espeak"]
    elif has_proxy:
        order = ["edge", "mms", "espeak"]
    else:
        order = ["mms", "edge", "espeak"]
    # SoVITS goes FIRST when enabled; on failure we fall through unchanged.
    if use_sovits:
        order = ["sovits", *order]
    last_err: Exception | None = None
    for engine in order:
        try:
            if engine == "sovits":
                await get_gpu().tts_sovits(
                    text=text, voice=voice, out_path=out_path,
                    pitch=p_pitch, emotion=p_emotion, speed=p_speed,
                    sovits_url=sovits_url,
                )
            elif engine == "azure":
                await tts_azure(text, voice, rate, out_path, azure_key, azure_region)
            elif engine == "edge":
                await tts_edge(text, voice, rate, out_path)
            elif engine == "mms":
                await get_gpu().tts_local(text=text, voice=voice, out_path=out_path)
            else:
                await tts_espeak(text, voice, out_path)
            log.info("TTS via %s ok", engine)
            return
        except Exception as e:
            last_err = e
            log.warning("TTS %s failed (%s) — next", engine, type(e).__name__)
    raise RuntimeError(f"all TTS engines failed: {last_err}")


# --- voice-clone reference extraction (CPU ffmpeg + http fetch) ------------------

async def extract_ref_audio(video_url: str, out_wav: Path, seconds: int = 10) -> bool:
    """Fetch the avatar video and extract a clean mono reference clip for
    voice cloning. Returns True on success."""
    local = local_path_for(video_url)
    try:
        if local:
            src = local
        else:
            async with httpx.AsyncClient(timeout=120, follow_redirects=True) as c:
                r = await c.get(video_url)
                if r.status_code >= 400:
                    return False
                tmp = OUTPUT_DIR / f".refsrc_{secrets.token_hex(4)}.mp4"
                tmp.write_bytes(r.content)
                src = str(tmp)
        proc = await asyncio.to_thread(
            subprocess.run,
            [FFMPEG_BIN, "-y", "-i", str(src), "-t", str(seconds), "-vn", "-ac", "1", "-ar", "16000", str(out_wav)],
            capture_output=True, text=True,
        )
        if not local:
            Path(src).unlink(missing_ok=True)
        return proc.returncode == 0 and out_wav.exists() and out_wav.stat().st_size > 1000
    except Exception as e:
        log.warning("ref audio extract failed: %s", e)
        return False
