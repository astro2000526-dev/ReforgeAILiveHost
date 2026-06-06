"""MMS-TTS (Meta) — offline neural TTS, works in China (downloaded via hf-mirror).

Real Thai voice, unlike espeak. Models cached under HF_HOME (mounted volume).
torch/transformers imports stay lazy inside functions (GPU layer rule).
"""
import asyncio
import os
from pathlib import Path

_mms_cache: dict = {}


def mms_repo(voice: str) -> str:
    v = (voice or "").lower()
    if v.startswith("th") or "premwadee" in v or "niwat" in v or "achara" in v:
        return "facebook/mms-tts-tha"
    if v.startswith("zh") or v.startswith("bv") or "cmn" in v:
        return "facebook/mms-tts-cmn-script_simplified"
    return "facebook/mms-tts-eng"


def _mms_model(lang: str):
    """Load (cached) an MMS-TTS VitsModel for a language code (tha/eng/...).
    Prefers local weights (curl'd into /workspace/tmp/mms-tts-<lang>) because
    hf-mirror's 308 redirects break transformers' auto-download in CN."""
    import os as _os
    from transformers import AutoTokenizer, VitsModel
    local_dir = _os.getenv("MMS_DIR_PREFIX", "/workspace/tmp/mms-tts-") + lang
    src = local_dir if _os.path.isdir(local_dir) else f"facebook/mms-tts-{lang}"
    if src not in _mms_cache:
        model = VitsModel.from_pretrained(src)
        tok = AutoTokenizer.from_pretrained(src)
        model.eval()
        _mms_cache[src] = (model, tok)
    return _mms_cache[src]


def _split_codeswitch(text: str):
    """Split into runs of (lang, chunk). Thai chars → 'tha', everything else
    (Latin/digits/punct) → 'eng'. Consecutive same-lang chars are merged so
    'MacBook Pro รุ่นใหม่' → [('eng','MacBook Pro '),('tha','รุ่นใหม่')]."""
    runs: list[tuple[str, str]] = []
    cur_lang = None
    buf = ""
    for ch in text:
        if "฀" <= ch <= "๿":
            lang = "tha"
        elif ch.isspace():
            lang = cur_lang or "tha"   # whitespace sticks to current run
        else:
            lang = "eng"               # Latin, digits, punctuation
        if lang != cur_lang and buf.strip():
            runs.append((cur_lang, buf))
            buf = ""
        elif lang != cur_lang:
            buf = ""
        cur_lang = lang
        buf += ch
    if buf.strip():
        runs.append((cur_lang or "tha", buf))
    return runs


def _tts_mms_sync(text: str, voice: str, out_path: Path) -> None:
    import wave
    import numpy as np
    import torch

    primary = "tha" if mms_repo(voice).endswith("tha") else (
        "cmn-script_simplified" if mms_repo(voice).endswith("simplified") else "eng")

    # Code-switch only matters for Thai (mms-tts-tha drops Latin/digits).
    # For other primaries, synth the whole text in one model.
    if primary == "tha":
        runs = _split_codeswitch(text)
    else:
        runs = [(primary, text)]

    sr_out = 16000
    pieces: list = []
    for lang, chunk in runs:
        if not chunk.strip():
            continue
        try:
            model, tok = _mms_model(lang)
        except Exception:
            # fall back to primary model if the per-lang model is missing
            model, tok = _mms_model(primary)
        inputs = tok(chunk, return_tensors="pt")
        if inputs["input_ids"].shape[-1] == 0:
            continue
        # MMS-tha speaks rushed at the default rate; slow it a touch so it
        # sounds natural (lip-sync still matches — the slower audio is what we
        # feed Wav2Lip). speaking_rate<1 = slower.
        try:
            model.speaking_rate = float(os.getenv("MMS_SPEAKING_RATE", "1.0"))
        except Exception:
            pass
        with torch.no_grad():
            w = model(**inputs).waveform[0].cpu().numpy().astype("float32")
        sr = int(model.config.sampling_rate)
        if sr != sr_out:  # MMS langs are all 16k, but be safe
            idx = (np.arange(int(len(w) * sr_out / sr)) * sr / sr_out).astype(int)
            idx = idx[idx < len(w)]
            w = w[idx]
        pieces.append(w)
        pieces.append(np.zeros(int(sr_out * 0.12), dtype="float32"))  # small gap

    if not pieces:
        raise RuntimeError("MMS-TTS produced no audio (empty text?)")
    wav = np.concatenate(pieces)
    pcm = (np.clip(wav, -1.0, 1.0) * 32767.0).astype("<i2")
    with wave.open(str(out_path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr_out)
        w.writeframes(pcm.tobytes())
    if out_path.stat().st_size == 0:
        raise RuntimeError("MMS-TTS produced empty audio")


async def tts_mms(text: str, voice: str, out_path: Path) -> None:
    await asyncio.to_thread(_tts_mms_sync, text, voice, out_path)
