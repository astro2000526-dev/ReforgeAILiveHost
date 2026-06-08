"""RTMP stream control routes."""
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException

from ..deps import verify_pipeline_token
from ..schemas import StreamStartRequest, StreamStatus
from ..streaming import start_stream, stop_stream, stream_status

router = APIRouter()


@router.post(
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


@router.post("/stream/stop", dependencies=[Depends(verify_pipeline_token)])
async def stream_stop_endpoint(stream_id: str):
    ok = stop_stream(stream_id)
    if not ok:
        raise HTTPException(404, "unknown stream")
    return {"stream_id": stream_id, "status": "stopped"}


@router.get(
    "/stream/{stream_id}/status",
    dependencies=[Depends(verify_pipeline_token)],
)
async def stream_status_endpoint(stream_id: str):
    s = stream_status(stream_id)
    if not s:
        raise HTTPException(404, "unknown stream")
    return s
