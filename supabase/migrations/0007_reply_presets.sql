-- 0007: reply_presets — AI comment-reply presets for the live console
--
-- A preset bundles everything the AI needs to answer viewer comments in a
-- consistent voice:
--   instruction — persona / tone / rules the LLM must follow
--   data        — product & shop knowledge pasted into the prompt as context
--   qa          — curated Q&A pairs: [{ "q": "...", "a": "..." }, ...]
--                 fed to the LLM as authoritative answers for matching questions
--
-- Writes go through service_role (the /api/reply-presets routes); authenticated
-- users can browse active presets (same model as avatars).

create table if not exists public.reply_presets (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  instruction text not null default '',
  data        text not null default '',
  qa          jsonb not null default '[]'::jsonb,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists reply_presets_active_idx
  on public.reply_presets (is_active, created_at desc);

alter table public.reply_presets enable row level security;

create policy "reply_presets_select_active" on public.reply_presets
  for select to authenticated using (is_active = true);

-- grants (0004 default privileges cover service_role for new tables, but be
-- explicit so this file is self-contained when applied standalone)
grant all on public.reply_presets to service_role;
grant select on public.reply_presets to authenticated;
