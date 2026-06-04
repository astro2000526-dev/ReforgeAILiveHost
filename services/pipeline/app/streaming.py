"""RTMP push to Shopee Live (or test ingest).

Decision (Day 0 review #3): we re-encode rather than `-c copy`, force GOP=2s,
and reset PTS at each loop boundary to keep Shopee's ingestion stable.
"""
import asyncio
import subprocess
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from .config import FFMPEG_BIN


@dataclass
class StreamHandle:
    stream_id: str
    proc: subprocess.Popen
    started_at: float = field(default_factory=time.time)


_streams: dict[str, StreamHandle] = {}


def start_stream(stream_id: str, video_source: Path | str, rtmp_url: str, stream_key: str) -> StreamHandle:
    """Push `video_source` (local path OR http(s) URL) to RTMP in a loop.

    ffmpeg ingests both transparently; the caller in `main.py` decides which
    based on whether the URL looks remote.
    """
    if stream_id in _streams and _streams[stream_id].proc.poll() is None:
        raise RuntimeError(f"stream {stream_id} already live")

    full_target = f"{rtmp_url.rstrip('/')}/{stream_key}"
    cmd = [
        FFMPEG_BIN,
        "-re",
        "-stream_loop", "-1",
        "-fflags", "+genpts",
        "-i", str(video_source),
        "-c:v", "libx264", "-preset", "veryfast", "-b:v", "3000k",
        "-force_key_frames", "expr:gte(t,n_forced*2)",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "128k", "-ar", "44100",
        "-f", "flv",
        full_target,
    ]
    proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    handle = StreamHandle(stream_id=stream_id, proc=proc)
    _streams[stream_id] = handle
    return handle


def stop_stream(stream_id: str) -> bool:
    handle = _streams.get(stream_id)
    if not handle:
        return False
    if handle.proc.poll() is None:
        handle.proc.terminate()
        try:
            handle.proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            handle.proc.kill()
    _streams.pop(stream_id, None)
    return True


def list_streams() -> list[dict]:
    """Snapshot of every tracked ffmpeg push — consumed by /system/status."""
    out = []
    for sid in list(_streams):
        s = stream_status(sid)
        if s:
            out.append(s)
    return out


def stream_status(stream_id: str) -> Optional[dict]:
    handle = _streams.get(stream_id)
    if not handle:
        return None
    alive = handle.proc.poll() is None
    return {
        "stream_id": stream_id,
        "status": "live" if alive else "stopped",
        "pid": handle.proc.pid,
        "started_at": handle.started_at,
        "duration_sec": time.time() - handle.started_at,
    }
