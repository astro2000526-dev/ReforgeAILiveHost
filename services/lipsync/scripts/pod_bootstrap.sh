#!/usr/bin/env bash
# RunPod Pod first-boot bootstrap.
# Idempotent: re-running skips already-done steps. Safe to set as Pod start command.
#
# Required env (set in RunPod Pod env vars):
#   GIT_REPO_URL=https://<token>@github.com/<owner>/ai-live-bot.git   (private repo)
#   API_TOKEN=<random>                # required, the bot uses this to auth
# Optional:
#   LIPSYNC_MODEL=musetalk            # musetalk | wav2lip | mock
#   FP16=true
#   TARGET_FPS=25
set -euo pipefail

WORKDIR=/workspace
REPO_DIR=$WORKDIR/ai-live-bot
export MODELS_DIR=${MODELS_DIR:-$WORKDIR/models}
export WORK_DIR=${WORK_DIR:-$WORKDIR/runtime}

mkdir -p "$MODELS_DIR" "$WORK_DIR"

echo "[bootstrap] workdir=$WORKDIR models=$MODELS_DIR runtime=$WORK_DIR"

# 0) System packages we depend on. ffmpeg is required by both the API
# (audio decode + mp4 mux) and by MuseTalk's scripts.inference. Some
# RunPod base images ship CUDA tooling but no ffmpeg.
if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "[bootstrap] installing ffmpeg"
  apt-get update -qq && apt-get install -y --no-install-recommends ffmpeg
fi

# 1) Clone or pull repo
if [ -z "${GIT_REPO_URL:-}" ] && [ ! -d "$REPO_DIR/.git" ]; then
  echo "GIT_REPO_URL not set and repo not present. Either set the env var or git-clone into $REPO_DIR manually." >&2
  exit 1
fi

if [ ! -d "$REPO_DIR/.git" ]; then
  echo "[bootstrap] git clone -> $REPO_DIR"
  git clone --depth 1 "$GIT_REPO_URL" "$REPO_DIR"
else
  echo "[bootstrap] git pull in $REPO_DIR"
  git -C "$REPO_DIR" pull --ff-only || echo "[bootstrap] pull failed (offline?), continuing"
fi

cd "$REPO_DIR/runpod-lipsync"

# 2) Install python deps
echo "[bootstrap] pip install"
python -m pip install --upgrade pip wheel setuptools

# Torch first (CUDA 12.1 wheels). Idempotent: pip is a no-op if already installed.
python -m pip install --index-url https://download.pytorch.org/whl/cu121 \
        torch==2.3.1 torchvision==0.18.1 torchaudio==2.3.1
python -m pip install -r requirements.txt

# 2b) MuseTalk runtime deps that openmim cannot resolve cleanly.
#   - setuptools must stay >=70 (openmim pulls in 60.x via openxlab,
#     which breaks chumpy / mmcv build_isolation -> pkg_resources missing).
#   - mmcv 2.1.0 must compile from source on this exact (torch, CUDA) pair
#     because no prebuilt wheel exists. ~10-15 min on L4. Idempotent.
#   - mmdet 3.2 / mmpose 1.2 are the lowest versions that allow mmcv 2.1.
#   - mmpose's chumpy dep ships a broken setup.py; install --no-deps to
#     skip the reinstall once mmcv is in place.
echo "[bootstrap] MuseTalk runtime deps (mmcv compile, ~15 min on L4 first run)"
python -m pip install -U "setuptools>=70" pip wheel
python -m pip install --no-build-isolation chumpy==0.70
python -m pip install --no-build-isolation "mmcv==2.1.0"
python -m pip install --no-deps "mmdet==3.2.0" "mmpose==1.2.0"
python -m pip install xtcocotools json_tricks munkres ffmpeg-python moviepy gdown openmim

# 3) Download weights (script is idempotent)
echo "[bootstrap] download models"
bash scripts/download_models.sh

# 4) Optional warm-up sanity
python - <<'PY'
import torch
print("[bootstrap] torch", torch.__version__, "cuda", torch.cuda.is_available(),
      "device", torch.cuda.get_device_name(0) if torch.cuda.is_available() else "cpu")
PY

# 5) Start API
echo "[bootstrap] starting uvicorn on 0.0.0.0:8000"
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1
