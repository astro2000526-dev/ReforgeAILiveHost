-- 0003_runtime_drift.sql — columns + table added live during the MVP build
-- that 0001 didn't have yet. Idempotent; safe to re-run.
--
-- Captured from the running UCloud DB (2026-05-31) so a fresh one-click deploy
-- reproduces the exact schema the web app + pipeline expect.

-- avatars.description — free-text presenter notes (edited on /avatars/[id]).
alter table public.avatars
  add column if not exists description text;

-- generations.meta — per-render settings snapshot the version list reads
-- (duration_seconds, mode, voice, voice_clone, playback_speed, video_quality,
--  sound_mode, script_text, ...).
alter table public.generations
  add column if not exists meta jsonb;

-- system_config — single-row app config (key='system_config_v1'). Read/written
-- by the web /api/config gateway. No RLS: it's server-only config, and the web
-- talks to it via the anon/service key through the PostgREST gateway.
create table if not exists public.system_config (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz default now()
);

grant all on public.system_config to anon, authenticated, service_role;
