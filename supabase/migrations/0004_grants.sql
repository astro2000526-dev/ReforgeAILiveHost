-- 0004_grants.sql — table privileges for the PostgREST roles.
--
-- Lean-Supabase (raw postgres + postgrest) has NO default table grants. The web
-- talks to the DB as service_role (its SERVICE_KEY JWT). service_role is
-- bypassrls, but bypassrls only skips RLS policy evaluation — it does NOT grant
-- table-level SELECT/INSERT/UPDATE/DELETE. Without these, every gateway query
-- fails with "permission denied for table ...". 0003 granted only system_config;
-- this grants the rest. Idempotent.

-- service_role: full access to everything (the app's server-side client).
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- anon / authenticated: scoped to what the RLS policies in 0001 intend.
grant select on public.avatars to anon, authenticated;
grant select, insert, update, delete on public.projects   to authenticated;
grant select, insert, update, delete on public.generations to authenticated;
grant select, insert, update, delete on public.streams     to authenticated;
grant select, update on public.profiles to authenticated;

-- any future tables created by these roles get the same defaults.
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
