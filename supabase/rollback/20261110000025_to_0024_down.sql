-- =============================================================================
-- ROLLBACK of 0025 (error log, health summary) back to 0024. One transaction.
-- No business data involved; the error log is removed with its schema.
-- Run before 20261110000024_to_0023_down.sql if going further back.
-- =============================================================================
drop function public.system_health();
drop function public.recent_app_errors(integer);
drop function public.report_app_error(text, text, text, text, text, uuid, uuid);
drop schema ops cascade;
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
    'rls_auto_enable'                                                  -- Supabase-managed
  ])
$$;
revoke all on function public.platform_definer_allowlist() from public, anon, authenticated;
