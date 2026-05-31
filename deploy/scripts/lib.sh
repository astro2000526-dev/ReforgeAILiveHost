#!/usr/bin/env bash
# Shared helpers for the deploy scripts. Source, don't execute.

log()  { printf '\033[36m[reforge]\033[0m %s\n' "$*"; }
ok()   { printf '\033[32m[ok]\033[0m %s\n' "$*"; }
warn() { printf '\033[33m[warn]\033[0m %s\n' "$*"; }
die()  { printf '\033[31m[err]\033[0m %s\n' "$*" >&2; exit 1; }

# base64url, no padding (JWT-style).
b64url() { openssl base64 -e -A | tr '+/' '-_' | tr -d '='; }

# sign_jwt <role> <secret> → HS256 JWT with claims {role, iss, ref}.
# Matches the PostgREST gateway's expected anon/service_role tokens.
sign_jwt() {
  local role="$1" secret="$2" h p sig
  h=$(printf '%s' '{"alg":"HS256","typ":"JWT"}' | b64url)
  p=$(printf '{"role":"%s","iss":"supabase-lite","ref":"reforge"}' "$role" | b64url)
  sig=$(printf '%s.%s' "$h" "$p" | openssl dgst -sha256 -hmac "$secret" -binary | b64url)
  printf '%s.%s.%s' "$h" "$p" "$sig"
}

rand_hex() { openssl rand -hex "${1:-32}"; }
# URL/shell-safe token of N chars (no +/=).
rand_token() { openssl rand -base64 "$(( ${1:-48} * 2 ))" | tr -dc 'A-Za-z0-9' | cut -c1-"${1:-48}"; }

# upsert KEY=VALUE into an env file (replace existing line or append).
set_env() {
  local file="$1" key="$2" val="$3"
  if grep -qE "^${key}=" "$file" 2>/dev/null; then
    # use a temp file; value may contain / and & so avoid sed substitution
    grep -vE "^${key}=" "$file" > "$file.tmp" && mv "$file.tmp" "$file"
  fi
  printf '%s=%s\n' "$key" "$val" >> "$file"
}

# wait_http <url> <timeout_s> [name] — poll until 2xx/3xx or timeout.
wait_http() {
  local url="$1" t="${2:-180}" name="${3:-$url}" i=0
  printf '\033[36m[reforge]\033[0m waiting for %s ' "$name"
  until curl -fsS -o /dev/null --max-time 5 "$url" 2>/dev/null; do
    i=$((i+3)); [ "$i" -ge "$t" ] && { printf 'TIMEOUT\n'; return 1; }
    printf '.'; sleep 3
  done
  printf ' up\n'; return 0
}

# Detect the host's public IPv4 (for nip.io URLs).
detect_ip() {
  local ip
  ip=$(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null) \
    || ip=$(curl -fsS --max-time 5 https://ifconfig.me 2>/dev/null) \
    || ip=$(ip -4 route get 1.1.1.1 2>/dev/null | grep -oE 'src [0-9.]+' | awk '{print $2}')
  printf '%s' "${ip:-}"
}
