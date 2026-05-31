#!/usr/bin/env bash
# Bootstrap the lean-Supabase DB: roles/auth → app migrations → seed config.
# Assumes `db` + `rest` are already up (init.sh waits for db healthy first).
# Idempotent: re-running is safe (errors like "policy exists" are non-fatal).
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY="$(cd "$HERE/.." && pwd)"
REPO="$(cd "$DEPLOY/.." && pwd)"
source "$HERE/lib.sh"

[ -f "$DEPLOY/.env" ] && set -a && . "$DEPLOY/.env" && set +a
: "${AUTHPASS:?}"
COMPOSE=(docker compose -f "$DEPLOY/docker-compose.yml")

psql_stop() { "${COMPOSE[@]}" exec -T db psql -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }
psql_soft() { "${COMPOSE[@]}" exec -T db psql -U postgres -d postgres "$@"; }

# 1. Roles + auth schema (authenticator password injected).
log "bootstrap roles + auth"
sed "s/__AUTHPASS__/${AUTHPASS}/g" "$DEPLOY/supabase/bootstrap.sql" | psql_stop -f -

# 2. App migrations (0001 schema, 0002 demo seed, 0003 drift). Soft-fail so a
#    re-run past "create policy" (no IF NOT EXISTS in PG15) doesn't abort.
for m in "$REPO"/supabase/migrations/*.sql; do
  log "migrate $(basename "$m")"
  psql_soft -f - < "$m" || warn "$(basename "$m") had non-fatal errors (likely already applied)"
done

# Hard-assert the migrations actually created the config table before we seed,
# so a silent migration failure surfaces here with a clear message.
psql_stop -c "select 1 from public.system_config limit 0;" >/dev/null \
  || die "public.system_config missing — migrations failed (see warnings above)"

# 3. Seed the single app-config row for this deploy (service-DNS wiring).
log "seed system_config"
psql_stop <<'SQL'
insert into public.system_config(key, value) values (
  'system_config_v1',
  '{
     "tts_provider": "edge-tts",
     "tts_voice": "th-TH-PremwadeeNeural",
     "lipsync_enabled": true,
     "lipsync_model": "wav2lip",
     "lipsync_url": "http://lipsync:8000",
     "render_mode": "ai",
     "voice_clone": true,
     "playback_speed": 1.0,
     "video_quality": "1080p",
     "sound_mode": "normal",
     "lip_blend": 30,
     "default_rtmp_url": "rtmps://live-api-s.facebook.com:443/rtmp/",
     "default_duration": 15
   }'::jsonb
) on conflict (key) do nothing;
SQL

# 4. Tell PostgREST to reload its schema cache (new columns/table).
psql_soft -c "notify pgrst, 'reload schema';" >/dev/null 2>&1 || true

ok "database ready"
