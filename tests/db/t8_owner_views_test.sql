-- =============================================================================
-- The nine owner-rights views, role by role (audit finding 7).
--
-- These views run with owner rights, so the only thing standing between a
-- login and the rows is the rule written inside the view itself. The audit
-- called that a hand-written security boundary and asked for a test per view,
-- because a missing role check would hand out purchase costs and margins.
--
-- Tenant separation for these views is covered generically by
-- t2_tenant_isolation_test.sql (iso.check_views loops over every view and
-- every uuid column). This file covers the other half: WHICH ROLE may read
-- each view, pinned to the rule each view states today, so that removing a
-- role check turns this test red instead of going unnoticed.
--
-- Users come from the shared fixtures (see m0_security_test.sql):
--   ...0001 super_admin   ...0002 manager   ...0003 billing
--   ...0004 warehouse     ...0005 salesman (route: Sangamner City)
--   ...0009 a signed-in stranger who belongs to no business
-- =============================================================================

create schema if not exists ov;

-- This file runs after the tenant tests, which add a second business and
-- switch memberships on and off. So rather than rely on what they left
-- behind, make sure each user this file signs in as is an active member of
-- APEX TRADING CO. with the role the fixtures gave them, and that the
-- stranger is a member of nothing.
set role postgres;
do $$
declare v_apex uuid := 'a9e70000-0000-4000-8000-000000000001';
begin
  if not exists (select 1 from public.tenants where id = v_apex) then
    raise exception 't8: APEX TRADING CO. is missing, so there is nothing to test against';
  end if;
  insert into public.tenant_members (tenant_id, user_id, role, is_active)
  select v_apex, p.id, p.role, true
    from public.profiles p
   where p.id in ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002',
                  '00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000004',
                  '00000000-0000-0000-0000-000000000005')
  on conflict (tenant_id, user_id) do update set is_active = true, role = excluded.role;
  update public.profiles set default_tenant_id = v_apex
   where id in ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002',
                '00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000004',
                '00000000-0000-0000-0000-000000000005');
  -- the stranger must belong to no business at all
  delete from public.tenant_members where user_id = '00000000-0000-0000-0000-000000000009';
end $$;
reset role;

-- Rows a given user can read from a given view. Runs the count as that user
-- and gives back -1 when the view refuses the user outright (no permission),
-- so "refused" and "allowed but empty" stay distinguishable.
create or replace function ov.rows_for(p_user text, p_view text) returns bigint
language plpgsql as $$
declare n bigint;
begin
  perform set_config('request.jwt.claim.sub', p_user, false);
  perform set_config('request.headers', '{}', false);
  execute 'set local role authenticated';
  begin
    execute format('select count(*) from public.%I', p_view) into n;
  exception
    when insufficient_privilege then n := -1;
  end;
  execute 'reset role';
  return n;
end $$;

