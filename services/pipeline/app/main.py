"""App assembly — and nothing else.

Layer map:
    app/api/        HTTP routes (thin controllers)
    app/services/   orchestration (render / generate / tts / script flows)
    app/clients/    external network APIs (ollama; TTS providers in app/tts/)
    app/gpu/        GPU-call boundary (lipsync, MMS-TTS, OpenVoice, GFPGAN,
                    rembg matting, MuseTalk) — swap servers via GPU_BACKEND/
                    GPU_BASE_URL only
    app/media.py    CPU ffmpeg ops
    app/state.py    in-memory job state
    app/storage.py  Supabase Storage uploads
"""
import logging
from pathlib import Path

# Load .env BEFORE anything that reads env vars (TTS provider selection,
# Supabase client, etc.) — uvicorn doesn't do this automatically.
# override=True so a value written to /workspace/.env wins over a blank/stale
# container -e var (e.g. AZURE_SPEECH_KEY="" baked at `docker run`). In the
# compose deploy there's no .env file, so container env is used as-is.
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env", override=True)

from fastapi import FastAPI                      # noqa: E402
from fastapi.staticfiles import StaticFiles      # noqa: E402

from .api import all_routers                     # noqa: E402
from .config import OUTPUT_DIR                   # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("pipeline")

app = FastAPI(title="ReforgeAILiveHost Pipeline", version="0.1.0")

# Serve finished mp4s + uploaded avatar assets so the dashboard can preview
# them and ffmpeg/RTMP can ingest them over http. OUTPUT_DIR == /workspace/output.
app.mount("/files", StaticFiles(directory=str(OUTPUT_DIR)), name="files")

for r in all_routers:
    app.include_router(r)
