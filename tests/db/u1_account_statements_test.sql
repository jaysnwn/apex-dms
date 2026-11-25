-- =============================================================================
-- Account statements (0039): the 15 cases of the statement spec, and that every
-- figure reconciles with the ledger and the Outstanding screen's views.
--
-- Territory "Statement Belt"
--   Route S1: towns Sangvi (1), Pimpri (2)        shops A B C I (Sangvi), D E (Pimpri)
--   Route S2: town  Rajur (1)                      shops F G H (Rajur)
--   No route, town Rajur:                          shop  J
--   Route S3 (large): 300 shops in Sangvi
-- Statement period: 1–20 Nov 2026. Payments are cash or UPI only.
-- =============================================================================
\set ON_ERROR_STOP 1
select set_config('request.jwt.claim.sub', '', false);

create schema st;
grant usage on schema st to authenticated;
create function st.shop(p text) returns uuid language sql stable security definer as $$ select id from public.retailers where shop_name = p $$;
create function st.inv(p_shop text, p_no text, p_date date, p_days int, p_amt numeric, p_status text default 'issued')
returns uuid language plpgsql security definer as $$
declare v uuid;
begin
  insert into public.invoices (invoice_no, fy, retailer_id, invoice_date, credit_days, due_date, place_of_supply, is_igst, retailer_snapshot,
                               subtotal, discount_total, taxable_total, cgst_total, sgst_total, igst_total, round_off, grand_total, is_opening, brand_id)
  values (p_no, '26-27', st.shop(p_shop), p_date, p_days, p_date + p_days, '27', false,
          jsonb_build_object('shop_name', p_shop, 'state_code', '27'),
          p_amt, 0, p_amt, 0, 0, 0, 0, p_amt, true, (select id from public.brands where name = 'CONQRETE' and tenant_id = current_setting('app.tenant_id')::uuid))
  returning id into v;
  if p_status = 'cancelled' then
    update public.invoices set status = 'cancelled', cancelled_at = now(), cancel_reason = 'Raised in error' where id = v;
  end if;
  return v;
end $$;
create function st.cn(p_inv text, p_no text, p_date date, p_amt numeric) returns void language sql security definer as $$
  insert into public.credit_notes (credit_note_no, fy, invoice_id, retailer_id, note_date, reason, taxable_total, grand_total)
  select p_no, '26-27', id, retailer_id, p_date, 'Damaged in transit', p_amt, p_amt from public.invoices where invoice_no = p_inv $$;
grant execute on all functions in schema st to authenticated;

-- ---------- master data ----------
do $$
declare t uuid; s1 uuid; s2 uuid; s3 uuid; sangvi uuid; pimpri uuid; rajur uuid;
begin
  insert into public.territories (name, code) values ('Statement Belt', 'STB') returning id into t;
  insert into public.locations (name, territory_id) values ('Sangvi', t) returning id into sangvi;
  insert into public.locations (name, territory_id) values ('Pimpri', t) returning id into pimpri;
  insert into public.locations (name, territory_id) values ('Rajur', t) returning id into rajur;
  insert into public.routes (name, territory_id, sort_order) values ('Sangvi – Pimpri', t, 1) returning id into s1;
  insert into public.routes (name, territory_id, sort_order) values ('Rajur', t, 2) returning id into s2;
  insert into public.routes (name, territory_id, sort_order) values ('Sangvi big', null, 3) returning id into s3;
  insert into public.route_locations (route_id, location_id, sequence) values (s1, sangvi, 1), (s1, pimpri, 2), (s2, rajur, 1), (s3, sangvi, 1);
  insert into public.retailers (shop_name, mobile, billing_city, billing_state_code, location_id, route_id)
  values ('St A', '9300000001', 'Sangvi', '27', sangvi, s1), ('St B', '9300000002', 'Sangvi', '27', sangvi, s1),
         ('St C', '9300000003', 'Sangvi', '27', sangvi, s1), ('St I', '9300000009', 'Sangvi', '27', sangvi, s1),
         ('St D', '9300000004', 'Pimpri', '27', pimpri, s1), ('St E', '9300000005', 'Pimpri', '27', pimpri, s1),
         ('St F', '9300000006', 'Rajur', '27', rajur, s2), ('St G', '9300000007', 'Rajur', '27', rajur, s2),
         ('St H', '9300000008', 'Rajur', '27', rajur, s2),
         ('St J', '9300000010', 'Rajur', '27', rajur, null);
  insert into public.retailers (shop_name, mobile, billing_city, billing_state_code, location_id, route_id)
  select 'Big ' || lpad(n::text, 3, '0'), '94' || lpad(n::text, 8, '0'), 'Sangvi', '27', sangvi, s3 from generate_series(1, 300) n;
  assert (select count(*) from public.route_outlets where route_id = s1 and is_active) = 6, 'route S1 has 6 shops';
