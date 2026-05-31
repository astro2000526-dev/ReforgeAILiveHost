-- Lean-Supabase bootstrap: the roles + auth helpers PostgREST needs, which a
-- vanilla postgres:15 image does NOT ship. Run ONCE on a fresh db, before the
-- app migrations. Idempotent.
--
-- __AUTHPASS__ is replaced by seed-db.sh with the generated authenticator
-- password (must match PGRST_DB_URI in docker-compose.yml).

create extension if not exists pgcrypto;

do $$ begin
  if not exists (select from pg_roles where rolname='anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select from pg_roles where rolname='authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select from pg_roles where rolname='service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
  if not exists (select from pg_roles where rolname='authenticator') then
    create role authenticator noinherit login password '__AUTHPASS__';
  else
    alter role authenticator login password '__AUTHPASS__';
  end if;
end $$;

grant anon, authenticated, service_role to authenticator;

-- Minimal `auth` schema so RLS policies referencing auth.uid()/role() resolve.
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, email text);

create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::json->>'sub','')::uuid $$;
create or replace function auth.role() returns text language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::json->>'role','') $$;
create or replace function auth.email() returns text language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::json->>'email','') $$;

grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
