"""Upload avatar assets (image / video).

Saves the file under /workspace/output/uploads and returns a public http URL
(served by the /files mount). Used by the avatar-management UI.
"""
import asyncio
import os
import secrets

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from ..config import PUBLIC_BASE_URL, UPLOAD_DIR
from ..deps import verify_pipeline_token
from ..media import compress_video

router = APIRouter()

_ALLOWED_EXT = {".mp4", ".mov", ".webm", ".m4v", ".jpg", ".jpeg", ".png", ".webp", ".gif"}


@router.post("/upload", dependencies=[Depends(verify_pipeline_token)])
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
        ok = await asyncio.to_thread(compress_video, stage, dest)
        await asyncio.to_thread(lambda: stage.unlink(missing_ok=True))
        if not ok:
            await asyncio.to_thread(dest.write_bytes, data)
    else:
        await asyncio.to_thread(dest.write_bytes, data)

    out_bytes = await asyncio.to_thread(lambda: dest.stat().st_size)
    url = f"{PUBLIC_BASE_URL}/files/uploads/{name}" if PUBLIC_BASE_URL else None
    return {"ok": True, "url": url, "path": str(dest), "bytes": out_bytes}
