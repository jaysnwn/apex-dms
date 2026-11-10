-- =============================================================================
-- Rate limits for sign-in and other sensitive actions (no business data).
--
-- Supabase's own sign-in limits are per IP address and generous. The app now
-- also counts attempts per email, per IP and per person in a small table
-- outside the API (ops.rate_limits), through rate_limit_hit(), which only the
-- server (service key) can call. Fixed windows: the first hit opens a window;
-- after p_max hits inside it, the action is refused until it ends.
-- Rows older than a day are removed as new ones arrive.
-- =============================================================================

create table ops.rate_limits (
  key           text primary key,
  window_start  timestamptz not null,
  hits          integer not null
);
alter table ops.rate_limits enable row level security;   -- no policies: the function below only

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
    'rate_limit_hit',                                                  -- server only, before sign-in (0027)
    'rls_auto_enable'                                                  -- Supabase-managed
  ])
$$;
revoke all on function public.platform_definer_allowlist() from public, anon, authenticated;

-- true = allowed, false = too many in this window
create or replace function public.rate_limit_hit(p_key text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql security definer set search_path = public, ops as $$
declare
  v_hits integer;
  v_window interval := make_interval(secs => greatest(coalesce(p_window_seconds, 60), 1));
begin
  insert into ops.rate_limits as r (key, window_start, hits)
  values (left(p_key, 200), now(), 1)
  on conflict (key) do update
    set hits         = case when r.window_start < now() - v_window then 1 else r.hits + 1 end,
        window_start = case when r.window_start < now() - v_window then now() else r.window_start end
  returning hits into v_hits;
  if random() < 0.01 then
    delete from ops.rate_limits where window_start < now() - interval '1 day';
  end if;
  return v_hits <= greatest(coalesce(p_max, 1), 1);
end $$;
revoke all on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;

do $$
declare v text;
begin
  select string_agg(p.proname, ', ') into v
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.prosecdef
     and pg_get_userbyid(p.proowner) <> 'app_definer'
     and p.proname not in (select * from public.platform_definer_allowlist());
  if v is not null then raise exception '0027 check failed: owner-rights outside the fence: %', v; end if;
  if has_function_privilege('authenticated', 'public.rate_limit_hit(text, integer, integer)', 'execute')
     or has_function_privilege('anon', 'public.rate_limit_hit(text, integer, integer)', 'execute') then
    raise exception '0027 check failed: rate_limit_hit must be server-only';
  end if;
end $$;
