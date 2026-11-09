-- =============================================================================
-- Multi-tenant platform (M-T1, part 1 of 3): platform core.
--
--   * tenants          one row per business (organization) on the platform
--   * tenant_members   a person's role in one tenant; one login can belong to
--                      several tenants (e.g. Apex owner and CONQRETE owner)
--   * platform_admins  the operator of the platform; NO access to tenant data
--   * current_tenant_id()  the tenant a request works in, decided by the
--                      database from the signed-in user's membership. The
--                      frontend never decides it on its own.
--
-- APEX TRADING CO. becomes the first tenant; every existing user becomes an
-- Apex member with exactly the role they have today. Nothing else changes in
-- this migration: existing policies and functions behave as before.
-- =============================================================================

-- Fixed id so every environment (local tests, staging, production) agrees.
-- a9e70000-0000-4000-8000-000000000001 = APEX TRADING CO.

create type public.tenant_status as enum ('trial', 'active', 'suspended', 'closed');

create table public.tenants (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null check (slug ~ '^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$'),
  display_name   text not null check (length(trim(display_name)) > 0),
  legal_name     text not null check (length(trim(legal_name)) > 0),
  business_type  text not null default 'distributor',
  status         public.tenant_status not null default 'active',
  created_by     uuid references auth.users (id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create unique index tenants_slug_key on public.tenants (slug);
create trigger tenants_updated_at before update on public.tenants
  for each row execute function public.set_updated_at();

create table public.platform_admins (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now()
);

create table public.tenant_members (
  tenant_id      uuid not null references public.tenants (id),
  user_id        uuid not null references public.profiles (id) on delete cascade,
  role           public.app_role not null,
  is_active      boolean not null default true,
  can_reimburse  boolean not null default false,
  created_by     uuid references auth.users (id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  primary key (tenant_id, user_id)
);
create index tenant_members_user_idx on public.tenant_members (user_id);
create trigger tenant_members_updated_at before update on public.tenant_members
  for each row execute function public.set_updated_at();

-- The tenant a user lands in when the request names none.
alter table public.profiles add column if not exists default_tenant_id uuid references public.tenants (id);

-- -----------------------------------------------------------------------------
-- current_tenant_id(): the only source of tenant context.
--
-- Signed-in user:
--   1. header x-tenant-id (sent by the app's server on every call): returned
--      ONLY if the user is an active member of that tenant and the tenant is
--      open (trial / active). A header naming any other tenant gives NULL,
--      never a fallback, so a forged header sees nothing.
--   2. no header: the user's default tenant if still valid, else their only
--      active membership. A user in several tenants with no header gets NULL.
-- No signed-in user:
--   only a trusted server context (service key, or a direct database session
--   such as a migration) may name a tenant, via the setting app.tenant_id.
--   Anonymous API calls always get NULL.
-- NULL means: no tenant, so every tenant policy returns nothing.
-- -----------------------------------------------------------------------------
create or replace function public.current_tenant_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_role   text;
  v_raw    text;
  v_tenant uuid;
begin
  if v_uid is null then
    v_role := coalesce(
      nullif(current_setting('request.jwt.claim.role', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role');
    if v_role is not null and v_role <> 'service_role' then
      return null;
    end if;
    v_raw := nullif(current_setting('app.tenant_id', true), '');
    if v_raw is null or v_raw !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return null;
    end if;
    return (select t.id from public.tenants t where t.id = v_raw::uuid);
  end if;

  begin
    v_raw := nullif(nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-tenant-id', '');
  exception when others then
    return null;   -- unreadable headers: no tenant
  end;

  if v_raw is not null then
    if v_raw !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return null;
    end if;
    select m.tenant_id into v_tenant
      from public.tenant_members m
      join public.tenants t on t.id = m.tenant_id
     where m.tenant_id = v_raw::uuid and m.user_id = v_uid
       and m.is_active and t.status in ('trial', 'active');
    return v_tenant;
  end if;

  select m.tenant_id into v_tenant
    from public.profiles p
    join public.tenant_members m on m.tenant_id = p.default_tenant_id and m.user_id = p.id
    join public.tenants t on t.id = m.tenant_id
   where p.id = v_uid and m.is_active and t.status in ('trial', 'active');
  if v_tenant is not null then
    return v_tenant;
  end if;

  select (array_agg(m.tenant_id))[1] into v_tenant
    from public.tenant_members m
    join public.tenants t on t.id = m.tenant_id
   where m.user_id = v_uid and m.is_active and t.status in ('trial', 'active')
  having count(*) = 1;
  return v_tenant;
end $$;
revoke all on function public.current_tenant_id() from public, anon;
grant execute on function public.current_tenant_id() to authenticated, service_role;

create or replace function public.is_platform_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid())
$$;
revoke all on function public.is_platform_admin() from public, anon;
grant execute on function public.is_platform_admin() to authenticated;

-- Tenants this user belongs to (for the tenant picker).
create or replace function public.my_tenants()
returns table (id uuid, slug text, display_name text, role public.app_role, status public.tenant_status, is_default boolean)
language sql stable security definer set search_path = public as $$
  select t.id, t.slug, t.display_name, m.role, t.status,
         t.id = (select default_tenant_id from public.profiles where id = auth.uid())
    from public.tenant_members m
    join public.tenants t on t.id = m.tenant_id
   where m.user_id = auth.uid() and m.is_active and t.status <> 'closed'
   order by t.display_name
$$;
revoke all on function public.my_tenants() from public, anon;
grant execute on function public.my_tenants() to authenticated;

-- -----------------------------------------------------------------------------
-- RLS on the platform tables (written only through functions / service key)
-- -----------------------------------------------------------------------------
alter table public.tenants enable row level security;
alter table public.tenant_members enable row level security;
alter table public.platform_admins enable row level security;

create policy tenants_select on public.tenants for select to authenticated
  using (
    exists (select 1 from public.tenant_members m
             where m.tenant_id = tenants.id and m.user_id = (select auth.uid()) and m.is_active)
    or (select public.is_platform_admin())
  );

create policy tenant_members_select on public.tenant_members for select to authenticated
  using (
    user_id = (select auth.uid())
    or (tenant_id = (select public.current_tenant_id())
        and (select public.has_role('super_admin', 'manager')))
  );

create policy platform_admins_select on public.platform_admins for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.tenants, public.tenant_members, public.platform_admins from anon;

-- -----------------------------------------------------------------------------
-- APEX TRADING CO. = tenant 1. Every existing user becomes an Apex member with
-- the role, active flag and reimbursement right they have today.
-- -----------------------------------------------------------------------------
insert into public.tenants (id, slug, display_name, legal_name, business_type, status)
select 'a9e70000-0000-4000-8000-000000000001', 'apex', 'APEX TRADING CO.',
       coalesce((select nullif(trim(legal_name), '') from public.company_settings limit 1), 'APEX TRADING CO.'),
       'distributor', 'active';

insert into public.tenant_members (tenant_id, user_id, role, is_active, can_reimburse)
select 'a9e70000-0000-4000-8000-000000000001', p.id, p.role, p.is_active, coalesce(p.can_reimburse, false)
  from public.profiles p;

-- A structural backfill, not a user action: no audit rows, no updated_at bump.
alter table public.profiles disable trigger user;
update public.profiles set default_tenant_id = 'a9e70000-0000-4000-8000-000000000001'
 where default_tenant_id is null;
alter table public.profiles enable trigger user;

-- -----------------------------------------------------------------------------
-- New auth users: profile as before, plus a membership.
--   app_metadata.tenant_id + role -> member of that tenant (new onboarding path)
--   role only, and the platform has exactly one tenant -> member of it
--     (keeps today's user-creation screen working until it is tenant-aware)
--   no role, or no tenant could be decided -> inactive profile, no membership
--     (a self sign-up, or a role-only user once several tenants exist, sees
--     nothing)
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_role   text := new.raw_app_meta_data ->> 'role';
  v_raw    text := nullif(new.raw_app_meta_data ->> 'tenant_id', '');
  v_tenant uuid;
begin
  if v_role is not null then
    if v_raw is not null then
      select id into v_tenant from public.tenants where id::text = v_raw;
    elsif (select count(*) from public.tenants) = 1 then
      select id into v_tenant from public.tenants;
    end if;
  end if;

  insert into public.profiles (id, email, full_name, phone, role, is_active, default_tenant_id)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.raw_user_meta_data ->> 'phone',
    coalesce(v_role, 'salesman')::public.app_role,
    v_tenant is not null,
    v_tenant
  )
  on conflict (id) do nothing;

  if v_tenant is not null then
    insert into public.tenant_members (tenant_id, user_id, role, is_active)
    values (v_tenant, new.id, v_role::public.app_role, true)
    on conflict (tenant_id, user_id) do nothing;
  end if;
  return new;
end $$;

-- Audit the platform tables like every other access table.
create trigger tenants_audit after insert or update or delete on public.tenants
  for each row execute function public.audit_row();
create trigger tenant_members_audit after insert or update or delete on public.tenant_members
  for each row execute function public.audit_row();
create trigger platform_admins_audit after insert or update or delete on public.platform_admins
  for each row execute function public.audit_row();

-- -----------------------------------------------------------------------------
-- Transitional (until M-T2 makes the membership the source of truth): the
-- existing Users screen edits role / active / reimburse on profiles; mirror
-- those edits into the user's membership of their default tenant.
-- -----------------------------------------------------------------------------
create or replace function public.profile_sync_membership()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.default_tenant_id is not null
     and (new.role, new.is_active, new.can_reimburse) is distinct from (old.role, old.is_active, old.can_reimburse) then
    update public.tenant_members
       set role = new.role, is_active = new.is_active, can_reimburse = coalesce(new.can_reimburse, false)
     where tenant_id = new.default_tenant_id and user_id = new.id;
  end if;
  return new;
end $$;
revoke all on function public.profile_sync_membership() from public, anon, authenticated;
create trigger profiles_sync_membership after update on public.profiles
  for each row execute function public.profile_sync_membership();