-- The rule each view states today. "cost" marks the views that carry purchase
-- cost or margin: those are the ones the audit was most worried about.
create table ov.expected (view_name text, role_name text, user_id text, may_read boolean, note text);
insert into ov.expected values
  -- catalog: any active user of the business, own brands only
  ('catalog',           'super_admin', '00000000-0000-0000-0000-000000000001', true,  'active user'),
  ('catalog',           'salesman',    '00000000-0000-0000-0000-000000000005', true,  'active user'),
  ('catalog',           'stranger',    '00000000-0000-0000-0000-000000000009', false, 'not a member'),
  -- stock_on_hand: any active user, own brands only
  ('stock_on_hand',     'super_admin', '00000000-0000-0000-0000-000000000001', true,  'active user'),
  ('stock_on_hand',     'salesman',    '00000000-0000-0000-0000-000000000005', true,  'active user'),
  ('stock_on_hand',     'stranger',    '00000000-0000-0000-0000-000000000009', false, 'not a member'),
  -- product_stock: any active user, own brands only
  ('product_stock',     'super_admin', '00000000-0000-0000-0000-000000000001', true,  'active user'),
  ('product_stock',     'salesman',    '00000000-0000-0000-0000-000000000005', true,  'active user'),
  ('product_stock',     'stranger',    '00000000-0000-0000-0000-000000000009', false, 'not a member'),
  -- sales_costs: COST. super_admin, manager, billing only
  ('sales_costs',       'super_admin', '00000000-0000-0000-0000-000000000001', true,  'cost'),
  ('sales_costs',       'manager',     '00000000-0000-0000-0000-000000000002', true,  'cost'),
  ('sales_costs',       'billing',     '00000000-0000-0000-0000-000000000003', true,  'cost'),
  ('sales_costs',       'warehouse',   '00000000-0000-0000-0000-000000000004', false, 'cost: warehouse must not see margin'),
  ('sales_costs',       'salesman',    '00000000-0000-0000-0000-000000000005', false, 'cost: salesman must not see margin'),
  ('sales_costs',       'stranger',    '00000000-0000-0000-0000-000000000009', false, 'cost'),
  -- purchase_receipts: COST. super_admin, manager, billing, warehouse
  ('purchase_receipts', 'super_admin', '00000000-0000-0000-0000-000000000001', true,  'cost'),
  ('purchase_receipts', 'manager',     '00000000-0000-0000-0000-000000000002', true,  'cost'),
  ('purchase_receipts', 'billing',     '00000000-0000-0000-0000-000000000003', true,  'cost'),
  ('purchase_receipts', 'warehouse',   '00000000-0000-0000-0000-000000000004', true,  'cost: warehouse receives goods'),
  ('purchase_receipts', 'salesman',    '00000000-0000-0000-0000-000000000005', false, 'cost: salesman must not see purchase cost'),
  ('purchase_receipts', 'stranger',    '00000000-0000-0000-0000-000000000009', false, 'cost'),
  -- stock_ledger: COST (unit cost per movement). no salesman
  ('stock_ledger',      'super_admin', '00000000-0000-0000-0000-000000000001', true,  'cost'),
  ('stock_ledger',      'manager',     '00000000-0000-0000-0000-000000000002', true,  'cost'),
  ('stock_ledger',      'billing',     '00000000-0000-0000-0000-000000000003', true,  'cost'),
  ('stock_ledger',      'warehouse',   '00000000-0000-0000-0000-000000000004', true,  'cost'),
  ('stock_ledger',      'salesman',    '00000000-0000-0000-0000-000000000005', false, 'cost: salesman must not see unit cost'),
  ('stock_ledger',      'stranger',    '00000000-0000-0000-0000-000000000009', false, 'cost'),
  -- sales_register: office roles, or a salesman for his own retailers
  ('sales_register',    'super_admin', '00000000-0000-0000-0000-000000000001', true,  'office'),
  ('sales_register',    'manager',     '00000000-0000-0000-0000-000000000002', true,  'office'),
  ('sales_register',    'billing',     '00000000-0000-0000-0000-000000000003', true,  'office'),
  ('sales_register',    'warehouse',   '00000000-0000-0000-0000-000000000004', true,  'office'),
  ('sales_register',    'stranger',    '00000000-0000-0000-0000-000000000009', false, 'not a member'),
  -- expense_list: active user, and only the expenses that person may see
  ('expense_list',      'super_admin', '00000000-0000-0000-0000-000000000001', true,  'active user'),
  ('expense_list',      'stranger',    '00000000-0000-0000-0000-000000000009', false, 'not a member');

-- fixtures: one invoice with a line, one received purchase, one expense, so
-- that "allowed" can show a row rather than an empty answer either way.
-- The save/confirm functions check the signed-in role, so the fixtures are
-- made as the Super Administrator, exactly as the office would make them.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
select set_config('request.headers', '{}', false);
set role authenticated;

do $$
declare v_brand uuid; v_prod uuid; v_wh uuid; v_ret uuid; v_sup uuid; v_order uuid; v_inv uuid; v_pur uuid; v_route uuid;
begin
  select id into v_brand from public.brands order by name limit 1;
  select id into v_prod  from public.products where brand_id = v_brand order by created_at limit 1;
  select id into v_wh    from public.warehouses where brand_id = v_brand limit 1;
  select id into v_ret   from public.retailers where salesman_id = '00000000-0000-0000-0000-000000000005' limit 1;
  if v_prod is null or v_wh is null or v_ret is null then
    raise notice 't8: fixtures incomplete (product/warehouse/retailer), the counts below only check permission';
    return;
  end if;

  -- stock to sell
  insert into public.stock_movements (product_id, warehouse_id, movement_type, qty, reason)
  values (v_prod, v_wh, 'opening', 50, 't8 fixture');

  -- a purchase, received, so purchase_receipts has a row
  select id into v_sup from public.suppliers where brand_id = v_brand limit 1;
  if v_sup is null then
    insert into public.suppliers (name, brand_id) values ('T8 Supplier', v_brand) returning id into v_sup;
  end if;
  select public.save_purchase(null, v_sup, v_wh, current_date, null, 30, 0, 't8',
    jsonb_build_array(jsonb_build_object('product_id', v_prod, 'qty', 10, 'unit_cost', 900))) into v_pur;
  perform public.receive_purchase(v_pur, 'T8-BILL-1', current_date, current_date, false);

  -- an invoice, so sales_register and sales_costs have a row
  select public.save_quotation(null, v_ret, 30, 't8', jsonb_build_array(
    jsonb_build_object('product_id', v_prod, 'qty', 2)), null) into v_order;
  select public.confirm_order(v_order, true, true) into v_inv;

