"""GPU worker routes — the SERVER side of app/gpu/remote.py.

Run this same image on a GPU box (GPU_BACKEND unset = local) and point the
orchestrator at it with GPU_BACKEND=remote + GPU_BASE_URL=http://gpu-box:8000.
Every route is token-protected (PIPELINE_TOKEN; set GPU_TOKEN to the same
value on the orchestrator side, or share PIPELINE_TOKEN).

Contracts mirror app/gpu/remote.py exactly: multipart in, media bytes out,
non-fatal warnings in the X-Warnings response header (json array).
"""
import json
import secrets
import subprocess

from fastapi import APIRouter, Depends, Form, HTTPException, UploadFile, File
from fastapi.responses import Response
from pydantic import BaseModel

from ..config import TMP_DIR
from ..deps import verify_pipeline_token

router = APIRouter(prefix="/gpu", dependencies=[Depends(verify_pipeline_token)])


def _work(name: str):
    d = TMP_DIR / "gpu_worker"
    d.mkdir(parents=True, exist_ok=True)
    return d / f"{secrets.token_hex(6)}_{name}"


@router.get("/health")
async def gpu_health():
    try:
        has_gpu = subprocess.run(["nvidia-smi", "-L"], capture_output=True).returncode == 0
    except Exception:  # nvidia-smi absent (no-GPU dev box)
        has_gpu = False
    return {"ok": True, "gpu": has_gpu}


class GpuTtsRequest(BaseModel):
    text: str
    voice: str


@router.post("/tts")
async def gpu_tts(req: GpuTtsRequest):
    from ..gpu.mms_tts import tts_mms
    out = _work("tts.wav")
    try:
        await tts_mms(req.text, req.voice, out)
        return Response(content=out.read_bytes(), media_type="audio/wav")
    except Exception as e:
        raise HTTPException(500, f"mms tts failed: {type(e).__name__}: {str(e)[:200]}")
    finally:
        out.unlink(missing_ok=True)


@router.post("/voice-clone")
async def gpu_voice_clone(src: UploadFile = File(...), ref: UploadFile = File(...)):
    from ..gpu.openvoice import voice_clone
    src_p, ref_p, out_p = _work("src.wav"), _work("ref.wav"), _work("clone.wav")
    try:
        src_p.write_bytes(await src.read())
        ref_p.write_bytes(await ref.read())
        await voice_clone(src_p, ref_p, out_p)
        return Response(content=out_p.read_bytes(), media_type="audio/wav")
    except Exception as e:
        raise HTTPException(500, f"voice clone failed: {type(e).__name__}: {str(e)[:200]}")
    finally:
        for p in (src_p, ref_p, out_p):
            p.unlink(missing_ok=True)


@router.post("/restore")
async def gpu_restore(video: UploadFile = File(...)):
    from ..gpu.face_restore import restore_faces
    in_p, out_p = _work("in.mp4"), _work("restored.mp4")
    try:
        in_p.write_bytes(await video.read())
        await restore_faces(in_p, out_p)
        return Response(content=out_p.read_bytes(), media_type="video/mp4")
    except Exception as e:
        raise HTTPException(500, f"face restore failed: {type(e).__name__}: {str(e)[:200]}")
    finally:
        for p in (in_p, out_p):
            p.unlink(missing_ok=True)


@router.post("/matte")
async def gpu_matte(
    video: UploadFile = File(...),
    bg_remove: str = Form("0"),
    background_url: str = Form(""),
    background_type: str = Form(""),
    camera_zoom: str = Form("1.0"),
    frame_position: str = Form("center"),
    frame_scale: str = Form("1.0"),
):
    import asyncio
    from ..gpu.compositing import apply_composite
    in_p = _work("in.mp4")
    try:
        in_p.write_bytes(await video.read())
        warnings = await asyncio.to_thread(
            apply_composite, in_p,
            bg_remove=bg_remove == "1",
            background=background_url or None,   # worker ffmpeg ingests the URL directly
            background_type=background_type or None,
            camera_zoom=float(camera_zoom or 1.0),
            frame_position=frame_position or "center",
            frame_scale=float(frame_scale or 1.0),
        )
        return Response(
            content=in_p.read_bytes(), media_type="video/mp4",
            headers={"X-Warnings": json.dumps(warnings)},
        )
    except Exception as e:
        raise HTTPException(500, f"matte composite failed: {type(e).__name__}: {str(e)[:200]}")
    finally:
        in_p.unlink(missing_ok=True)


@router.post("/musetalk")
async def gpu_musetalk(video: UploadFile = File(...), audio: UploadFile = File(...)):
    from ..gpu.musetalk import run_lipsync
    v_p, a_p, out_p = _work("template.mp4"), _work("audio.mp3"), _work("lipsynced.mp4")
    try:
        v_p.write_bytes(await video.read())
        a_p.write_bytes(await audio.read())
        await run_lipsync(v_p, a_p, out_p)
        return Response(content=out_p.read_bytes(), media_type="video/mp4")
    except Exception as e:
        raise HTTPException(500, f"musetalk failed: {type(e).__name__}: {str(e)[:200]}")
    finally:
        for p in (v_p, a_p, out_p):
            p.unlink(missing_ok=True)
