"""MuseTalk lip-sync adapter.

Stub on local dev (Windows, MUSETALK_ENABLED=0); real call on RunPod GPU where
MuseTalk is installed.

Decision (Day 0 review #1): pass the FULL concatenated audio to a SINGLE
MuseTalk run. Do not loop over segments.

MuseTalk's CLI (confirmed against TMElyralab/MuseTalk main, 2026-05-22):

    python -m scripts.inference \
        --inference_config <yaml> \
        --result_dir <dir> \
        --unet_model_path <models>/musetalkV15/unet.pth \
        --unet_config       <models>/musetalkV15/musetalk.json \
        --version v15 \
        --ffmpeg_path <dir-containing-ffmpeg-binary>

The YAML is a dict of tasks. We write one task per call:

    task_0:
      video_path: "<abs path>"
      audio_path: "<abs path>"
      result_name: "<output stem>"

Output lands at: <result_dir>/<version>/<result_name>.mp4
We then move it to the caller's requested `output_path`.
"""
from __future__ import annotations

import asyncio
import logging
import os
import shutil
import subprocess
import sys
from pathlib import Path

from .config import MUSETALK_ENABLED
from .ffmpeg_ops import mux_audio_onto_video

log = logging.getLogger("pipeline.musetalk")


class MuseTalkError(RuntimeError):
    pass


def _resolve_repo() -> Path:
    raw = os.getenv("MUSETALK_PATH", "").strip()
    if not raw:
        raise MuseTalkError(
            "MUSETALK_PATH is not set. Point it at the MuseTalk repo root "
            "(the directory containing scripts/, configs/, models/)."
        )
    p = Path(raw).expanduser()
    if not (p / "scripts" / "inference.py").exists():
        raise MuseTalkError(
            f"MUSETALK_PATH={p} does not look like a MuseTalk checkout "
            f"(missing scripts/inference.py)."
        )
    return p


def _resolve_required(repo: Path, env_name: str, default_rel: str) -> Path:
    raw = os.getenv(env_name, "").strip()
    p = Path(raw).expanduser() if raw else repo / default_rel
    if not p.exists():
        raise MuseTalkError(
            f"{env_name} resolved to {p} but the file does not exist. "
            f"Did the weight download script finish?"
        )
    return p


def _python_bin() -> str:
    # MUSETALK_PYTHON lets the user point at a separate venv if MuseTalk's deps
    # don't coexist with the FastAPI service's. Default to whatever's running us.
    return os.getenv("MUSETALK_PYTHON", "").strip() or sys.executable


def _write_task_yaml(
    yaml_path: Path, video_path: Path, audio_path: Path, result_name: str
) -> None:
    # All inputs come from inside our own pipeline (downloaded template, TTS
    # concat output) so the paths never contain quote characters. as_posix()
    # gives forward-slash paths that are unambiguous on both Linux and Windows.
    #
    # result_name MUST include the .mp4 extension. MuseTalk passes this string
    # verbatim to ffmpeg as the output filename; without an extension ffmpeg
    # fails with "Unable to find a suitable output format" but MuseTalk exits 0
    # anyway, silently producing no output. Found the hard way 2026-05-23.
    yaml_path.write_text(
        "task_0:\n"
        f'  video_path: "{video_path.as_posix()}"\n'
        f'  audio_path: "{audio_path.as_posix()}"\n'
        f'  result_name: "{result_name}.mp4"\n',
        encoding="utf-8",
    )


def _tail(s: str | None, n: int) -> str:
    return "\n".join((s or "").strip().splitlines()[-n:])


def _run_inference_sync(
    repo: Path,
    yaml_path: Path,
    result_dir: Path,
    unet_model: Path,
    unet_config: Path,
    version: str,
    ffmpeg_dir: str,
) -> None:
    cmd = [
        _python_bin(), "-m", "scripts.inference",
        "--inference_config", str(yaml_path),
        "--result_dir", str(result_dir),
        "--unet_model_path", str(unet_model),
        "--unet_config", str(unet_config),
        "--version", version,
    ]
    if ffmpeg_dir:
        cmd += ["--ffmpeg_path", ffmpeg_dir]

    log.info("musetalk: %s", " ".join(cmd))
    try:
        r = subprocess.run(cmd, cwd=str(repo), capture_output=True, text=True)
    except FileNotFoundError as e:
        raise MuseTalkError(
            f"MuseTalk python interpreter not found: {cmd[0]!r}. "
            f"Set MUSETALK_PYTHON to a python that has MuseTalk's deps installed."
        ) from e

    if r.returncode != 0:
        # Surface BOTH streams — MuseTalk writes progress to stdout and
        # tracebacks to stderr; the actionable line could be in either.
        raise MuseTalkError(
            f"MuseTalk inference failed (exit={r.returncode}).\n"
            f"--- stderr (last 30 lines) ---\n{_tail(r.stderr, 30)}\n"
            f"--- stdout (last 15 lines) ---\n{_tail(r.stdout, 15)}"
        )


async def run_lipsync(
    template_video: Path, full_audio: Path, output_path: Path
) -> Path:
    if not MUSETALK_ENABLED:
        # Local-dev fallback — just loops the template and muxes the audio in.
        # The avatar's mouth won't move; that's the GPU box's job.
        return await mux_audio_onto_video(template_video, full_audio, output_path)

    repo = _resolve_repo()
    version = (os.getenv("MUSETALK_VERSION", "v15").strip() or "v15")
    # README defaults: v15 layout under models/musetalkV15/, v1 under models/musetalk/.
    if version == "v15":
        default_model_rel, default_cfg_rel = (
            "models/musetalkV15/unet.pth",
            "models/musetalkV15/musetalk.json",
        )
    else:
        default_model_rel, default_cfg_rel = (
            "models/musetalk/pytorch_model.bin",
            "models/musetalk/musetalk.json",
        )
    unet_model = _resolve_required(repo, "MUSETALK_UNET_MODEL", default_model_rel)
    unet_config = _resolve_required(repo, "MUSETALK_UNET_CONFIG", default_cfg_rel)
    ffmpeg_dir = os.getenv("MUSETALK_FFMPEG_DIR", "").strip()

    # Job-local staging so concurrent jobs don't fight over result_dir/<version>/.
    job_dir = output_path.parent / f".musetalk-{output_path.stem}"
    if job_dir.exists():
        shutil.rmtree(job_dir, ignore_errors=True)
    job_dir.mkdir(parents=True, exist_ok=True)

    yaml_path = job_dir / "task.yaml"
    result_dir = job_dir / "out"
    result_name = output_path.stem
    _write_task_yaml(
        yaml_path,
        template_video.resolve(),
        full_audio.resolve(),
        result_name,
    )

    await asyncio.to_thread(
        _run_inference_sync,
        repo, yaml_path, result_dir,
        unet_model, unet_config, version, ffmpeg_dir,
    )

    produced = result_dir / version / f"{result_name}.mp4"
    if not produced.exists():
        # Older MuseTalk revs wrote straight into result_dir without the version
        # subdir. Try that before giving up.
        alt = result_dir / f"{result_name}.mp4"
        if alt.exists():
            produced = alt
        else:
            raise MuseTalkError(
                f"MuseTalk exited 0 but produced no output at {produced} "
                f"(also checked {alt}). Check the inference logs above."
            )

    if output_path.exists():
        output_path.unlink()
    shutil.move(str(produced), str(output_path))
    shutil.rmtree(job_dir, ignore_errors=True)
    return output_path
