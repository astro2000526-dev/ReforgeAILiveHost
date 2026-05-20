# Supabase setup

This folder contains the database schema as plain SQL. We're not using the
Supabase CLI yet (MVP); the user runs SQL by hand via the dashboard.

## Apply the initial schema

1. Sign in at https://supabase.com and create a project. Region: **Singapore**
   (closest to TH/ID/VN markets — same as your Azure Speech region).
2. Once the project is ready, go to **Project Settings → API** and grab:
   - `Project URL`           → `SUPABASE_URL` in `.env`
   - `service_role` key      → `SUPABASE_SERVICE_KEY` in `services/pipeline/.env`
   - `anon` public key       → `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `apps/web/.env.local`
3. Open **SQL Editor → New query**, paste the contents of
   [migrations/0001_initial_schema.sql](migrations/0001_initial_schema.sql),
   click **Run**.
4. Verify: **Table editor** should now show `profiles`, `avatars`, `projects`,
   `generations`, `streams`.

## Storage bucket (set up once, manually)

Supabase Storage isn't created by the SQL file. After the tables are in place:

1. **Storage → New bucket**
   - Name: `videos`
   - Public: **Yes** (we serve template videos and generated mp4s directly to
     the browser and to ffmpeg on the GPU box)
2. Inside the bucket, create folders by convention:
   - `avatars/<avatar_id>/template.mp4`
   - `avatars/<avatar_id>/preview.jpg`
   - `generations/<generation_id>/output.mp4`
   - `projects/<project_id>/products/*.jpg` (optional)

## Seeding the avatars

The seed `INSERT` is commented out at the bottom of the schema file. After you
upload real template videos to the `videos` bucket:

1. Copy the public URLs (e.g. `https://<project>.supabase.co/storage/v1/object/public/videos/avatars/nida/template.mp4`).
2. Uncomment the `INSERT` block in `0001_initial_schema.sql`, replace placeholder URLs, run it in SQL Editor.

Alternative: insert via the Table editor UI row by row.

## Row Level Security cheat sheet

- **profiles**: user reads/updates only their own row.
- **avatars**: any authenticated user can read active avatars; writes are
  service_role only (admin upload script).
- **projects / generations / streams**: user can only touch rows belonging to
  their own projects. Generation writes happen via service_role from the
  FastAPI worker (which bypasses RLS).

## Migrations going forward

Add new SQL files as `migrations/000N_<short_name>.sql`. Keep them idempotent
(`if not exists`, `or replace`). When we adopt the Supabase CLI we can drop
this convention and let `supabase db push` handle it.

## Pre-launch checklist (NOT MVP, but don't forget)

- [ ] Rotate any credentials shared during MVP setup (Volcengine token, etc.)
- [ ] Migrate `streams.stream_key` from plaintext to `pgcrypto`-encrypted
- [ ] Tighten storage bucket policies (probably split private/public buckets)
- [ ] Enable Supabase Auth email confirmation
- [ ] Add daily backups (Supabase Pro plan)
