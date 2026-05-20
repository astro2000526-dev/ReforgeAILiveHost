from pydantic import BaseModel, Field
from typing import Literal


class ScriptSegment(BaseModel):
    type: Literal["intro", "pain", "intro_product", "demo", "price", "cta"] | str
    text: str
    duration_sec: float | None = None


class GenerateRequest(BaseModel):
    project_id: str
    avatar_template_url: str
    script_segments: list[ScriptSegment] = Field(min_length=1)
    voice: str = "th-TH-PremwadeeNeural"
    rate: str = "+0%"
    # Caller-supplied UUID that namespaces the Storage upload. Optional for
    # legacy callers / smoke scripts (we fall back to project_id).
    generation_id: str | None = None


class GenerateResponse(BaseModel):
    project_id: str
    status: Literal["queued", "tts", "lipsync", "concat", "done", "failed"]
    stage: str | None = None
    progress: int | None = None
    output_path: str | None = None
    output_url: str | None = None
    message: str | None = None


class StreamStartRequest(BaseModel):
    stream_id: str
    video_url: str
    rtmp_url: str
    stream_key: str


class StreamStatus(BaseModel):
    stream_id: str
    status: Literal["idle", "live", "stopped", "error"]
    pid: int | None = None
    started_at: float | None = None
