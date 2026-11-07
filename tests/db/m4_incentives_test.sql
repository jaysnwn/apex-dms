-- =============================================================================
-- Salesman incentive: sales before GST net of returns, shops billed, smart
-- shops (≥ minimum, every bill paid within 21 days), collection slab on
-- everything due in the month (old overdue included), approval lock, privacy.
-- Runs after m0–m3 tests. Builds a month two months back so it is "final".
-- =============================================================================
\set ON_ERROR_STOP 1

create temp table ids (k text primary key, v uuid);
create temp table m (d date);
insert into m values (date_trunc('month', current_date - interval '2 months')::date);
grant all on ids, m to authenticated;

-- Fixtures (as owner): stock, a second route for salesman 2, four shops for salesman 1.
insert into public.stock_movements (product_id, warehouse_id, movement_type, qty, unit_cost, reason)
select '30000000-0000-0000-0000-000000000001', id, 'stock_in', 500, 900, 'incentive test' from public.warehouses where name = 'CONQRETE Warehouse';
insert into public.routes (id, name, default_salesman_id) values
  ('10000000-0000-0000-0000-000000000009', 'Other Route', '00000000-0000-0000-0000-000000000006');
insert into public.retailers (id, shop_name, mobile, route_id) values
  ('40000000-0000-0000-0000-00000000000a', 'Inc Shop A', '9811100001', '10000000-0000-0000-0000-000000000001'),
  ('40000000-0000-0000-0000-00000000000b', 'Inc Shop B', '9811100002', '10000000-0000-0000-0000-000000000001'),
  ('40000000-0000-0000-0000-00000000000c', 'Inc Shop C', '9811100003', '10000000-0000-0000-0000-000000000001'),
  ('40000000-0000-0000-0000-00000000000d', 'Inc Shop D (other salesman)', '9811100004', '10000000-0000-0000-0000-000000000009');
-- Shop E: added by salesman 1 himself (no route) → also his
insert into public.retailers (id, shop_name, mobile, salesman_id) values
  ('40000000-0000-0000-0000-00000000000e', 'Inc Shop E', '9811100005', '00000000-0000-0000-0000-000000000005');

-- Billing creates the invoices (price 1000 before GST, 18% → 1180 per unit).
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$
declare
  p uuid := '30000000-0000-0000-0000-000000000001';
  mk text := 'mk';
begin
  -- A: 6 units (taxable 6000) · B: 6 units · C: 2 units · D: 6 units (other salesman)
  -- E: old bill 1 unit (previous month) + this month 2 units
  insert into ids select k, public.confirm_order(public.save_quotation(null, r::uuid, 15, null,
           jsonb_build_array(jsonb_build_object('product_id', p, 'qty', q, 'unit_price', 1000)), null))
    from (values ('invA', '40000000-0000-0000-0000-00000000000a', 6), ('invB', '40000000-0000-0000-0000-00000000000b', 6),
                 ('invC', '40000000-0000-0000-0000-00000000000c', 2), ('invD', '40000000-0000-0000-0000-00000000000d', 6),
                 ('invE0', '40000000-0000-0000-0000-00000000000e', 1), ('invE', '40000000-0000-0000-0000-00000000000e', 2)) t(k, r, q);
end $$;
reset role;

-- Back-date the invoices into the test month (test only: bypass the edit guard).
alter table public.invoices disable trigger invoices_guard;
update public.invoices set invoice_date = (select d from m) + 2, due_date = (select d from m) + 2 + credit_days
 where id in (select v from ids where k in ('invA', 'invB', 'invC', 'invD', 'invE'));
update public.invoices set invoice_date = (select d from m) - 10, due_date = (select d from m) - 10 + credit_days
 where id = (select v from ids where k = 'invE0');
alter table public.invoices enable trigger invoices_guard;

