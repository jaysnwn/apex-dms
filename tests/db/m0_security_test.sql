-- =============================================================================
-- M0 exit tests: roles, RLS, audit log, numbering, immutability.
-- Run with tests/db/run.sh (plain Postgres + Supabase stubs).
-- Any failed assertion raises and stops the run.
-- =============================================================================
\set ON_ERROR_STOP 1

-- ---------- Seed users (as postgres / service role) ----------
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000001', 'admin@apex.test',     '{"role":"super_admin"}', '{"full_name":"Asha Admin"}'),
  ('00000000-0000-0000-0000-000000000002', 'manager@apex.test',   '{"role":"manager"}',     '{"full_name":"Manoj Manager"}'),
  ('00000000-0000-0000-0000-000000000003', 'billing@apex.test',   '{"role":"billing"}',     '{"full_name":"Bina Billing"}'),
  ('00000000-0000-0000-0000-000000000004', 'warehouse@apex.test', '{"role":"warehouse"}',   '{"full_name":"Wasim Warehouse"}'),
  ('00000000-0000-0000-0000-000000000005', 'sales1@apex.test',    '{"role":"salesman"}',    '{"full_name":"Sachin Sales"}'),
  ('00000000-0000-0000-0000-000000000006', 'sales2@apex.test',    '{"role":"salesman"}',    '{"full_name":"Sunil Sales"}'),
  ('00000000-0000-0000-0000-000000000009', 'stranger@x.test',     '{}',                     '{}');

do $$ begin
  assert (select count(*) from public.profiles where is_active) = 6, 'six active profiles expected';
  assert (select not is_active from public.profiles where email = 'stranger@x.test'),
    'self sign-up without role must be inactive';
  assert (select role from public.profiles where email = 'billing@apex.test') = 'billing', 'role from app_metadata';
end $$;

insert into public.routes (id, name, default_salesman_id) values
  ('10000000-0000-0000-0000-000000000001', 'Sangamner City', '00000000-0000-0000-0000-000000000005');
insert into public.retailers (id, shop_name, mobile, route_id) values
  ('20000000-0000-0000-0000-000000000001', 'Shree Mobile Point', '9822000001', '10000000-0000-0000-0000-000000000001');
insert into public.retailers (id, shop_name, mobile, salesman_id) values
  ('20000000-0000-0000-0000-000000000002', 'Om Electronics', '9822000002', '00000000-0000-0000-0000-000000000006');
insert into public.products (id, name, brand_id, sku, purchase_cost, retailer_price, mrp, gst_rate)
select '30000000-0000-0000-0000-000000000001', '20000mAh Power Bank', id, 'CQ-PB20K', 900, 1199, 1999, 18
  from public.brands where name = 'CONQRETE';

-- ---------- Salesman 1 ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000005', false);
set role authenticated;
do $$ begin
  assert (select count(*) from public.retailers) = 1, 'salesman sees only own-route retailers';
  assert (select shop_name from public.retailers) = 'Shree Mobile Point', 'wrong retailer visible';
  assert (select count(*) from public.products) = 0, 'salesman must not read products (cost)';
  assert (select count(*) from public.catalog) = 1, 'salesman reads catalog view';
  assert (select count(*) from public.audit_log) = 0, 'salesman must not read audit log';
  update public.profiles set role = 'super_admin' where id = auth.uid();
  assert (select role from public.profiles where id = auth.uid()) = 'salesman', 'salesman escalated own role';
end $$;
-- salesman may create a retailer only for himself
do $$ begin
  begin
    insert into public.retailers (shop_name, mobile, salesman_id)
    values ('Fake', '9822000003', '00000000-0000-0000-0000-000000000006');
    raise exception 'salesman created a retailer for someone else';
  exception when insufficient_privilege then null;
  end;
  insert into public.retailers (shop_name, mobile, salesman_id)
  values ('New Shop', '9822000004', auth.uid());
  assert (select count(*) from public.retailers) = 2, 'salesman should see the retailer he created';
end $$;
do $$ begin
  begin
    perform public.next_document_number('INV');
    raise exception 'authenticated user called next_document_number directly';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- ---------- Warehouse ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', false);
set role authenticated;
do $$
declare v_wh uuid := (select id from public.warehouses limit 1);
begin
  begin
    insert into public.retailers (shop_name, mobile) values ('X', '9822000005');
    raise exception 'warehouse created a retailer';
  exception when insufficient_privilege then null;
  end;
  insert into public.stock_movements (product_id, warehouse_id, movement_type, qty, reason)
  values ('30000000-0000-0000-0000-000000000001', v_wh, 'opening', 50, 'opening stock');
  begin
    insert into public.stock_movements (product_id, warehouse_id, movement_type, qty)
    values ('30000000-0000-0000-0000-000000000001', v_wh, 'dispatch', -5);
    raise exception 'warehouse wrote a dispatch movement directly';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.stock_movements (product_id, warehouse_id, movement_type, qty)
    values ('30000000-0000-0000-0000-000000000001', v_wh, 'damage', 3);
    raise exception 'damage with positive qty accepted';
  exception when check_violation then null;
  end;
  assert (select available from public.product_stock
           where product_id = '30000000-0000-0000-0000-000000000001') = 50, 'available should be 50';
  assert (select count(*) from public.products) = 0, 'warehouse must not read cost';
end $$;
reset role;

-- stock movements are append-only, even for the owner role
do $$ begin
  begin
    update public.stock_movements set qty = 500;
    raise exception 'stock movement was edited';
  exception when raise_exception then
    if sqlerrm not like '%append-only%' then raise; end if;
  end;
end $$;

