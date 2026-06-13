"""TTS orchestration — engine fallback chain + voice-clone reference helpers.

Engines, by layer:
    azure / edge  → app/tts providers (external network APIs)
    mms           → app/gpu (torch — GPU layer)
    espeak        → local CPU subprocess (offline last resort)
"""
import asyncio
import hashlib
import logging
import os
import secrets
import shutil
import subprocess
from pathlib import Path

import httpx

from ..config import FFMPEG_BIN, OUTPUT_DIR
from ..gpu import get_gpu
from ..media import local_path_for

log = logging.getLogger("pipeline.tts")


# --- content-addressed TTS cache ----------------------------------------------
# Identical (text, voice, rate, provider/engine) inputs re-synthesized cost a
# repeated paid API call (Azure/Google bill per char) or a repeated GPU run
# (SoVITS/MMS) and the full network RTT. A live stream re-speaks the same reply
# lines, and re-renders re-voice the same script — so a small disk cache cuts
# both cost and latency. Opt out with TTS_CACHE_DISABLED=1.

_TTS_CACHE_DIR = OUTPUT_DIR / ".tts_cache"
_TTS_CACHE_MAX = int(os.getenv("TTS_CACHE_MAX_ENTRIES") or "2000")


def _tts_cache_enabled() -> bool:
    return (os.getenv("TTS_CACHE_DISABLED") or "").strip().lower() not in ("1", "true", "yes")


def _tts_cache_key(text: str, voice: str, rate: str, *, primary: str,
                   use_sovits: bool, pitch: float, emotion: str | None,
                   sovits_url: str | None) -> str:
    """Key on everything that changes the produced bytes. `primary` is the
    resolved FIRST engine of the chain (order[0]) — it already encodes the full
    routing decision (provider + key presence + EDGE_TTS_PROXY), so it's the one
    field needed instead of the raw presence flags. We only write-through the
    cache when this primary engine is the one that actually produced the audio
    (see the loop), so a key never maps to a different engine's bytes.
    pitch/emotion/sovits_url only matter for SoVITS, so they're folded in only then."""
    h = hashlib.sha256()
    parts = [text, voice, rate, primary, str(use_sovits)]
    if use_sovits:
        parts += [f"{pitch:.3f}", emotion or "", sovits_url or ""]
    for p in parts:
        h.update(p.encode("utf-8", "replace"))
        h.update(b"\x00")
    return h.hexdigest()


def _tts_cache_get(key: str, out_path: Path) -> bool:
    src = _TTS_CACHE_DIR / key
    try:
        if src.is_file() and src.stat().st_size > 0:
            out_path.write_bytes(src.read_bytes())
            return out_path.stat().st_size > 0
    except OSError:
        pass
    return False


