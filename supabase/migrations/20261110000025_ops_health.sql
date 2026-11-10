-- =============================================================================
-- Operations: an error log and a health summary (no business data changes).
--
--   * ops.app_errors: errors seen by browsers and by the server. In its own
--     schema, which the API does not expose; written and read only through the
--     functions below.
--   * report_app_error(): any signed-in user's browser reports an error, at
--     most 20 per person per 10 minutes, so it cannot fill the database. The
--     server (service key) reports its own errors, naming the user and
--     business only if that user really is an active member of it.
--   * recent_app_errors(): a business's Super Admin sees that business's errors.
--   * system_health(): sizes and counts for the System health page: the
--     business's own figures, and the platform's totals (database size against
--     the free plan's 500 MB) for platform administrators only.
-- Errors older than 30 days are removed as new ones arrive.
-- =============================================================================

create schema if not exists ops;
revoke all on schema ops from public, anon, authenticated;

create table ops.app_errors (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  tenant_id  uuid references public.tenants (id) on delete cascade,
  user_id    uuid,
  source     text not null check (source in ('browser', 'server')),
  message    text not null,
  digest     text,
  path       text,
  detail     text
);
create index app_errors_tenant_at_idx on ops.app_errors (tenant_id, at desc);
create index app_errors_user_at_idx on ops.app_errors (user_id, at desc);
alter table ops.app_errors enable row level security;
-- reachable only through the functions below, which do their own checks
-- (signed-in caller, business, Super Admin); recent_app_errors runs fenced
create policy definer_only on ops.app_errors to app_definer using (true) with check (true);
grant usage on schema ops to app_definer;
grant select, insert, delete on ops.app_errors to app_definer;

-- -----------------------------------------------------------------------------
-- Allow-list (replaces 0024's): system_health reads sizes across the whole
-- database (pg_database_size, storage totals), and report_app_error checks a
-- membership before any business is chosen; the fenced role can do neither.
-- Both only read counts / write the error log.
-- -----------------------------------------------------------------------------
create or replace function public.platform_definer_allowlist()
returns setof text language sql immutable as $$
  select unnest(array[
    'current_tenant_id', 'is_platform_admin', 'my_tenants',            -- decide the tenant
    'is_tenant_member',
    'current_app_role', 'has_role', 'is_active_user',                  -- role in that tenant
    'handle_new_user', 'profile_sync_membership', 'guard_last_owner',  -- identity + membership
    'tenant_stamp', 'audit_row', 'audit_log_tenant_default',           -- stamp / audit every row
    'storage_object_tenant', 'storage_user_folder',                    -- storage paths
    'tenant_public_profile',                                           -- branded login page
    'member_tenant_count', 'find_user_id_by_email',                    -- not callable from the API
    'system_health',                                                   -- sizes (0025)
    'report_app_error',                                                -- checks membership before any business is chosen (0025)
    'rls_auto_enable'                                                  -- Supabase-managed
  ])
$$;
revoke all on function public.platform_definer_allowlist() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Reporting
-- -----------------------------------------------------------------------------
create or replace function public.report_app_error(p_source text, p_message text, p_digest text default null,
                                                   p_path text default null, p_detail text default null,
                                                   p_user uuid default null, p_tenant uuid default null)
returns void
language plpgsql security definer set search_path = public, ops as $$
declare
  v_server boolean := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role';
  v_user   uuid;
  v_tenant uuid;
begin
  if v_server then
    v_user := p_user;
    -- the server names the business only for a real, active member of it
    if p_user is not null and p_tenant is not null and exists (
         select 1 from public.tenant_members m where m.user_id = p_user and m.tenant_id = p_tenant and m.is_active) then
      v_tenant := p_tenant;
    end if;
  else
    v_user := auth.uid();
    if v_user is null then return; end if;               -- signed-in users only
    v_tenant := public.current_tenant_id();
    if (select count(*) from ops.app_errors e where e.user_id = v_user and e.at > now() - interval '10 minutes') >= 20 then
      return;                                            -- enough from this person for now
    end if;
  end if;
  insert into ops.app_errors (tenant_id, user_id, source, message, digest, path, detail)
  values (v_tenant, v_user, case when v_server and p_source = 'server' then 'server' else 'browser' end,
          left(coalesce(nullif(trim(p_message), ''), 'Unknown error'), 500),
          left(p_digest, 100), left(p_path, 300), left(p_detail, 2000));
  if random() < 0.02 then
    delete from ops.app_errors where at < now() - interval '30 days';
  end if;
end $$;
revoke all on function public.report_app_error(text, text, text, text, text, uuid, uuid) from public, anon;
grant execute on function public.report_app_error(text, text, text, text, text, uuid, uuid) to authenticated, service_role;

create or replace function public.recent_app_errors(p_limit integer default 100)
returns table (at timestamptz, source text, message text, digest text, path text, user_name text)
language plpgsql stable security definer set search_path = public, ops as $$
begin
  if not public.has_role('super_admin') then
    raise exception 'Only the Super Admin sees the error log' using errcode = '42501';
  end if;
  return query
    select e.at, e.source, e.message, e.digest, e.path, p.full_name
      from ops.app_errors e
      left join public.tenant_people p on p.id = e.user_id
     where e.tenant_id = public.current_tenant_id()
     order by e.at desc
     limit least(greatest(coalesce(p_limit, 100), 1), 500);
end $$;
revoke all on function public.recent_app_errors(integer) from public, anon;
grant execute on function public.recent_app_errors(integer) to authenticated;

-- -----------------------------------------------------------------------------
-- Health summary
-- -----------------------------------------------------------------------------
create or replace function public.system_health()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v jsonb;
begin
  if not public.has_role('super_admin') then
    raise exception 'Only the Super Admin sees system health' using errcode = '42501';
  end if;
  v := jsonb_build_object(
    'files_bytes', (select coalesce(sum((o.metadata ->> 'size')::bigint), 0) from storage.objects o
                     where public.storage_object_tenant(o.name) = v_tenant),
    'files_count', (select count(*) from storage.objects o where public.storage_object_tenant(o.name) = v_tenant),
    'rows', jsonb_build_object(
       'products',        (select count(*) from public.products where tenant_id = v_tenant),
       'retailers',       (select count(*) from public.retailers where tenant_id = v_tenant),
       'invoices',        (select count(*) from public.invoices where tenant_id = v_tenant),
       'invoice_lines',   (select count(*) from public.invoice_lines where tenant_id = v_tenant),
       'payments',        (select count(*) from public.payments where tenant_id = v_tenant),
       'stock_movements', (select count(*) from public.stock_movements where tenant_id = v_tenant),
       'audit_log',       (select count(*) from public.audit_log where tenant_id = v_tenant)),
    'errors_24h', (select count(*) from ops.app_errors e where e.tenant_id = v_tenant and e.at > now() - interval '24 hours'),
    'errors_7d',  (select count(*) from ops.app_errors e where e.tenant_id = v_tenant and e.at > now() - interval '7 days'));
  if public.is_platform_admin() then
    v := v || jsonb_build_object('platform', jsonb_build_object(
      'database_bytes', pg_database_size(current_database()),
      'database_limit_bytes', 500 * 1024 * 1024,
      'files_bytes', (select coalesce(sum((o.metadata ->> 'size')::bigint), 0) from storage.objects o),
      'files_limit_bytes', 1024 * 1024 * 1024,
      'tenants', (select count(*) from public.tenants)));
  end if;
  return v;
end $$;
revoke all on function public.system_health() from public, anon;
grant execute on function public.system_health() to authenticated;

-- fenced like every other function (see 0022)
grant create on schema public to app_definer;
alter function public.recent_app_errors(integer) owner to app_definer;
revoke create on schema public from app_definer;

-- -----------------------------------------------------------------------------
-- Check
-- -----------------------------------------------------------------------------
do $$
declare v text;
begin
  select string_agg(p.proname, ', ') into v
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.prosecdef
     and pg_get_userbyid(p.proowner) <> 'app_definer'
     and p.proname not in (select * from public.platform_definer_allowlist());
  if v is not null then raise exception '0025 check failed: owner-rights outside the fence: %', v; end if;
  if has_schema_privilege('authenticated', 'ops', 'USAGE') or has_schema_privilege('anon', 'ops', 'USAGE') then
    raise exception '0025 check failed: the ops schema must not be reachable from the API';
  end if;
  if has_function_privilege('anon', 'public.report_app_error(text, text, text, text, text, uuid, uuid)', 'execute') then
    raise exception '0025 check failed: anonymous callers must not write the error log';
  end if;
  if has_schema_privilege('app_definer', 'public', 'CREATE') then
    raise exception '0025 check failed: app_definer must not be able to create objects';
  end if;
end $$;
