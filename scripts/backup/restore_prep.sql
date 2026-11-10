-- Prepares an empty plain Postgres 17 database to receive a DMS backup for the
-- nightly restore check: the roles that policies name and the extensions the
-- indexes use. (A real disaster restore goes into a new Supabase project,
-- which already has all of this; see docs/runbooks/backup-and-restore.md.)
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated', 'service_role', 'app_definer', 'authenticator',
                           'supabase_auth_admin', 'supabase_storage_admin', 'dashboard_user',
                           'supabase_admin', 'pgbouncer', 'supabase_replication_admin',
                           'supabase_read_only_user', 'supabase_realtime_admin'] loop
    if not exists (select 1 from pg_roles where rolname = r) then
      execute format('create role %I nologin', r);
    end if;
  end loop;
end $$;
drop schema if exists public cascade;
create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
