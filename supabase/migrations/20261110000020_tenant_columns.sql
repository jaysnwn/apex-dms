-- =============================================================================
-- Multi-tenant platform (M-T1, part 2 of 3): tenant_id on every business row.
--
--   * every public table except profiles (a person's global identity) and the
--     platform tables gets tenant_id, backfilled with APEX TRADING CO.
--   * a stamp trigger fills tenant_id from current_tenant_id() on insert,
--     rejects a row naming another tenant, and forbids moving a row between
--     tenants. It fires before every other trigger (name starts with "aa_").
--   * audit_log keeps tenant_id nullable: changes to global identity rows
--     (profiles, platform tables) belong to no tenant.
--
-- Safety: row counts of every table are captured first and compared at the
-- end; any difference aborts the whole migration (one transaction).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Which tables are tenant-owned (everything in public except these)
-- -----------------------------------------------------------------------------
create or replace function public.tenant_scoped_tables()
returns setof text
language sql stable set search_path = public as $$
  select c.relname::text
    from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
     and c.relname not in ('profiles', 'tenants', 'tenant_members', 'platform_admins')
   order by 1
$$;
revoke all on function public.tenant_scoped_tables() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 1. Snapshot row counts
-- -----------------------------------------------------------------------------
create temporary table _mt_counts (table_name text primary key, before_n bigint, after_n bigint);
do $$
declare t text; n bigint;
begin
  for t in select * from public.tenant_scoped_tables() loop
    execute format('select count(*) from public.%I', t) into n;
    insert into _mt_counts (table_name, before_n) values (t, n);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 2. Add the column and backfill every existing row to Apex.
--    User triggers (append-only guards, audit) are lifted for the backfill
--    only, inside this transaction, exactly as migration 0015 did for brands.
-- -----------------------------------------------------------------------------
do $$
declare t text;
begin
  for t in select * from public.tenant_scoped_tables() loop
    execute format('alter table public.%I add column if not exists tenant_id uuid', t);
    execute format('alter table public.%I disable trigger user', t);
    execute format('update public.%I set tenant_id = %L where tenant_id is null', t, 'a9e70000-0000-4000-8000-000000000001');
    execute format('alter table public.%I enable trigger user', t);
    if t <> 'audit_log' then
      execute format('alter table public.%I alter column tenant_id set not null', t);
    end if;
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 3. The stamp trigger
-- -----------------------------------------------------------------------------
create or replace function public.tenant_stamp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ctx uuid;
begin
  if tg_op = 'UPDATE' then
    if new.tenant_id is distinct from old.tenant_id then
      raise exception 'A record cannot be moved to another organization' using errcode = '42501';
    end if;
    return new;
  end if;

  v_ctx := public.current_tenant_id();
  if v_ctx is null then
    -- Only a trusted server context with no signed-in user may write without
    -- a tenant context, and then it must name the tenant itself.
    if auth.uid() is not null or new.tenant_id is null then
      raise exception 'No organization selected' using errcode = '42501';
    end if;
    return new;
  end if;

  if new.tenant_id is null then
    new.tenant_id := v_ctx;
  elsif new.tenant_id <> v_ctx then
    raise exception 'This record belongs to another organization' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function public.tenant_stamp() from public, anon, authenticated;

do $$
declare t text;
begin
  for t in select * from public.tenant_scoped_tables() loop
    continue when t = 'audit_log';
    execute format('create trigger aa_tenant_stamp before insert or update of tenant_id on public.%I
                      for each row execute function public.tenant_stamp()', t);
  end loop;
end $$;

-- Audit rows written directly by a function (not by audit_row) belong to the
-- request's tenant. No tenant context (platform-level change): stays empty.
create or replace function public.audit_log_tenant_default()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.tenant_id is null then
    new.tenant_id := public.current_tenant_id();
  end if;
  return new;
end $$;
revoke all on function public.audit_log_tenant_default() from public, anon, authenticated;
create trigger aa_tenant_default before insert on public.audit_log
  for each row execute function public.audit_log_tenant_default();

-- Lookups by tenant come first in every index we add later; this one is
-- needed by every policy from M-T2 on.
do $$
declare t text;
begin
  for t in select * from public.tenant_scoped_tables() loop
    execute format('create index if not exists %I on public.%I (tenant_id)', t || '_tenant_idx', t);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 4. Audit rows carry the tenant of the row changed (or of the request).
--    Same as 0015's version plus tenant_id.
-- -----------------------------------------------------------------------------
create or replace function public.audit_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_id  text;
  v_brand uuid;
  v_tenant uuid;
begin
  -- Skip no-op updates (only updated_at changed)
  if tg_op = 'UPDATE' and (v_old - 'updated_at') = (v_new - 'updated_at') then
    return new;
  end if;

  v_id := coalesce(v_new ->> 'id', v_old ->> 'id');
  v_brand := nullif(coalesce(v_new ->> 'brand_id', v_old ->> 'brand_id'), '')::uuid;
  if v_brand is null and tg_table_name = 'brands' then v_brand := v_id::uuid; end if;

  v_tenant := nullif(coalesce(v_new ->> 'tenant_id', v_old ->> 'tenant_id'), '')::uuid;
  if v_tenant is null and tg_table_name = 'tenants' then v_tenant := v_id::uuid; end if;
  -- Rows without a tenant of their own (a person's profile) are logged in the
  -- tenant the change was made in; platform admin changes belong to no tenant.
  if v_tenant is null and tg_table_name <> 'platform_admins' then
    v_tenant := public.current_tenant_id();
  end if;

  insert into public.audit_log (table_name, record_id, action, old_data, new_data, changed_by, brand_id, tenant_id)
  values (tg_table_name, v_id, tg_op, v_old, v_new, auth.uid(), v_brand, v_tenant);

  return coalesce(new, old);
end $$;
revoke all on function public.audit_row() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 5. Verify: same row counts, no row without a tenant
-- -----------------------------------------------------------------------------
do $$
declare t text; n bigint; v_bad text;
begin
  for t in select table_name from _mt_counts loop
    execute format('select count(*) from public.%I', t) into n;
    update _mt_counts set after_n = n where table_name = t;
    if t <> 'audit_log' then
      execute format('select count(*) from public.%I where tenant_id is null', t) into n;
      if n > 0 then raise exception 'M-T1 check failed: % rows of % have no tenant', n, t; end if;
    end if;
  end loop;
  select string_agg(table_name || ' ' || before_n || '->' || after_n, ', ') into v_bad
    from _mt_counts where before_n is distinct from after_n;
  if v_bad is not null then
    raise exception 'M-T1 check failed: row counts changed: %', v_bad;
  end if;
end $$;

drop table _mt_counts;
