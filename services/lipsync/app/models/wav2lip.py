from __future__ import annotations

import io
import sys
from functools import lru_cache
from pathlib import Path

import numpy as np

from ..cache import avatar_key, cache
from ..config import settings
from ..logging_setup import get_logger
from .base import InferenceResult, LipSyncModel

log = get_logger(__name__)


@lru_cache(maxsize=128)
def _feather_alpha(h: int, w: int, pct: int) -> np.ndarray:
    """Soft 0..1 alpha for blending the Wav2Lip face crop back into the frame.

    1.0 in the centre, ramps to 0.0 over a border whose width grows with `pct`
    (the 'smoothness'/ความเนียน setting). This hides the hard rectangular seam +
    the slight colour/lighting step at the crop edge. pct=0 → all-ones (hard
    paste, old behaviour). Cached because consecutive frames reuse bbox sizes.
    """
    frac = max(0.0, min(1.0, pct / 100.0))
    m = np.ones((h, w), dtype=np.float32)
    b = int(min(h, w) * 0.5 * frac)
    b = max(0, min(b, h // 2, w // 2))
    if b > 0:
        ramp = np.linspace(0.0, 1.0, b, dtype=np.float32)
        m[:b, :] = np.minimum(m[:b, :], ramp[:, None])
        m[h - b:, :] = np.minimum(m[h - b:, :], ramp[::-1][:, None])
        m[:, :b] = np.minimum(m[:, :b], ramp[None, :])
        m[:, w - b:] = np.minimum(m[:, w - b:], ramp[None, ::-1])
    return m[..., None]  # (h, w, 1) — broadcasts over BGR. Do not mutate (cached).


class Wav2LipModel(LipSyncModel):
    """Fallback baseline. Wraps the original Rudrabha/Wav2Lip repo.

    Source + ``wav2lip_gan.pth`` expected at
    ``settings.models_dir/wav2lip``.
    """

    name = "wav2lip"

    def __init__(self) -> None:
        self._loaded = False
        self._device = settings.device
        self._root = Path(settings.models_dir) / "wav2lip"
        self._model = None
        self._face_detect = None

    def _ensure_path(self) -> None:
        root = str(self._root)
        if root not in sys.path:
            sys.path.insert(0, root)

    def load(self) -> None:
        if self._loaded:
            return
        self._ensure_path()
        try:
            import torch  # noqa: F401
            from models import Wav2Lip  # upstream
            from face_detection import FaceAlignment, LandmarksType
            import audio  # upstream audio.py
        except Exception as e:
            raise RuntimeError(
                "Wav2Lip source not found. Run scripts/download_models.sh first."
            ) from e

        import torch

        # librosa >= 0.10 made filters.mel() keyword-only, but upstream
        # audio.py calls it positionally: mel(sr, n_fft, n_mels=.., fmin=..,
        # fmax=..) -> "mel() takes 0 positional arguments but 2 ... given".
        # Shim once, globally, so audio.melspectrogram keeps working.
        import librosa

        if not getattr(librosa.filters.mel, "_w2l_positional_shim", False):
            _orig_mel = librosa.filters.mel

            def _mel_compat(*args, **kwargs):
                for name, val in zip(("sr", "n_fft"), args):
                    kwargs.setdefault(name, val)
                return _orig_mel(**kwargs)

            _mel_compat._w2l_positional_shim = True
            librosa.filters.mel = _mel_compat

        ckpt_path = self._root / "checkpoints" / "wav2lip_gan.pth"
        log.info("loading Wav2Lip ckpt=%s", ckpt_path)
        ckpt = torch.load(str(ckpt_path), map_location=self._device)
        state = {k.replace("module.", ""): v for k, v in ckpt["state_dict"].items()}
        model = Wav2Lip()
        model.load_state_dict(state)
        model = model.to(self._device).eval()
        if settings.fp16:
            try:
                model = model.half()
            except Exception:
                pass
        self._model = model
        self._face_detect = FaceAlignment(LandmarksType._2D, flip_input=False, device=self._device)
        self._audio_mod = audio
        self._loaded = True

    def warmup(self) -> None:
        if not self._loaded:
            self.load()
        try:
            silence = np.zeros(int(settings.sample_rate * 0.5), dtype=np.float32)
            blank = self._blank_avatar_bytes()
            key = self.prepare_avatar(blank)
            _ = self.infer(key, silence)
            log.info("warmup ok")
        except Exception as e:  # pragma: no cover
            log.exception("warmup failed: %s", e)

    @staticmethod
    def _blank_avatar_bytes() -> bytes:
        import imageio.v3 as iio

        img = (np.ones((256, 256, 3), dtype=np.uint8) * 128)
        buf = io.BytesIO()
        iio.imwrite(buf, img, extension=".png")
        return buf.getvalue()

    def prepare_avatar(self, image_bytes: bytes, max_edge: int | None = None) -> str:
        import os as _os

        # long-edge cap; caller (video_quality) drives this so lip-sync res
        # follows the requested output res. Falls back to env / 1280.
        MAX_EDGE = int(max_edge or _os.getenv("LIPSYNC_MAX_EDGE", "1280"))
        # Cache per (clip, MAX_EDGE) — a 720 and a 1080 render of the same ref
        # must NOT share prepared frames.
        key = f"{avatar_key(image_bytes)}:{MAX_EDGE}"
        if cache.get(key) is not None:
            return key
        import cv2
        import imageio.v3 as iio
        import tempfile

        # Read frames. For VIDEO use cv2.VideoCapture (streams frame-by-frame,
        # bounded — never loads the whole clip into RAM). Cap count + size so a
        # long/large clip can't hang. Falls back to a single still image.
        MAX_FRAMES = int(_os.getenv("LIPSYNC_MAX_FRAMES", "300"))   # ~12s @25fps CONSECUTIVE (looped for longer audio)
        frames: list = []
        head = image_bytes[:12]
        is_video = (b"ftyp" in head) or (b"webm" in head) or (b"\x1aE\xdf\xa3" in head)
        if is_video:
            tmp = tempfile.NamedTemporaryFile(suffix=".mp4", delete=False)
            try:
                tmp.write(image_bytes); tmp.flush(); tmp.close()
                cap = cv2.VideoCapture(tmp.name)
                # Read CONSECUTIVE frames at the source's native fps so 1 source
                # frame == 1 output frame at target_fps → head moves at natural
                # speed. (Subsampling across the whole clip = sped-up motion.)
                while len(frames) < MAX_FRAMES:
                    ok, fr = cap.read()
                    if not ok:
                        break
                    fr = cv2.cvtColor(fr, cv2.COLOR_BGR2RGB)
                    h, w = fr.shape[:2]
                    s = min(1.0, MAX_EDGE / max(h, w))
                    if s < 1.0:
                        fr = cv2.resize(fr, (int(w * s), int(h * s)))
                    frames.append(np.ascontiguousarray(fr))
                cap.release()
            finally:
                try: _os.unlink(tmp.name)
                except Exception: pass
        if not frames:
            img = iio.imread(io.BytesIO(image_bytes))
            if img.ndim == 2:
                img = np.stack([img] * 3, axis=-1)
            img = img[:, :, :3]
            h, w = img.shape[:2]
            s = min(1.0, MAX_EDGE / max(h, w))
            if s < 1.0:
                img = cv2.resize(img, (int(w * s), int(h * s)))
            frames = [np.ascontiguousarray(img)]

        # Pass 1: detect a raw face bbox per frame (reuse last good on a miss).
        kept_frames = []
        raw_boxes = []
        last = None
        for fr in frames:
            fr = np.ascontiguousarray(fr[:, :, :3])
            preds = self._face_detect.get_detections_for_batch(np.array([fr]))
            box = preds[0] if preds and preds[0] is not None else last
            if box is None:
                continue
            last = box
            kept_frames.append(fr)
            raw_boxes.append([float(v) for v in box])
        if not raw_boxes:
            raise RuntimeError("No face detected in avatar image/video")

        # Pass 2: temporally smooth the bbox sequence (upstream Wav2Lip does this
        # with a 5-frame moving average). Per-frame s3fd detection jitters a few
        # px each frame; that jitter makes the pasted mouth wobble → unnatural.
        # Averaging the box over a short window stabilises mouth position so the
        # lips read as "attached" and move smoothly.
        boxes = np.asarray(raw_boxes, dtype=np.float32)
        T = min(5, len(boxes))
        if T > 1:
            smoothed = boxes.copy()
            for i in range(len(boxes)):
                lo = i if i + T <= len(boxes) else len(boxes) - T
                smoothed[i] = boxes[lo:lo + T].mean(axis=0)
            boxes = smoothed

        # Pass 3: clamp to frame bounds + crop the (now stable) face region.
        entries = []
        for fr, box in zip(kept_frames, boxes):
            x1, y1, x2, y2 = (int(round(v)) for v in box)
            h, w = fr.shape[:2]
            x1 = max(0, min(x1, w - 1)); y1 = max(0, min(y1, h - 1))
            x2 = max(x1 + 1, min(x2, w)); y2 = max(y1 + 1, min(y2, h))
            face = fr[y1:y2, x1:x2]
            if face.size == 0:
                continue
            entries.append({"image": fr, "bbox": (x1, y1, x2, y2), "face": face})
        if not entries:
            raise RuntimeError("No face detected in avatar image/video")

        cache.put(key, {"frames": entries})
        return key

    def infer(self, avatar_key: str, audio_pcm16k_mono: np.ndarray, lip_blend: int = 30) -> InferenceResult:
        if not self._loaded:
            self.load()
        ctx = cache.get(avatar_key)
        if ctx is None:
            raise KeyError(f"avatar not prepared: {avatar_key}")

        import cv2
        import torch

        mel_step_size = 16
        mel = self._audio_mod.melspectrogram(audio_pcm16k_mono)
        mel_chunks = []
        mel_idx_multiplier = 80.0 / settings.target_fps
        i = 0
        while True:
            start = int(i * mel_idx_multiplier)
            if start + mel_step_size > mel.shape[1]:
                mel_chunks.append(mel[:, -mel_step_size:])
                break
            mel_chunks.append(mel[:, start : start + mel_step_size])
            i += 1

        entries = ctx["frames"]
        n_src = len(entries)
        n = len(mel_chunks)
        # Cycle source frames (ping-pong so a short clip loops smoothly).
        def src_idx(i: int) -> int:
            if n_src == 1:
                return 0
            period = 2 * (n_src - 1)
            j = i % period
            return j if j < n_src else period - j

        faces96 = [cv2.resize(entries[src_idx(i)]["face"], (96, 96)) for i in range(n)]
        face_batch = np.asarray(faces96)
        mel_batch = np.asarray(mel_chunks)

        img_masked = face_batch.copy()
        img_masked[:, 96 // 2 :] = 0
        img_in = np.concatenate((img_masked, face_batch), axis=3) / 255.0
        img_in = torch.FloatTensor(np.transpose(img_in, (0, 3, 1, 2))).to(self._device)
        # Wav2Lip audio encoder expects (N, 1, 80, 16) — just add the channel dim.
        mel_in = torch.FloatTensor(mel_batch).unsqueeze(1).to(self._device)
        if settings.fp16:
            img_in = img_in.half()
            mel_in = mel_in.half()

        with torch.no_grad():
            pred = self._model(mel_in, img_in)
        pred = (pred.float().cpu().numpy().transpose(0, 2, 3, 1) * 255.0).astype(np.uint8)

        blend_pct = int(max(0, min(100, lip_blend)))
        frames = []
        for i, p in enumerate(pred):
            e = entries[src_idx(i)]
            x1, y1, x2, y2 = e["bbox"]
            f = e["image"].copy()
            # Resize to the slice's real shape, not the bbox dims — guards
            # against any 1-px mismatch ("could not broadcast").
            region = f[y1:y2, x1:x2]
            rh, rw = region.shape[:2]
            pred_r = cv2.resize(p, (rw, rh))
            if blend_pct <= 0:
                f[y1:y2, x1:x2] = pred_r
            else:
                # Feather the crop edge so it melts into the surrounding frame.
                m = _feather_alpha(rh, rw, blend_pct)
                f[y1:y2, x1:x2] = (
                    pred_r.astype(np.float32) * m + region.astype(np.float32) * (1.0 - m)
                ).astype(np.uint8)
            frames.append(f)

        return InferenceResult(
            frames=np.stack(frames, axis=0),
            fps=settings.target_fps,
            audio=audio_pcm16k_mono.astype(np.float32),
            sample_rate=settings.sample_rate,
        )
