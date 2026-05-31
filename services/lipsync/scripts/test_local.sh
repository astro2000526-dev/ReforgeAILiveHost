#!/usr/bin/env bash
# Smoke-test the running lip-sync service.
# Usage: BASE_URL=http://localhost:8000 ./scripts/test_local.sh path/to/avatar.png path/to/audio.wav
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8000}"
TOKEN_HDR=()
if [ -n "${API_TOKEN:-}" ]; then
  TOKEN_HDR=(-H "Authorization: Bearer ${API_TOKEN}")
fi

AVATAR="${1:-./samples/avatar.png}"
AUDIO="${2:-./samples/audio.wav}"

if [ ! -f "$AVATAR" ] || [ ! -f "$AUDIO" ]; then
  echo "Usage: $0 <avatar.png> <audio.wav>"
  exit 1
fi

echo "[1/3] /health"
curl -fsS "$BASE_URL/health" | python -m json.tool

echo "[2/3] /warmup"
curl -fsS -X POST "${TOKEN_HDR[@]}" "$BASE_URL/warmup" | python -m json.tool

echo "[3/3] /lip-sync"
AV_B64=$(base64 < "$AVATAR" | tr -d '\n')
AU_B64=$(base64 < "$AUDIO" | tr -d '\n')
python - <<PY
import json, urllib.request, os
url = os.environ["BASE_URL"] + "/lip-sync"
body = json.dumps({"avatar_base64": os.environ["AV_B64"], "audio_base64": os.environ["AU_B64"]}).encode()
req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
if os.environ.get("API_TOKEN"):
    req.add_header("Authorization", f"Bearer {os.environ['API_TOKEN']}")
print(urllib.request.urlopen(req, timeout=300).read().decode())
PY
