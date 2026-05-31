from __future__ import annotations

import asyncio
import base64
import json
from typing import Optional

import numpy as np
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from ..config import settings
from ..logging_setup import get_logger
from ..pipeline import decode_audio_to_pcm16k
from ..timing import Timings, stage

router = APIRouter()
log = get_logger(__name__)


def _check_token(ws: WebSocket) -> bool:
    if settings.api_token is None:
        return True
    auth = ws.headers.get("authorization", "")
    if auth.lower().startswith("bearer ") and auth.split(" ", 1)[1].strip() == settings.api_token:
        return True
    token_q = ws.query_params.get("token")
    return token_q == settings.api_token


@router.websocket("/lip-sync-stream")
async def lip_sync_stream(ws: WebSocket) -> None:
    """Bidirectional WS protocol.

    Client → server JSON messages:
        {"type": "init", "avatar_base64": "..."}
        {"type": "audio", "pcm16k_base64": "..."}   # raw float32 PCM 16kHz mono
        {"type": "end"}

    Server → client messages:
        {"type": "ready", "avatar_key": "..."}
        {"type": "frames", "fps": 25, "shape": [T,H,W,3], "frames_base64": "..."}
        {"type": "timings", "stages": {...}}
        {"type": "error", "message": "..."}
    """
    await ws.accept()
    if not _check_token(ws):
        await ws.send_json({"type": "error", "message": "unauthorized"})
        await ws.close()
        return

    model = ws.app.state.model
    avatar_key: Optional[str] = None

    try:
        while True:
            msg = await ws.receive_text()
            data = json.loads(msg)
            mtype = data.get("type")

            if mtype == "init":
                img = base64.b64decode(data["avatar_base64"])
                avatar_key = await asyncio.to_thread(model.prepare_avatar, img)
                await ws.send_json({"type": "ready", "avatar_key": avatar_key})

            elif mtype == "audio":
                if avatar_key is None:
                    await ws.send_json({"type": "error", "message": "init first"})
                    continue
                t = Timings()
                with stage("chunk_decode", t):
                    if "pcm16k_base64" in data:
                        pcm = np.frombuffer(
                            base64.b64decode(data["pcm16k_base64"]), dtype=np.float32
                        )
                    elif "audio_base64" in data:
                        pcm = await asyncio.to_thread(
                            decode_audio_to_pcm16k, base64.b64decode(data["audio_base64"])
                        )
                    else:
                        await ws.send_json({"type": "error", "message": "missing audio"})
                        continue
                with stage("chunk_inference", t):
                    result = await asyncio.to_thread(model.infer, avatar_key, pcm)
                frames_b64 = base64.b64encode(result.frames.tobytes()).decode("ascii")
                await ws.send_json(
                    {
                        "type": "frames",
                        "fps": result.fps,
                        "shape": list(result.frames.shape),
                        "frames_base64": frames_b64,
                    }
                )
                await ws.send_json({"type": "timings", "stages": t.as_dict()})

            elif mtype == "end":
                await ws.send_json({"type": "done"})
                break

            else:
                await ws.send_json({"type": "error", "message": f"unknown type {mtype!r}"})

    except WebSocketDisconnect:
        log.info("ws disconnect")
    except Exception as e:
        log.exception("ws error: %s", e)
        try:
            await ws.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass
