"""Central config — the ONLY module that defines paths + env-derived settings.

Layer map (see also CLAUDE.md):
    app/api/        L: HTTP routes (thin controllers)
    app/services/   L: orchestration (process flow, no inference, no torch)
    app/clients/    L: external network APIs (ollama; TTS providers live in app/tts/)
    app/gpu/        L: GPU-call boundary — the ONLY place torch/rembg/gfpgan/
                       transformers/openvoice may be imported. Swap the GPU
                       server via GPU_BACKEND/GPU_BASE_URL, nothing else.
    app/media.py    L: CPU ffmpeg ops
    app/state.py    L: in-memory job state (single owner)
    app/storage.py  L: Supabase Storage uploads

NOTE: app/main.py calls load_dotenv(override=True) BEFORE importing this
module, so module-level env reads below see /workspace/.env values.
"""
from pathlib import Path
import os

BASE_DIR = Path(__file__).resolve().parent.parent
TMP_DIR = BASE_DIR / "tmp"
OUTPUT_DIR = BASE_DIR / "output"
UPLOAD_DIR = OUTPUT_DIR / "uploads"
TMP_DIR.mkdir(exist_ok=True)
OUTPUT_DIR.mkdir(exist_ok=True)
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

FFMPEG_BIN = os.getenv("FFMPEG_BIN", "ffmpeg")
FFPROBE_BIN = os.getenv(
    "FFPROBE_BIN",
    FFMPEG_BIN.replace("ffmpeg", "ffprobe") if "ffmpeg" in FFMPEG_BIN else "ffprobe",
)

MUSETALK_ENABLED = os.getenv("MUSETALK_ENABLED", "0") == "1"

# Public base URL the browser/ffmpeg can reach this service at (set in .env).
# Used to hand back a playable http URL for rendered clips. Falls back to "".
PUBLIC_BASE_URL = (os.getenv("PUBLIC_BASE_URL") or "").rstrip("/")

# Where the local Qwen (ollama) lives. host.docker.internal works for the
# legacy per-container deploy; the unified compose sets OLLAMA_URL=http://qwen:11434.
OLLAMA_URL = (os.getenv("OLLAMA_URL") or "http://host.docker.internal:11434").rstrip("/")


# --- GPU-call layer switches (read lazily — can change per deploy) -----------
def gpu_backend_for(capability: str) -> str:
    """Resolve 'local' | 'remote' for one GPU capability.

    GPU_<CAP>_BACKEND (e.g. GPU_TTS_BACKEND) overrides the global GPU_BACKEND.
    Default 'local' == today's behavior: in-process inference on this box,
    lipsync via the per-request lipsync_url. Set GPU_BACKEND=remote +
    GPU_BASE_URL to move ALL GPU work to another box running this same image.
    Capabilities: lipsync | tts | voice_clone | restore | matte | musetalk
    """
    return (
        os.getenv(f"GPU_{capability.upper()}_BACKEND")
        or os.getenv("GPU_BACKEND")
        or "local"
    ).strip().lower()


def gpu_base_url() -> str:
    """Base URL of the remote GPU worker (this same image, /gpu/* routes)."""
    return (os.getenv("GPU_BASE_URL") or "").rstrip("/")


def gpu_token() -> str:
    """Bearer for the remote GPU worker; defaults to the shared PIPELINE_TOKEN."""
    return (os.getenv("GPU_TOKEN") or os.getenv("PIPELINE_TOKEN") or "").strip()
