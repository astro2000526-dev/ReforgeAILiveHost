#!/usr/bin/env bash
#
#  init-local.sh — Mac / no-GPU local bring-up.
#
#  Same stack as init.sh MINUS the GPU services (pipeline, lipsync, qwen):
#  brings up db + rest (PostgREST) + web (Next.js) + nginx on Docker Desktop.
#  Video generation needs an NVIDIA GPU, so /api generate calls 502 here — but
#  the full UI, auth, DB, and PostgREST all work for local web development.
#
#  Usage:  cd deploy && ./init-local.sh
#  Stop :  docker compose -f deploy/docker-compose.yml down
#
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
DEPLOY="$(pwd)"
source "$DEPLOY/scripts/lib.sh"
DC=(docker compose -f "$DEPLOY/docker-compose.yml")

# ── 0. Preflight ─────────────────────────────────────────────────────────────
log "preflight (local / no-GPU)"
command -v docker >/dev/null || die "docker not found — install Docker Desktop."
docker info >/dev/null 2>&1   || die "docker daemon not running — start Docker Desktop."
for c in openssl curl envsubst; do command -v "$c" >/dev/null || die "missing '$c' (brew install gettext for envsubst)"; done

# ── 1. .env + secrets + LOCAL overrides ──────────────────────────────────────
[ -f "$DEPLOY/.env" ] || { cp "$DEPLOY/.env.example" "$DEPLOY/.env"; log "created .env"; }
set -a && . "$DEPLOY/.env" && set +a

# Local-only overrides: a writable data dir + localhost vhosts via nip.io.
LOCAL_DATA="${LOCAL_DATA_DIR:-$HOME/reforge-data}"
[ "${DATA_DIR:-}" = "$LOCAL_DATA" ] || { DATA_DIR="$LOCAL_DATA"; set_env "$DEPLOY/.env" DATA_DIR "$DATA_DIR"; }
[ "${HOST_IP:-}" = "127.0.0.1" ]    || { HOST_IP=127.0.0.1;      set_env "$DEPLOY/.env" HOST_IP "$HOST_IP"; }
# Host :5432 is often taken by another local Postgres; expose reforge db on 5433
# (internal network port stays 5432, so rest/web/seed are unaffected).
[ -n "${DB_HOST_PORT:-}" ] || { DB_HOST_PORT="${LOCAL_DB_PORT:-5433}"; set_env "$DEPLOY/.env" DB_HOST_PORT "$DB_HOST_PORT"; }
# Host :80 is often taken (a native nginx, another proxy); publish on 8080.
[ -n "${HTTP_PORT:-}" ] || { HTTP_PORT="${LOCAL_HTTP_PORT:-8080}"; set_env "$DEPLOY/.env" HTTP_PORT "$HTTP_PORT"; }

# Generate any missing secrets (identical to init.sh).
[ -n "${SUPERPASS:-}" ]      || { SUPERPASS=$(rand_hex 16);        set_env "$DEPLOY/.env" SUPERPASS "$SUPERPASS"; }
[ -n "${AUTHPASS:-}" ]       || { AUTHPASS=$(rand_hex 16);         set_env "$DEPLOY/.env" AUTHPASS "$AUTHPASS"; }
[ -n "${PIPELINE_TOKEN:-}" ] || { PIPELINE_TOKEN=$(rand_token 48); set_env "$DEPLOY/.env" PIPELINE_TOKEN "$PIPELINE_TOKEN"; }
[ -n "${JWT_SECRET:-}" ]     || { JWT_SECRET=$(rand_token 48);     set_env "$DEPLOY/.env" JWT_SECRET "$JWT_SECRET"; }
[ -n "${ANON_KEY:-}" ]       || { ANON_KEY=$(sign_jwt anon "$JWT_SECRET");            set_env "$DEPLOY/.env" ANON_KEY "$ANON_KEY"; }
[ -n "${SERVICE_KEY:-}" ]    || { SERVICE_KEY=$(sign_jwt service_role "$JWT_SECRET"); set_env "$DEPLOY/.env" SERVICE_KEY "$SERVICE_KEY"; }
set -a && . "$DEPLOY/.env" && set +a
ok "config ready — HOST_IP=$HOST_IP DATA_DIR=$DATA_DIR (GPU services skipped)"

# ── 2. Data dirs + rendered config (only what non-GPU services mount) ────────
mkdir -p "$DATA_DIR"/{pgdata,nginx,status} "$DATA_DIR"/pipeline/output
export HOST_IP
envsubst '${HOST_IP}' < "$DEPLOY/nginx/default.conf.template" > "$DATA_DIR/nginx/default.conf"
envsubst '${HOST_IP}' < "$DEPLOY/status/index.html.template"  > "$DATA_DIR/status/index.html"
ok "wrote nginx + status config"

# ── 3. Build web image (skips pipeline + lipsync builds) ─────────────────────
log "building web image — the long part…"
"${DC[@]}" build web

# ── 4. Database: up (wait healthy) → seed/migrate ────────────────────────────
log "starting database (waiting for healthy)"
"${DC[@]}" up -d --wait db
bash "$DEPLOY/scripts/seed-db.sh"

# ── 5. rest + web + nginx, --no-deps so GPU services never start ─────────────
log "starting rest + web + nginx (GPU services skipped)"
"${DC[@]}" up -d --no-deps rest web nginx

# ── 6. Health gate (web only) ────────────────────────────────────────────────
PORT_SUFFIX=""; [ "$HTTP_PORT" = "80" ] || PORT_SUFFIX=":$HTTP_PORT"
wait_http "http://console.$HOST_IP.nip.io$PORT_SUFFIX" 180 "web" || warn "web not ready yet"

echo
ok "Local stack up (no GPU) 🎉"
cat <<EOF

  Console : http://console.$HOST_IP.nip.io$PORT_SUFFIX   (resolves to localhost)
  DB      : postgres://postgres@127.0.0.1:$DB_HOST_PORT
  Note    : video generation (pipeline + lipsync + qwen) is OFF — needs a GPU.
            Those /api generate calls will 502 until deployed on a GPU host.

  Manage  : docker compose -f $DEPLOY/docker-compose.yml ps
  Logs    : docker compose -f $DEPLOY/docker-compose.yml logs -f web
  Stop    : docker compose -f $DEPLOY/docker-compose.yml down

EOF
