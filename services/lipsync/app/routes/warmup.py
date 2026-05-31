from __future__ import annotations

import time

from fastapi import APIRouter, Depends, Request

from ..logging_setup import get_logger
from .auth import require_token

router = APIRouter()
log = get_logger(__name__)


@router.post("/warmup")
def warmup(request: Request, _: None = Depends(require_token)) -> dict:
    model = request.app.state.model
    t0 = time.perf_counter()
    model.warmup()
    return {"status": "ok", "elapsed_ms": round((time.perf_counter() - t0) * 1000.0, 1)}
