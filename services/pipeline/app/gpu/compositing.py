"""Presenter background compositing + frame layout.

Per-avatar render options applied AFTER the clip is produced (AI lip-sync or
template loop), right before speed/finalize:

  1. camera_zoom     — center crop-zoom (pure ffmpeg, cheap)
  2. frame layout    — presenter scaled (frame_scale < 1) and anchored in the
                       frame (frame_position 9-grid: top-left … bottom-right)
  3. bg_remove       — per-frame person matting via rembg (u2net_human_seg),
                       then overlay onto a background image/video (or black)

Without bg_remove, layout overlays the OPAQUE presenter video onto the
background (picture-in-picture style). With bg_remove, the matted person is
overlaid with alpha. Everything is best-effort: the caller catches exceptions
and keeps the un-composited clip, reporting a warning instead of failing.
"""

from __future__ import annotations

import logging
import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Callable

from ..config import FFMPEG_BIN
from ..media import probe_stream, zoom_vf

log = logging.getLogger("pipeline.compositing")

# rembg ONNX session — loaded once per process (same pattern as GFPGAN cache).
_rembg_session = None


def _session():
    global _rembg_session
    if _rembg_session is None:
        from rembg import new_session  # lazy — optional dep on dev machines

        _rembg_session = new_session(os.getenv("REMBG_MODEL", "u2net_human_seg"))
    return _rembg_session


def _run(cmd: list[str], what: str) -> None:
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"{what} failed: {(r.stderr or '')[-300:]}")


def _overlay_xy(position: str) -> tuple[str, str]:
    """9-grid anchor → overlay x/y expressions (W/H = canvas, w/h = layer)."""
    p = (position or "center").lower()
    x, y = "(W-w)/2", "(H-h)/2"
    if "left" in p:
        x = "0"
    if "right" in p:
        x = "W-w"
    if "top" in p:
        y = "0"
    if "bottom" in p:
        y = "H-h"
    return x, y


def _fg_scale_vf(frame_scale: float) -> str | None:
    """Scale the presenter layer down to frame_scale of its size (even dims)."""
    fs = max(0.2, min(1.0, float(frame_scale or 1.0)))
    if fs > 0.995:
        return None
    return f"scale=trunc(iw*{fs}/2)*2:trunc(ih*{fs}/2)*2:flags=lanczos"


def _bg_args(background: str | None, background_type: str | None,
             w: int, h: int, warnings: list[str], note_black: bool) -> list[str]:
    """Background ffmpeg input: image loops, video loops, none → black."""
    if background and background_type == "video":
        return ["-stream_loop", "-1", "-i", str(background)]
    if background:
        return ["-loop", "1", "-i", str(background)]
    if note_black:
        warnings.append("bg_remove on but no background set — used black")
    return ["-f", "lavfi", "-i", f"color=c=black:s={w}x{h}:r=25"]


