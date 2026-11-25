-- =============================================================================
-- ROLLBACK of 0036 back to 0035. Run as ONE transaction.
-- Removing a member (0036) is undone as a feature; who removed whom (removed_at,
-- removed_by) is lost, and removed members stay inactive.
-- =============================================================================
drop function if exists public.remove_member(uuid);
drop policy if exists definer_tenant_fence_delete on public.tenant_members;
CREATE OR REPLACE FUNCTION public.add_member(p_email text, p_role app_role)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_tenant uuid := public.current_tenant_id();
  v_user   uuid;
begin
  if not public.has_role('super_admin') then
    raise exception 'Only the Super Admin manages users' using errcode = '42501';
  end if;
  v_user := public.find_user_id_by_email(p_email);
  if v_user is null then
    return null;                               -- no login yet: the app creates one
  end if;
  if exists (select 1 from public.tenant_members where tenant_id = v_tenant and user_id = v_user) then
    raise exception 'This person is already a user of this organization.' using errcode = 'P0001';
  end if;
  insert into public.tenant_members (tenant_id, user_id, role, is_active, created_by)
  values (v_tenant, v_user, p_role, true, auth.uid());
  return v_user;
end $function$
;

CREATE OR REPLACE FUNCTION public.list_members()
 RETURNS TABLE(id uuid, full_name text, email text, phone text, role app_role, is_active boolean, can_reimburse boolean, created_at timestamp with time zone, shared boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.has_role('super_admin') then
    raise exception 'Only the Super Admin manages users' using errcode = '42501';
  end if;
  return query
    select p.id, p.full_name, p.email, p.phone, m.role, m.is_active, m.can_reimburse, m.created_at,
           public.member_tenant_count(p.id) > 1
      from public.tenant_members m
      join public.profiles p on p.id = m.user_id
     where m.tenant_id = public.current_tenant_id()
     order by m.is_active desc, p.full_name;
end $function$
;

alter table public.tenant_members drop column if exists removed_by;
alter table public.tenant_members drop column if exists removed_at;
