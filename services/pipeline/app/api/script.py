"""LLM passthrough + AI script generation (local Qwen via ollama)."""
from fastapi import APIRouter, Depends

from ..clients import ollama
from ..deps import verify_pipeline_token
from ..schemas import LLMRequest, ScriptRequest
from ..services import script_service

router = APIRouter()


@router.post("/llm", dependencies=[Depends(verify_pipeline_token)])
async def llm_endpoint(req: LLMRequest):
    text = await ollama.generate(req.llm_url, req.model, req.prompt, max_tokens=req.max_tokens)
    return {"text": text}


@router.post("/script", dependencies=[Depends(verify_pipeline_token)])
async def script_endpoint(req: ScriptRequest):
    return await script_service.generate_script(req)
