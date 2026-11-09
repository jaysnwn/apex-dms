-- =============================================================================
-- Multi-tenant platform (M-T3): database support for the app.
--
--   * tenant_public_profile(slug): the business name for its branded login
--     page (/login/<slug>), callable before signing in; nothing else is shown
--   * member management, always inside the current tenant, Super Admin only:
--       list_members()          people of this business, role and status here
--       set_member(...)         role / active / reimburse in THIS business;
--                               name and phone only for people who work for no
--                               other business (they are one global identity)
--       add_member(email, role) an existing login joins this business
--       password_reset_allowed(user)  true only for people who work for this
--                               business and no other one, so an admin can
--                               never take over a login that opens another
--                               business
--   * cross-tenant facts these need (does this email exist, how many
--     businesses does this person work for) come from two postgres-owned
--     helpers that are NOT callable from the API.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Allow-list of functions that stay with postgres (replaces 0022's)
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
    'rls_auto_enable'                                                  -- Supabase-managed
  ])
$$;
revoke all on function public.platform_definer_allowlist() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. Branded login page
-- -----------------------------------------------------------------------------
create or replace function public.tenant_public_profile(p_slug text)
returns table (slug text, display_name text)
language sql stable security definer set search_path = public as $$
  select t.slug, t.display_name from public.tenants t
   where t.slug = lower(trim(p_slug)) and t.status in ('trial', 'active')
