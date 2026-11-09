-- =============================================================================
-- Multi-tenant platform (M-T2, part 1 of 2): fence every owner-rights function
-- and view inside the request's tenant.
--
-- Until now every SECURITY DEFINER function and owner-rights view ran as
-- "postgres", which bypasses row-level security: they saw every row in the
-- database. They now run as app_definer, a role WITHOUT that bypass, which
-- gets one rule on every business table: rows of current_tenant_id() only.
-- The functions keep their logic and keep seeing every row of their own
-- tenant (that is why they are owner-rights), but can never read or change
-- another tenant's rows, whatever ids they are given.
--
-- Also here:
--   * roles come from the membership in the current tenant, not the profile
--   * "at least one active Super Administrator" is checked per tenant
--   * tenant_people: a person with their role in the current tenant; five
--     functions that read roles from profiles now read it from there
--   * retailer codes and default state come from the tenant's settings
--
-- A small allow-list of platform functions stays with postgres because it
-- must see memberships across tenants (to decide the tenant at all).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Keep exact copies of what this migration and 0023 change, so the
--    rollback can restore them byte for byte (schema not exposed to the API)
-- -----------------------------------------------------------------------------
create schema if not exists mt_rollback;
revoke all on schema mt_rollback from public;
create table mt_rollback.function_src (sig text primary key, src text not null);
create table mt_rollback.defaults (tbl text, col text, expr text, primary key (tbl, col));
create table mt_rollback.triggers (name text primary key, def text not null);
create table mt_rollback.policies (schema_name text, tbl text, name text, create_sql text not null,
                                   primary key (schema_name, tbl, name));

insert into mt_rollback.function_src
select p.oid::regprocedure::text, pg_get_functiondef(p.oid)
  from pg_proc p
 where p.oid in ('public.current_app_role()'::regprocedure, 'public.can_reimburse_expenses()'::regprocedure,
                 'public.profile_sync_membership()'::regprocedure,
                 'public.approve_incentives(date, boolean)'::regprocedure,
                 'public.expense_save(uuid, uuid, uuid, numeric, date, uuid, uuid, text, text, text, text, text, boolean, uuid, text)'::regprocedure,
                 'public.plan_route(uuid, uuid, date, text)'::regprocedure,
                 'public.record_location(numeric, numeric, numeric, timestamp with time zone)'::regprocedure,
                 'public.route_assign(uuid, uuid, date, text)'::regprocedure);

insert into mt_rollback.defaults
select c.relname, a.attname, pg_get_expr(d.adbin, d.adrelid)
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
 where c.relnamespace = 'public'::regnamespace
   and (c.relname, a.attname) in (('retailers', 'code'), ('retailers', 'billing_state_code'),
                                  ('company_settings', 'legal_name'), ('company_settings', 'doc_prefix'));

insert into mt_rollback.triggers
select t.tgname, pg_get_triggerdef(t.oid) from pg_trigger t where t.tgname = 'profiles_guard_last_super_admin';

-- every policy on business tables, profiles and storage objects, as it is now
insert into mt_rollback.policies
select n.nspname, c.relname, pol.polname,
       format('create policy %I on %I.%I as %s for %s to %s%s%s',
              pol.polname, n.nspname, c.relname,
              case when pol.polpermissive then 'permissive' else 'restrictive' end,
              case pol.polcmd when 'r' then 'select' when 'a' then 'insert' when 'w' then 'update'
                              when 'd' then 'delete' else 'all' end,
              (select string_agg(case when r = 0 then 'public' else quote_ident(pg_get_userbyid(r)) end, ', ')
                 from unnest(pol.polroles) r),
              coalesce(' using (' || pg_get_expr(pol.polqual, pol.polrelid) || ')', ''),
              coalesce(' with check (' || pg_get_expr(pol.polwithcheck, pol.polrelid) || ')', ''))
  from pg_policy pol
  join pg_class c on c.oid = pol.polrelid
  join pg_namespace n on n.oid = c.relnamespace
 where (n.nspname = 'public' and c.relname in (select * from public.tenant_scoped_tables() union all select 'profiles'))
    or (n.nspname = 'storage' and c.relname = 'objects');

