-- 0006: per-presenter frame layout
--
-- frame_position — where the presenter sits in the frame (9-grid anchor)
-- frame_scale    — presenter size relative to the frame (1.0 = full frame;
--                  position only has visible effect when scale < 1.0)

alter table public.avatars
  add column if not exists frame_position text not null default 'center'
    check (frame_position in ('top-left','top','top-right','left','center','right','bottom-left','bottom','bottom-right')),
  add column if not exists frame_scale double precision not null default 1.0;
