"""Legacy full-pipeline routes (/generate path)."""
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException

from .. import state
from ..deps import verify_pipeline_token
from ..schemas import GenerateRequest, GenerateResponse
from ..services.generate_service import run_job

router = APIRouter()


@router.post(
    "/generate",
    response_model=GenerateResponse,
    dependencies=[Depends(verify_pipeline_token)],
)
async def generate_endpoint(req: GenerateRequest, background: BackgroundTasks):
    state.jobs[req.project_id] = {"status": "queued", "stage": "queued", "progress": 0}
    background.add_task(run_job, req)
    return GenerateResponse(project_id=req.project_id, status="queued", progress=0)


@router.get(
    "/generate/{project_id}",
    response_model=GenerateResponse,
    dependencies=[Depends(verify_pipeline_token)],
)
async def generate_status(project_id: str):
    job = state.jobs.get(project_id)
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
