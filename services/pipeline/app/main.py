import asyncio
import logging
import os
import secrets
import subprocess
from pathlib import Path

# Load .env BEFORE anything that reads env vars (TTS provider selection,
# Supabase client, etc.) — uvicorn doesn't do this automatically.
# override=True so a value written to /workspace/.env wins over a blank/stale
# container -e var (e.g. AZURE_SPEECH_KEY="" baked at `docker run`). In the
# compose deploy there's no .env file, so container env is used as-is.
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env", override=True)

import httpx
from fastapi import BackgroundTasks, Depends, FastAPI, File, HTTPException, UploadFile, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .config import FFMPEG_BIN, OUTPUT_DIR
from .pipeline import GenerateInput, generate
from .schemas import (
    GenerateRequest,
    GenerateResponse,
    StreamStartRequest,
    StreamStatus,
)
from .streaming import start_stream, stop_stream, stream_status

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("pipeline")

# Public base URL the browser/ffmpeg can reach this service at (set in .env).
# Used to hand back a playable http URL for rendered clips. Falls back to "".
PUBLIC_BASE_URL = (os.getenv("PUBLIC_BASE_URL") or "").rstrip("/")

# Where the local Qwen (ollama) lives. host.docker.internal works for the
# legacy per-container deploy; the unified compose sets OLLAMA_URL=http://qwen:11434.
_OLLAMA_URL = (os.getenv("OLLAMA_URL") or "http://host.docker.internal:11434").rstrip("/")

app = FastAPI(title="ReforgeAILiveHost Pipeline", version="0.1.0")

# Serve finished mp4s + uploaded avatar assets so the dashboard can preview
# them and ffmpeg/RTMP can ingest them over http. OUTPUT_DIR == /workspace/output.
UPLOAD_DIR = OUTPUT_DIR / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/files", StaticFiles(directory=str(OUTPUT_DIR)), name="files")

# In-memory job state. Replace with Redis when we wire in the real queue (Day 3-4).
_jobs: dict[str, dict] = {}


# --- Auth -------------------------------------------------------------------
# Single shared secret between Web (Next.js) and this service. The Web side
# sends `Authorization: Bearer <PIPELINE_TOKEN>` from inside its API routes,
# so the token never reaches the browser. Health stays open for liveness
# probes (load balancer / docker healthcheck).
_PIPELINE_TOKEN = (os.getenv("PIPELINE_TOKEN") or "").strip()
_security = HTTPBearer(auto_error=True)


async def verify_pipeline_token(
    credentials: HTTPAuthorizationCredentials = Depends(_security),
) -> None:
    if not _PIPELINE_TOKEN:
        # Fail closed: an unset token in prod is more dangerous than a 503.
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="PIPELINE_TOKEN not configured on the pipeline service",
        )
    # constant-time compare so we don't leak the secret length via timing.
    if not secrets.compare_digest(credentials.credentials, _PIPELINE_TOKEN):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid pipeline token",
        )


@app.get("/health")
async def health():
    return {"ok": True}


# --- AI script generation (local Qwen via ollama) ---------------------------
class ScriptRequest(BaseModel):
    product_title: str = ""
    selling_points: list[str] = []
    price_now: float | None = None
    price_original: float | None = None
    language: str = "th"          # th | en | zh
    llm_url: str = _OLLAMA_URL
    model: str = "qwen2.5:3b"


_LANG_WORD = {"th": "ภาษาไทย", "en": "English", "zh": "中文"}


class LLMRequest(BaseModel):
    prompt: str
    model: str = "qwen2.5:3b"
    max_tokens: int = 256
    llm_url: str = _OLLAMA_URL


@app.post("/llm", dependencies=[Depends(verify_pipeline_token)])
async def llm_endpoint(req: LLMRequest):
    base = req.llm_url.rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=120) as c:
            r = await c.post(f"{base}/api/generate", json={
                "model": req.model, "prompt": req.prompt, "stream": False,
                "options": {"num_predict": req.max_tokens},
            })
            if r.status_code >= 400:
                raise HTTPException(502, f"LLM HTTP {r.status_code}: {r.text[:200]}")
            return {"text": r.json().get("response", "")}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"LLM unreachable: {type(e).__name__}: {str(e)[:150]}")


