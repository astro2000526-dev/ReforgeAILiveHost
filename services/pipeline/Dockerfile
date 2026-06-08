# syntax=docker/dockerfile:1.6
#
# ReforgeAILiveHost — pipeline (GPU)
# Base: NVIDIA CUDA 12.1 runtime on Ubuntu 22.04 (Python 3.10).
# Layout: /workspace/{app,scripts,MuseTalk}, weights mounted as volume.
# Run as non-root user `pipeline` (uid 1000).
#
# Build:
#   docker build -t reforge-pipeline:latest .
#
# Pin MuseTalk to a known-good commit (do this after first successful smoke):
#   docker build --build-arg MUSETALK_GIT_REF=<sha> -t reforge-pipeline:latest .

FROM nvidia/cuda:12.1.0-cudnn8-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    HF_ENDPOINT=https://hf-mirror.com \
    MUSETALK_PATH=/workspace/MuseTalk \
    MUSETALK_FFMPEG_DIR=/usr/bin

# --- System packages ---------------------------------------------------------
# ffmpeg: video work; git+git-lfs: MuseTalk clone + weight LFS files;
# libgl1+libglib2: opencv runtime (used by GFPGAN); curl: healthcheck.
RUN apt-get update && apt-get install -y --no-install-recommends \
        python3.10 python3.10-venv python3-pip \
        ffmpeg git git-lfs \
        libgl1 libglib2.0-0 \
        ca-certificates curl \
    && git lfs install --skip-repo \
    && ln -sf /usr/bin/python3.10 /usr/local/bin/python \
    && ln -sf /usr/bin/python3.10 /usr/local/bin/python3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace

# --- MuseTalk repo (heavy layer; cache aggressively) -------------------------
# Default ref = main, override via --build-arg MUSETALK_GIT_REF=<sha> for prod.
ARG MUSETALK_GIT_REF=main
RUN git clone --depth 1 --branch "${MUSETALK_GIT_REF}" \
        https://github.com/TMElyralab/MuseTalk.git /workspace/MuseTalk

# MuseTalk's pip deps = torch + diffusers + xformers + opencv + gfpgan stack.
# This is the largest layer (~5GB). Goes BEFORE our app code so app edits
# don't invalidate it.
RUN python -m pip install --upgrade pip \
    && pip install -r /workspace/MuseTalk/requirements.txt

# --- Our service deps (small; layer last) ------------------------------------
COPY requirements.txt /workspace/requirements.txt
RUN pip install -r /workspace/requirements.txt

# rembg person matting on GPU: swap the CPU onnxruntime (from requirements.txt)
# for the CUDA 12.x build so u2net_human_seg runs on the GPU.
RUN pip uninstall -y onnxruntime && pip install onnxruntime-gpu==1.19.2
# Persist the u2net weights (~176MB, downloaded on first matting call) on the
# models volume so container restarts don't re-download.
ENV U2NET_HOME=/workspace/MuseTalk/models/u2net

# --- Offline TTS (espeak-ng) — works without network/key (edge-tts is geo-blocked in CN) ---
# Late layer so it doesn't invalidate the heavy MuseTalk/torch cache above.
USER root
RUN apt-get update && apt-get install -y --no-install-recommends espeak-ng \
    && rm -rf /var/lib/apt/lists/*

# --- App code ----------------------------------------------------------------
COPY app /workspace/app
COPY scripts /workspace/scripts
COPY docker-entrypoint.sh /workspace/docker-entrypoint.sh
RUN chmod +x /workspace/docker-entrypoint.sh /workspace/scripts/check_gpu_seam.sh \
    # GPU-seam guard: fail the build if torch/rembg/gfpgan/transformers leak
    # outside app/gpu/ — keeps the GPU boundary swappable via env alone.
    && /workspace/scripts/check_gpu_seam.sh

# --- Non-root user + writable dirs -------------------------------------------
# Pre-create tmp/output so the user owns them before mount.
RUN useradd --create-home --uid 1000 --shell /bin/bash pipeline \
    && mkdir -p /workspace/tmp /workspace/output /workspace/MuseTalk/models \
    && chown -R pipeline:pipeline /workspace
USER pipeline

# --- Runtime volumes ---------------------------------------------------------
# - models/: ~15GB of weights, downloaded on first run via entrypoint.
# - tmp/   : per-job working dir; persisted so a restart can resume cleanup.
# - output/: final mp4s before they get uploaded to Supabase Storage.
VOLUME ["/workspace/MuseTalk/models", "/workspace/tmp", "/workspace/output"]

EXPOSE 8000

# --- Healthcheck -------------------------------------------------------------
# Start period 120s = give MuseTalk import + CUDA init time on first boot.
HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 \
    CMD curl -fsS http://localhost:8000/health || exit 1

ENTRYPOINT ["/workspace/docker-entrypoint.sh"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
