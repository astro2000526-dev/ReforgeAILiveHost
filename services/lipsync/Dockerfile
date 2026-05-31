# devel (not runtime) base — provides nvcc so mmcv can compile its CUDA ops.
FROM nvidia/cuda:12.1.1-cudnn8-devel-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    TZ=UTC \
    MODELS_DIR=/workspace/models \
    WORK_DIR=/workspace/runtime \
    CUDA_HOME=/usr/local/cuda \
    TORCH_CUDA_ARCH_LIST=8.9

RUN apt-get update && apt-get install -y --no-install-recommends \
        python3.11 python3.11-venv python3-pip python3.11-dev \
        ffmpeg git curl ca-certificates build-essential \
        libgl1 libglib2.0-0 libsm6 libxext6 libxrender1 \
    && rm -rf /var/lib/apt/lists/* \
    && ln -sf /usr/bin/python3.11 /usr/local/bin/python \
    && ln -sf /usr/bin/python3.11 /usr/local/bin/python3 \
    && python -m pip install --upgrade pip setuptools wheel

WORKDIR /app

# Torch 2.1.1 (CUDA 12.1) — pinned to match the prebuilt mmcv 2.1.0 wheel so
# mmcv's CUDA ops are ABI-compatible (torch 2.3 + mmcv 2.1 compiled = SIGSEGV).
RUN pip install --index-url https://download.pytorch.org/whl/cu121 \
        torch==2.1.1 torchvision==0.16.1 torchaudio==2.1.1

COPY requirements.txt /app/requirements.txt
RUN pip install -r /app/requirements.txt

# --- MuseTalk runtime deps: use the PREBUILT mmcv 2.1.0 wheel for torch2.1/cu121
#     (no source compile → fast + ABI-correct). ---
RUN pip install -U "setuptools>=70" pip wheel \
    && pip install --no-build-isolation chumpy==0.70 \
    && pip install "mmcv==2.1.0" -f https://download.openmmlab.com/mmcv/dist/cu121/torch2.1/index.html \
    && pip install --no-deps "mmdet==3.2.0" "mmpose==1.2.0" \
    && pip install xtcocotools json_tricks munkres ffmpeg-python moviepy gdown openmim \
    # mmpose deps drag in scikit-learn→numpy2, which segfaults mmcv's compiled
    # ops (built for the numpy-1 C ABI). Force the numpy-1 stack back.
    && pip install "numpy==1.26.4" "scipy==1.11.4" "scikit-learn==1.3.2" \
    # NOTE: don't import mmcv.ops here — docker build has no GPU, so touching
    # CUDA ops segfaults at build time. Verify import-only; ops are tested at
    # runtime (with --gpus). Build succeeding == deps resolved correctly.
    && python -c "import mmpose,mmdet,mmcv,numpy; print('mm import OK', mmpose.__version__, 'numpy', numpy.__version__)"

COPY app /app/app
COPY handler.py /app/handler.py
COPY scripts /app/scripts
RUN chmod +x /app/scripts/*.sh

RUN mkdir -p ${MODELS_DIR} ${WORK_DIR}

EXPOSE 8000

# Default: API server. RunPod Pod start command can override.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
