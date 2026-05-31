"""MuseTalk wrapper — subprocess pattern.

We do NOT try to reimplement MuseTalk's internal pipeline. Instead we
invoke the upstream entry point ``scripts.inference`` per request, which
the MuseTalk maintainers ship and test. That keeps us robust against
upstream refactors (load_all_model signature, preprocessing helpers, etc.).

Tradeoff: each call loads the model into a fresh subprocess (~5-15s
cold start). For the MVP this is acceptable for batch mode. A future
optimisation can switch to ``scripts.realtime_inference`` and a
long-running subprocess for live mode.
"""
from __future__ import annotations

import io
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np

from ..cache import avatar_key, cache
from ..config import settings
from ..logging_setup import get_logger
from .base import InferenceResult, LipSyncModel

log = get_logger(__name__)


class MuseTalkModel(LipSyncModel):
    name = "musetalk"

    def __init__(self) -> None:
        self._loaded = False
        self._musetalk_root = Path(settings.models_dir) / "musetalk"

    def load(self) -> None:
        """Verify the MuseTalk repo + weights are on disk."""
        root = self._musetalk_root
        required = [
            root / "scripts" / "inference.py",
            root / "models" / "musetalkV15" / "unet.pth",
            root / "models" / "musetalkV15" / "musetalk.json",
            root / "models" / "sd-vae" / "config.json",
            root / "models" / "whisper" / "preprocessor_config.json",
            root / "models" / "whisper" / "pytorch_model.bin",
            root / "models" / "dwpose" / "dw-ll_ucoco_384.pth",
            root / "models" / "face-parse-bisent" / "resnet18-5c106cde.pth",
            root / "models" / "face-parse-bisent" / "79999_iter.pth",
        ]
        missing = [str(p) for p in required if not p.exists()]
        if missing:
            raise RuntimeError(
                "MuseTalk assets missing:\n  " + "\n  ".join(missing) + "\nRun scripts/download_models.sh first."
            )
        log.info("MuseTalk assets verified at %s", root)
        self._loaded = True

    def warmup(self) -> None:
        """Subprocess pattern: skip warmup. Each call pays its own load cost.

        We could spawn a dummy run here, but that wastes minutes of GPU
        time. Cold-start cost shows up in the first /lip-sync call.
        """
        if not self._loaded:
            self.load()
        log.info("warmup: subprocess pattern uses lazy load; skipping pre-run")

    def prepare_avatar(self, image_bytes: bytes, max_edge: int | None = None) -> str:
        """Cache the avatar source as an mp4 ready for MuseTalk.

        Accepts either:
          * A still image (PNG/JPG): expanded into a short looped mp4
            (avoids upstream's image-branch bug and div-by-zero on 1-frame
            mp4).
          * A real video clip (mp4): used verbatim — the natural blink/
            breathing motion shows through MuseTalk's lip overlay.
        """
        key = avatar_key(image_bytes)
        existing = cache.get(key)
        if existing is not None and Path(existing["mp4"]).is_file():
            return key

        cache_dir = Path(settings.work_dir) / "avatars"
        cache_dir.mkdir(parents=True, exist_ok=True)
        mp4_path = cache_dir / f"{key}.mp4"

        if _looks_like_mp4(image_bytes):
            mp4_path.write_bytes(image_bytes)
            cache.put(key, {"mp4": str(mp4_path), "path": str(mp4_path)})
            log.info("avatar cached (video) key=%s mp4=%s", key[:12], mp4_path)
            return key

        # Still image path: write png, expand into a 5-frame mp4 so
        # cv2.VideoCapture.get(CAP_PROP_FPS) is non-zero and the upstream
        # script takes its (working) video branch.
        png_path = cache_dir / f"{key}.png"
        png_path.write_bytes(image_bytes)
        cmd = [
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
            "-loop", "1", "-i", str(png_path),
            "-r", str(settings.target_fps),
            "-frames:v", "5",
            "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
            "-c:v", "libx264", "-pix_fmt", "yuv420p",
            "-an",
            str(mp4_path),
        ]
        subprocess.run(cmd, check=True, capture_output=True)
        cache.put(key, {"png": str(png_path), "mp4": str(mp4_path), "path": str(mp4_path)})
        log.info("avatar cached (image) key=%s mp4=%s", key[:12], mp4_path)
        return key

    # Audio chunk size for splitting long inputs. MuseTalk on L4 processes
    # ~1s of speech per second of compute, plus a fixed ~15s model load.
    # Keep each chunk's subprocess under the Cloudflare 100s proxy timeout.
    _CHUNK_SECONDS = 25.0

    def infer(
        self, avatar_key: str, audio_pcm16k_mono: np.ndarray, lip_blend: int = 30
    ) -> InferenceResult:
        """Run MuseTalk on the audio, chunking long inputs to dodge proxy timeouts."""
        if not self._loaded:
            self.load()
        ctx = cache.get(avatar_key)
        if ctx is None:
            raise KeyError(f"avatar not prepared: {avatar_key}")
        avatar_path = ctx["mp4"]

        duration_s = len(audio_pcm16k_mono) / settings.sample_rate
        chunk_samples = int(self._CHUNK_SECONDS * settings.sample_rate)

        if duration_s <= self._CHUNK_SECONDS:
            out_mp4 = self._run_subprocess(avatar_path, audio_pcm16k_mono)
        else:
            log.info("audio %.1fs > %.0fs -> splitting", duration_s, self._CHUNK_SECONDS)
            sub_mp4s = []
            offset = 0
            while offset < len(audio_pcm16k_mono):
                segment = audio_pcm16k_mono[offset : offset + chunk_samples]
                sub_mp4s.append(self._run_subprocess(avatar_path, segment))
                offset += chunk_samples
            out_mp4 = _concat_mp4s(sub_mp4s)

        frames, fps = _decode_video_frames(str(out_mp4))
        return InferenceResult(
            frames=frames,
            fps=fps or settings.target_fps,
            audio=audio_pcm16k_mono.astype(np.float32),
            sample_rate=settings.sample_rate,
        )

    def _run_subprocess(self, avatar_path: str, audio_pcm: np.ndarray) -> Path:
        """Run a single MuseTalk subprocess call. Returns the output mp4 path."""
        import soundfile as sf

        run_dir = Path(tempfile.mkdtemp(prefix="musetalk_", dir=settings.work_dir))
        audio_path = run_dir / "audio.wav"
        sf.write(
            str(audio_path),
            audio_pcm.astype(np.float32),
            settings.sample_rate,
            subtype="PCM_16",
        )

        cfg_path = run_dir / "task.yaml"
        result_name = "out.mp4"
        cfg_path.write_text(
            "task_0:\n"
            f"  video_path: {avatar_path}\n"
            f"  audio_path: {audio_path}\n"
            f"  result_name: {result_name}\n",
            encoding="utf-8",
        )

        result_dir = run_dir / "results"
        result_dir.mkdir()

        unet_config = self._musetalk_root / "models" / "musetalk" / "musetalk.json"
        unet_weights = self._musetalk_root / "models" / "musetalkV15" / "unet.pth"
        whisper_dir = self._musetalk_root / "models" / "whisper"
        cmd = [
            sys.executable, "-m", "scripts.inference",
            "--inference_config", str(cfg_path),
            "--result_dir", str(result_dir),
            "--version", "v15",
            "--fps", str(settings.target_fps),
            "--gpu_id", "0",
            "--unet_config", str(unet_config),
            "--unet_model_path", str(unet_weights),
            "--whisper_dir", str(whisper_dir),
        ]
        if settings.fp16:
            cmd.append("--use_float16")

        env = os.environ.copy()
        env["PYTHONPATH"] = f"{self._musetalk_root}:{env.get('PYTHONPATH', '')}"

        log.info("running %s (cwd=%s)", " ".join(cmd), self._musetalk_root)
        proc = subprocess.run(
            cmd, cwd=str(self._musetalk_root), env=env,
            capture_output=True, text=True, timeout=900,
        )
        if proc.returncode != 0:
            log.error("musetalk subprocess stderr:\n%s", proc.stderr[-4000:])
            raise RuntimeError(
                f"musetalk subprocess failed rc={proc.returncode}: "
                f"{proc.stderr.splitlines()[-1] if proc.stderr else ''}"
            )

        out_mp4 = result_dir / "v15" / result_name
        if not out_mp4.is_file():
            candidates = list(result_dir.rglob("*.mp4"))
            if not candidates:
                raise RuntimeError(
                    f"MuseTalk produced no mp4. dir={result_dir}\n"
                    f"stdout tail:\n{proc.stdout[-2000:]}"
                )
            out_mp4 = max(candidates, key=lambda p: p.stat().st_size)
        return out_mp4