end $$;

-- ---------- invoices and credit notes (dated, as carried over) ----------
select st.inv('St A', 'ST/A1', '2026-10-05', 15, 1000);                       -- 1. one unpaid bill
select st.inv('St B', 'ST/B1', '2026-09-10', 15, 500);                        -- 2. several unpaid bills
select st.inv('St B', 'ST/B2', '2026-11-10', 15, 700);
select st.inv('St C', 'ST/C1', '2026-10-01', 15, 800);                        -- 3. paid in full
select st.inv('St D', 'ST/D1', '2026-10-01', 30, 1000);                       -- 4. part paid
select st.inv('St E', 'ST/E1', '2026-10-02', 15, 1200);                       -- 5. several receipts
select st.inv('St F', 'ST/F1', '2026-11-10', 15, 1000);                       -- 6. advance, bill later
select st.inv('St G', 'ST/G1', '2026-09-01', 15, 2000);                       -- 7/10. opening due, no activity in Nov
select st.inv('St H', 'ST/H1', '2026-10-05', 15, 1000);                       -- 8. credit note, one payment for two bills
select st.inv('St H', 'ST/H2', '2026-10-28', 15, 700);
select st.cn('ST/H1', 'ST/CN-H1', '2026-10-25', 200);
select st.inv('St I', 'ST/I1', '2026-11-03', 15, 5000, 'cancelled');          -- 14. cancelled bill
select st.inv('St I', 'ST/I2', '2026-11-04', 15, 300);
select st.inv('St J', 'ST/J1', '2026-11-06', 15, 450);                        -- not on a route
select st.inv(shop_name, 'ST/BIG' || substr(shop_name, 5), '2026-11-02', 15, 1000)
  from public.retailers where shop_name like 'Big %';                         -- 15. large route

-- ---------- payments: cash and UPI, recorded by the office ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', false);
set role authenticated;
select public.record_payment(st.shop('St C'), 800, 'cash', '2026-10-15');
select public.record_payment(st.shop('St D'), 400, 'upi', '2026-11-12', 'UPI-D-1');
select public.record_payment(st.shop('St E'), 300, 'cash', '2026-10-10');
select public.record_payment(st.shop('St E'), 500, 'upi', '2026-10-20', 'UPI-E-2');
select public.record_payment(st.shop('St E'), 400, 'cash', '2026-11-05');
select public.record_payment(st.shop('St F'), 1500, 'cash', '2026-10-03');   -- nothing to apply it to: advance
select public.record_payment(st.shop('St H'), 1500, 'upi', '2026-11-02', 'UPI-H-1');  -- 800 to H1, 700 to H2
select public.record_payment(st.shop('St I'), 300, 'cash', '2026-11-08');
select public.record_payment(st.shop(shop_name), 600, 'cash', '2026-11-15') from public.retailers where shop_name like 'Big %';
reset role;
-- 14. a payment reversed (rejected by the office) never counts
insert into public.payments (receipt_no, retailer_id, payment_date, amount, method, status)
values ('ST/RCPT-REV', st.shop('St I'), '2026-11-09', 999, 'cash', 'cancelled');

-- =============================================================================
-- Checks as Billing (office)
-- =============================================================================
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', false);
set role authenticated;

create temp table r as select * from public.account_statement('territory', (select id from public.territories where name = 'Statement Belt'), '2026-11-01', '2026-11-20');
create temp table e as select * from public.account_statement_entries('territory', (select id from public.territories where name = 'Statement Belt'), '2026-11-01', '2026-11-20');

