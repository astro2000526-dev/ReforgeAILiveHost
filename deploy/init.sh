#!/usr/bin/env bash
#
#  ReforgeAILiveHost — one-command deploy.
#
#     git clone <repo> && cd ReforgeAILiveHost/deploy && ./init.sh
#
#  Brings up the FULL stack on a single GPU host: Postgres + PostgREST, the
#  FastAPI pipeline (TTS + voice clone), the Wav2Lip lip-sync service, local
#  Qwen (ollama), the Next.js web app, and an nginx reverse proxy — wired
#  together and seeded, reachable at http://console.<IP>.nip.io.
#
#  Safe to re-run: secrets persist in .env, models/DB are skipped if present.
#  First run downloads ~700MB of weights + a ~2GB Qwen model and builds 3
#  images, so it takes a while. Subsequent runs are fast.
#
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
DEPLOY="$(pwd)"
source "$DEPLOY/scripts/lib.sh"

DC=(docker compose -f "$DEPLOY/docker-compose.yml")

# ── 0. Preflight ────────────────────────────────────────────────────────────
log "preflight checks"
command -v docker  >/dev/null || die "docker not found — install Docker first."
docker compose version >/dev/null 2>&1 || die "'docker compose' (v2) not available."
for c in openssl curl git envsubst; do command -v "$c" >/dev/null || die "missing '$c'"; done
if command -v nvidia-smi >/dev/null && nvidia-smi -L >/dev/null 2>&1; then
  ok "GPU: $(nvidia-smi -L | head -1)"
else
  warn "no nvidia-smi / GPU detected — pipeline+lipsync+qwen need an NVIDIA GPU + nvidia-container-toolkit."
fi

# ── 1. .env + secrets ────────────────────────────────────────────────────────
[ -f "$DEPLOY/.env" ] || { cp "$DEPLOY/.env.example" "$DEPLOY/.env"; log "created .env"; }
set -a && . "$DEPLOY/.env" && set +a