def _looks_like_mp4(b: bytes) -> bool:
    """Detect an ISOBMFF/mp4 container by its 'ftyp' box header."""
    return len(b) >= 12 and b[4:8] == b"ftyp"


def _concat_mp4s(parts: list[Path]) -> Path:
    """Concat sub-mp4s into one. Re-encode (not stream copy) so timing is clean."""
    if len(parts) == 1:
        return parts[0]
    work = parts[0].parent.parent  # share the temp tree of the first chunk
    list_file = work / "concat.txt"
    list_file.write_text("\n".join(f"file '{p}'" for p in parts), encoding="utf-8")
    out_path = work / "concat.mp4"
    cmd = [
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
        "-f", "concat", "-safe", "0",
        "-i", str(list_file),
        "-c:v", "libx264", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "128k",
        str(out_path),
    ]
    subprocess.run(cmd, check=True, capture_output=True)
    log.info("concat %d mp4s -> %s", len(parts), out_path)
    return out_path


def _decode_video_frames(path: str) -> tuple[np.ndarray, int]:
    """Decode an mp4 file into a (T,H,W,3) uint8 RGB tensor + fps via ffmpeg."""
    # Probe fps.
    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-of", "csv=p=0", "-select_streams", "v:0",
         "-show_entries", "stream=avg_frame_rate", path],
        capture_output=True, text=True, check=True,
    )
    rate = probe.stdout.strip() or "25/1"
    num, _, den = rate.partition("/")
    fps = int(round(float(num) / float(den or "1")))

    # Probe dimensions.
    dim = subprocess.run(
        ["ffprobe", "-v", "error", "-of", "csv=p=0", "-select_streams", "v:0",
         "-show_entries", "stream=width,height", path],
        capture_output=True, text=True, check=True,
    )
    w, _, h = dim.stdout.strip().partition(",")
    w, h = int(w), int(h)

    raw = subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error",
         "-i", path, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
        capture_output=True, check=True,
    ).stdout
    frames = np.frombuffer(raw, dtype=np.uint8).reshape(-1, h, w, 3)
    return frames, fps
