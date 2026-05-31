#!/usr/bin/env bash
# Download ONLY the weights this stack actually uses:
#   • Wav2Lip (repo code + wav2lip_gan.pth + s3fd.pth)  → lipsync service
#   • MMS-TTS tha + eng (offline Thai/English TTS)       → pipeline service
# OpenVoice's tone-converter ships inside the openvoice-cli pip package (baked
# into the pipeline image), so nothing to fetch here.
#
# We deliberately SKIP MuseTalk's ~6GB weights — this deploy runs Wav2Lip
# (MUSETALK_ENABLED=0). Total download here is ~700MB, not 6GB.
#
# Idempotent: a file of the right size is left alone.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/lib.sh"

DATA_DIR="${DATA_DIR:?set DATA_DIR}"
HF="${HF_MIRROR:-https://hf-mirror.com}"

LS_MODELS="$DATA_DIR/lipsync/models"
PP_TMP="$DATA_DIR/pipeline/tmp"

# fetch <url> <dest> [expected_bytes] — curl -fL, follows HF LFS redirects.
fetch() {
  local url="$1" dest="$2" want="${3:-}"
  if [ -f "$dest" ] && [ -n "$want" ] && [ "$(stat -c%s "$dest" 2>/dev/null || echo 0)" = "$want" ]; then
    ok "have $(basename "$dest")"; return 0
  fi
  mkdir -p "$(dirname "$dest")"
  log "↓ $(basename "$dest")"
  curl -fL --retry 3 --retry-delay 2 -C - -o "$dest" "$url" \
    || { rm -f "$dest"; die "download failed: $url"; }
  if [ -n "$want" ]; then
    local got; got=$(stat -c%s "$dest" 2>/dev/null || echo 0)
    [ "$got" = "$want" ] || { rm -f "$dest"; die "size mismatch for $dest (got $got want $want)"; }
  fi
}

# ── 1. Wav2Lip ──────────────────────────────────────────────────────────────
W2L="$LS_MODELS/wav2lip"
if [ ! -d "$W2L/.git" ] && [ ! -f "$W2L/audio.py" ]; then
  log "cloning Wav2Lip source"
  git clone --depth 1 https://github.com/Rudrabha/Wav2Lip.git "$W2L"
else
  ok "Wav2Lip source present"
fi

# wav2lip_gan.pth (435801865 B). Primary mirror + fallback (both verified).
if ! fetch "$HF/Kedreamix/Linly-Talker/resolve/main/checkpoints/wav2lip_gan.pth" \
           "$W2L/checkpoints/wav2lip_gan.pth" 435801865 2>/dev/null; then
  warn "primary wav2lip_gan mirror failed, trying fallback"
  fetch "$HF/numz/wav2lip_studio/resolve/main/Wav2lip/wav2lip_gan.pth" \
        "$W2L/checkpoints/wav2lip_gan.pth" 435801865
fi

# s3fd face detector (89843225 B).
fetch "https://www.adrianbulat.com/downloads/python-fan/s3fd-619a316812.pth" \
      "$W2L/face_detection/detection/sfd/s3fd.pth" 89843225

# ── 2. MMS-TTS (Thai + English) ─────────────────────────────────────────────
for lang in tha eng; do
  for f in config.json model.safetensors special_tokens_map.json tokenizer_config.json vocab.json; do
    fetch "$HF/facebook/mms-tts-$lang/resolve/main/$f" "$PP_TMP/mms-tts-$lang/$f"
  done
  ok "mms-tts-$lang ready"
done

ok "models ready (Wav2Lip + MMS-TTS, MuseTalk skipped)"