end $$;

reset role;
select set_config('request.jwt.claim.sub', '', false);

-- An expense, so expense_list has a row. The category has to be looked up as
-- the service role, because a signed-in login cannot read expense_categories;
-- a temp table carries the ids across, and the expense itself is then saved
-- through expense_save, so it is numbered and checked like any other.
set role postgres;
-- Scoped to APEX TRADING CO. on purpose: this runs as the service role, which
-- sees every business, and the tenant tests have left a second one behind.
create temp table ov_fix as
select (select id from public.expense_categories
         where not route_required and is_active
           and tenant_id = 'a9e70000-0000-4000-8000-000000000001'
         order by sort_order, name limit 1) as cat_id,
       (select id from public.brands
         where tenant_id = 'a9e70000-0000-4000-8000-000000000001' order by name limit 1) as brand_id,
       (select id from public.routes
         where tenant_id = 'a9e70000-0000-4000-8000-000000000001' order by name limit 1) as route_id;
grant select on ov_fix to authenticated;
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
select set_config('request.headers', '{}', false);
set role authenticated;
do $$
declare f record;
begin
  select * into f from ov_fix;
  if f.cat_id is null then raise exception 't8: no expense category that works without a route'; end if;
  perform public.expense_save(null, '00000000-0000-0000-0000-000000000005', f.cat_id, 250,
    current_date, f.route_id, f.brand_id, 't8 fixture', 'cash', 'employee', null, null,
    true, null, 'office');
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);

-- the checks -----------------------------------------------------------------
do $$
declare r record; n bigint; v_fail int := 0; v_checked int := 0;
begin
  for r in select * from ov.expected order by view_name, role_name loop
    n := ov.rows_for(r.user_id, r.view_name);
    v_checked := v_checked + 1;
    if r.may_read then
      -- allowed: the view must not refuse the user
      if n = -1 then
        raise warning 't8 FAIL %.% (%): refused, but this role may read it', r.view_name, r.role_name, r.note;
        v_fail := v_fail + 1;
      end if;
    else
      -- not allowed: the view must give this user nothing at all
      if n <> 0 and n <> -1 then
        raise warning 't8 FAIL %.% (%): % rows visible, expected none', r.view_name, r.role_name, r.note, n;
        v_fail := v_fail + 1;
      end if;
    end if;
  end loop;

  if v_fail > 0 then
    raise exception 't8: % of % view/role rules are broken (see the warnings above)', v_fail, v_checked;
  end if;

  -- A view with no rows at all would pass every "sees nothing" rule above
  -- without proving anything. So each view must show at least one row to at
  -- least one role that is allowed to read it.
  for r in select distinct view_name from ov.expected loop
    if not exists (
      select 1 from ov.expected e
       where e.view_name = r.view_name and e.may_read
         and ov.rows_for(e.user_id, e.view_name) > 0
    ) then
      raise exception 't8: no allowed role sees any row of %, so the rules for it prove nothing; fix the fixtures', r.view_name;
    end if;
  end loop;

  raise notice 't8: % view/role rules hold, each on a view with rows in it', v_checked;
end $$;

-- stock_reserved is a helper for product_stock and 0030 closed it to logins.
do $$ begin
  if has_table_privilege('authenticated', 'public.stock_reserved', 'select') then
    raise exception 't8: stock_reserved must not be readable by a signed-in user';
  end if;
  if not has_table_privilege('app_definer', 'public.stock_reserved', 'select') then
    raise exception 't8: stock_reserved must stay readable by app_definer';
  end if;
end $$;

-- every one of the nine is accounted for above
do $$
declare v_missing text;
begin
  select string_agg(v, ', ') into v_missing
    from unnest(array['catalog','stock_on_hand','stock_reserved','product_stock','sales_register',
                      'sales_costs','purchase_receipts','stock_ledger','expense_list']) v
   where v <> 'stock_reserved'
     and v not in (select view_name from ov.expected);
  if v_missing is not null then
    raise exception 't8: no role rules written for %', v_missing;
  end if;
end $$;

drop schema ov cascade;
select 'ALL OWNER-RIGHTS VIEW TESTS PASSED' as result;
