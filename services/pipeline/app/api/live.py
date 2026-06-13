"""24/7 live streamer routes — look-ahead pre-render + continuous RTMP emit.

The web side starts a session, then keeps feeding script text (e.g. from the
Qwen continuous-script loop) via /live/feed; the pipeline keeps ~30s rendered
ahead and the RTMP push never starves (filler segment covers gaps).
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..deps import verify_pipeline_token
from ..services import live_service

router = APIRouter(prefix="/live", dependencies=[Depends(verify_pipeline_token)])


class LiveStartRequest(BaseModel):
    session_id: str
    rtmp_url: str
    stream_key: str = ""
    script_texts: list[str] = []
    voice: str = "th-TH-PremwadeeNeural"
    rate: str = "+0%"
    avatar_image_url: str | None = None
    template_url: str | None = None
    lipsync_url: str | None = None
    lipsync_model: str | None = None
    video_quality: str = "720p"
    sound_mode: str = "normal"
    lip_blend: int = 30
    azure_key: str | None = None
    azure_region: str | None = None
    google_key: str | None = None        # Google Cloud TTS API key (from Settings)
    tts_engine: str | None = None        # "sovits" | None
    tts_provider: str | None = None      # explicit Settings choice: google|azure|edge-tts
    tts_pitch: float = 0.0
    tts_emotion: str | None = None
    sovits_url: str | None = None        # GPT-SoVITS service URL (else env default)


class LiveFeedRequest(BaseModel):
    session_id: str
    texts: list[str]


@router.post("/start")
async def live_start(req: LiveStartRequest):
    try:
        return await live_service.start_live(**req.model_dump())
    except RuntimeError as e:
        raise HTTPException(409, str(e))


@router.post("/feed")
async def live_feed(req: LiveFeedRequest):
    try:
        return live_service.feed_live(req.session_id, req.texts)
    except KeyError as e:
        raise HTTPException(404, str(e))


@router.get("/sessions")
async def live_sessions():
    return {"sessions": live_service.list_live()}


@router.get("/status/{session_id}")
async def live_status(session_id: str):
    try:
        return live_service.live_status(session_id)
    except KeyError as e:
        raise HTTPException(404, str(e))


@router.post("/stop/{session_id}")
async def live_stop(session_id: str):
    try:
        return await live_service.stop_live(session_id)
    except KeyError as e:
        raise HTTPException(404, str(e))