-- -----------------------------------------------------------------------------
-- 1. The definer role
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_definer') then
    create role app_definer nologin inherit nobypassrls;
  end if;
end $$;
-- Member of anon only to inherit its use of the auth schema (auth.uid()).
-- anon is the least-privileged such role and no policy names it, so the only
-- row-level rule that applies to app_definer is its own tenant fence below.
-- (Not authenticated: its policies would then apply too, and some of them call
-- back into fenced functions.)
do $$
begin
  -- in case an earlier draft granted it (roles are shared by every database of a server)
  if exists (select 1 from pg_auth_members where roleid = 'authenticated'::regrole and member = 'app_definer'::regrole) then
    revoke authenticated from app_definer;
  end if;
end $$;
grant anon to app_definer;
-- postgres must be able to hand functions to app_definer and replace them later.
grant app_definer to postgres with inherit false, set true;

grant usage on schema public to app_definer;
grant all on all tables in schema public to app_definer;
grant all on all sequences in schema public to app_definer;
grant execute on all functions in schema public to app_definer;
alter default privileges for role postgres in schema public grant all on tables to app_definer;
alter default privileges for role postgres in schema public grant all on sequences to app_definer;
alter default privileges for role postgres in schema public grant execute on functions to app_definer;
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'extensions') then
    execute 'grant usage on schema extensions to app_definer';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 2. The fence: app_definer sees and writes only the current tenant's rows