def apply_composite(
    video_path: Path,
    *,
    bg_remove: bool = False,
    background: str | None = None,        # local path or URL (image/video)
    background_type: str | None = None,   # "image" | "video"
    camera_zoom: float = 1.0,
    frame_position: str = "center",       # 9-grid anchor
    frame_scale: float = 1.0,             # presenter size in frame (0.2..1.0)
    progress: Callable[[int], None] | None = None,
) -> list[str]:
    """Apply zoom + frame layout + background removal IN PLACE on video_path.

    Returns non-fatal warnings. Raises on hard failure (caller keeps the
    original clip)."""
    warnings: list[str] = []
    zvf = zoom_vf(camera_zoom)
    fg_vf = _fg_scale_vf(frame_scale)
    pos = (frame_position or "center").lower()
    needs_layout = fg_vf is not None or pos != "center"

    if not bg_remove and not needs_layout:
        if not zvf:
            return warnings
        # Zoom-only fast path: one re-encode, audio copied through.
        tmp = video_path.with_suffix(".zoom.mp4")
        _run([FFMPEG_BIN, "-y", "-i", str(video_path), "-vf", zvf,
              "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
              "-pix_fmt", "yuv420p", "-c:a", "copy", "-movflags", "+faststart",
              str(tmp)], "camera zoom")
        tmp.replace(video_path)
        return warnings

    if not bg_remove:
        # --- Layout path (no matting): opaque presenter over background ------
        # Canvas keeps the presenter video's dimensions; presenter is zoomed,
        # scaled to frame_scale and anchored. Background covers the canvas.
        w = int(probe_stream(video_path, "width") or 0)
        h = int(probe_stream(video_path, "height") or 0)
        if not w or not h:
            raise RuntimeError("could not probe video dimensions for layout")
        bg_in = _bg_args(background, background_type, w, h, warnings, note_black=False)
        x, y = _overlay_xy(pos)
        fg_chain = ",".join([f for f in (zvf, fg_vf) if f]) or "null"
        fc = (f"[0:v]scale={w}:{h}:force_original_aspect_ratio=increase,"
              f"crop={w}:{h},setsar=1[bg];"
              f"[1:v]{fg_chain},setsar=1[fg];"
              f"[bg][fg]overlay={x}:{y}:shortest=1[v]")
        tmp = video_path.with_suffix(".layout.mp4")
        _run([
            FFMPEG_BIN, "-y",
            *bg_in,
            "-i", str(video_path),
            "-filter_complex", fc,
            "-map", "[v]", "-map", "1:a?",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
            "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "96k", "-ar", "44100",
            "-movflags", "+faststart", "-shortest",
            str(tmp),
        ], "frame layout")
        tmp.replace(video_path)
        return warnings

    # --- Matting path ---------------------------------------------------------
    import io

    from PIL import Image  # rembg dep
    from rembg import remove

    work = Path(tempfile.mkdtemp(prefix="composite_", dir=str(video_path.parent)))
    try:
        fps = probe_stream(video_path, "r_frame_rate") or "25/1"
        frames_in = work / "in"
        frames_in.mkdir()

        # 1) extract frames (zoom baked in here so we matte the final framing).
        #    JPEG q2 keeps disk flat on long clips (PNG would be ~10x bigger);
        #    the quality loss is invisible after the final CRF-23 encode.
        extract = [FFMPEG_BIN, "-y", "-i", str(video_path)]
        if zvf:
            extract += ["-vf", zvf]
        extract += ["-q:v", "2", str(frames_in / "%06d.jpg")]
        _run(extract, "frame extract")

        frames = sorted(frames_in.glob("*.jpg"))
        if not frames:
            raise RuntimeError("no frames extracted")

        with Image.open(frames[0]) as first:
            w, h = first.size

        # 2) background input: image loops, video loops, none → black
        bg_in = _bg_args(background, background_type, w, h, warnings, note_black=True)

        # 3) matte each frame and PIPE it straight into the compositing ffmpeg
        #    (image2pipe) — no RGBA png dir, so peak disk stays at the jpgs.
        #    The matted layer is scaled to frame_scale and anchored at
        #    frame_position (alpha-blended via format=auto).
        tmp = video_path.with_suffix(".comp.mp4")
        x, y = _overlay_xy(pos)
        fg_chain = f"{fg_vf}," if fg_vf else ""
        fc = (f"[0:v]scale={w}:{h}:force_original_aspect_ratio=increase,"
              f"crop={w}:{h},setsar=1[bg];"
              f"[1:v]{fg_chain}setsar=1[fg];"
              f"[bg][fg]overlay={x}:{y}:shortest=1:format=auto[v]")
        cmd = [
            FFMPEG_BIN, "-y",
            *bg_in,
            "-f", "image2pipe", "-framerate", fps, "-c:v", "png", "-i", "pipe:0",
            "-i", str(video_path),
            "-filter_complex", fc,
            "-map", "[v]", "-map", "2:a?",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
            "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "96k", "-ar", "44100",
            "-movflags", "+faststart", "-shortest",
            str(tmp),
        ]
        session = _session()
        # stderr → file (NOT a pipe): ffmpeg is chatty and a full stderr pipe
        # would deadlock against our stdin writes.
        err_log = work / "ffmpeg.log"
        with err_log.open("wb") as err_f:
            proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=err_f)
            assert proc.stdin is not None
            try:
                for i, f in enumerate(frames):
                    with Image.open(f) as im:
                        cut = remove(im.convert("RGB"), session=session)
                    buf = io.BytesIO()
                    cut.save(buf, format="PNG")
                    proc.stdin.write(buf.getvalue())
                    f.unlink()  # keep disk usage flat
                    if progress and (i % 25 == 0 or i == len(frames) - 1):
                        progress(int((i + 1) / len(frames) * 100))
            except BrokenPipeError:
                pass  # ffmpeg died early — surfaced via returncode below
            finally:
                try:
                    proc.stdin.close()
                except Exception:
                    pass
            proc.wait()
        if proc.returncode != 0:
            tail = err_log.read_bytes()[-300:].decode(errors="replace")
            raise RuntimeError(f"background composite failed: {tail}")
        tmp.replace(video_path)
        return warnings
    finally:
        shutil.rmtree(work, ignore_errors=True)
