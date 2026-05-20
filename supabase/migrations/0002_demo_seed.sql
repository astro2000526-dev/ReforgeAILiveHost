-- 0002_demo_seed.sql — MVP demo data
-- Apply after 0001_initial_schema.sql. Safe to re-run.
--
-- Why this exists:
--   The base schema makes profiles.id a FK to auth.users(id). For a real
--   product we'd onboard via Supabase Auth and let the on_auth_user_created
--   trigger populate profiles. For the MVP demo we want to walk through the
--   whole wizard WITHOUT signing up, so we relax that FK and insert a fixed
--   demo profile that all demo projects belong to.

-- Loosen the FK so we can insert a profile not backed by auth.users.
alter table public.profiles
  drop constraint if exists profiles_id_fkey;

-- Demo user. Fixed UUID so the Next.js side can hardcode it in lib/demo-user.ts.
insert into public.profiles (id, email, company_name)
values ('00000000-0000-0000-0000-000000000001', 'demo@reforge.ai', 'Demo 商家')
on conflict (id) do nothing;

-- Demo avatars (3 Chinese-market personas). Template URLs are placeholders;
-- replace with real Supabase Storage URLs once you upload actual videos.
insert into public.avatars
  (id, name, preview_image_url, template_video_url, region, gender, display_order, is_active)
values
  ('11111111-1111-1111-1111-111111111101',
   '小美 — 元气女主播',
   'https://placehold.co/400x600/fde2e7/c43d6d?text=%E5%B0%8F%E7%BE%8E',
   'https://placehold.co/template-xiaomei.mp4',
   'CN', 'female', 10, true),
  ('11111111-1111-1111-1111-111111111102',
   '阿强 — 实力派带货',
   'https://placehold.co/400x600/dbeafe/1e40af?text=%E9%98%BF%E5%BC%BA',
   'https://placehold.co/template-aqiang.mp4',
   'CN', 'male', 20, true),
  ('11111111-1111-1111-1111-111111111103',
   '静静 — 知性温柔风',
   'https://placehold.co/400x600/dcfce7/166534?text=%E9%9D%99%E9%9D%99',
   'https://placehold.co/template-jingjing.mp4',
   'CN', 'female', 30, true)
on conflict (id) do nothing;