def _tts_cache_put(key: str, out_path: Path) -> None:
    try:
        if not (out_path.exists() and out_path.stat().st_size > 0):
            return
        _TTS_CACHE_DIR.mkdir(parents=True, exist_ok=True)
        dst = _TTS_CACHE_DIR / key
        if dst.exists():
            return
        # Bound the cache: prune the oldest ~20% by mtime when over the cap.
        try:
            entries = [p for p in _TTS_CACHE_DIR.iterdir() if p.is_file() and not p.name.endswith(".tmp")]
            if len(entries) >= _TTS_CACHE_MAX:
                entries.sort(key=lambda p: p.stat().st_mtime)
                for p in entries[: max(1, _TTS_CACHE_MAX // 5)]:
                    p.unlink(missing_ok=True)
        except OSError:
            pass
        tmp = _TTS_CACHE_DIR / f"{key}.{secrets.token_hex(4)}.tmp"
        shutil.copyfile(out_path, tmp)
        tmp.replace(dst)  # atomic publish (unique tmp avoids concurrent-writer collisions)
    except OSError:
        pass


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


_GOOGLE_VOICE_TOKENS = ("standard", "wavenet", "neural2", "chirp", "studio",
                        "news", "polyglot", "journey", "casual")


def _google_voice_for(voice: str) -> str:
    """Google needs a Google voice name (th-TH-Standard-A, th-TH-Neural2-C,
    th-TH-Chirp3-HD-Achernar, …). If we were handed an Azure-style id
    (th-TH-PremwadeeNeural) or an MMS id, derive a safe Google default from the
    locale prefix — Standard exists for every supported locale and is cheapest."""
    v = (voice or "").strip()
    if v.count("-") >= 2 and any(tok in v.lower() for tok in _GOOGLE_VOICE_TOKENS):
        return v
    parts = v.split("-")
    lang = f"{parts[0]}-{parts[1]}" if len(parts) >= 2 else "th-TH"
    return f"{lang}-Standard-A"


async def tts_google(text: str, voice: str, rate: str, out_path: Path,
                     google_key: str | None = None) -> None:
    """Google Cloud TTS (REST, API-key). Cheapest neural-grade Thai option
    (Standard ~$4/1M chars). Key comes from Settings (per-request) or env."""
    from ..tts.google import GoogleTTSProvider
    prov = GoogleTTSProvider(api_key=(google_key or None))
    await prov.synthesize(text, _google_voice_for(voice), rate, out_path)
    if not out_path.exists() or out_path.stat().st_size == 0:
        raise RuntimeError("google TTS produced empty audio")


# --- fallback chain -------------------------------------------------------------

async def tts_to_file(text: str, voice: str, rate: str, out_path: Path,
                      azure_key: str | None = None, azure_region: str | None = None,
                      google_key: str | None = None, provider: str | None = None,
                      *, sovits: bool = False, pitch: float = 0.0,
                      emotion: str | None = None,
                      engine_prefs: dict | None = None) -> None:
    """TTS chain, China-safe:
      0. GPT-SoVITS (highest quality, pitch/emotion)  ← only when `sovits` on
      1. Google Cloud TTS (cheapest neural-grade)     ← when a Google key is set
      2. Azure Neural (best Thai)                     ← when an Azure key is set
      3. MMS-TTS (Meta, offline neural — real Thai)   ← offline primary (GPU layer)
      4. edge-tts (good, but 403 in China)
      5. espeak-ng (robotic, last resort)
    Always writes audio to out_path or raises if all fail.

    `provider` is the user's explicit Settings choice ('google' | 'azure' |
    'edge-tts'); when set and usable it is tried FIRST, before the key-presence
    auto-order below. This honors the dropdown even if other keys are also set.

    `engine_prefs` is an optional override dict; recognized keys: ``sovits``
    (bool), ``pitch`` (float), ``emotion`` (str), ``speed`` (float),
    ``sovits_url`` (str), ``google_key`` (str), ``provider`` (str). It layers on
    top of the same-named keyword args so a caller can pass either form."""
    prefs = engine_prefs or {}
    use_sovits = bool(prefs.get("sovits", sovits))
    p_pitch = float(prefs.get("pitch", pitch) or 0.0)
    p_emotion = prefs.get("emotion", emotion)
    p_speed = float(prefs.get("speed", 1.0) or 1.0)
    sovits_url = prefs.get("sovits_url")
    google_key = prefs.get("google_key", google_key)
    provider = (prefs.get("provider", provider) or "").strip().lower()

    has_google = bool((google_key or os.getenv("GOOGLE_TTS_API_KEY") or "").strip())
    has_azure = bool((azure_key or os.getenv("AZURE_SPEECH_KEY") or "").strip())
    has_proxy = bool((os.getenv("EDGE_TTS_PROXY") or "").strip())
    # Auto order by key presence — Google first (cheapest neural-grade), then
    # Azure, then edge (needs a CN-safe proxy), MMS offline always backstops.
    if has_google:
        order = ["google", "mms", "espeak"]
    elif has_azure:
        order = ["azure", "mms", "espeak"]
    elif has_proxy:
        order = ["edge", "mms", "espeak"]
    else:
        order = ["mms", "edge", "espeak"]
    # Honor the explicit Settings provider: move its engine to the front when
    # it's actually usable (key present / always-available for edge).
    pref_engine = {"google": "google", "azure": "azure",
                   "edge-tts": "edge", "edge": "edge"}.get(provider)
    usable = {"google": has_google, "azure": has_azure, "edge": True}
    if pref_engine and usable.get(pref_engine, False):
        order = [pref_engine, *[e for e in order if e != pref_engine]]
        for tail in ("mms", "espeak"):   # keep offline backstops in the chain
            if tail not in order:
                order.append(tail)
    # SoVITS goes FIRST when enabled; on failure we fall through unchanged.
    if use_sovits:
        order = ["sovits", *order]

    # Cache lookup: keyed on the PRIMARY engine (order[0]) so the key changes
    # whenever routing changes, and the stored bytes always belong to that engine.
    primary_engine = order[0]
    ckey: str | None = None
    if _tts_cache_enabled():
        ckey = _tts_cache_key(
            text, voice, rate, primary=primary_engine, use_sovits=use_sovits,
            pitch=p_pitch, emotion=p_emotion, sovits_url=sovits_url,
        )
        if _tts_cache_get(ckey, out_path):
            log.info("TTS cache hit %s", ckey[:8])
            return

    last_err: Exception | None = None
    for engine in order:
        try:
            if engine == "sovits":
                await get_gpu().tts_sovits(
                    text=text, voice=voice, out_path=out_path,
                    pitch=p_pitch, emotion=p_emotion, speed=p_speed,
                    sovits_url=sovits_url,
                )
            elif engine == "google":
                await tts_google(text, voice, rate, out_path, google_key)
            elif engine == "azure":
                await tts_azure(text, voice, rate, out_path, azure_key, azure_region)
            elif engine == "edge":
                await tts_edge(text, voice, rate, out_path)
            elif engine == "mms":
                await get_gpu().tts_local(text=text, voice=voice, out_path=out_path)
            else:
                await tts_espeak(text, voice, out_path)
            log.info("TTS via %s ok", engine)
            # Only cache when the PREFERRED engine produced it — never store a
            # fallback (mms/espeak during a transient outage) under the preferred
            # key, or recovery would keep serving the degraded clip.
            if ckey and engine == primary_engine:
                _tts_cache_put(ckey, out_path)
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
    downloaded: Path | None = None
    try:
        if local:
            src = local
        else:
            async with httpx.AsyncClient(timeout=120, follow_redirects=True) as c:
                r = await c.get(video_url)
                if r.status_code >= 400:
                    return False
                downloaded = OUTPUT_DIR / f".refsrc_{secrets.token_hex(4)}.mp4"
                downloaded.write_bytes(r.content)
                src = str(downloaded)
        proc = await asyncio.to_thread(
            subprocess.run,
            [FFMPEG_BIN, "-y", "-i", str(src), "-t", str(seconds), "-vn", "-ac", "1", "-ar", "16000", str(out_wav)],
            capture_output=True, text=True,
        )
        return proc.returncode == 0 and out_wav.exists() and out_wav.stat().st_size > 1000
    except Exception as e:
        log.warning("ref audio extract failed: %s", e)
        return False
    finally:
        # Always remove the downloaded temp — even if ffmpeg raised — so repeated
        # voice-clone attempts on a broken ffmpeg env don't leak .refsrc files.
        if downloaded is not None:
            downloaded.unlink(missing_ok=True)