do $$
declare x record;
begin
  -- the hierarchy: 9 shops on the two routes + J (town in the territory, no route); big route S3 has no territory
  assert (select count(*) from r) = 10, 'territory shops: ' || (select count(*) from r);
  assert (select string_agg(shop_name, ',' order by shop_position) from r) = 'St A,St B,St C,St I,St D,St E,St F,St G,St H,St J',
    'print order: route, town order, shop order — ' || (select string_agg(shop_name, ',' order by shop_position) from r);
  assert (select route_name is null and town_name = 'Rajur' and territory_name = 'Statement Belt' from r where shop_name = 'St J'), 'J: no route, still in its territory';

  -- 1. one unpaid bill
  select * into x from r where shop_name = 'St A';
  assert x.opening = 1000 and x.invoiced = 0 and x.collected = 0 and x.closing = 1000 and x.bills_due = 1000 and x.overdue = 1000 and x.advance = 0, '1: ' || row_to_json(x);
  -- 2. several unpaid bills: one before the period (opening), one inside
  select * into x from r where shop_name = 'St B';
  assert x.opening = 500 and x.invoiced = 700 and x.closing = 1200 and x.bills_due = 1200 and x.overdue = 500, '2: ' || row_to_json(x);
  -- 3 / 9. paid in full in October: nothing owed, nothing in November
  select * into x from r where shop_name = 'St C';
  assert x.opening = 0 and x.closing = 0 and x.bills_due = 0 and x.entries = 0, '3: ' || row_to_json(x);
  -- 4. part payment inside the period
  select * into x from r where shop_name = 'St D';
  assert x.opening = 1000 and x.collected = 400 and x.closing = 600 and x.bills_due = 600 and x.overdue = 600, '4: ' || row_to_json(x);  -- due 31 Oct: overdue on 20 Nov
  -- 5. three receipts, two before the period
  select * into x from r where shop_name = 'St E';
  assert x.opening = 400 and x.collected = 400 and x.closing = 0 and x.bills_due = 0, '5: ' || row_to_json(x);
  -- 6. advance kept apart: 1500 received in October; the November bill of 1000 took 1000 of it, 500 is still advance
  select * into x from r where shop_name = 'St F';
  assert x.opening = -1500 and x.invoiced = 1000 and x.closing = -500 and x.bills_due = 0 and x.advance = 500, '6: ' || row_to_json(x);
  -- 7 / 10. opening due, no transactions in the period
  select * into x from r where shop_name = 'St G';
  assert x.opening = 2000 and x.entries = 0 and x.closing = 2000 and x.overdue = 2000, '7: ' || row_to_json(x);
  -- 8. credit note in October, then one UPI payment for both bills in November
  select * into x from r where shop_name = 'St H';
  assert x.opening = 1500 and x.collected = 1500 and x.credit_notes = 0 and x.closing = 0 and x.bills_due = 0 and x.advance = 0, '8: ' || row_to_json(x);
  -- 14. the cancelled bill and the reversed payment count nowhere
  select * into x from r where shop_name = 'St I';
  assert x.invoiced = 300 and x.collected = 300 and x.closing = 0 and x.entries = 2, '14: ' || row_to_json(x);

  -- identity on every shop: closing = signed bill balances − advance, and closing = last running balance
  assert not exists (select 1 from r where closing <> opening + invoiced - credit_notes - collected), 'closing formula';
  assert not exists (
    select 1 from r where entries > 0 and closing <> (select balance from e where e.retailer_id = r.retailer_id order by line_no desc limit 1)
  ), 'closing equals the last running balance';
  assert not exists (select 1 from r where entries <> (select count(*) from e where e.retailer_id = r.retailer_id)), 'entry counts';
  assert (select count(*) = count(distinct (retailer_id, kind, doc_id)) from e), 'no document twice';
  assert not exists (select 1 from e where doc_no in ('ST/I1', 'ST/RCPT-REV')), 'cancelled bill / reversed payment not listed';

  -- allocation shown on the payment: one payment, two bills
  assert (select against = 'ST/H1, ST/H2' and on_account = 0 from e where kind = 'payment' and retailer_id = st.shop('St H')), 'H payment applied to both bills';
  assert (select method = 'upi' and reference_no = 'UPI-D-1' from e where retailer_id = st.shop('St D') and kind = 'payment'), 'method and UPI reference carried';
end $$;

-- the credit note sits in October: an October statement shows it, and the advance as it stood on 31 Oct
do $$
declare x record;
begin
  select * into x from public.account_statement('retailer', st.shop('St H'), '2026-10-01', '2026-10-31');
  assert x.invoiced = 1700 and x.credit_notes = 200 and x.closing = 1500 and x.bills_due = 1500, 'H in October: ' || row_to_json(x);
  assert (select against = 'ST/H1' and credit = 200 from public.account_statement_entries('retailer', st.shop('St H'), '2026-10-01', '2026-10-31') where kind = 'credit_note'), 'credit note names its bill';
  select * into x from public.account_statement('retailer', st.shop('St F'), '2026-10-01', '2026-10-31');
  assert x.closing = -1500 and x.advance = 1500 and x.bills_due = 0, 'F on 31 Oct: all advance';
  -- November's statement must not drop October's unpaid bill (spec 7)
  assert (select closing from public.account_statement('retailer', st.shop('St A'), '2026-11-01', '2026-11-20')) = 1000, 'October bill still owed in November';
