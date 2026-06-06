#!/usr/bin/env bash
#
#  enable-https.sh — turn on real TLS for a Reforge deploy. Opt-in, idempotent.
#
#  Obtains a Let's Encrypt certificate (certbot --webroot) for ${DOMAIN} and its
#  api./console./status. subdomains, swaps nginx onto the 443 TLS config, and
#  reloads. The nip.io HTTP flow keeps working (port 80 now 301-redirects to
#  https://${DOMAIN}).
#
#  PREREQUISITES (do these first — see deploy/HTTPS_OAUTH.md):
#    1. DNS A records for ${DOMAIN}, api.${DOMAIN}, console.${DOMAIN},
#       status.${DOMAIN} → this server's public IP.
#    2. Uncomment the letsencrypt + webroot volume mounts on the `nginx` service
#       in docker-compose.yml (and the DOMAIN env passthrough), then:
#         docker compose -f deploy/docker-compose.yml up -d nginx
#
#  Usage:
#     ./enable-https.sh --domain example.com --email you@example.com
#     DOMAIN=example.com EMAIL=you@example.com ./enable-https.sh
#     ./enable-https.sh --domain example.com --email you@example.com --staging
#
#  Re-runs are safe: certbot reuses a valid cert unless near expiry; nginx is
#  just re-rendered + reloaded.
#
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
DEPLOY="$(pwd)"
# shellcheck source=deploy/scripts/lib.sh
source "$DEPLOY/scripts/lib.sh"

DC=(docker compose -f "$DEPLOY/docker-compose.yml")

# ── Args / env ────────────────────────────────────────────────────────────────
DOMAIN="${DOMAIN:-}"
EMAIL="${EMAIL:-}"
STAGING=0
while [ $# -gt 0 ]; do
  case "$1" in
    --domain) DOMAIN="$2"; shift 2 ;;
    --email)  EMAIL="$2";  shift 2 ;;
    --staging) STAGING=1;  shift ;;
    -h|--help) grep -E '^#( |$)' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "unknown arg: $1 (try --help)" ;;
  esac
done

[ -n "$DOMAIN" ] || die "missing DOMAIN — pass --domain example.com or set DOMAIN="
[ -n "$EMAIL" ]  || die "missing EMAIL — pass --email you@example.com or set EMAIL= (for cert expiry notices)"

# ── Load deploy env (DATA_DIR etc.) ───────────────────────────────────────────
[ -f "$DEPLOY/.env" ] || die ".env not found — run ./init.sh first"
set -a && . "$DEPLOY/.env" && set +a
DATA_DIR="${DATA_DIR:-/data/reforge}"
NGINX_CONF="$DATA_DIR/nginx/default.conf"
WEBROOT="$DATA_DIR/certbot"
LETSENCRYPT="$DATA_DIR/letsencrypt"

log "domain=$DOMAIN  email=$EMAIL  staging=$STAGING  data_dir=$DATA_DIR"

# ── Persist DOMAIN to .env (used by compose env passthrough) ──────────────────
set_env "$DEPLOY/.env" DOMAIN "$DOMAIN"

# ── 1. Webroot + ACME challenge location on the CURRENT (HTTP) config ──────────
# certbot --webroot needs nginx to already serve /.well-known/acme-challenge/.
# Inject that location into the live nip.io config (idempotent) so the very first
# issuance works before any TLS cert exists.
mkdir -p "$WEBROOT/.well-known/acme-challenge" "$LETSENCRYPT"
[ -f "$NGINX_CONF" ] || die "$NGINX_CONF not found — run ./init.sh first"

if ! grep -q 'acme-challenge' "$NGINX_CONF"; then
  log "adding ACME challenge location to the current HTTP config"
  # Insert right after the default_server line so it applies to the catch-all vhost.
  tmp="$(mktemp)"
  awk '
    /listen 80 default_server;/ && !done {
      print
      print "    location /.well-known/acme-challenge/ { root /var/www/certbot; default_type \"text/plain\"; }"
      done=1
      next
    }
    { print }
  ' "$NGINX_CONF" > "$tmp" && mv "$tmp" "$NGINX_CONF"
  "${DC[@]}" exec -T nginx nginx -s reload 2>/dev/null \
    || warn "could not reload nginx yet — make sure the nginx container is up with the webroot mount (see HTTPS_OAUTH.md)"
fi

# ── 2. Obtain the certificate (certbot in a one-shot container) ───────────────
log "requesting certificate via certbot --webroot"
STAGING_FLAG=""
[ "$STAGING" -eq 1 ] && STAGING_FLAG="--staging"

# Use the official certbot image, mounting the SAME host paths the nginx service
# mounts (letsencrypt = certs, certbot = webroot). --network reforge is not
# required for http-01 (validation comes from the public internet → :80).
docker run --rm \
  -v "$LETSENCRYPT:/etc/letsencrypt" \
  -v "$WEBROOT:/var/www/certbot" \
  certbot/certbot certonly --webroot -w /var/www/certbot \
    --non-interactive --agree-tos --email "$EMAIL" $STAGING_FLAG \
    --keep-until-expiring \
    -d "$DOMAIN" -d "api.$DOMAIN" -d "console.$DOMAIN" -d "status.$DOMAIN" \
  || die "certbot failed — check DNS A records resolve to this server and :80 is reachable from the internet"

ok "certificate obtained for $DOMAIN (+ api./console./status.)"

# ── 3. Render the TLS nginx config + reload ───────────────────────────────────
log "rendering TLS nginx config"
export DOMAIN
envsubst '${DOMAIN}' < "$DEPLOY/nginx/default-tls.conf.template" > "$NGINX_CONF"
ok "wrote $NGINX_CONF"

log "reloading nginx"
if "${DC[@]}" exec -T nginx nginx -t 2>/dev/null && "${DC[@]}" exec -T nginx nginx -s reload 2>/dev/null; then
  ok "nginx reloaded with TLS"
else
  warn "nginx reload failed — confirm the letsencrypt + webroot mounts are uncommented, then: ${DC[*]} up -d nginx"
fi

# ── 4. Next steps ─────────────────────────────────────────────────────────────
RENEW_CMD="docker run --rm -v $LETSENCRYPT:/etc/letsencrypt -v $WEBROOT:/var/www/certbot certbot/certbot renew --webroot -w /var/www/certbot --quiet && ${DC[*]} exec -T nginx nginx -s reload"
echo
ok "HTTPS is on 🎉"
cat <<EOF

  Console : https://console.$DOMAIN
  API     : https://api.$DOMAIN
  Status  : https://status.$DOMAIN
  (http://*.$DOMAIN now redirects to https; nip.io URLs redirect too)

  AUTO-RENEW — add this cron line (runs twice daily; renews only when needed):

    0 3,15 * * *  $RENEW_CMD

    Edit with:  crontab -e

  REMINDER: rebuild/redeploy the web app with the public HTTPS URLs so the
  browser bundle points at the cloud Supabase + correct origins. For Google
  login also set NEXT_PUBLIC_AUTH_ENABLED=1 — see deploy/HTTPS_OAUTH.md.

EOF