@app.post("/script", dependencies=[Depends(verify_pipeline_token)])
async def script_endpoint(req: ScriptRequest):
    lang = _LANG_WORD.get(req.language[:2], "ภาษาไทย")
    info = f"สินค้า: {req.product_title}\n"
    if req.selling_points:
        info += "จุดขาย: " + ", ".join(req.selling_points) + "\n"
    if req.price_now:
        info += f"ราคา: {req.price_now}" + (f" (ปกติ {req.price_original})" if req.price_original else "") + "\n"
    prompt = (
        f"คุณเป็นนักขายไลฟ์มืออาชีพ เขียนสคริปต์ขายของสด {lang} 6 ช่วงตามลำดับนี้: "
        "เปิดตัว, ปัญหา, แนะนำสินค้า, สาธิต, ราคา, ปิดการขาย. "
        "แต่ละช่วง 1-2 ประโยค กระชับ เป็นธรรมชาติ ชวนซื้อ. "
        "ตอบเป็น 6 บรรทัด บรรทัดละช่วง ขึ้นต้นด้วย [เปิดตัว] [ปัญหา] [แนะนำสินค้า] [สาธิต] [ราคา] [ปิดการขาย] "
        "ห้ามมีคำอธิบายอื่น.\n\n" + info
    )
    base = req.llm_url.rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=120) as c:
            r = await c.post(f"{base}/api/generate", json={"model": req.model, "prompt": prompt, "stream": False})
            if r.status_code >= 400:
                raise HTTPException(502, f"LLM HTTP {r.status_code}: {r.text[:200]}")
            text = r.json().get("response", "")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"LLM unreachable: {type(e).__name__}: {str(e)[:150]}")

    # parse [tag] lines → segments
    import re
    tag_map = {"เปิดตัว": "intro", "ปัญหา": "pain", "แนะนำสินค้า": "product", "สาธิต": "demo", "ราคา": "price", "ปิดการขาย": "cta"}
    segments = []
    for line in text.splitlines():
        line = line.strip()
        m = re.match(r"^\[?\s*([^\]\d.][^\]]*?)\s*\]?[:：]?\s*(.+)$", line)
        if not m:
            continue
        tag, body = m.group(1).strip(), m.group(2).strip()
        typ = tag_map.get(tag, None)
        if typ and body:
            segments.append({"type": typ, "text": body, "duration_sec": 32})
    # fallback: if parsing failed, split non-empty lines into generic segments
    if not segments:
        lines = [l.strip(" -•*") for l in text.splitlines() if l.strip()]
        order = ["intro", "pain", "product", "demo", "price", "cta"]
        segments = [{"type": order[min(i, 5)], "text": l, "duration_sec": 32} for i, l in enumerate(lines[:6])]
    return {"ok": True, "script_segments": segments, "raw": text[:1000]}


# --- Upload avatar assets (image / video) -----------------------------------
# Saves the file under /workspace/output/uploads and returns a public http URL
# (served by the /files mount). Used by the avatar-management UI.
_ALLOWED_EXT = {".mp4", ".mov", ".webm", ".m4v", ".jpg", ".jpeg", ".png", ".webp", ".gif"}


@app.post("/upload", dependencies=[Depends(verify_pipeline_token)])
async def upload_endpoint(file: UploadFile = File(...)):
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in _ALLOWED_EXT:
        raise HTTPException(400, f"unsupported file type: {ext or '(none)'}")
    is_video = ext in {".mp4", ".mov", ".webm", ".m4v"}
    out_ext = ".mp4" if is_video else ext
    name = f"{secrets.token_hex(8)}{out_ext}"
    dest = UPLOAD_DIR / name
    data = await file.read()

    if is_video:
        # Compress/normalize to ≤ Full-HD H.264 mp4 so it loads fast and ffmpeg
        # can loop it cheaply. Falls back to the raw bytes if ffmpeg fails.
        stage = UPLOAD_DIR / f".raw_{secrets.token_hex(4)}{ext}"
        await asyncio.to_thread(stage.write_bytes, data)
        ok = await asyncio.to_thread(_compress_video, stage, dest)
        await asyncio.to_thread(lambda: stage.unlink(missing_ok=True))
        if not ok:
            await asyncio.to_thread(dest.write_bytes, data)
    else:
        await asyncio.to_thread(dest.write_bytes, data)

    out_bytes = await asyncio.to_thread(lambda: dest.stat().st_size)
    url = f"{PUBLIC_BASE_URL}/files/uploads/{name}" if PUBLIC_BASE_URL else None
    return {"ok": True, "url": url, "path": str(dest), "bytes": out_bytes}


# Cap to Full-HD on the long edge; keep aspect; even dims for H.264.
_FIT_FHD = (
    "scale='min(1920,iw)':'min(1920,ih)':force_original_aspect_ratio=decrease,"
    "scale=trunc(iw/2)*2:trunc(ih/2)*2"
)


