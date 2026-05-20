"""End-to-end generation pipeline.

Flow (per Day 0 decision):
  1. edge-tts each script segment in parallel  -> mp3s
  2. ffmpeg concat all mp3s                    -> one audio.mp3
  3. MuseTalk: template_video + audio.mp3      -> lipsynced.mp4   (ONE run)
  4. ffmpeg transcode for streaming (GOP=2s)   -> final.mp4
  5. Upload final.mp4 to Supabase Storage      -> public URL
"""
import asyncio
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Awaitable

import httpx

from .config import TMP_DIR, OUTPUT_DIR
from .ffmpeg_ops import concat_audio, transcode_for_streaming
from .musetalk import run_lipsync
from .storage import StorageError, storage_enabled, upload_video
from .tts import synthesize_all


log = logging.getLogger("pipeline")

ProgressFn = Callable[[str, int], Awaitable[None]]


@dataclass
class GenerateInput:
    project_id: str
    avatar_template_url: str
    script_texts: list[str]
    voice: str
    rate: str
    # generation_id namespaces the Storage object so re-runs don't clobber
    # each other. Web side generates this when it creates the generations row.
    generation_id: str | None = None


@dataclass
class GenerateResult:
    path: Path
    url: str | None  # None when storage_enabled() is False (local dev)


async def _noop_progress(stage: str, pct: int) -> None:
    return None


async def _download(url: str, dest: Path) -> Path:
    async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
        async with client.stream("GET", url) as r:
            r.raise_for_status()
            with dest.open("wb") as f:
                async for chunk in r.aiter_bytes(chunk_size=1 << 20):
                    f.write(chunk)
    return dest


async def generate(
    inp: GenerateInput, progress: ProgressFn = _noop_progress
) -> GenerateResult:
    work = TMP_DIR / inp.project_id
    work.mkdir(parents=True, exist_ok=True)

    await progress("download", 5)
    template_path = work / "template.mp4"
    if inp.avatar_template_url.startswith(("http://", "https://")):
        await _download(inp.avatar_template_url, template_path)
    else:
        # Local path for dev/smoke tests.
        template_path = Path(inp.avatar_template_url)

    await progress("tts", 20)
    seg_audios = await synthesize_all(
        segments=inp.script_texts,
        voice=inp.voice,
        rate=inp.rate,
        work_dir=work,
        basename="seg",
    )

    await progress("concat_audio", 40)
    full_audio = work / "full.mp3"
    await concat_audio(seg_audios, full_audio)

    await progress("lipsync", 60)
    lipsynced = work / "lipsynced.mp4"
    await run_lipsync(template_path, full_audio, lipsynced)

    await progress("transcode", 85)
    final = OUTPUT_DIR / f"{inp.project_id}.mp4"
    await transcode_for_streaming(lipsynced, final)

    url: str | None = None
    if storage_enabled():
        await progress("upload", 95)
        # Fall back to project_id when caller didn't supply a generation_id
        # (e.g. legacy /generate callers, smoke scripts). Re-runs will overwrite.
        gen_id = inp.generation_id or inp.project_id
        try:
            url = await upload_video(final, inp.project_id, gen_id)
        except StorageError as e:
            # Upload failure shouldn't kill the whole job — the mp4 is already
            # on local disk and useful for debugging / manual recovery. Log
            # loudly so the caller notices.
            log.error("upload failed for project=%s gen=%s: %s", inp.project_id, gen_id, e)

    await progress("done", 100)
    return GenerateResult(path=final, url=url)
