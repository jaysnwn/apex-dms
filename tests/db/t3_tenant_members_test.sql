-- =============================================================================
-- M-T3 tests: member management inside one tenant (0024).
-- Runs after t1 and t2 (uses Apex fixtures and ISO from t2).
--   * branded login lookup shows only an open tenant's name, to anyone
--   * the Super Admin sees and changes only their own business's people
--   * a person shared with another business keeps their name / phone and
--     password out of this business's reach
--   * an existing login can be added to a second business
--   * the cross-tenant helpers are not callable from the API
-- =============================================================================
\set ON_ERROR_STOP 1

-- a person who works for Apex (billing) and for ISO (salesman)
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('e1000000-0000-4000-8000-000000000001', 'shared@both.test',
   '{"role":"salesman","tenant_id":"c0000000-0000-4000-8000-00000000000c"}', '{"full_name":"Shared Person"}');
insert into public.tenant_members (tenant_id, user_id, role)
values ('a9e70000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 'billing');

-- ---------- Branded login lookup (no login needed) ----------
select set_config('request.jwt.claim.sub', '', false);
set role anon;
do $$ begin
  assert (select display_name from public.tenant_public_profile('APEX')) = 'APEX TRADING CO.', 'login page finds Apex by slug';
  assert not exists (select 1 from public.tenant_public_profile('nobody')), 'unknown slug shows nothing';
  begin
    perform public.find_user_id_by_email('owner@iso.test');
    raise exception 'anonymous caller looked up an email';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
update public.tenants set status = 'suspended' where slug = 'iso-dist';
set role anon;
do $$ begin
  assert not exists (select 1 from public.tenant_public_profile('iso-dist')), 'suspended business has no login page';
end $$;
reset role;
update public.tenants set status = 'active' where slug = 'iso-dist';

-- ---------- Apex Super Admin ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
select set_config('request.headers', '{}', false);
set role authenticated;
do $$
declare v_id uuid;
begin
  assert not exists (select 1 from public.list_members() where email like '%@iso.test'), 'Apex list has no ISO-only people';
  assert (select shared from public.list_members() where id = 'e1000000-0000-4000-8000-000000000001'), 'shared person is marked shared';
  assert not (select shared from public.list_members() where id = '00000000-0000-0000-0000-000000000003'), 'Apex-only person is not shared';

  -- role change in Apex leaves the person's ISO role alone
  perform public.set_member('e1000000-0000-4000-8000-000000000001', 'manager', true, false, 'Shared Person', null);
  assert (select role from public.list_members() where id = 'e1000000-0000-4000-8000-000000000001') = 'manager', 'Apex role changed';

  -- a shared person's name and phone are not this business's to change
  begin
    perform public.set_member('e1000000-0000-4000-8000-000000000001', 'manager', true, false, 'Renamed By Apex', null);
    raise exception 'Apex renamed a person who also works for ISO';
  exception when raise_exception then
    if sqlerrm not like '%another organization%' then raise; end if;
  end;
  -- an Apex-only person can be renamed
  perform public.set_member('00000000-0000-0000-0000-000000000003', 'billing', true, false, 'Bina B. Billing', '9822011111');
  assert (select full_name from public.list_members() where id = '00000000-0000-0000-0000-000000000003') = 'Bina B. Billing', 'renamed';

  -- ISO-only people do not exist for Apex
  begin
    perform public.set_member('c1000000-0000-4000-8000-000000000002', 'manager', true, false, 'x', null);
    raise exception 'Apex changed an ISO-only person';
  exception when no_data_found then null;
  end;

  -- password reset: only for people who work for this business alone
  assert public.password_reset_allowed('00000000-0000-0000-0000-000000000003'), 'Apex-only person: reset allowed';
  assert not public.password_reset_allowed('e1000000-0000-4000-8000-000000000001'), 'shared person: reset refused';
  assert not public.password_reset_allowed('c1000000-0000-4000-8000-000000000001'), 'ISO-only person: reset refused';

  -- cannot lock yourself out, cannot remove the last Super Admin
  begin
    perform public.set_member(auth.uid(), 'super_admin', false, false, null, null);
    raise exception 'admin disabled own account';
  exception when raise_exception then
    if sqlerrm not like '%your own account%' then raise; end if;
  end;

  -- an existing login joins Apex
  v_id := public.add_member('owner@iso.test', 'warehouse');
  assert v_id = 'c1000000-0000-4000-8000-000000000001', 'ISO owner added to Apex by email';
  assert (select role from public.list_members() where id = v_id) = 'warehouse', 'joins as warehouse';
  assert public.add_member('nobody-yet@new.test', 'salesman') is null, 'unknown email: app must create the login';
  begin
    perform public.add_member('owner@iso.test', 'warehouse');
    raise exception 'added twice';
  exception when raise_exception then
    if sqlerrm not like '%already a user%' then raise; end if;
  end;

  -- the helpers that see across businesses are not callable here
  begin
    perform public.member_tenant_count(v_id);
    raise exception 'member_tenant_count callable from the API';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- the ISO owner's role in ISO did not change by joining Apex
do $$ begin
  assert (select role from public.tenant_members where user_id = 'c1000000-0000-4000-8000-000000000001'
            and tenant_id = 'c0000000-0000-4000-8000-00000000000c') = 'super_admin', 'ISO role untouched';
  assert (select role from public.tenant_members where user_id = 'e1000000-0000-4000-8000-000000000001'
            and tenant_id = 'c0000000-0000-4000-8000-00000000000c') = 'salesman', 'shared person''s ISO role untouched';
  assert (select full_name from public.profiles where id = 'e1000000-0000-4000-8000-000000000001') = 'Shared Person', 'name untouched';
end $$;

-- ---------- Not a Super Admin ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$ begin
  begin
    perform public.list_members();
    raise exception 'manager listed members';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.set_member('00000000-0000-0000-0000-000000000005', 'manager', true, false, null, null);
    raise exception 'manager changed a role';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- ---------- Last Super Admin of a business ----------
select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000001', false);
select set_config('request.headers', '{"x-tenant-id":"c0000000-0000-4000-8000-00000000000c"}', false);
set role authenticated;
do $$ begin
  assert public.current_tenant_id() = 'c0000000-0000-4000-8000-00000000000c', 'ISO owner picks ISO';
  begin
    perform public.set_member(auth.uid(), 'manager', true, false, null, null);
    raise exception 'last Super Admin demoted';
  exception when raise_exception then
    if sqlerrm not like '%Super Administrator%' then raise; end if;
  end;
end $$;
reset role;
-- ---------- Uploads: own business, own folder ----------
set role authenticated;
do $$
declare
  me  text := auth.uid()::text;
  iso text := 'c0000000-0000-4000-8000-00000000000c';
  apx text := 'a9e70000-0000-4000-8000-000000000001';
begin
  assert public.is_own_upload(iso || '/' || me || '/bill.jpg'), 'ISO file in my folder is mine';
  assert not public.is_own_upload(apx || '/' || me || '/bill.jpg'), 'an Apex file is not ISO''s';
  assert not public.is_own_upload(me || '/bill.jpg'), 'a pre-tenancy file belongs to Apex, not ISO';
  assert not public.is_own_upload(iso || '/00000000-0000-0000-0000-000000000001/bill.jpg'), 'someone else''s folder';
  assert not public.is_own_upload(iso || '/' || me || '/../x.jpg'), 'no ..';
  assert not public.is_own_upload(null), 'no path';
end $$;
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000005', false);
select set_config('request.headers', '{}', false);
set role authenticated;
do $$
declare
  me  text := auth.uid()::text;
  v   jsonb;
begin
  assert public.current_app_role() = 'salesman', 'Apex salesman';
  assert public.is_own_upload('a9e70000-0000-4000-8000-000000000001/' || me || '/bill.jpg'), 'Apex file in my folder';
  assert public.is_own_upload(me || '/bill.jpg'), 'old-style Apex path still accepted';
  -- a receipt in the new tenant folder is accepted by the real function
  v := public.expense_save(null, null, (select id from public.expense_categories where code = 'food'), 120, current_date,
         null, null, 'Lunch', 'cash', 'employee', 'a9e70000-0000-4000-8000-000000000001/' || me || '/lunch.jpg',
         null, false, null, 'salesman_app');
  assert (select receipt_path from public.expenses where id = (v ->> 'id')::uuid) like 'a9e70000-%/lunch.jpg', 'new-style receipt saved';
  begin
    perform public.expense_save(null, null, (select id from public.expense_categories where code = 'food'), 120, current_date,
         null, null, 'Lunch', 'cash', 'employee', 'c0000000-0000-4000-8000-00000000000c/' || me || '/lunch.jpg',
         null, false, null, 'salesman_app');
    raise exception 'receipt from another business accepted';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);
select set_config('request.headers', '', false);

select 'ALL TENANT MEMBER DATABASE TESTS PASSED' as result;
