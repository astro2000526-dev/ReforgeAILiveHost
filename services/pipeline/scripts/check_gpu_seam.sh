#!/usr/bin/env bash
# GPU-seam guard — heavy inference imports are allowed ONLY under app/gpu/.
# Run from services/pipeline/. Wire into CI / pre-build to keep the boundary.
set -euo pipefail
cd "$(dirname "$0")/.."
PATTERN='^[[:space:]]*(import (torch|gfpgan|rembg|transformers|openvoice_cli|wavmark|cv2)([[:space:].]|$)|from (torch|gfpgan|rembg|transformers|openvoice_cli|wavmark|cv2)[[:space:].])'
BAD=$(grep -rnE "$PATTERN" app --include='*.py' | grep -v '^app/gpu/' || true)
if [ -n "$BAD" ]; then
  echo "GPU-layer imports leaked outside app/gpu/:" >&2
  echo "$BAD" >&2
  exit 1
fi
echo "GPU seam clean — torch/rembg/gfpgan/transformers/openvoice only under app/gpu/"