-- Payments (dated in the past) and a return.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$
declare d date := (select d from m);
begin
  -- E pays 500 BEFORE the month (oldest-first → last month's bill): reduces what is due, not collection
  perform public.record_payment('40000000-0000-0000-0000-00000000000e', 500, 'cash', d - 3);
  -- A pays in full on day 10 (within 21 days of day 2) → smart
  perform public.record_payment('40000000-0000-0000-0000-00000000000a', 7080, 'cash', d + 9);
  -- B pays in full on day 30 (28 days after the bill) → missed
  perform public.record_payment('40000000-0000-0000-0000-00000000000b', 7080, 'cash', d + 29);
  -- C pays 2360 in month, but bought below the 5000 minimum → below_min
  perform public.record_payment('40000000-0000-0000-0000-00000000000c', 2360, 'cash', d + 5);
  -- E pays 2000: oldest first → 680 left on last month's bill, then 1320 to this month's
  perform public.record_payment('40000000-0000-0000-0000-00000000000e', 2000, 'cash', d + 6);
  -- return of 1 unit on B's bill in the month → B net 5000 taxable
  perform public.create_credit_note((select v from ids where k = 'invB'), 'damaged', false,
    (select jsonb_agg(jsonb_build_object('invoice_line_id', id, 'qty', 1)) from public.invoice_lines where invoice_id = (select v from ids where k = 'invB')));
end $$;
reset role;
update public.credit_notes set note_date = (select d from m) + 12 where invoice_id = (select v from ids where k = 'invB');

-- ---------- Salesman 1 sees his own figures ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000005', false);
set role authenticated;
do $$
declare j jsonb; d date := (select d from m);
begin
  j := public.salesman_incentive('00000000-0000-0000-0000-000000000005', d);
  -- sales: A 6000 + B (6000 − 1000 returned) + C 2000 + E 2000 = 15000 (D excluded, E's old bill excluded)
  assert (j->>'net_sales')::numeric = 15000, 'net sales ' || (j->>'net_sales');
  assert (j->>'billed_shops')::int = 4, 'billed shops ' || (j->>'billed_shops');
  assert (j->>'smart_shops')::int = 1, 'smart shops ' || (j->>'smart_shops');
  -- due in the month (all bills due by month end, at what was owed on the 1st):
  --   A 7080 + B 5900 (after return) + C 2360 + E old 680 (1180 − 500 paid before) + E new 2360 = 18380
  assert (j->>'collection_due')::numeric = 18380, 'collection due ' || (j->>'collection_due');
  -- collected in the month against those: A 7080 + B 5900 (capped after return) + C 2360 + E 2000 = 17340
  assert (j->>'collected')::numeric = 17340, 'collected ' || (j->>'collected');
  assert (j->>'collection_pct')::numeric = round(17340 / 18380.0 * 100, 2), 'collection %';
  assert (j->>'collection_earned')::numeric = 2500, '94.34% → 85% slab = 2500, got ' || (j->>'collection_earned');
  assert (j->'next_slab'->>'min_pct')::numeric = 95, 'next slab 95%';
  assert (j->>'next_slab_gap')::numeric = round(0.95 * 18380 - 17340, 2), 'gap to next slab';
  assert (j->>'max_total')::numeric = 9000, 'max 2000×3 + 3000';
  assert (j->>'is_final')::boolean, 'two months back is final';
  assert (j->>'sales_earned')::numeric = 0, 'sales not reached';
  assert (j->>'total')::numeric = 2500, 'total ' || (j->>'total');

  -- slabs: highest reached only, never added up
  assert public.incentive_collection_amount((public.incentive_scheme_for(d)).collection_slabs, 74.99) = 0, 'below 75';
  assert public.incentive_collection_amount((public.incentive_scheme_for(d)).collection_slabs, 75) = 2000, '75';
  assert public.incentive_collection_amount((public.incentive_scheme_for(d)).collection_slabs, 84.99) = 2000, '84.99';
  assert public.incentive_collection_amount((public.incentive_scheme_for(d)).collection_slabs, 85) = 2500, '85';
  assert public.incentive_collection_amount((public.incentive_scheme_for(d)).collection_slabs, 94.99) = 2500, '94.99';
  assert public.incentive_collection_amount((public.incentive_scheme_for(d)).collection_slabs, 95) = 3000, '95';
  assert public.incentive_collection_amount((public.incentive_scheme_for(d)).collection_slabs, 100) = 3000, '100';
  assert (select due_amount from public.incentive_shops(auth.uid(), d) where shop_name = 'Inc Shop E') = 3040, 'E due 680 + 2360';

  assert (select status from public.incentive_shops(auth.uid(), d) where shop_name = 'Inc Shop A') = 'smart', 'A smart';
  assert (select status from public.incentive_shops(auth.uid(), d) where shop_name = 'Inc Shop B') = 'missed', 'B missed (paid late)';
  assert (select status from public.incentive_shops(auth.uid(), d) where shop_name = 'Inc Shop C') = 'below_min', 'C below minimum';
  assert (select status from public.incentive_shops(auth.uid(), d) where shop_name = 'Inc Shop E') = 'below_min', 'E below minimum';
  assert not exists (select 1 from public.incentive_shops(auth.uid(), d) where shop_name like 'Inc Shop D%'), 'D is not his';
  assert (select status from public.incentive_shops(auth.uid(), d) where shop_name = 'Shree Mobile Point') = 'not_billed', 'unbilled shop listed';

  begin perform public.salesman_incentive('00000000-0000-0000-0000-000000000006', d); raise exception 'saw another salesman';
  exception when insufficient_privilege then null; end;
  begin perform public.approve_incentives(d); raise exception 'salesman approved';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.incentive_schemes (effective_from, sales_target, sales_amount, billed_target, billed_amount, smart_target, smart_min_purchase, smart_pay_days, smart_amount, collection_slabs)
    values (date_trunc('month', current_date)::date, 1, 1, 1, 1, 1, 1, 1, 1, '[{"min_pct":1,"amount":1}]');
    raise exception 'salesman changed the scheme';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- ---------- Manager: cannot change the scheme, approves & pays ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
declare d date := (select d from m); n int; v_id uuid;
begin
  begin
    insert into public.incentive_schemes (effective_from, sales_target, sales_amount, billed_target, billed_amount, smart_target, smart_min_purchase, smart_pay_days, smart_amount, collection_slabs)
    values (date_trunc('month', current_date)::date, 1, 1, 1, 1, 1, 1, 1, 1, '[{"min_pct":1,"amount":1}]');
    raise exception 'manager changed the scheme';
  exception when insufficient_privilege then null; end;

  begin perform public.approve_incentives(date_trunc('month', current_date)::date); raise exception 'approved an open month';
  exception when raise_exception then if sqlerrm not like '%final only after%' then raise; end if; end;

  n := public.approve_incentives(d);
  assert n = (select count(*) from public.profiles where role = 'salesman' and is_active), 'approved every active salesman: ' || n;
  assert public.approve_incentives(d) = 0, 'second approval adds nothing';
  select id into v_id from public.incentive_payouts where salesman_id = '00000000-0000-0000-0000-000000000005' and month = d;
  assert (select total from public.incentive_payouts where id = v_id) = 2500, 'locked total';
  assert (select collection_earned from public.incentive_payouts where id = v_id) = 2500, 'locked collection slab';
  assert (select jsonb_array_length(detail->'shops') from public.incentive_payouts where id = v_id) = 4, 'shop detail kept';
  begin perform public.mark_incentive_paid(v_id, 'upi'); raise exception 'paid without reference';
  exception when raise_exception then if sqlerrm not like '%reference%' then raise; end if; end;
  perform public.mark_incentive_paid(v_id, 'upi', 'UPI-INC-1');
  assert (select status from public.incentive_payouts where id = v_id) = 'paid', 'paid';
end $$;
reset role;

-- ---------- Super admin edits the scheme from next month; old months unchanged ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$ begin
  insert into public.incentive_schemes (effective_from, sales_target, sales_amount, billed_target, billed_amount, smart_target, smart_min_purchase, smart_pay_days, smart_amount, collection_slabs)
  values ((date_trunc('month', current_date) + interval '1 month')::date, 350000, 2500, 60, 2000, 30, 5000, 21, 2000, '[{"min_pct":80,"amount":2000},{"min_pct":95,"amount":3500}]');
  assert (public.incentive_scheme_for((select d from m))).sales_target = 300000, 'old month keeps old scheme';
  assert (public.incentive_scheme_for((date_trunc('month', current_date) + interval '1 month')::date)).sales_target = 350000, 'new month uses new scheme';
end $$;
reset role;

-- Salesman sees only his own payout
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000005', false);
set role authenticated;
do $$ begin
  assert (select count(*) from public.incentive_payouts where salesman_id <> auth.uid()) = 0, 'salesman sees only his own payout';
  assert (select count(*) from public.incentive_payouts where salesman_id = auth.uid()) = 1, 'salesman sees his payout';
end $$;
reset role;

select 'ALL INCENTIVE DATABASE TESTS PASSED' as result;