-- -----------------------------------------------------------------------------
do $$
declare t text;
begin
  for t in select * from public.tenant_scoped_tables() loop
    if t = 'audit_log' then
      execute $p$create policy definer_tenant_fence on public.audit_log for all to app_definer
                  using (tenant_id = (select public.current_tenant_id()))
                  with check (tenant_id is null or tenant_id = (select public.current_tenant_id()))$p$;
    else
      execute format('create policy definer_tenant_fence on public.%I for all to app_definer
                        using (tenant_id = (select public.current_tenant_id()))
                        with check (tenant_id = (select public.current_tenant_id()))', t);
    end if;
  end loop;
end $$;

-- Is this person a member of the current tenant? (answers only yes / no)
create or replace function public.is_tenant_member(p_user uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tenant_members m
                  where m.user_id = p_user and m.tenant_id = public.current_tenant_id())
$$;
revoke all on function public.is_tenant_member(uuid) from public, anon;
grant execute on function public.is_tenant_member(uuid) to authenticated, app_definer;

-- People: own profile, and profiles of members of the current tenant.
create policy definer_tenant_fence on public.profiles for all to app_definer
  using (id = (select auth.uid()) or public.is_tenant_member(id))
  with check (id = (select auth.uid()) or public.is_tenant_member(id));
create policy definer_tenant_fence on public.tenant_members for select to app_definer
  using (tenant_id = (select public.current_tenant_id()) or user_id = (select auth.uid()));
create policy definer_tenant_fence on public.tenants for select to app_definer
  using (id = (select public.current_tenant_id()));

-- -----------------------------------------------------------------------------
-- 3. Roles come from the membership in the current tenant
-- -----------------------------------------------------------------------------
create or replace function public.current_app_role()
returns public.app_role
language sql stable security definer set search_path = public as $$
  select m.role from public.tenant_members m
   where m.user_id = auth.uid() and m.tenant_id = public.current_tenant_id() and m.is_active
$$;

create or replace function public.can_reimburse_expenses()
returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_role('super_admin')
      or exists (select 1 from public.tenant_members m
                  where m.user_id = auth.uid() and m.tenant_id = public.current_tenant_id()
                    and m.is_active and m.can_reimburse and m.role in ('manager', 'billing'))
$$;

-- A person with their role in the current tenant (fenced: app_definer owns it).
create view public.tenant_people as
select p.id, p.full_name, p.email, p.phone, m.role, m.is_active, m.can_reimburse, p.share_location,
       p.created_at, m.tenant_id
  from public.profiles p
  join public.tenant_members m on m.user_id = p.id and m.tenant_id = public.current_tenant_id();
revoke all on public.tenant_people from anon, authenticated;

-- At least one active Super Administrator per tenant.
create or replace function public.guard_last_owner()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.role = 'super_admin' and old.is_active
     and (tg_op = 'DELETE' or new.role <> 'super_admin' or not new.is_active)
     and not exists (
       select 1 from public.tenant_members
        where tenant_id = old.tenant_id and role = 'super_admin' and is_active and user_id <> old.user_id
     ) then
    raise exception 'At least one active Super Administrator is required' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;
revoke all on function public.guard_last_owner() from public, anon, authenticated;
create trigger tenant_members_guard_last_owner before update or delete on public.tenant_members
  for each row execute function public.guard_last_owner();
drop trigger profiles_guard_last_super_admin on public.profiles;

-- The current Users screen edits role / active / reimburse on profiles:
-- mirror the edit into the membership of the tenant it was made in.
create or replace function public.profile_sync_membership()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_tenant uuid := coalesce(public.current_tenant_id(), new.default_tenant_id);
begin
  if v_tenant is not null
     and (new.role, new.is_active, new.can_reimburse) is distinct from (old.role, old.is_active, old.can_reimburse) then
    update public.tenant_members
       set role = new.role, is_active = new.is_active, can_reimburse = coalesce(new.can_reimburse, false)
     where tenant_id = v_tenant and user_id = new.id;
  end if;
  return new;
end $$;

-- -----------------------------------------------------------------------------
-- 4. Functions that read a role from profiles read it from tenant_people.
--    Each patch must hit exactly the expected line, or the migration stops.
-- -----------------------------------------------------------------------------
do $$
declare
  r record;
  v_src text;
begin
  for r in select * from (values
    ('public.approve_incentives(date, boolean)',
     'select id from public.profiles where role = ''salesman'' and is_active order by full_name loop',
     'select id from public.tenant_people where role = ''salesman'' and is_active order by full_name loop'),
    ('public.expense_save(uuid, uuid, uuid, numeric, date, uuid, uuid, text, text, text, text, text, boolean, uuid, text)',
     '(select 1 from public.profiles where id = v_emp and is_active)',
     '(select 1 from public.tenant_people where id = v_emp and is_active)'),
    ('public.plan_route(uuid, uuid, date, text)',
     '(select 1 from public.profiles where id = p_salesman_id and role = ''salesman'' and is_active)',
     '(select 1 from public.tenant_people where id = p_salesman_id and role = ''salesman'' and is_active)'),
    ('public.record_location(numeric, numeric, numeric, timestamp with time zone)',
     '(select 1 from public.profiles where id = auth.uid() and is_active and share_location and role = ''salesman'')',
     '(select 1 from public.tenant_people where id = auth.uid() and is_active and share_location and role = ''salesman'')'),
    ('public.route_assign(uuid, uuid, date, text)',
     '(select 1 from public.profiles where id = p_salesman and role = ''salesman'' and is_active)',
     '(select 1 from public.tenant_people where id = p_salesman and role = ''salesman'' and is_active)')
  ) as x(fn, old_text, new_text) loop
    v_src := pg_get_functiondef(r.fn::regprocedure);
    if (length(v_src) - length(replace(v_src, r.old_text, ''))) / length(r.old_text) <> 1 then
      raise exception 'M-T2: % does not contain the expected line exactly once; update migration 0022', r.fn;
    end if;
    execute replace(v_src, r.old_text, r.new_text);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 5. Codes and defaults from the tenant, not from Apex
-- -----------------------------------------------------------------------------
-- Retailer codes: <tenant prefix>-R-0001, one series per tenant. Apex keeps
-- APX-R-#### and continues after the last code issued by the old sequence.
create or replace function public.next_retailer_code()
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_value  integer;
  v_prefix text;
begin
  if v_tenant is null then
    raise exception 'No organization selected' using errcode = '42501';
  end if;
  insert into public.number_series (tenant_id, doc_type, fy) values (v_tenant, 'RETAILER', 'ALL')
  on conflict (tenant_id, doc_type, fy) do nothing;
  update public.number_series set next_value = next_value + 1
   where tenant_id = v_tenant and doc_type = 'RETAILER' and fy = 'ALL'
  returning next_value - 1 into v_value;
  select doc_prefix into v_prefix from public.company_settings where tenant_id = v_tenant;
  return coalesce(v_prefix, 'DOC') || '-R-' || lpad(v_value::text, 4, '0');
end $$;
revoke all on function public.next_retailer_code() from public, anon;
grant execute on function public.next_retailer_code() to authenticated;

insert into public.number_series (tenant_id, doc_type, fy, next_value)
select 'a9e70000-0000-4000-8000-000000000001', 'RETAILER', 'ALL',
       greatest(
         (select case when is_called then last_value + 1 else last_value end from public.retailer_code_seq),
         coalesce((select max(substring(code from '-R-([0-9]+)$')::int) + 1 from public.retailers
                    where tenant_id = 'a9e70000-0000-4000-8000-000000000001' and code ~ '-R-[0-9]+$'), 1))
on conflict (tenant_id, doc_type, fy) do nothing;

alter table public.retailers alter column code set default public.next_retailer_code();

-- Default billing state = the tenant's own state.
create or replace function public.tenant_state_code()
returns char(2)
language sql stable security definer set search_path = public as $$
  select state_code from public.company_settings where tenant_id = public.current_tenant_id()
$$;
revoke all on function public.tenant_state_code() from public, anon;
grant execute on function public.tenant_state_code() to authenticated;
alter table public.retailers alter column billing_state_code set default public.tenant_state_code();

-- No Apex details as defaults for a new tenant's settings.
alter table public.company_settings alter column legal_name drop default;
alter table public.company_settings alter column doc_prefix set default 'DOC';

-- -----------------------------------------------------------------------------
-- 6. Hand every other owner-rights function and view to app_definer
-- -----------------------------------------------------------------------------
create or replace function public.platform_definer_allowlist()
returns setof text language sql immutable as $$
  select unnest(array[
    'current_tenant_id', 'is_platform_admin', 'my_tenants',            -- decide the tenant
    'is_tenant_member',
    'current_app_role', 'has_role', 'is_active_user',                  -- role in that tenant
    'handle_new_user', 'profile_sync_membership', 'guard_last_owner',  -- identity + membership
    'tenant_stamp', 'audit_row', 'audit_log_tenant_default',           -- stamp / audit every row
    'storage_object_tenant', 'storage_user_folder',                    -- storage paths (0023)
    'rls_auto_enable'                                                  -- Supabase-managed
  ])
$$;
revoke all on function public.platform_definer_allowlist() from public, anon, authenticated;

do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig
             from pg_proc p
            where p.pronamespace = 'public'::regnamespace and p.prosecdef
              and p.proname not in (select * from public.platform_definer_allowlist())
  loop
    execute format('alter function %s owner to app_definer', r.sig);
  end loop;

  for r in select c.oid::regclass as v
             from pg_class c
            where c.relnamespace = 'public'::regnamespace and c.relkind = 'v'
              and not coalesce(c.reloptions::text ~ 'security_invoker=(true|on)', false)
  loop
    execute format('alter view %s owner to app_definer', r.v);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 7. Check: nothing but the allow-list runs with the bypass any more
-- -----------------------------------------------------------------------------
do $$
declare v text;
begin
  select string_agg(p.proname, ', ') into v
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.prosecdef
     and pg_get_userbyid(p.proowner) <> 'app_definer'
     and p.proname not in (select * from public.platform_definer_allowlist());
  if v is not null then raise exception 'M-T2 check failed: still owner-rights as postgres: %', v; end if;

  select string_agg(c.relname, ', ') into v
    from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind = 'v'
     and not coalesce(c.reloptions::text ~ 'security_invoker=(true|on)', false)
     and pg_get_userbyid(c.relowner) <> 'app_definer';
  if v is not null then raise exception 'M-T2 check failed: owner-rights views not fenced: %', v; end if;

  if (select rolbypassrls from pg_roles where rolname = 'app_definer') then
    raise exception 'M-T2 check failed: app_definer must not bypass row-level security';
  end if;
  if pg_has_role('app_definer', 'authenticated', 'USAGE') or pg_has_role('app_definer', 'service_role', 'USAGE')
     or pg_has_role('app_definer', 'postgres', 'USAGE') then
    raise exception 'M-T2 check failed: app_definer must not act as authenticated, service_role or postgres';
  end if;
end $$;
