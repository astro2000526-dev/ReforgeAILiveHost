from __future__ import annotations

import base64
import os
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from ..config import settings
from ..logging_setup import get_logger
from ..pipeline import run_batch
from .auth import require_token

router = APIRouter()
log = get_logger(__name__)


class LipSyncRequest(BaseModel):
    avatar_url: Optional[str] = None
    avatar_base64: Optional[str] = None
    audio_url: Optional[str] = None
    audio_base64: Optional[str] = None
    return_mode: str = Field(default="path", description="path | url | file")
    max_edge: Optional[int] = Field(default=None, description="long-edge cap (follows requested video_quality)")
    lip_blend: int = Field(default=30, description="0..100 feather the lip-crop edge into the frame (ความเนียน)")
    model: Optional[str] = Field(default=None, description="wav2lip | musetalk — switch engine at runtime to match Settings")


async def _fetch_bytes(url: str) -> bytes:
    async with httpx.AsyncClient(timeout=60.0) as client:
        r = await client.get(url)
        r.raise_for_status()
        return r.content


async def _resolve(b64: str | None, url: str | None, label: str) -> bytes:
    if b64:
        try:
            return base64.b64decode(b64)
        except Exception as e:
            raise HTTPException(400, f"bad base64 in {label}: {e}")
    if url:
        try:
            return await _fetch_bytes(url)
        except Exception as e:
            raise HTTPException(400, f"failed to fetch {label}: {e}")
    raise HTTPException(400, f"missing {label}_url or {label}_base64")


@router.post("/lip-sync")
async def lip_sync(req: LipSyncRequest, request: Request, _: None = Depends(require_token)):
    model = request.app.state.model
    # Runtime engine switch so the Settings dropdown actually takes effect
    # without a container restart. Single worker → requests are serialized, so
    # swapping app.state.model here is safe. infer() lazy-loads on first use.
    want = (req.model or "").strip().lower()
    if want and want != getattr(model, "name", ""):
        from ..models import build_model
        try:
            new_model = build_model(want)
            new_model.load()
            request.app.state.model = new_model
            model = new_model
            log.info("lip-sync engine switched to %s", want)
        except Exception as e:
            log.exception("engine switch to %s failed; keeping %s", want, getattr(model, "name", "?"))
            raise HTTPException(400, f"cannot switch engine to {want}: {e}")
    image_bytes = await _resolve(req.avatar_base64, req.avatar_url, "avatar")
    audio_bytes = await _resolve(req.audio_base64, req.audio_url, "audio")

    try:
        out_path, timings, key = run_batch(
            model, image_bytes, audio_bytes, max_edge=req.max_edge, lip_blend=req.lip_blend
        )
    except Exception as e:
        log.exception("lip-sync failed")
        raise HTTPException(500, f"inference failed: {e}")

    if req.return_mode == "file":
        return FileResponse(out_path, media_type="video/mp4", filename=os.path.basename(out_path))
    return {
        "status": "ok",
        "path": out_path,
        "size_bytes": os.path.getsize(out_path),
        "avatar_key": key,
        "timings_ms": timings.as_dict(),
    }
