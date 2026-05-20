-- ReforgeAILiveHost — Initial schema (MVP)
-- Apply: Supabase Dashboard → SQL Editor → New query → paste this file → Run
-- All statements are idempotent (`if not exists` / `or replace`) so re-running
-- is safe during development.
--
-- Day 0 decisions baked in:
--   #4 stream_key is stored plaintext for MVP, gated by RLS; rotate to pgcrypto
--      before public launch.
--   Language enum includes zh-CN so a pivot to Chinese market is purely a data
--      change, not a schema migration.

-- =====================================================
-- 1. profiles — extends Supabase auth.users
-- =====================================================
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  company_name text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- Auto-create a profile row whenever a new auth user is added.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- =====================================================
-- 2. avatars — platform-curated digital human library
-- =====================================================
create table if not exists public.avatars (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  preview_image_url   text,
  template_video_url  text not null,
  region              text check (region in ('TH','ID','VN','MY','CN','EN')),
  gender              text check (gender in ('female','male','other')),
  is_active           boolean not null default true,
  display_order       int     not null default 0,
  created_at          timestamptz not null default now()
);

create index if not exists avatars_active_order_idx
  on public.avatars (is_active, display_order, created_at desc);

alter table public.avatars enable row level security;

-- Any authenticated user can browse active avatars; writes go through
-- service_role (admin upload script / Supabase dashboard).
create policy "avatars_select_active" on public.avatars
  for select to authenticated using (is_active = true);


-- =====================================================
-- 3. projects — a user's live-stream project
-- =====================================================
create table if not exists public.projects (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  name            text not null,
  avatar_id       uuid references public.avatars(id) on delete restrict,
  product_url     text,
  product_info    jsonb not null default '{}'::jsonb,
  -- script_segments: [{ "type": "intro", "text": "...", "duration_sec": 35 }, ...]
  script_segments jsonb not null default '[]'::jsonb,
  language        text  check (language in ('th-TH','id-ID','vi-VN','en-US','zh-CN')),
  -- voice: full provider voice ID, e.g. "th-TH-PremwadeeNeural" for Azure,
  -- "BV421_streaming" for Volcengine, "BV001_streaming" for Volcengine zh.
  voice           text,
  speech_rate     text not null default '+0%',
  status          text not null default 'draft'
                  check (status in ('draft','generating','ready','failed')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists projects_user_created_idx
  on public.projects (user_id, created_at desc);
create index if not exists projects_status_idx
  on public.projects (status) where status in ('generating','ready');

alter table public.projects enable row level security;

create policy "projects_select_own" on public.projects
  for select using (auth.uid() = user_id);
create policy "projects_insert_own" on public.projects
  for insert with check (auth.uid() = user_id);
create policy "projects_update_own" on public.projects
  for update using (auth.uid() = user_id);
create policy "projects_delete_own" on public.projects
  for delete using (auth.uid() = user_id);


-- =====================================================
-- 4. generations — one row per video-gen attempt
-- =====================================================
create table if not exists public.generations (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references public.projects(id) on delete cascade,
  status           text not null default 'queued'
                   check (status in ('queued','tts','lipsync','concat','done','failed')),
  progress         int  not null default 0 check (progress between 0 and 100),
  output_video_url text,
  error_message    text,
  started_at       timestamptz,
  finished_at      timestamptz,
  created_at       timestamptz not null default now()
);

create index if not exists generations_project_created_idx
  on public.generations (project_id, created_at desc);

alter table public.generations enable row level security;

-- Users can read generations for projects they own. Inserts/updates happen
-- via service_role from the FastAPI worker, which bypasses RLS — no policy
-- needed for those.
create policy "generations_select_via_project" on public.generations
  for select using (
    exists (
      select 1 from public.projects p
      where p.id = generations.project_id and p.user_id = auth.uid()
    )
  );


-- =====================================================
-- 5. streams — RTMP push tasks
-- =====================================================
create table if not exists public.streams (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects(id) on delete cascade,
  rtmp_url        text not null,
  -- Day 0 #4: plaintext for MVP, RLS-gated. Rotate to pgcrypto before launch.
  stream_key      text not null,
  status          text not null default 'idle'
                  check (status in ('idle','live','stopped','error')),
  started_at      timestamptz,
  stopped_at      timestamptz,
  duration_seconds int not null default 0,
  error_message   text,
  created_at      timestamptz not null default now()
);

create index if not exists streams_project_status_idx
  on public.streams (project_id, status);

alter table public.streams enable row level security;

create policy "streams_select_via_project" on public.streams
  for select using (
    exists (
      select 1 from public.projects p
      where p.id = streams.project_id and p.user_id = auth.uid()
    )
  );
create policy "streams_insert_via_project" on public.streams
  for insert with check (
    exists (
      select 1 from public.projects p
      where p.id = streams.project_id and p.user_id = auth.uid()
    )
  );
create policy "streams_update_via_project" on public.streams
  for update using (
    exists (
      select 1 from public.projects p
      where p.id = streams.project_id and p.user_id = auth.uid()
    )
  );
create policy "streams_delete_via_project" on public.streams
  for delete using (
    exists (
      select 1 from public.projects p
      where p.id = streams.project_id and p.user_id = auth.uid()
    )
  );


-- =====================================================
-- 6. Shared updated_at trigger
-- =====================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists set_projects_updated_at on public.projects;
create trigger set_projects_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();


-- =====================================================
-- 7. Seed data (uncomment and fill real URLs after uploading template videos)
-- =====================================================
-- insert into public.avatars (name, preview_image_url, template_video_url, region, gender, display_order)
-- values
--   ('Nida — 泰国女主播',    'https://<bucket>/avatars/nida/preview.jpg',  'https://<bucket>/avatars/nida/template.mp4',  'TH','female',10),
--   ('Pong — 泰国男主播',    'https://<bucket>/avatars/pong/preview.jpg',  'https://<bucket>/avatars/pong/template.mp4',  'TH','male',  20),
--   ('Sari — 印尼女主播',    'https://<bucket>/avatars/sari/preview.jpg',  'https://<bucket>/avatars/sari/template.mp4',  'ID','female',30),
--   ('Linh — 越南女主播',    'https://<bucket>/avatars/linh/preview.jpg',  'https://<bucket>/avatars/linh/template.mp4',  'VN','female',40),
--   ('小美 — 中文女主播',    'https://<bucket>/avatars/xiaomei/preview.jpg','https://<bucket>/avatars/xiaomei/template.mp4','CN','female',50);
