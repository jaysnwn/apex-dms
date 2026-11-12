-- =============================================================================
-- ROLLBACK of 0027 (rate limits) back to 0026. One transaction. No business data.
-- Run before 20261110000026_to_0025_down.sql if going further back.
-- =============================================================================
drop function public.rate_limit_hit(text, integer, integer);
drop table ops.rate_limits;
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
