"""End-to-end generation pipeline (/generate path — legacy full flow).

Flow (per Day 0 decision):
  1. TTS each script segment in parallel        -> mp3s         (app/tts clients)
  2. ffmpeg concat all mp3s                     -> one audio.mp3 (app/media)
  3. MuseTalk: template_video + audio.mp3       -> lipsynced.mp4 (app/gpu, ONE run)
  4. GFPGAN face restore                        -> restored.mp4  (app/gpu)
  5. ffmpeg transcode for streaming (GOP=2s)    -> final.mp4     (app/media)
  6. Upload final.mp4 to Supabase Storage       -> public URL    (app/storage)
"""
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Awaitable

import httpx

from .. import state
from ..config import TMP_DIR, OUTPUT_DIR
from ..gpu import get_gpu
from ..media import concat_audio, transcode_for_streaming
from ..schemas import GenerateRequest
from ..storage import StorageError, storage_enabled, upload_video
from ..tts import synthesize_all

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
    video_quality: str = "1080p"   # 1080p | 720p | 480p — drives streaming bitrate tier


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
    await get_gpu().musetalk_lipsync(
        template_video=template_path, full_audio=full_audio, output_path=lipsynced
    )

    await progress("face_restore", 75)
    restored = work / "restored.mp4"
    await get_gpu().restore_faces(input_video=lipsynced, output_video=restored)

    await progress("transcode", 85)
    final = OUTPUT_DIR / f"{inp.project_id}.mp4"
    await transcode_for_streaming(restored, final, inp.video_quality)

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


async def run_job(req: GenerateRequest) -> None:
    pid = req.project_id

    async def progress(stage: str, pct: int):
        state.jobs[pid] = {**state.jobs.get(pid, {}), "stage": stage, "progress": pct}
        log.info("project=%s stage=%s progress=%d", pid, stage, pct)

    try:
        result = await generate(
            GenerateInput(
                project_id=pid,
                avatar_template_url=req.avatar_template_url,
                script_texts=[s.text for s in req.script_segments],
                voice=req.voice,
                rate=req.rate,
                generation_id=req.generation_id,
                video_quality=req.video_quality,
            ),
            progress=progress,
        )
        state.jobs[pid] = {
            **state.jobs.get(pid, {}),
            "status": "done",
            "output_path": str(result.path),
            "output_url": result.url,
        }
    except Exception as e:
        log.exception("generation failed for %s", pid)
        # Some Windows-originating exceptions (FileNotFoundError under asyncio
        # subprocess) stringify to empty — fall back to repr/typename so the
        # client never sees a blank failure.
        msg = str(e) or repr(e) or type(e).__name__
        state.jobs[pid] = {**state.jobs.get(pid, {}), "status": "failed", "message": msg}
