import logging
import os
import secrets
from pathlib import Path

# Load .env BEFORE anything that reads env vars (TTS provider selection,
# Supabase client, etc.) — uvicorn doesn't do this automatically.
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

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

app = FastAPI(title="ReforgeAILiveHost Pipeline", version="0.1.0")

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
