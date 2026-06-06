-- 0005: per-presenter background & camera settings
--
-- bg_remove        — matte the person out of the presenter video at render time
-- background_url   — image/video composited behind the matted person
-- background_type  — 'image' | 'video' (how the pipeline loops it)
-- camera_zoom      — center crop-zoom 1.0..3.0 applied before compositing

alter table public.avatars
  add column if not exists bg_remove boolean not null default false,
  add column if not exists background_url text,
  add column if not exists background_type text check (background_type in ('image', 'video')),
  add column if not exists camera_zoom double precision not null default 1.0;