$$;
revoke all on function public.tenant_public_profile(text) from public;
grant execute on function public.tenant_public_profile(text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. Cross-tenant helpers (postgres-owned, NOT granted to anyone)
-- -----------------------------------------------------------------------------
create or replace function public.member_tenant_count(p_user uuid)
returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.tenant_members m where m.user_id = p_user
$$;
revoke all on function public.member_tenant_count(uuid) from public, anon, authenticated;
grant execute on function public.member_tenant_count(uuid) to app_definer;

create or replace function public.find_user_id_by_email(p_email text)
returns uuid
language sql stable security definer set search_path = public as $$
  select u.id from auth.users u where lower(u.email) = lower(trim(p_email)) limit 1
$$;
revoke all on function public.find_user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.find_user_id_by_email(text) to app_definer;

-- app_definer may add and change memberships of the current tenant only
create policy definer_tenant_fence_insert on public.tenant_members for insert to app_definer
  with check (tenant_id = (select public.current_tenant_id()));
create policy definer_tenant_fence_update on public.tenant_members for update to app_definer
  using (tenant_id = (select public.current_tenant_id()))
  with check (tenant_id = (select public.current_tenant_id()));

-- -----------------------------------------------------------------------------
-- 4. Member management (fenced: owned by app_definer)
-- -----------------------------------------------------------------------------
create or replace function public.list_members()
returns table (id uuid, full_name text, email text, phone text, role public.app_role, is_active boolean,
               can_reimburse boolean, created_at timestamptz, shared boolean)
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
     where m.tenant_id = public.current_tenant_id()
     order by m.is_active desc, p.full_name;
end $$;

create or replace function public.set_member(p_user uuid, p_role public.app_role, p_active boolean,
                                             p_can_reimburse boolean, p_full_name text, p_phone text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_name   text := nullif(trim(coalesce(p_full_name, '')), '');
  v_phone  text := nullif(trim(coalesce(p_phone, '')), '');
  p        public.profiles%rowtype;
begin
  if not public.has_role('super_admin') then
    raise exception 'Only the Super Admin manages users' using errcode = '42501';
  end if;
  if not exists (select 1 from public.tenant_members where tenant_id = v_tenant and user_id = p_user) then
    raise exception 'This person is not a member of this organization' using errcode = 'P0002';
  end if;
  if p_user = auth.uid() and not coalesce(p_active, true) then
    raise exception 'You cannot disable your own account.' using errcode = 'P0001';
  end if;

  update public.tenant_members
     set role = p_role, is_active = coalesce(p_active, true),
         can_reimburse = coalesce(p_can_reimburse, false) and p_role in ('manager', 'billing')
   where tenant_id = v_tenant and user_id = p_user;

  -- Name and phone belong to the person, not to one business: only changed
  -- here when they work for this business alone.
  select * into p from public.profiles where id = p_user;
  if (v_name is distinct from nullif(p.full_name, '') or v_phone is distinct from p.phone) then
    if public.member_tenant_count(p_user) > 1 then
      raise exception 'This person also works for another organization; only they can change their name and phone.'
        using errcode = 'P0001';
    end if;
    if v_name is null then raise exception 'Enter the full name' using errcode = 'P0001'; end if;
    update public.profiles set full_name = v_name, phone = v_phone where id = p_user;
  end if;
end $$;

create or replace function public.add_member(p_email text, p_role public.app_role)
returns uuid
language plpgsql security definer set search_path = public as $$
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
end $$;

create or replace function public.password_reset_allowed(p_user uuid)
returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_role('super_admin') then
    raise exception 'Only the Super Admin manages users' using errcode = '42501';
  end if;
  return exists (select 1 from public.tenant_members
                  where tenant_id = public.current_tenant_id() and user_id = p_user)
     and public.member_tenant_count(p_user) = 1;
end $$;

revoke all on function public.list_members(), public.set_member(uuid, public.app_role, boolean, boolean, text, text),
                       public.add_member(text, public.app_role), public.password_reset_allowed(uuid) from public, anon;
grant execute on function public.list_members(), public.set_member(uuid, public.app_role, boolean, boolean, text, text),
                          public.add_member(text, public.app_role), public.password_reset_allowed(uuid) to authenticated;

-- hand them to app_definer (CREATE on the schema only for the hand-over)
grant create on schema public to app_definer;
alter function public.list_members() owner to app_definer;
alter function public.set_member(uuid, public.app_role, boolean, boolean, text, text) owner to app_definer;
alter function public.add_member(text, public.app_role) owner to app_definer;
alter function public.password_reset_allowed(uuid) owner to app_definer;
revoke create on schema public from app_definer;

-- -----------------------------------------------------------------------------
-- 5. People lists in the app: a person with their role and status in the
--    current business (fenced view from 0022). Replaces reading role /
--    is_active from profiles, which are one per person, not per business.
-- -----------------------------------------------------------------------------
grant select on public.tenant_people to authenticated;

-- -----------------------------------------------------------------------------
-- 6. Uploads in the tenant folder: '<tenant_id>/<user_id>/file'
--    expense_save, reimburse_expenses and visit_check_out accepted a file only
--    if its first folder was the user's id. The app now uploads into the
--    organization's folder, so they check with is_own_upload(): the file
--    belongs to the current business AND to the caller's own folder. Files
--    from before multi-tenancy ('<user_id>/file') still count as Apex's.
--    The 0023 source of each function is kept for the rollback.
-- -----------------------------------------------------------------------------
create or replace function public.is_own_upload(p_path text)
returns boolean
language sql stable set search_path = public as $$
  select p_path is not null
     and p_path !~ '(^/|\.\.)'
     and public.storage_object_tenant(p_path) = public.current_tenant_id()
     and public.storage_user_folder(p_path) = auth.uid()::text
$$;
revoke all on function public.is_own_upload(text) from public, anon;
grant execute on function public.is_own_upload(text) to authenticated, app_definer;
-- the three functions run as app_definer and call the storage helpers
grant execute on function public.storage_object_tenant(text), public.storage_user_folder(text) to app_definer;

create table mt_rollback.function_src_0024 (sig text primary key, src text not null);
insert into mt_rollback.function_src_0024
select p.oid::regprocedure::text, pg_get_functiondef(p.oid)
  from pg_proc p
 where p.oid in ('public.expense_save(uuid, uuid, uuid, numeric, date, uuid, uuid, text, text, text, text, text, boolean, uuid, text)'::regprocedure,
                 'public.reimburse_expenses(jsonb, date, public.payment_method, text, text, text, uuid)'::regprocedure,
                 'public.visit_check_out(uuid, uuid, numeric, numeric, numeric, text, text, timestamp with time zone, uuid)'::regprocedure);
do $$
begin
  if (select count(*) from mt_rollback.function_src_0024) <> 3 then
    raise exception 'M-T3: upload functions not found; update migration 0024';
  end if;
end $$;

do $$
declare
  r record;
  v_src text;
begin
  for r in select * from (values
    ('public.expense_save(uuid, uuid, uuid, numeric, date, uuid, uuid, text, text, text, text, text, boolean, uuid, text)',
     'if p_receipt_path is not null and split_part(p_receipt_path, ''/'', 1) <> v_uid::text then',
     'if p_receipt_path is not null and not public.is_own_upload(p_receipt_path) then'),
    ('public.expense_save(uuid, uuid, uuid, numeric, date, uuid, uuid, text, text, text, text, text, boolean, uuid, text)',
     'and split_part(p_receipt_path, ''/'', 1) <> v_uid::text then',
     'and not public.is_own_upload(p_receipt_path) then'),
    ('public.reimburse_expenses(jsonb, date, public.payment_method, text, text, text, uuid)',
     'if p_proof_path is not null and split_part(p_proof_path, ''/'', 1) <> auth.uid()::text then',
     'if p_proof_path is not null and not public.is_own_upload(p_proof_path) then'),
    ('public.visit_check_out(uuid, uuid, numeric, numeric, numeric, text, text, timestamp with time zone, uuid)',
     'if p_photo_path is not null and split_part(p_photo_path, ''/'', 1) <> auth.uid()::text then',
     'if p_photo_path is not null and not public.is_own_upload(p_photo_path) then')
  ) as x(fn, old_text, new_text) loop
    v_src := pg_get_functiondef(r.fn::regprocedure);
    if (length(v_src) - length(replace(v_src, r.old_text, ''))) / length(r.old_text) <> 1 then
      raise exception 'M-T3: % does not contain the expected line exactly once; update migration 0024', r.fn;
    end if;
    execute replace(v_src, r.old_text, r.new_text);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 7. Check
-- -----------------------------------------------------------------------------
do $$
declare v text;
begin
  select string_agg(p.proname, ', ') into v
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.prosecdef
     and pg_get_userbyid(p.proowner) <> 'app_definer'
     and p.proname not in (select * from public.platform_definer_allowlist());
  if v is not null then raise exception 'M-T3 check failed: owner-rights outside the fence: %', v; end if;
  if has_function_privilege('authenticated', 'public.member_tenant_count(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.find_user_id_by_email(text)', 'execute')
     or has_function_privilege('anon', 'public.find_user_id_by_email(text)', 'execute') then
    raise exception 'M-T3 check failed: cross-tenant helpers must not be callable from the API';
  end if;
  select string_agg(sig, ', ') into v
    from mt_rollback.function_src_0024 b
   where pg_get_functiondef(b.sig::regprocedure) ~ 'split_part\(p_(receipt|proof|photo)_path'
      or pg_get_userbyid((select proowner from pg_proc where oid = b.sig::regprocedure)) <> 'app_definer';
  if v is not null then raise exception 'M-T3 check failed: upload check not patched or owner changed: %', v; end if;
  if has_schema_privilege('app_definer', 'public', 'CREATE') then
    raise exception 'M-T3 check failed: app_definer must not be able to create objects';
  end if;
end $$;
