from __future__ import annotations

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI

from .config import settings
from .logging_setup import get_logger, setup_logging
from .models import build_model
from .routes import health, lipsync, stream, warmup


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    log = get_logger("startup")
    os.makedirs(settings.work_dir, exist_ok=True)
    log.info(
        "startup model=%s device=%s fp16=%s models_dir=%s",
        settings.model_name,
        settings.device,
        settings.fp16,
        settings.models_dir,
    )
    model = build_model()
    try:
        model.load()
        model.warmup()
        log.info("model loaded and warmed up")
    except Exception as e:
        log.exception("model preload failed: %s", e)
    app.state.model = model
    yield
    log.info("shutdown")


app = FastAPI(title="runpod-lipsync", version="0.1.0", lifespan=lifespan)
app.include_router(health.router)
app.include_router(warmup.router)
app.include_router(lipsync.router)
app.include_router(stream.router)
