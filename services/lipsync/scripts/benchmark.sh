#!/usr/bin/env bash
# Benchmark lip-sync at 5s / 30s / 10min audio durations.
# Synthesizes silent audio with ffmpeg so it runs without a TTS dep.
# Usage: BASE_URL=http://localhost:8000 ./scripts/benchmark.sh path/to/avatar.png
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8000}"
AVATAR="${1:-./samples/avatar.png}"
OUT_DIR="${OUT_DIR:-./bench_out}"
mkdir -p "$OUT_DIR"

if [ ! -f "$AVATAR" ]; then
  echo "avatar not found: $AVATAR"
  exit 1
fi

run_one() {
  local secs="$1"
  local label="$2"
  local wav="$OUT_DIR/silence_${label}.wav"
  ffmpeg -hide_banner -loglevel error -y \
    -f lavfi -i "anullsrc=channel_layout=mono:sample_rate=16000" \
    -t "$secs" "$wav"
  echo "[bench] duration=${secs}s"
  AV_B64=$(base64 < "$AVATAR" | tr -d '\n')
  AU_B64=$(base64 < "$wav" | tr -d '\n')
  BASE_URL="$BASE_URL" AV_B64="$AV_B64" AU_B64="$AU_B64" API_TOKEN="${API_TOKEN:-}" python - <<'PY' | tee "$OUT_DIR/result_${label}.json"
import json, os, time, urllib.request
url = os.environ["BASE_URL"] + "/lip-sync"
body = json.dumps({"avatar_base64": os.environ["AV_B64"], "audio_base64": os.environ["AU_B64"]}).encode()
req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
if os.environ.get("API_TOKEN"):
    req.add_header("Authorization", f"Bearer {os.environ['API_TOKEN']}")
t0 = time.perf_counter()
out = urllib.request.urlopen(req, timeout=3600).read().decode()
wall_ms = round((time.perf_counter() - t0) * 1000, 1)
parsed = json.loads(out)
parsed["wall_ms"] = wall_ms
print(json.dumps(parsed, indent=2))
PY
}

run_one 5    "5s"
run_one 30   "30s"
run_one 600  "10min"

echo "[bench] done. results in $OUT_DIR/"
