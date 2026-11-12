-- =============================================================================
-- 0029 / 0030 tests (November 2026 architecture audit). Runs after every other
-- suite, so the database holds sales, purchases, stock and expenses of two
-- brands (CQ, BL) and of a second business (ISO DISTRIBUTORS).
--   * the functions restated in 0029 are all there, fenced and callable
--   * the two reader functions and stock_reserved are not reachable by logins
--   * no view can be written through by an API login
--   * each of the owner-rights views shows a login only what its role, brands
--     and business allow (they bypass row-level security, so the checks inside
--     the views are the only protection: audit finding 7)
-- Logins: …01 Super Admin, …11 warehouse (CQ only), …12 manager (BL only),
--         …05 salesman, …09 inactive, c1…02 salesman of ISO DISTRIBUTORS.
-- =============================================================================
\set ON_ERROR_STOP 1

-- ---------- structure (no login) ----------
do $$
declare v text;
begin
  select string_agg(s, ', ') into v
    from unnest(array[
      'public.start_stock_count(uuid, text)', 'public.confirm_order(uuid, boolean, boolean)',
      'public.create_credit_note(uuid, text, boolean, jsonb)', 'public.save_quotation(uuid, uuid, integer, text, jsonb, uuid)',
      'public.approve_incentives(date, boolean)', 'public.plan_route(uuid, uuid, date, text)',
      'public.record_location(numeric, numeric, numeric, timestamp with time zone)', 'public.route_assign(uuid, uuid, date, text)',
      'public.expense_save(uuid, uuid, uuid, numeric, date, uuid, uuid, text, text, text, text, text, boolean, uuid, text)',
      'public.reimburse_expenses(jsonb, date, public.payment_method, text, text, text, uuid)',
      'public.visit_check_out(uuid, uuid, numeric, numeric, numeric, text, text, timestamp with time zone, uuid)']) s
   where to_regprocedure(s) is null
      or not (select p.prosecdef and p.proowner = 'app_definer'::regrole and p.proconfig = array['search_path=public']
                     and has_function_privilege('authenticated', p.oid, 'execute')
                     and not has_function_privilege('anon', p.oid, 'execute')
                from pg_proc p where p.oid = to_regprocedure(s));
  assert v is null, 'restated functions missing or not fenced: ' || v;

  assert not has_function_privilege('authenticated', 'public.invoice_open_amount(uuid)', 'execute'), 'invoice_open_amount open to logins';
  assert not has_function_privilege('authenticated', 'public.product_available(uuid)', 'execute'), 'product_available open to logins';

  select string_agg(c.relname || ' (' || r.role || ')', ', ') into v
    from pg_class c, unnest(array['anon', 'authenticated']) r(role)
   where c.relnamespace = 'public'::regnamespace and c.relkind = 'v'
     and (has_table_privilege(r.role, c.oid, 'insert') or has_table_privilege(r.role, c.oid, 'update')
          or has_table_privilege(r.role, c.oid, 'delete') or has_table_privilege(r.role, c.oid, 'truncate')
          or (r.role = 'anon' and has_table_privilege(r.role, c.oid, 'select')));
  assert v is null, 'views writable by a login, or readable without signing in: ' || v;

  -- every view without security_invoker is one this file must cover
  select string_agg(c.relname, ', ' order by c.relname) into v
    from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind = 'v'
     and not coalesce(c.reloptions @> array['security_invoker=true'], false)
     and c.relname not in ('catalog', 'stock_on_hand', 'stock_reserved', 'product_stock', 'sales_register',
                           'sales_costs', 'purchase_receipts', 'stock_ledger', 'expense_list', 'tenant_people');
  assert v is null, 'new owner-rights view without access tests in t7_audit_test.sql: ' || v;
end $$;

create temp table seen (who text, obj text, n bigint, primary key (who, obj));
grant all on seen to authenticated;
create temp table brand (code text primary key, id uuid);
insert into brand select code, id from public.brands where tenant_id = 'a9e70000-0000-4000-8000-000000000001' and code in ('CQ', 'BL') and is_active
  on conflict do nothing;
grant select on brand to authenticated;
select set_config('request.headers', '{}', false);
select set_config('request.jwt.claims', '{"role":"authenticated"}', false);

-- ---------- Super Admin: sees both brands everywhere; the fixtures are not empty ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
declare v text;
begin
  insert into seen
  select 'admin', 'catalog', count(*) from public.catalog union all
  select 'admin', 'stock_on_hand', count(*) from public.stock_on_hand union all
  select 'admin', 'product_stock', count(*) from public.product_stock union all
  select 'admin', 'sales_register', count(*) from public.sales_register union all
  select 'admin', 'sales_costs', count(*) from public.sales_costs union all
  select 'admin', 'purchase_receipts', count(*) from public.purchase_receipts union all
  select 'admin', 'stock_ledger', count(*) from public.stock_ledger union all
  select 'admin', 'expense_list', count(*) from public.expense_list;
  select string_agg(obj, ', ') into v from seen where who = 'admin' and n = 0;
  assert v is null, 'fixtures give the Super Admin nothing in: ' || v;
  assert (select count(distinct brand_id) from public.catalog) >= 2, 'Super Admin sees both brands';
  assert not exists (select 1 from public.catalog where brand_name = 'ISOBRAND'), 'another business''s products in catalog';
  assert not exists (select 1 from public.sales_register where brand_name = 'ISOBRAND'), 'another business''s sales';
  assert not exists (select 1 from public.stock_ledger where brand_name = 'ISOBRAND'), 'another business''s stock ledger';

  begin perform 1 from public.stock_reserved; raise exception 'stock_reserved readable by a login';
  exception when insufficient_privilege then null; end;
  begin perform public.invoice_open_amount(gen_random_uuid()); raise exception 'invoice_open_amount callable by a login';
  exception when insufficient_privilege then null; end;
  begin perform public.product_available(gen_random_uuid()); raise exception 'product_available callable by a login';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- ---------- warehouse limited to CQ: no BL stock, no purchase of BL, no costs ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000011', false);