end $$;

-- 11–13. towns add up to routes, routes add up to the territory
do $$
declare v_t uuid := (select id from public.territories where name = 'Statement Belt');
begin
  assert (select sum(closing) from r where town_name = 'Sangvi') =
         (select sum(closing) from public.account_statement('town', (select id from public.locations where name = 'Sangvi'), '2026-11-01', '2026-11-20') where route_name = 'Sangvi – Pimpri'),
    'Sangvi on route S1 = Sangvi in the town statement';
  assert (select sum(closing) from r where route_name = 'Sangvi – Pimpri') =
         (select sum(closing) from public.account_statement('route', (select id from public.routes where name = 'Sangvi – Pimpri'), '2026-11-01', '2026-11-20')),
    'route S1 in the territory = route S1 statement';
  assert (select sum(closing) from r) =
         (select sum(closing) from public.account_statement('route', (select id from public.routes where name = 'Sangvi – Pimpri'), '2026-11-01', '2026-11-20'))
       + (select sum(closing) from public.account_statement('route', (select id from public.routes where name = 'Rajur'), '2026-11-01', '2026-11-20'))
       + (select closing from r where shop_name = 'St J'),
    'territory = its routes + shops not on a route';
  assert (select sum(closing) from r) = 1000 + 1200 + 0 + 0 + 600 + 0 - 500 + 2000 + 0 + 450, 'territory closing ' || (select sum(closing) from r);
end $$;

-- All transactions, up to today: the statement equals the Outstanding screen's views and the ledger, shop by shop
do $$
begin
  assert not exists (
    select 1
      from public.account_statement('territory', (select id from public.territories where name = 'Statement Belt'), null, null) s
      join public.retailer_balances b on b.retailer_id = s.retailer_id
     where s.opening <> 0 or s.bills_due <> b.outstanding or s.advance <> b.unallocated
        or s.closing <> (select coalesce(sum(debit - credit), 0) from public.retailer_ledger l where l.retailer_id = s.retailer_id)
  ), 'all-time statement reconciles with retailer_balances and retailer_ledger';
end $$;

-- 15. a route of 300 shops, in two calls
do $$
declare v_r uuid := (select id from public.routes where name = 'Sangvi big'); v_t timestamptz := clock_timestamp();
begin
  assert (select count(*) from public.account_statement('route', v_r, '2026-11-01', '2026-11-20')) = 300, '300 shops';
  assert (select sum(closing) from public.account_statement('route', v_r, '2026-11-01', '2026-11-20')) = 300 * 400, 'big route closing';
  assert (select count(*) from public.account_statement_entries('route', v_r, '2026-11-01', '2026-11-20')) = 600, '600 ledger lines';
  assert clock_timestamp() - v_t < interval '10 seconds', 'big route took ' || (clock_timestamp() - v_t);
end $$;

-- the dates and the type are checked
do $$
begin
  begin perform public.account_statement('route', st.shop('St A'), '2026-11-20', '2026-11-01'); raise exception 'reversed dates accepted' using errcode = 'ZZ999';
  exception when invalid_parameter_value then null; end;
  begin perform public.account_statement('shop', st.shop('St A'), null, null); raise exception 'unknown type accepted' using errcode = 'ZZ999';
  exception when invalid_parameter_value then null; end;
end $$;
reset role;

-- =============================================================================
-- A salesman: his own shop's statement only; no town, route or territory statements
-- =============================================================================
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000005', false);
set role authenticated;
do $$
begin
  begin
    perform public.account_statement('territory', (select id from public.territories where name = 'Statement Belt'), null, null);
    raise exception 'salesman printed a territory statement' using errcode = 'ZZ999';
  exception when insufficient_privilege then null; end;
  -- the Statement Belt shops are not on his routes: row level security hides them
  assert (select count(*) from public.account_statement('retailer', st.shop('St A'), null, null)) = 0, 'salesman sees a shop that is not his';
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);