-- ---------- Billing ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$ begin
  assert (select count(*) from public.retailers) = 3, 'billing sees all retailers';
  assert (select count(*) from public.products) = 1, 'billing reads products';
  update public.profiles set role = 'manager' where id = '00000000-0000-0000-0000-000000000005';
  assert (select role from public.profiles where id = '00000000-0000-0000-0000-000000000005') = 'salesman',
    'billing changed a role';
  assert (select count(*) from public.audit_log) = 0, 'billing must not read audit log';
end $$;
reset role;

-- ---------- Super admin ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$ begin
  update public.profiles set role = 'manager' where id = '00000000-0000-0000-0000-000000000006';
  assert (select role from public.profiles where id = '00000000-0000-0000-0000-000000000006') = 'manager',
    'super admin could not change role';
  assert exists (
    select 1 from public.audit_log
     where table_name = 'profiles' and action = 'UPDATE'
       and record_id = '00000000-0000-0000-0000-000000000006'
       and changed_by = '00000000-0000-0000-0000-000000000001'
       and old_data ->> 'role' = 'salesman' and new_data ->> 'role' = 'manager'
  ), 'audit row with before/after + user missing';
  assert exists (select 1 from public.audit_log where table_name = 'stock_movements'
                  and changed_by = '00000000-0000-0000-0000-000000000004'), 'stock movement not audited';
  begin
    update public.profiles set role = 'manager' where id = auth.uid();
    raise exception 'last super admin demoted';
  exception when raise_exception then
    if sqlerrm not like '%Super Administrator%' then raise; end if;
  end;
end $$;
reset role;

-- ---------- Inactive user ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000009', false);
set role authenticated;
do $$ begin
  assert (select count(*) from public.profiles) = 1, 'inactive user sees only self';
  assert (select count(*) from public.retailers) = 0, 'inactive user sees retailers';
  assert (select count(*) from public.catalog) = 0, 'inactive user sees catalog';
end $$;
reset role;

-- ---------- Anonymous ----------
set role anon;
do $$ begin
  begin
    perform 1 from public.retailers;
    raise exception 'anon read retailers';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- ---------- Numbering & invoice immutability ----------
do $$
declare a text; b text;
begin
  a := public.next_document_number('INV', '2026-11-05');
  b := public.next_document_number('INV', '2026-11-06');
  assert a = 'APX/INV/26-27/00001', 'first invoice number: ' || a;
  assert b = 'APX/INV/26-27/00002', 'second invoice number: ' || b;
  assert public.next_document_number('INV', '2027-04-01') = 'APX/INV/27-28/00001', 'new FY must restart';
  assert public.fy_label('2027-03-31') = '26-27', 'fy_label March';
end $$;

insert into public.orders (id, order_no, retailer_id, credit_days, status)
values ('40000000-0000-0000-0000-000000000001', 'APX/ORD/26-27/00001', '20000000-0000-0000-0000-000000000001', 15, 'invoiced');
insert into public.invoices (id, invoice_no, fy, order_id, retailer_id, invoice_date, credit_days, due_date,
  place_of_supply, is_igst, retailer_snapshot, subtotal, discount_total, taxable_total, cgst_total, sgst_total,
  igst_total, round_off, grand_total)
values ('50000000-0000-0000-0000-000000000001', 'APX/INV/26-27/00001', '26-27', '40000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001', '2026-11-05', 15, '2026-11-20', '27', false, '{}', 1000, 0, 1000, 90, 90, 0, 0, 1180);

do $$ begin
  begin
    update public.invoices set grand_total = 1 where id = '50000000-0000-0000-0000-000000000001';
    raise exception 'invoice total edited';
  exception when raise_exception then
    if sqlerrm not like '%cannot be edited%' then raise; end if;
  end;
  begin
    update public.invoices set due_date = '2026-12-31' where id = '50000000-0000-0000-0000-000000000001';
    raise exception 'invoice due date edited';
  exception when raise_exception then
    if sqlerrm not like '%cannot be edited%' then raise; end if;
  end;
  begin
    insert into public.orders (id, order_no, retailer_id, credit_days) values
      ('40000000-0000-0000-0000-000000000002', 'O2', '20000000-0000-0000-0000-000000000001', 15);
    insert into public.invoices (invoice_no, fy, order_id, retailer_id, invoice_date, credit_days, due_date,
      place_of_supply, is_igst, retailer_snapshot, subtotal, discount_total, taxable_total, cgst_total, sgst_total,
      igst_total, round_off, grand_total)
    values ('X2', '26-27', '40000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001',
      '2026-11-05', 15, '2026-11-25', '27', false, '{}', 0, 0, 0, 0, 0, 0, 0, 0);
    raise exception 'wrong due date accepted';
  exception when check_violation then null;
  end;
  update public.invoices set status = 'cancelled', cancel_reason = 'test'
   where id = '50000000-0000-0000-0000-000000000001';
end $$;

-- Salesman 1 can see invoices of his retailer only; invoice balance view respects RLS
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000005', false);
set role authenticated;
do $$ begin
  assert (select count(*) from public.invoices) = 1, 'salesman sees own retailer invoice';
  begin
    insert into public.invoices (invoice_no, fy, order_id, retailer_id, invoice_date, credit_days, due_date,
      place_of_supply, is_igst, retailer_snapshot, subtotal, discount_total, taxable_total, cgst_total, sgst_total,
      igst_total, round_off, grand_total)
    values ('X3', '26-27', '40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
      '2026-11-05', 0, '2026-11-05', '27', false, '{}', 0, 0, 0, 0, 0, 0, 0, 0);
    raise exception 'salesman inserted an invoice directly';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

select 'ALL M0 DATABASE TESTS PASSED' as result;