def _compress_video(src, dst) -> bool:
    cmd = [
        FFMPEG_BIN, "-y", "-i", str(src),
        "-vf", _FIT_FHD,
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "24",
        "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart",
        str(dst),
    ]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True)
        return r.returncode == 0 and dst.exists()
    except Exception:
        return False


# --- Render a fixed-length clip ---------------------------------------------
# Stream-only / demo path: produce an N-second mp4 WITHOUT TTS or MuseTalk.
# If a real template video is reachable we loop/trim it to N seconds; otherwise
# we fall back to a generated test pattern and report the problem in `errors`
# (the caller decides whether to continue). The clip is always produced so the
# user can push it straight to Facebook Live / any RTMP.

class RenderRequest(BaseModel):
    project_id: str
    duration_seconds: int = 30
    title: str | None = None
    template_url: str | None = None
    # --- AI render path (mode="ai") ---
    mode: str = "loop"                       # "loop" | "ai"
    script_text: str | None = None           # text to speak (edge-tts)
    avatar_image_url: str | None = None       # still image / first frame for lip-sync
    lipsync_url: str | None = None           # e.g. http://127.0.0.1:8001
    voice: str = "th-TH-PremwadeeNeural"
    rate: str = "+0%"
    voice_clone: bool = False                # clone avatar's voice (OpenVoice)
    playback_speed: float = 1.0              # final clip speed; <1 = slower (keeps A/V sync)
    output_name: str | None = None           # versioned output filename (else project_id)
    video_quality: str = "1080p"             # 1080p | 720p | 480p
    sound_mode: str = "normal"               # soft | normal | boost
    lip_blend: int = 30                      # 0..100 feather lip-crop edge (ความเนียน)
    azure_key: str | None = None             # Azure Speech key (from Settings); overrides env
    azure_region: str | None = None          # Azure region, e.g. eastus


# Live render progress, surfaced on the status panel via GET /render/active.
_render_jobs: dict[str, dict] = {}
_render_cancel: set[str] = set()


def _local_path_for(url: str | None) -> str | None:
    """If `url` points at our own /files mount, return the local file path so
    ffmpeg reads from disk instead of looping back through http (much faster +
    avoids the nginx proxy timeout)."""
    if not url or not PUBLIC_BASE_URL:
        return None
    prefix = f"{PUBLIC_BASE_URL}/files/"
    if not url.startswith(prefix):
        return None
    rel = url[len(prefix):].split("?", 1)[0]
    p = (OUTPUT_DIR / rel).resolve()
    try:
        if str(p).startswith(str(OUTPUT_DIR.resolve())) and p.is_file():
            return str(p)
    except Exception:
        pass
    return None


async def _resolve_template(url: str | None) -> tuple[str | None, str | None]:
    """Return (ffmpeg_input, error). Prefers a local path; else HEAD-checks http."""
    if not url:
        return None, "no template video URL on this avatar"
    local = _local_path_for(url)
    if local:
        return local, None
    if not url.startswith(("http://", "https://")):
        return None, f"template URL is not http(s): {url}"
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=8) as c:
            r = await c.head(url)
            if r.status_code >= 400:
                return None, f"template video returned HTTP {r.status_code}: {url}"
            return url, None
    except Exception as e:
        return None, f"template video unreachable ({type(e).__name__}): {url}"


