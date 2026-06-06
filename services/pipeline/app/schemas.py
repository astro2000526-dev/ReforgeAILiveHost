from pydantic import BaseModel, Field
from typing import Literal

from .config import OLLAMA_URL


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


# --- AI script generation (local Qwen via ollama) ----------------------------

class ScriptRequest(BaseModel):
    product_title: str = ""
    selling_points: list[str] = []
    price_now: float | None = None
    price_original: float | None = None
    language: str = "th"          # th | en | zh
    existing_script: str = ""     # current script — improve on it, don't ignore
    avatar_name: str = ""         # presenter persona (name)
    avatar_desc: str = ""         # presenter persona (description)
    llm_url: str = OLLAMA_URL
    model: str = "qwen2.5:3b"


class LLMRequest(BaseModel):
    prompt: str
    model: str = "qwen2.5:3b"
    max_tokens: int = 256
    llm_url: str = OLLAMA_URL


# --- Render a fixed-length clip -----------------------------------------------
# Stream-only / demo path: produce an N-second mp4 WITHOUT TTS or MuseTalk.
# If a real template video is reachable we loop/trim it to N seconds; otherwise
# we fall back to a generated test pattern and report the problem in `errors`
# (the caller decides whether to continue). The clip is always produced so the
# user can push it straight to Facebook Live / any RTMP.

class RenderRequest(BaseModel):
    project_id: str
    duration_seconds: int = 30
    title: str | None = None
    template_url: str | None = None
    # --- AI render path (mode="ai") ---
    mode: str = "loop"                       # "loop" | "ai"
    script_text: str | None = None           # text to speak (edge-tts)
    avatar_image_url: str | None = None       # still image / first frame for lip-sync
    lipsync_url: str | None = None           # e.g. http://127.0.0.1:8001
    voice: str = "th-TH-PremwadeeNeural"
    rate: str = "+0%"
    # --- TTS engine selection (None = current chain; "sovits" = GPT-SoVITS first) ---
    tts_engine: str | None = None            # "sovits" | None
    tts_pitch: float = 0.0                    # semitones -12..12 (sovits)
    tts_emotion: str | None = None            # emotion tag (sovits, best-effort)
    voice_clone: bool = False                # clone avatar's voice (OpenVoice)
    playback_speed: float = 1.0              # final clip speed; <1 = slower (keeps A/V sync)
    output_name: str | None = None           # versioned output filename (else project_id)
    video_quality: str = "1080p"             # 1080p | 720p | 480p
    sound_mode: str = "normal"               # soft | normal | boost
    lip_blend: int = 30                      # 0..100 feather lip-crop edge (ความเนียน)
    azure_key: str | None = None             # Azure Speech key (from Settings); overrides env
    azure_region: str | None = None          # Azure region, e.g. eastus
    lipsync_model: str | None = None         # wav2lip | musetalk — switch engine to match Settings
    # --- Per-presenter background & camera (from the avatar's settings) ---
    bg_remove: bool = False                  # matte the person out (rembg)
    background_url: str | None = None        # background composited behind the person
    background_type: str | None = None       # "image" | "video"
    camera_zoom: float = 1.0                 # 1.0..3.0 center crop-zoom
    frame_position: str = "center"           # 9-grid anchor (top-left … bottom-right)
    frame_scale: float = 1.0                 # presenter size in frame (0.2..1.0)


class StreamStatus(BaseModel):
    stream_id: str
    status: Literal["idle", "live", "stopped", "error"]
    pid: int | None = None
    started_at: float | None = None
