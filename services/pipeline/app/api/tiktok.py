"""TikTok LIVE ingest routes (test / read-only).

    POST /tiktok/connect            {username}      → spawn a chat listener
    GET  /tiktok/comments/{user}    ?since&limit    → poll buffered comments
    GET  /tiktok/sessions                           → all listeners' status
    POST /tiktok/disconnect/{user}                  → stop a listener

No login, no posting back to chat — we only read a creator's public live chat.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..deps import verify_pipeline_token
from ..services import tiktok_service

router = APIRouter(prefix="/tiktok", dependencies=[Depends(verify_pipeline_token)])


class TikTokConnectRequest(BaseModel):
    username: str


@router.post("/connect")
async def tiktok_connect(req: TikTokConnectRequest):
    if not req.username.strip():
        raise HTTPException(400, "username is required")
    return await tiktok_service.connect(req.username.strip())


@router.get("/comments/{username}")
async def tiktok_comments(username: str, since: int = 0, limit: int = 50):
    try:
        return tiktok_service.comments(username, since=since, limit=limit)
    except KeyError:
        raise HTTPException(404, f"no listener for @{username}")


@router.get("/sessions")
async def tiktok_sessions():
    return {"sessions": tiktok_service.list_all()}


@router.post("/disconnect/{username}")
async def tiktok_disconnect(username: str):
    try:
        return await tiktok_service.disconnect(username)
    except KeyError:
        raise HTTPException(404, f"no listener for @{username}")
