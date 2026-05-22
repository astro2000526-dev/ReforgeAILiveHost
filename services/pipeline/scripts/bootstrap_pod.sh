#!/usr/bin/env bash
# One-shot setup for a fresh AutoDL (or any Linux CUDA) pod.
#
# Usage:
#   cd <repo>/services/pipeline
#   bash scripts/bootstrap_pod.sh
#
# What it does:
#   1. apt-installs ffmpeg + git-lfs (if missing).
#   2. Clones TMElyralab/MuseTalk into ./MuseTalk and installs its deps.
#   3. Runs MuseTalk's download_weights.sh (which itself uses hf-mirror.com,
#      so this works from inside mainland China).
#   4. Installs THIS service's requirements on top — order matters: MuseTalk
#      pulls a huge torch+diffusers stack first, then our pins (supabase,
#      fastapi, httpx<0.28) layer on top without conflict.
#   5. Copies .env.example -> .env if .env doesn't exist yet.
#
# What it does NOT do:
#   - Fill in .env (you must do that — Volcengine + Supabase secrets).
#   - Start uvicorn. After this finishes, edit .env then run:
#       uvicorn app.main:app --host 0.0.0.0 --port 8000
set -euo pipefail

# --- Sanity: we should be in services/pipeline ---
if [ ! -f "app/main.py" ] || [ ! -f "requirements.txt" ]; then
  echo "ERROR: run this from services/pipeline/ (couldn't find app/main.py)" >&2
  exit 1
fi

PIPELINE_DIR="$(pwd)"
echo "==> Working directory: $PIPELINE_DIR"

# --- 1. System packages ---
echo "==> Installing ffmpeg + git-lfs (apt)"
if command -v apt-get >/dev/null 2>&1; then
  apt-get update -qq
  apt-get install -y -qq ffmpeg git-lfs >/dev/null
  git lfs install --skip-repo >/dev/null
else
  echo "WARN: no apt-get found — assuming ffmpeg + git-lfs already installed" >&2
fi

# --- 2. Clone MuseTalk ---
if [ ! -d "MuseTalk" ]; then
  echo "==> Cloning TMElyralab/MuseTalk"
  git clone --depth 1 https://github.com/TMElyralab/MuseTalk.git
else
  echo "==> MuseTalk already cloned, skipping clone"
fi

# --- 3. Install MuseTalk's Python deps ---
echo "==> Installing MuseTalk requirements (this is the big one — torch/diffusers/xformers)"
pip install --upgrade pip
pip install -r MuseTalk/requirements.txt

# --- 4. Download weights (uses hf-mirror.com per MuseTalk's own script) ---
WEIGHT_FILE="MuseTalk/models/musetalkV15/unet.pth"
if [ -f "$WEIGHT_FILE" ]; then
  echo "==> Weights already present at $WEIGHT_FILE, skipping download"
else
  echo "==> Downloading MuseTalk weights (~10-15GB; allow 10+ min)"
  pushd MuseTalk >/dev/null
  # Make sure the mirror endpoint is set even if the script doesn't export it
  # itself (older revs don't).
  export HF_ENDPOINT="${HF_ENDPOINT:-https://hf-mirror.com}"
  bash download_weights.sh
  popd >/dev/null
fi

# Hard verify — we'd rather fail here than have MuseTalk choke at runtime.
for f in \
  "MuseTalk/models/musetalkV15/unet.pth" \
  "MuseTalk/models/musetalkV15/musetalk.json" \
  "MuseTalk/models/sd-vae" \
  "MuseTalk/models/whisper"
do
  if [ ! -e "$f" ]; then
    echo "ERROR: expected weight artifact missing: $f" >&2
    echo "       download_weights.sh may have failed silently. Re-run it manually:" >&2
    echo "         cd MuseTalk && HF_ENDPOINT=https://hf-mirror.com bash download_weights.sh" >&2
    exit 1
  fi
done

# --- 5. Install THIS service's deps (layers on top of MuseTalk's env) ---
echo "==> Installing FastAPI service requirements"
pip install -r requirements.txt

# --- 6. .env stub ---
if [ ! -f ".env" ]; then
  cp .env.example .env
  echo "==> Created .env from .env.example"
fi

# --- 7. Pre-fill the MuseTalk paths in .env so the user only has to fill secrets ---
MUSETALK_ABS="$PIPELINE_DIR/MuseTalk"
# sed -i works on GNU sed (Linux pods), which is what AutoDL ships.
sed -i "s|^MUSETALK_ENABLED=.*|MUSETALK_ENABLED=1|" .env
sed -i "s|^MUSETALK_PATH=.*|MUSETALK_PATH=$MUSETALK_ABS|" .env
sed -i "s|^MUSETALK_FFMPEG_DIR=.*|MUSETALK_FFMPEG_DIR=/usr/bin|" .env
sed -i "s|^FFMPEG_BIN=.*|FFMPEG_BIN=ffmpeg|" .env

echo ""
echo "================================================================"
echo "Bootstrap done."
echo ""
echo "Next steps:"
echo "  1. Edit .env and fill in:"
echo "       VOLCENGINE_APPID, VOLCENGINE_ACCESS_TOKEN"
echo "       SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_STORAGE_BUCKET"
echo "  2. Start the service:"
echo "       uvicorn app.main:app --host 0.0.0.0 --port 8000"
echo "  3. From another shell, smoke-test /generate (see services/pipeline/README.md)"
echo ""
echo "MuseTalk repo path:  $MUSETALK_ABS"
echo "ffmpeg binary:       $(which ffmpeg)"
echo "================================================================"
