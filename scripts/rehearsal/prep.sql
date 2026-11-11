-- Prepares an empty plain Postgres 17 database to receive a production dump
-- for the upgrade rehearsal: the Supabase roles the dump's owners, grants and
-- policies name, and the extensions. Unlike the backup check, app_definer is
-- NOT created here: production does not have it yet, migration 0019 does.
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated', 'service_role', 'authenticator',
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