set role authenticated;
do $$
declare v_bl uuid := (select id from brand where code = 'BL');
begin
  assert (select count(*) from public.catalog) > 0, 'CQ warehouse sees its catalogue';
  assert not exists (select 1 from public.catalog where brand_id = v_bl), 'catalog: other brand shown';
  assert not exists (select 1 from public.product_stock where brand_id = v_bl), 'product_stock: other brand shown';
  assert not exists (select 1 from public.stock_ledger where brand_id = v_bl), 'stock_ledger: other brand shown';
  -- stock_on_hand and purchase_receipts carry no brand column: every product in them must be one this login can see
  assert not exists (select 1 from public.stock_on_hand s where not exists (select 1 from public.catalog c where c.id = s.product_id)),
    'stock_on_hand: other brand''s product shown';
  assert not exists (select 1 from public.purchase_receipts r where not exists (select 1 from public.catalog c where c.id = r.product_id)),
    'purchase_receipts: other brand''s product shown';
  assert (select count(*) from public.stock_ledger) < (select n from seen where who = 'admin' and obj = 'stock_ledger'), 'stock_ledger not narrowed by brand';
  assert (select count(*) from public.purchase_receipts) < (select n from seen where who = 'admin' and obj = 'purchase_receipts'), 'purchase_receipts not narrowed by brand';
  assert (select count(*) from public.sales_costs) = 0, 'warehouse sees purchase costs of sales';
  assert (select count(*) from public.sales_register) > 0, 'warehouse sees the sales register (to pick and dispatch)';
end $$;
reset role;

-- ---------- manager limited to BL ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000012', false);
set role authenticated;
do $$
declare v_cq uuid := (select id from brand where code = 'CQ');
begin
  assert (select count(*) from public.catalog) > 0, 'BL manager sees its catalogue';
  assert not exists (select 1 from public.catalog where brand_id = v_cq), 'catalog: other brand shown';
  assert not exists (select 1 from public.product_stock where brand_id = v_cq), 'product_stock: other brand shown';
  assert not exists (select 1 from public.stock_ledger where brand_id = v_cq), 'stock_ledger: other brand shown';
  assert not exists (select 1 from public.stock_on_hand s where not exists (select 1 from public.catalog c where c.id = s.product_id)),
    'stock_on_hand: other brand''s product shown';
  assert not exists (select 1 from public.purchase_receipts r where not exists (select 1 from public.catalog c where c.id = r.product_id)),
    'purchase_receipts: other brand''s product shown';
  assert not exists (select 1 from public.expense_list where brand_id = v_cq and employee_id <> auth.uid()), 'expense_list: other brand''s expenses shown';
  assert (select count(*) from public.sales_costs) > 0, 'manager sees costs';
end $$;
reset role;

-- ---------- salesman: own outlets' sales, own expenses, no costs, no purchases, no ledger ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000005', false);
set role authenticated;
do $$
begin
  assert (select count(*) from public.sales_costs) = 0, 'salesman sees costs';
  assert (select count(*) from public.purchase_receipts) = 0, 'salesman sees purchase receipts';
  assert (select count(*) from public.stock_ledger) = 0, 'salesman sees the stock ledger';
  assert (select count(*) from public.sales_register) > 0, 'salesman sees own outlets'' sales';
  assert not exists (select 1 from public.sales_register s where not public.can_see_retailer(s.retailer_id)), 'sales_register: another salesman''s outlet';
  assert (select count(*) from public.sales_register) < (select n from seen where who = 'admin' and obj = 'sales_register'), 'sales_register not narrowed for a salesman';
  assert (select count(*) from public.expense_list) > 0, 'salesman sees own expenses';
  assert not exists (select 1 from public.expense_list where employee_id <> auth.uid()), 'expense_list: someone else''s expense';
end $$;
reset role;

-- ---------- inactive login: nothing anywhere ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000009', false);
set role authenticated;
do $$
begin
  assert (select count(*) from public.catalog) + (select count(*) from public.stock_on_hand) + (select count(*) from public.product_stock)
       + (select count(*) from public.sales_register) + (select count(*) from public.sales_costs) + (select count(*) from public.purchase_receipts)
       + (select count(*) from public.stock_ledger) + (select count(*) from public.expense_list) = 0, 'an inactive login sees rows in a view';
end $$;
reset role;

-- ---------- another business: nothing of Apex ----------
select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000002', false);
set role authenticated;
do $$
begin
  assert not exists (select 1 from public.catalog c join brand b on b.id = c.brand_id), 'other business sees Apex catalogue';
  assert not exists (select 1 from public.product_stock p join brand b on b.id = p.brand_id), 'other business sees Apex stock';
  assert not exists (select 1 from public.sales_register s join brand b on b.id = s.brand_id), 'other business sees Apex sales';
  assert not exists (select 1 from public.stock_ledger l join brand b on b.id = l.brand_id), 'other business sees Apex stock ledger';
  assert not exists (select 1 from public.expense_list e join brand b on b.id = e.brand_id), 'other business sees Apex expenses';
  assert (select count(*) from public.sales_costs) = 0 and (select count(*) from public.purchase_receipts) = 0, 'other business''s salesman sees costs or receipts';
end $$;
reset role;

select 'ALL AUDIT TESTS PASSED' as result;
