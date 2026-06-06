"""Ollama (local Qwen) client — the one place we talk to the LLM.

Raises HTTPException with the same 502 bodies the old inline blocks produced,
so /llm and /script keep byte-identical error behavior.
"""
import httpx
from fastapi import HTTPException


async def generate(
    llm_url: str, model: str, prompt: str, max_tokens: int | None = None
) -> str:
    base = llm_url.rstrip("/")
    payload: dict = {"model": model, "prompt": prompt, "stream": False}
    if max_tokens is not None:
        payload["options"] = {"num_predict": max_tokens}
    try:
        async with httpx.AsyncClient(timeout=120) as c:
            r = await c.post(f"{base}/api/generate", json=payload)
            if r.status_code >= 400:
                raise HTTPException(502, f"LLM HTTP {r.status_code}: {r.text[:200]}")
            return r.json().get("response", "")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"LLM unreachable: {type(e).__name__}: {str(e)[:150]}")
