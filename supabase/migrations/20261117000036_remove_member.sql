-- Remove a user from this organization.
--
-- Someone with no history here is deleted outright. Someone who has created
-- invoices, collected payments, made visits, etc. cannot be deleted without
-- breaking those records, so they are removed instead: no access, hidden from
-- the user list, their name kept on the old records. Adding the same email
-- again brings them back.

alter table public.tenant_members add column if not exists removed_at timestamptz;
alter table public.tenant_members add column if not exists removed_by uuid references auth.users(id);

-- app_definer may delete memberships of the current tenant only (same fence as
-- its insert / update rights in 0024).
drop policy if exists definer_tenant_fence_delete on public.tenant_members;
create policy definer_tenant_fence_delete on public.tenant_members for delete to app_definer
  using (tenant_id = (select public.current_tenant_id()));

create or replace function public.remove_member(p_user uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_n      integer;
begin
  if not public.has_role('super_admin') then
    raise exception 'Only the Super Admin manages users' using errcode = '42501';
  end if;
  if p_user = auth.uid() then
    raise exception 'You cannot remove yourself.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.tenant_members where tenant_id = v_tenant and user_id = p_user and removed_at is null) then
    raise exception 'This person is not a user of this organization' using errcode = 'P0002';
  end if;

  delete from public.profile_brands where tenant_id = v_tenant and user_id = p_user;
  begin
    delete from public.tenant_members where tenant_id = v_tenant and user_id = p_user;
    get diagnostics v_n = row_count;
    if v_n = 1 then return 'deleted'; end if;
    raise foreign_key_violation;               -- not deleted: fall back to removing
  exception when foreign_key_violation then
    -- has history here: keep the row for the records, take every access away
    update public.tenant_members
       set is_active = false, can_reimburse = false, removed_at = now(), removed_by = auth.uid()
     where tenant_id = v_tenant and user_id = p_user;
    get diagnostics v_n = row_count;
    if v_n <> 1 then raise exception 'Could not remove this user' using errcode = 'P0001'; end if;
    return 'removed';
  end;
end $$;
revoke all on function public.remove_member(uuid) from public, anon;
grant execute on function public.remove_member(uuid) to authenticated;

create or replace function public.list_members()
returns table(id uuid, full_name text, email text, phone text, role app_role, is_active boolean, can_reimburse boolean, created_at timestamptz, shared boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_role('super_admin') then
    raise exception 'Only the Super Admin manages users' using errcode = '42501';
  end if;
  return query
    select p.id, p.full_name, p.email, p.phone, m.role, m.is_active, m.can_reimburse, m.created_at,
           public.member_tenant_count(p.id) > 1
      from public.tenant_members m
      join public.profiles p on p.id = m.user_id
     where m.tenant_id = public.current_tenant_id() and m.removed_at is null
     order by m.is_active desc, p.full_name;
end $$;

create or replace function public.add_member(p_email text, p_role app_role)
returns uuid language plpgsql security definer set search_path = public as $$
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
  if exists (select 1 from public.tenant_members where tenant_id = v_tenant and user_id = v_user and removed_at is not null) then
    update public.tenant_members
       set role = p_role, is_active = true, removed_at = null, removed_by = null
     where tenant_id = v_tenant and user_id = v_user;
    return v_user;                             -- a removed user brought back
  end if;
  if exists (select 1 from public.tenant_members where tenant_id = v_tenant and user_id = v_user) then
    raise exception 'This person is already a user of this organization.' using errcode = 'P0001';
  end if;
  insert into public.tenant_members (tenant_id, user_id, role, is_active, created_by)
  values (v_tenant, v_user, p_role, true, auth.uid());
  return v_user;
end $$;

grant create on schema public to app_definer;
alter function public.remove_member(uuid) owner to app_definer;
revoke create on schema public from app_definer;

do $$
begin
  if not exists (select 1 from pg_attribute where attrelid = 'public.tenant_members'::regclass and attname = 'removed_at') then
    raise exception '0036: tenant_members.removed_at missing';
  end if;
  if exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prosecdef
               and pg_get_userbyid(p.proowner) <> 'app_definer'
               and p.proname not in (select * from public.platform_definer_allowlist())) then
    raise exception '0036 check failed: owner-rights function outside the fence';
  end if;
end $$;
