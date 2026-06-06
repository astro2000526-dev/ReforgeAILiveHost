"""Live render routes (/render path)."""
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException

from .. import state
from ..deps import verify_pipeline_token
from ..schemas import RenderRequest
from ..services.render_service import do_render

router = APIRouter()


@router.post("/render", dependencies=[Depends(verify_pipeline_token)])
async def render_endpoint(req: RenderRequest, background: BackgroundTasks):
    """Enqueue an async render. Returns immediately; poll GET /render/status/{id}."""
    state.render_jobs[req.project_id] = {"status": "queued", "pct": 0, "source": req.mode}
    background.add_task(do_render, req)
    return {"ok": True, "project_id": req.project_id, "status": "queued"}


@router.get("/render/status/{project_id}", dependencies=[Depends(verify_pipeline_token)])
async def render_status(project_id: str):
    job = state.render_jobs.get(project_id)
    if not job:
        raise HTTPException(404, "no render job for this project")
    return {"project_id": project_id, **job}


@router.post("/render/cancel/{project_id}", dependencies=[Depends(verify_pipeline_token)])
async def render_cancel(project_id: str):
    """Mark a render cancelled. Checked between stages in render_ai/do_render;
    also frees the UI immediately even if a long ffmpeg/inference is mid-flight."""
    state.render_cancel.add(project_id)
    job = state.render_jobs.get(project_id)
    if job and job.get("status") == "rendering":
        state.render_jobs[project_id] = {**job, "status": "cancelled", "pct": job.get("pct", 0)}
    return {"project_id": project_id, "status": "cancelled"}


@router.get("/render/active")
async def render_active():
    """Unauthenticated, read-only — consumed by the status panel."""
    active = {k: v for k, v in state.render_jobs.items() if v.get("status") == "rendering"}
    return {"active": active, "all": state.render_jobs}