def _run_ffmpeg_progress(cmd: list[str], dur: int, pid: str, source: str) -> subprocess.CompletedProcess:
    """Run ffmpeg with -progress so we can publish % into _render_jobs."""
    _render_jobs[pid] = {"status": "rendering", "pct": 0, "duration": dur, "source": source}
    full = cmd + ["-progress", "pipe:1", "-nostats"]
    proc = subprocess.Popen(full, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    err_lines: list[str] = []
    assert proc.stdout is not None
    for line in proc.stdout:
        line = line.strip()
        if line.startswith("out_time_us=") or line.startswith("out_time_ms="):
            try:
                micros = int(line.split("=", 1)[1])
                secs = micros / 1_000_000.0
                pct = max(0, min(99, int(secs / dur * 100)))
                _render_jobs[pid]["pct"] = pct
            except Exception:
                pass
    proc.wait()
    if proc.stderr:
        err_lines = proc.stderr.read().splitlines()
    rc = proc.returncode
    _render_jobs[pid] = {**_render_jobs[pid], "status": "done" if rc == 0 else "failed", "pct": 100 if rc == 0 else _render_jobs[pid].get("pct", 0)}
    return subprocess.CompletedProcess(full, rc, "", "\n".join(err_lines[-20:]))


@app.get("/render/active")
async def render_active():
    """Unauthenticated, read-only — consumed by the status panel."""
    active = {k: v for k, v in _render_jobs.items() if v.get("status") == "rendering"}
    return {"active": active, "all": _render_jobs}


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


async def _tts_espeak(text: str, voice: str, out_path: Path) -> None:
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


async def _tts_edge(text: str, voice: str, rate: str, out_path: Path) -> None:
    """edge-tts: text → mp3. Geo-blocked (403) in China unless EDGE_TTS_PROXY
    points at a proxy outside CN (e.g. http://host:port or socks5://host:port)."""
    import edge_tts
    proxy = (os.getenv("EDGE_TTS_PROXY") or "").strip() or None
    comm = edge_tts.Communicate(text=text, voice=voice, rate=rate, proxy=proxy)
    with open(out_path, "wb") as f:
        async for chunk in comm.stream():
            if chunk.get("type") == "audio":
                f.write(chunk["data"])
    if out_path.stat().st_size == 0:
        raise RuntimeError("edge-tts produced empty audio")


# MMS-TTS (Meta) — offline neural TTS, works in China (downloaded via hf-mirror).
# Real Thai voice, unlike espeak. Models cached under HF_HOME (mounted volume).
_mms_cache: dict = {}


def _mms_repo(voice: str) -> str:
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
    import re
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

    primary = "tha" if _mms_repo(voice).endswith("tha") else (
        "cmn-script_simplified" if _mms_repo(voice).endswith("simplified") else "eng")

    # Code-switch only matters for Thai (mms-tts-tha drops Latin/digits).
    # For other primaries, synth the whole text in one model.
    if primary == "tha":
        runs = _split_codeswitch(text)
    else:
        runs = [(primary, text)]

    sr_out = 16000
    pieces: list[np.ndarray] = []
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
            import math
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


async def _tts_mms(text: str, voice: str, out_path: Path) -> None:
    await asyncio.to_thread(_tts_mms_sync, text, voice, out_path)


# --- Voice cloning (OpenVoice v2 tone conversion) ---------------------------
# Converts the TTS audio's TIMBRE to match a reference voice (extracted from
# the avatar's own video), keeping the spoken Thai/English content. Cached
# converter; CPU (pipeline container's torch can't see the GPU here).
_ov_converter = None


def _get_ov_converter():
    global _ov_converter
    if _ov_converter is not None:
        return _ov_converter
    import os as _os
    import wavmark
    class _D:
        def to(self, *a, **k):
            return self
    wavmark.load_model = lambda *a, **k: _D()          # skip watermark (CN-blocked)
    import openvoice_cli
    from openvoice_cli.api import ToneColorConverter
    ToneColorConverter.add_watermark = lambda self, audio, message: audio
    # Locate the bundled converter checkpoint relative to the installed package
    # (works whether openvoice-cli is a --user or system install). Fall back to
    # the legacy hard-coded path + an OPENVOICE_CONVERTER_DIR override.
    cdir = _os.getenv("OPENVOICE_CONVERTER_DIR") or _os.path.join(
        _os.path.dirname(openvoice_cli.__file__), "checkpoints", "converter")
    if not _os.path.exists(_os.path.join(cdir, "checkpoint.pth")):
        cdir = "/home/pipeline/.local/lib/python3.10/site-packages/openvoice_cli/checkpoints/converter"
    conv = ToneColorConverter(_os.path.join(cdir, "config.json"), device="cpu")
    conv.load_ckpt(_os.path.join(cdir, "checkpoint.pth"))
    _ov_converter = conv
    return conv


def _voice_clone_sync(src_wav: Path, ref_wav: Path, out_wav: Path) -> None:
    conv = _get_ov_converter()
    src_se = conv.extract_se(str(src_wav))
    tgt_se = conv.extract_se(str(ref_wav))
    conv.convert(str(src_wav), src_se, tgt_se, str(out_wav))


async def _voice_clone(src_wav: Path, ref_wav: Path, out_wav: Path) -> None:
    await asyncio.to_thread(_voice_clone_sync, src_wav, ref_wav, out_wav)


async def _extract_ref_audio(video_url: str, out_wav: Path, seconds: int = 10) -> bool:
    """Fetch the avatar video and extract a clean mono reference clip for
    voice cloning. Returns True on success."""
    local = _local_path_for(video_url)
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


async def _tts_azure(text: str, voice: str, rate: str, out_path: Path,
                     azure_key: str | None = None, azure_region: str | None = None) -> None:
    """Azure Neural TTS (REST) — best Thai voices (Premwadee/Niwat), reads
    embedded English too. Key/region come from Settings (per-request) or env."""
    from .tts.azure import AzureTTSProvider
    # explicit args win; AzureTTSProvider falls back to env when given None.
    prov = AzureTTSProvider(speech_key=(azure_key or None), region=(azure_region or None))
    # Azure needs a full neural voice name (xx-XX-NameNeural); fall back to a
    # sane Thai voice if we were handed an MMS-style id.
    az_voice = voice if (voice and voice.count("-") >= 2 and voice.endswith("Neural")) else "th-TH-PremwadeeNeural"
    await prov.synthesize(text, az_voice, rate, out_path)
    if not out_path.exists() or out_path.stat().st_size == 0:
        raise RuntimeError("azure TTS produced empty audio")


async def _tts_to_file(text: str, voice: str, rate: str, out_path: Path,
                       azure_key: str | None = None, azure_region: str | None = None) -> None:
    """TTS chain, China-safe:
      0. Azure Neural (best quality)                  ← when an Azure key is set
      1. MMS-TTS (Meta, offline neural — real Thai)   ← offline primary
      2. edge-tts (good, but 403 in China)
      3. espeak-ng (robotic, last resort)
    Always writes audio to out_path or raises if all fail."""
    has_azure = bool((azure_key or os.getenv("AZURE_SPEECH_KEY") or "").strip())
    has_proxy = bool((os.getenv("EDGE_TTS_PROXY") or "").strip())
    if has_azure:
        order = ["azure", "mms", "espeak"]
    elif has_proxy:
        order = ["edge", "mms", "espeak"]
    else:
        order = ["mms", "edge", "espeak"]
    last_err: Exception | None = None
    for engine in order:
        try:
            if engine == "azure":
                await _tts_azure(text, voice, rate, out_path, azure_key, azure_region)
            elif engine == "edge":
                await _tts_edge(text, voice, rate, out_path)
            elif engine == "mms":
                await _tts_mms(text, voice, out_path)
            else:
                await _tts_espeak(text, voice, out_path)
            log.info("TTS via %s ok", engine)
            return
        except Exception as e:
            last_err = e
            log.warning("TTS %s failed (%s) — next", engine, type(e).__name__)
    raise RuntimeError(f"all TTS engines failed: {last_err}")


async def _render_ai(req: RenderRequest, out_path: Path) -> list[str]:
    """AI lip-sync path: script → edge-tts → lipsync service → mp4 at out_path.
    Returns a list of non-fatal warnings. Raises on hard failure so the caller
    can fall back to the loop/testpattern path."""
    import base64
    warnings: list[str] = []
    pid = req.project_id
    _render_jobs[pid] = {"status": "rendering", "pct": 5, "duration": req.duration_seconds, "source": "ai-tts"}

    if not req.script_text or not req.script_text.strip():
        raise RuntimeError("ai mode requires script_text")
    if not req.avatar_image_url:
        raise RuntimeError("ai mode requires avatar_image_url")
    if not req.lipsync_url:
        raise RuntimeError("ai mode requires lipsync_url")

    # 1) TTS → audio, then trim to the requested duration so we don't lip-sync
    #    a 3-minute script into a huge frame array (mock OOMs, musetalk slow).
    raw_audio = OUTPUT_DIR / f".{pid}.tts.raw"
    await _tts_to_file(req.script_text.strip(), req.voice, req.rate, raw_audio,
                       azure_key=req.azure_key, azure_region=req.azure_region)
    audio_path = OUTPUT_DIR / f".{pid}.tts.wav"
    dur_cap = max(1, min(int(req.duration_seconds or 15), 1800))  # AI clips: cap 30 min
    trim = await asyncio.to_thread(
        subprocess.run,
        [FFMPEG_BIN, "-y", "-i", str(raw_audio), "-t", str(dur_cap),
         "-af", _loudnorm_af(req.sound_mode),
         "-ar", "16000", "-ac", "1", str(audio_path)],
        capture_output=True, text=True,
    )
    raw_audio.unlink(missing_ok=True)
    if trim.returncode != 0 or not audio_path.exists():
        raise RuntimeError(f"audio trim failed: {(trim.stderr or '')[-200:]}")

    # 1b) Voice clone (optional): convert TTS timbre → the avatar's own voice,
    #     using a reference clip extracted from the avatar video. Best-effort —
    #     on any failure we keep the plain TTS audio.
    if req.voice_clone and req.avatar_image_url:
        _render_jobs[pid] = {**_render_jobs[pid], "pct": 20, "source": "ai-clone"}
        try:
            ref_wav = OUTPUT_DIR / f".{pid}.ref.wav"
            if await _extract_ref_audio(req.avatar_image_url, ref_wav, seconds=10):
                cloned = OUTPUT_DIR / f".{pid}.clone.wav"
                await _voice_clone(audio_path, ref_wav, cloned)
                # resample clone back to 16k mono for lip-sync
                trim2 = await asyncio.to_thread(
                    subprocess.run,
                    [FFMPEG_BIN, "-y", "-i", str(cloned),
                     "-af", _loudnorm_af(req.sound_mode),
                     "-ar", "16000", "-ac", "1", str(audio_path)],
                    capture_output=True, text=True,
                )
                ref_wav.unlink(missing_ok=True)
                cloned.unlink(missing_ok=True)
                if trim2.returncode == 0:
                    log.info("voice clone applied for %s", pid)
                else:
                    warnings.append("voice clone resample failed, used plain TTS")
            else:
                warnings.append("could not extract reference audio for voice clone")
        except Exception as e:
            warnings.append(f"voice clone failed ({type(e).__name__}), used plain TTS")
            log.warning("voice clone failed for %s: %s", pid, e)

    _render_jobs[pid] = {**_render_jobs[pid], "pct": 35, "source": "ai-lipsync"}

    # 2) call lipsync /lip-sync — pass avatar by URL (service fetches it),
    #    audio inline as base64, ask for the file back.
    audio_b64 = base64.b64encode(audio_path.read_bytes()).decode()
    payload = {
        "avatar_url": req.avatar_image_url,
        "audio_base64": audio_b64,
        "return_mode": "file",
        "max_edge": _lipsync_max_edge(req.video_quality or "1080p"),
        "lip_blend": int(req.lip_blend if req.lip_blend is not None else 30),
    }
    base = req.lipsync_url.rstrip("/")
    # MuseTalk reloads its models per request and is much slower than Wav2Lip,
    # so allow a longer wait via env (default 900s; bump for musetalk).
    _ls_timeout = float(os.getenv("LIPSYNC_HTTP_TIMEOUT", "900"))
    async with httpx.AsyncClient(timeout=_ls_timeout) as c:
        r = await c.post(f"{base}/lip-sync", json=payload)
        if r.status_code >= 400:
            raise RuntimeError(f"lipsync HTTP {r.status_code}: {r.text[:200]}")
        # return_mode=file → mp4 bytes
        raw = OUTPUT_DIR / f".{pid}.lipsync.mp4"
        raw.write_bytes(r.content)
    _render_jobs[pid] = {**_render_jobs[pid], "pct": 80, "source": "ai-encode"}

    # 3) normalize for streaming (faststart, ≤720p) → out_path
    cmd = [
        FFMPEG_BIN, "-y", "-i", str(raw),
        "-vf", _scale_vf(req.video_quality),
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "96k", "-ar", "44100", "-movflags", "+faststart",
        str(out_path),
    ]
    proc = await asyncio.to_thread(subprocess.run, cmd, capture_output=True, text=True)
    audio_path.unlink(missing_ok=True)
    raw.unlink(missing_ok=True)
    if proc.returncode != 0:
        raise RuntimeError(f"ai encode failed: {(proc.stderr or '')[-300:]}")
    # NOTE: do NOT set status=done here — _do_render finalizes (speed + url).
    # Setting done prematurely makes the poller catch a done state with no url.
    _render_jobs[pid] = {**_render_jobs[pid], "pct": 95, "source": "ai-finalize"}
    return warnings


def _lipsync_max_edge(quality: str) -> int:
    # Lip-sync long-edge cap follows the requested video_quality so we never
    # process at a higher res than the final encode keeps (wasted GPU/RAM),
    # nor lower (final would upscale → blur). Matches _scale_vf's long edges.
    return {"1080p": 1920, "720p": 1280, "480p": 854}.get(quality, 1280)


def _scale_vf(quality: str) -> str:
    edge = {"1080p": (1080, 1920), "720p": (720, 1280), "480p": (480, 854)}.get(quality, (1080, 1920))
    return (f"scale='min({edge[0]},iw)':'min({edge[1]},ih)':force_original_aspect_ratio=decrease,"
            "scale=trunc(iw/2)*2:trunc(ih/2)*2")


def _loudnorm_af(sound_mode: str) -> str:
    # target integrated loudness: louder I = louder output
    i = {"soft": "-18", "normal": "-14", "boost": "-10"}.get(sound_mode, "-14")
    vol = {"soft": "1.0", "normal": "1.3", "boost": "1.8"}.get(sound_mode, "1.3")
    return f"loudnorm=I={i}:TP=-1.0,volume={vol},alimiter=limit=0.97"


def _apply_speed_sync(path: Path, speed: float) -> None:
    """Slow/speed the finished clip while KEEPING A/V sync (video setpts +
    audio atempo by the same factor). speed<1 = slower. No-op if ~1.0."""
    if abs(speed - 1.0) < 0.01:
        return
    speed = max(0.25, min(2.0, speed))
    setpts = round(1.0 / speed, 4)
    tmp = path.with_suffix(".spd.mp4")
    cmd = [
        FFMPEG_BIN, "-y", "-i", str(path),
        "-filter_complex", f"[0:v]setpts={setpts}*PTS[v];[0:a]atempo={speed}[a]",
        "-map", "[v]", "-map", "[a]",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", str(tmp),
    ]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode == 0 and tmp.exists():
        tmp.replace(path)


async def _do_render(req: RenderRequest) -> None:
    """Run the full render (ai → fallback loop/testpattern) and record the
    final result in _render_jobs[pid]. Long-running → called as a background
    task so the HTTP request returns immediately (avoids nginx 504)."""
    pid = req.project_id
    errors: list[str] = []
    dur = max(1, min(int(req.duration_seconds or 30), 3600))
    # Versioned output: each render keeps its own file (output_name = generation
    # id) so old versions aren't overwritten and can be listed.
    name = req.output_name or pid
    out_path = OUTPUT_DIR / f"{name}.mp4"
    output_url = f"{PUBLIC_BASE_URL}/files/{name}.mp4" if PUBLIC_BASE_URL else None
    _render_cancel.discard(pid)  # fresh start

    def _cancelled():
        return pid in _render_cancel

    try:
        # AI lip-sync path first (falls through to loop on any failure).
        if req.mode == "ai":
            try:
                warns = await _render_ai(req, out_path)
                if _cancelled():
                    _render_jobs[pid] = {"status": "cancelled", "pct": 0}
                    return
                await asyncio.to_thread(_apply_speed_sync, out_path, req.playback_speed)
                _render_jobs[pid] = {"status": "done", "pct": 100, "source": "ai",
                                     "output_url": output_url, "errors": warns}
                return
            except Exception as e:
                errors.append(f"AI render failed, fell back to loop: {type(e).__name__}: {str(e)[:200]}")
                log.warning("AI render failed for %s: %s", pid, e)

        template_input, err = await _resolve_template(req.template_url)
        if err:
            errors.append(err)

        _ENCODE = [
            "-vf", "scale='min(1080,iw)':'min(1920,ih)':force_original_aspect_ratio=decrease:flags=lanczos,"
                   "scale=trunc(iw/2)*2:trunc(ih/2)*2",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-pix_fmt", "yuv420p",
            "-maxrate", "4000k", "-bufsize", "8000k",
            "-force_key_frames", "expr:gte(t,n_forced*2)",
            "-c:a", "aac", "-b:a", "96k", "-ar", "44100", "-movflags", "+faststart",
        ]
        if template_input:
            source = "template"
            cmd = [FFMPEG_BIN, "-y", "-stream_loop", "-1", "-i", template_input, "-t", str(dur), *_ENCODE, "-shortest", str(out_path)]
        else:
            source = "testpattern"
            cmd = [FFMPEG_BIN, "-y",
                   "-f", "lavfi", "-i", f"testsrc2=size=720x1280:rate=25:duration={dur}",
                   "-f", "lavfi", "-i", f"anullsrc=channel_layout=stereo:sample_rate=44100:duration={dur}",
                   "-t", str(dur), *_ENCODE, "-shortest", str(out_path)]

        log.info("render project=%s dur=%ss source=%s", pid, dur, source)
        proc = await asyncio.to_thread(_run_ffmpeg_progress, cmd, dur, pid, source)
        if proc.returncode != 0:
            _render_jobs[pid] = {"status": "failed", "pct": 0, "source": source,
                                 "errors": errors + [f"ffmpeg failed: {proc.stderr[-300:]}"]}
            return
        await asyncio.to_thread(_apply_speed_sync, out_path, req.playback_speed)
        _render_jobs[pid] = {"status": "done", "pct": 100, "source": source,
                             "output_url": output_url, "errors": errors}
    except Exception as e:
        _render_jobs[pid] = {"status": "failed", "pct": 0, "errors": errors + [f"{type(e).__name__}: {str(e)[:200]}"]}
        log.exception("render failed for %s", pid)


@app.post("/render", dependencies=[Depends(verify_pipeline_token)])
async def render_endpoint(req: RenderRequest, background: BackgroundTasks):
    """Enqueue an async render. Returns immediately; poll GET /render/status/{id}."""
    _render_jobs[req.project_id] = {"status": "queued", "pct": 0, "source": req.mode}
    background.add_task(_do_render, req)
    return {"ok": True, "project_id": req.project_id, "status": "queued"}


@app.get("/render/status/{project_id}", dependencies=[Depends(verify_pipeline_token)])
async def render_status(project_id: str):
    job = _render_jobs.get(project_id)
    if not job:
        raise HTTPException(404, "no render job for this project")
    return {"project_id": project_id, **job}


@app.post("/render/cancel/{project_id}", dependencies=[Depends(verify_pipeline_token)])
async def render_cancel(project_id: str):
    """Mark a render cancelled. Checked between stages in _render_ai/_do_render;
    also frees the UI immediately even if a long ffmpeg/inference is mid-flight."""
    _render_cancel.add(project_id)
    job = _render_jobs.get(project_id)
    if job and job.get("status") == "rendering":
        _render_jobs[project_id] = {**job, "status": "cancelled", "pct": job.get("pct", 0)}
    return {"project_id": project_id, "status": "cancelled"}


async def _run_job(req: GenerateRequest) -> None:
    pid = req.project_id

    async def progress(stage: str, pct: int):
        _jobs[pid] = {**_jobs.get(pid, {}), "stage": stage, "progress": pct}
        log.info("project=%s stage=%s progress=%d", pid, stage, pct)

    try:
        result = await generate(
            GenerateInput(
                project_id=pid,
                avatar_template_url=req.avatar_template_url,
                script_texts=[s.text for s in req.script_segments],
                voice=req.voice,
                rate=req.rate,
                generation_id=req.generation_id,
            ),
            progress=progress,
        )
        _jobs[pid] = {
            **_jobs.get(pid, {}),
            "status": "done",
            "output_path": str(result.path),
            "output_url": result.url,
        }
    except Exception as e:
        log.exception("generation failed for %s", pid)
        # Some Windows-originating exceptions (FileNotFoundError under asyncio
        # subprocess) stringify to empty — fall back to repr/typename so the
        # client never sees a blank failure.
        msg = str(e) or repr(e) or type(e).__name__
        _jobs[pid] = {**_jobs.get(pid, {}), "status": "failed", "message": msg}


@app.post(
    "/generate",
    response_model=GenerateResponse,
    dependencies=[Depends(verify_pipeline_token)],
)
async def generate_endpoint(req: GenerateRequest, background: BackgroundTasks):
    _jobs[req.project_id] = {"status": "queued", "stage": "queued", "progress": 0}
    background.add_task(_run_job, req)
    return GenerateResponse(project_id=req.project_id, status="queued", progress=0)


@app.get(
    "/generate/{project_id}",
    response_model=GenerateResponse,
    dependencies=[Depends(verify_pipeline_token)],
)
async def generate_status(project_id: str):
    job = _jobs.get(project_id)
    if not job:
        raise HTTPException(404, "unknown project")
    status = job.get("status") or job.get("stage", "queued")
    # GenerateResponse.status is a Literal; clamp anything in-flight to "queued"
    # so we don't 500 on intermediate progress events like "tts" not being in
    # the literal set.
    valid = {"queued", "tts", "lipsync", "concat", "done", "failed"}
    if status not in valid:
        status = "queued"
    return GenerateResponse(
        project_id=project_id,
        status=status,
        stage=job.get("stage"),
        progress=job.get("progress"),
        output_path=job.get("output_path"),
        output_url=job.get("output_url"),
        message=job.get("message"),
    )


@app.post(
    "/stream/start",
    response_model=StreamStatus,
    dependencies=[Depends(verify_pipeline_token)],
)
async def stream_start_endpoint(req: StreamStartRequest):
    # video_url may be an http(s) URL (Supabase Storage in prod), or a local
    # filesystem path during dev / smoke tests. ffmpeg can ingest either.
    video_input: str | Path
    if req.video_url.startswith(("http://", "https://")):
        video_input = req.video_url
    else:
        local = Path(req.video_url)
        if not local.exists():
            raise HTTPException(400, f"video not found: {req.video_url}")
        video_input = local
    handle = start_stream(req.stream_id, video_input, req.rtmp_url, req.stream_key)
    return StreamStatus(stream_id=req.stream_id, status="live", pid=handle.proc.pid, started_at=handle.started_at)


@app.post("/stream/stop", dependencies=[Depends(verify_pipeline_token)])
async def stream_stop_endpoint(stream_id: str):
    ok = stop_stream(stream_id)
    if not ok:
        raise HTTPException(404, "unknown stream")
    return {"stream_id": stream_id, "status": "stopped"}


@app.get(
    "/stream/{stream_id}/status",
    dependencies=[Depends(verify_pipeline_token)],
)
async def stream_status_endpoint(stream_id: str):
    s = stream_status(stream_id)
    if not s:
        raise HTTPException(404, "unknown stream")
    return s
