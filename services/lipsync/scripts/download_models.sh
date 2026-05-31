#!/usr/bin/env bash
# Download MuseTalk + (optional) Wav2Lip sources and weights into MODELS_DIR.
# Idempotent: re-running skips already-present files.
# Asset list verified against MuseTalk's official download_weights.sh.
set -euo pipefail

MODELS_DIR="${MODELS_DIR:-/workspace/models}"
mkdir -p "$MODELS_DIR"
cd "$MODELS_DIR"

echo "[download] MODELS_DIR=$MODELS_DIR"

# ---------------- MuseTalk source ----------------
if [ ! -d "musetalk/.git" ]; then
  echo "[download] cloning MuseTalk"
  git clone --depth 1 https://github.com/TMElyralab/MuseTalk.git musetalk
fi

cd musetalk
mkdir -p models/musetalk models/musetalkV15 models/sd-vae \
         models/whisper models/dwpose models/face-parse-bisent

# Python deps required by the download steps below.
python -m pip install --quiet --upgrade huggingface_hub gdown openmim

python - <<'PY'
import os, urllib.request
from huggingface_hub import snapshot_download, hf_hub_download

# 1. MuseTalk V1.0 + V1.5 weights (TMElyralab/MuseTalk).
snapshot_download(
    repo_id="TMElyralab/MuseTalk",
    local_dir="models",
    allow_patterns=[
        "musetalk/musetalk.json",
        "musetalk/pytorch_model.bin",
        "musetalkV15/musetalk.json",
        "musetalkV15/unet.pth",
    ],
)
# MuseTalk V1.0 also accepts pytorch_model.bin as unet.pth via symlink.
if not os.path.exists("models/musetalk/unet.pth"):
    os.symlink("pytorch_model.bin", "models/musetalk/unet.pth")
print("musetalk + musetalkV15 ok")

# 2. SD VAE — MuseTalk reads it from models/sd-vae (NOT sd-vae-ft-mse).
snapshot_download(
    repo_id="stabilityai/sd-vae-ft-mse",
    local_dir="models/sd-vae",
    allow_patterns=["config.json", "diffusion_pytorch_model.bin"],
)
print("sd-vae ok")

# 3. Whisper feature extractor + model (HF transformers).
snapshot_download(
    repo_id="openai/whisper-tiny",
    local_dir="models/whisper",
    allow_patterns=["config.json", "pytorch_model.bin", "preprocessor_config.json"],
)
print("whisper-tiny ok")

# 4. DWPose checkpoint.
os.makedirs("models/dwpose", exist_ok=True)
hf_hub_download(
    repo_id="yzd-v/DWPose",
    filename="dw-ll_ucoco_384.pth",
    local_dir="models/dwpose",
)
print("dwpose ckpt ok")

# 5. Face parsing — resnet18 (torchvision-style ckpt) + 79999_iter.pth (gdrive).
res = "models/face-parse-bisent/resnet18-5c106cde.pth"
if not os.path.exists(res):
    urllib.request.urlretrieve(
        "https://download.pytorch.org/models/resnet18-5c106cde.pth", res
    )
    print("resnet18 ok")

biset = "models/face-parse-bisent/79999_iter.pth"
if not os.path.exists(biset):
    import gdown
    gdown.download(id="154JgKpzCPW82qINcVieuPH3fZ2e0P812", output=biset, quiet=True)
    print("79999_iter.pth ok")
PY

cd "$MODELS_DIR"

# ---------------- Wav2Lip (optional fallback) ----------------
if [ "${SKIP_WAV2LIP:-0}" != "1" ]; then
  if [ ! -d "wav2lip/.git" ]; then
    echo "[download] cloning Wav2Lip"
    git clone --depth 1 https://github.com/Rudrabha/Wav2Lip.git wav2lip || true
  fi
  if [ -d "wav2lip" ]; then
    cd wav2lip
    mkdir -p checkpoints face_detection/detection/sfd
    if [ ! -f "checkpoints/wav2lip_gan.pth" ]; then
      echo "[download] wav2lip_gan.pth (manual, optional):"
      echo "  Drop into: $MODELS_DIR/wav2lip/checkpoints/"
      echo "  Source: https://github.com/Rudrabha/Wav2Lip#getting-the-weights"
    fi
    if [ ! -f "face_detection/detection/sfd/s3fd.pth" ]; then
      curl -fsSL -o face_detection/detection/sfd/s3fd.pth \
           https://www.adrianbulat.com/downloads/python-fan/s3fd-619a316812.pth \
           || echo "[warn] s3fd download failed, retry manually"
    fi
  fi
fi

echo "[download] done"
