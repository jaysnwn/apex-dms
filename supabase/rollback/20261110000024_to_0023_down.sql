-- =============================================================================
-- ROLLBACK of 0024 (app support) back to 0023. One transaction. Data untouched
-- (memberships added through add_member stay; they are ordinary rows).
-- Run before 20261110000023_to_0021_down.sql if going further back.
-- =============================================================================
-- upload checks: the 0023 source of each function, then the helper
do $$
declare r record;
begin
  for r in select src from mt_rollback.function_src_0024 loop execute r.src; end loop;
end $$;
drop table mt_rollback.function_src_0024;
drop function public.is_own_upload(text);
revoke execute on function public.storage_object_tenant(text), public.storage_user_folder(text) from app_definer;

revoke select on public.tenant_people from authenticated;
drop function public.list_members();
drop function public.set_member(uuid, public.app_role, boolean, boolean, text, text);
drop function public.add_member(text, public.app_role);
drop function public.password_reset_allowed(uuid);
drop function public.member_tenant_count(uuid);
drop function public.find_user_id_by_email(text);
drop function public.tenant_public_profile(text);
drop policy definer_tenant_fence_insert on public.tenant_members;
drop policy definer_tenant_fence_update on public.tenant_members;

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