[ -n "${HOST_IP:-}" ] || { HOST_IP="$(detect_ip)"; [ -n "$HOST_IP" ] || die "could not detect HOST_IP — set it in .env"; set_env "$DEPLOY/.env" HOST_IP "$HOST_IP"; }
[ -n "${DATA_DIR:-}" ] || { DATA_DIR=/data/reforge; set_env "$DEPLOY/.env" DATA_DIR "$DATA_DIR"; }
[ -n "${HF_MIRROR:-}" ] || { HF_MIRROR=https://hf-mirror.com; set_env "$DEPLOY/.env" HF_MIRROR "$HF_MIRROR"; }
[ -n "${SUPERPASS:-}" ]      || { SUPERPASS=$(rand_hex 16);     set_env "$DEPLOY/.env" SUPERPASS "$SUPERPASS"; }
[ -n "${AUTHPASS:-}" ]       || { AUTHPASS=$(rand_hex 16);      set_env "$DEPLOY/.env" AUTHPASS "$AUTHPASS"; }
[ -n "${PIPELINE_TOKEN:-}" ] || { PIPELINE_TOKEN=$(rand_token 48); set_env "$DEPLOY/.env" PIPELINE_TOKEN "$PIPELINE_TOKEN"; }
[ -n "${JWT_SECRET:-}" ]     || { JWT_SECRET=$(rand_token 48);  set_env "$DEPLOY/.env" JWT_SECRET "$JWT_SECRET"; }
[ -n "${ANON_KEY:-}" ]       || { ANON_KEY=$(sign_jwt anon "$JWT_SECRET");         set_env "$DEPLOY/.env" ANON_KEY "$ANON_KEY"; }
[ -n "${SERVICE_KEY:-}" ]    || { SERVICE_KEY=$(sign_jwt service_role "$JWT_SECRET"); set_env "$DEPLOY/.env" SERVICE_KEY "$SERVICE_KEY"; }
ok "config ready — HOST_IP=$HOST_IP DATA_DIR=$DATA_DIR"

# ── 2. Data dirs + rendered config files ─────────────────────────────────────
mkdir -p "$DATA_DIR"/{pgdata,ollama,nginx,status} \
         "$DATA_DIR"/pipeline/{tmp,output,models} "$DATA_DIR"/pipeline/output/uploads \
         "$DATA_DIR"/lipsync/{models,runtime}
export HOST_IP
envsubst '${HOST_IP}' < "$DEPLOY/nginx/default.conf.template"   > "$DATA_DIR/nginx/default.conf"
envsubst '${HOST_IP}' < "$DEPLOY/status/index.html.template"    > "$DATA_DIR/status/index.html"
ok "wrote nginx + status config"

# ── 3. Download models (background) + build images (foreground) ──────────────
log "downloading models in background (Wav2Lip + MMS-TTS, ~700MB)…"
DATA_DIR="$DATA_DIR" HF_MIRROR="$HF_MIRROR" bash "$DEPLOY/scripts/download-models.sh" \
  > "$DATA_DIR/models-download.log" 2>&1 &
DL_PID=$!

log "building images (pipeline + lipsync + web) — this is the long part…"
"${DC[@]}" build pipeline lipsync web

log "waiting for model downloads to finish…"
if wait "$DL_PID"; then ok "models downloaded"; else die "model download failed — see $DATA_DIR/models-download.log"; fi

# MuseTalk (opt-in): needs a separate ~6GB weight set. Fetched via the built
# lipsync image's own downloader (uses HF snapshot_download + the mirror).
if [ "${LIPSYNC_MODEL:-wav2lip}" = "musetalk" ]; then
  log "LIPSYNC_MODEL=musetalk → downloading MuseTalk weights (~6GB, first run only)…"
  "${DC[@]}" run --rm --no-deps -e SKIP_WAV2LIP=1 -e HF_ENDPOINT="$HF_MIRROR" \
    lipsync bash /app/scripts/download_models.sh \
    && ok "MuseTalk weights ready" \
    || warn "MuseTalk weight download had issues — check, then re-run; falls back to wav2lip otherwise"
fi

# ── 4. Database: up (wait healthy) → bootstrap → migrate → seed ──────────────
# Start ONLY db here and block on its healthcheck via compose's own --wait
# (stable across compose v2; no fragile `ps --format` template parsing).
# PostgREST (rest) is intentionally NOT started yet — it caches the schema at
# boot, so it must come up AFTER migrations or it 404s on system_config/meta.
log "starting database (waiting for healthy)"
"${DC[@]}" up -d --wait db
bash "$DEPLOY/scripts/seed-db.sh"

# ── 5. Bring up everything (rest boots here, with the migrated schema) ───────
log "starting all services"
"${DC[@]}" up -d

# ── 6. Qwen model pull ────────────────────────────────────────────────────────
log "waiting for ollama, then pulling qwen2.5:3b (~2GB, first run only)"
for i in $(seq 1 30); do "${DC[@]}" exec -T qwen ollama list >/dev/null 2>&1 && break; sleep 2; done
if "${DC[@]}" exec -T qwen ollama list 2>/dev/null | grep -q 'qwen2.5:3b'; then
  ok "qwen2.5:3b already present"
else
  "${DC[@]}" exec -T qwen ollama pull qwen2.5:3b && ok "qwen2.5:3b pulled" || warn "qwen pull failed — run later: docker compose exec qwen ollama pull qwen2.5:3b"
fi

# ── 7. Health gate ────────────────────────────────────────────────────────────
wait_http "http://api.$HOST_IP.nip.io/health"          180 "pipeline"  || warn "pipeline /health not ready yet"
wait_http "http://api.$HOST_IP.nip.io/lipsync/health"  180 "lipsync"   || warn "lipsync /health not ready yet"
wait_http "http://console.$HOST_IP.nip.io"             180 "web"       || warn "web not ready yet"

# ── Done ──────────────────────────────────────────────────────────────────────
echo
ok "ReforgeAILiveHost is up 🎉"
cat <<EOF

  Console : http://console.$HOST_IP.nip.io
  API     : http://api.$HOST_IP.nip.io
  Status  : http://status.$HOST_IP.nip.io

  Manage  : docker compose -f $DEPLOY/docker-compose.yml ps
  Logs    : docker compose -f $DEPLOY/docker-compose.yml logs -f <service>
  Secrets : $DEPLOY/.env   (keep private — never commit)

EOF
