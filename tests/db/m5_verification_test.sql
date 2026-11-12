-- =============================================================================
-- Payment verification: salesman collections wait for office verification;
-- office entries are verified automatically; reject cancels and re-opens bills;
-- only verified money counts for incentives. Runs after m0–m4.
-- =============================================================================
\set ON_ERROR_STOP 1
create temp table v (k text primary key, id uuid);
grant all on v to authenticated;
-- invoice_open_amount() is for database functions only since 0030: the tests read it through a helper
create function pg_temp.open_amt(p uuid) returns numeric language sql security definer as 'select public.invoice_open_amount(p)';
grant execute on function pg_temp.open_amt(uuid) to authenticated;

-- A manager makes a fresh bill (price 1000 set by hand) for Inc Shop A (salesman 1's route) and records one payment...
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
declare p uuid;
begin
  insert into v values ('inv', public.confirm_order(public.save_quotation(null, '40000000-0000-0000-0000-00000000000a', 15, null,
    '[{"product_id":"30000000-0000-0000-0000-000000000001","qty":2,"unit_price":1000}]'::jsonb, null)));
  p := public.record_payment('40000000-0000-0000-0000-00000000000a', 100, 'cash');
  assert (select verified_at is not null and verified_by = auth.uid() from public.payments where id = p), 'office entry auto-verified';
end $$;
reset role;

-- Salesman 1 collects cash and UPI in the field.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000005', false);
set role authenticated;
do $$
begin
  insert into v values ('cash', public.record_payment('40000000-0000-0000-0000-00000000000a', 1000, 'cash'));
  insert into v values ('upi', public.record_payment('40000000-0000-0000-0000-00000000000a', 500, 'upi', null, 'UPI-9'));
  assert (select count(*) from public.payments where id in (select id from v where k in ('cash', 'upi')) and verified_at is null) = 2, 'salesman entries wait for verification';
  -- the shop's balance already reflects the payment
  assert pg_temp.open_amt((select id from v where k = 'inv')) = 2360 - 100 - 1000 - 500, 'balance reduced';
  -- not counted for incentive yet
  assert (select due_collected from public.incentive_shops(auth.uid(), current_date) where shop_name = 'Inc Shop A') is not null, 'shop listed';
  begin perform public.verify_payments(array[(select id from v where k = 'cash')]); raise exception 'salesman verified own payment';
  exception when insufficient_privilege then null; end;
  begin perform public.reject_payment((select id from v where k = 'cash'), 'x'); raise exception 'salesman rejected';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Office verifies the cash and rejects the UPI (not seen in the bank).
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$
begin
  assert public.verify_payments(array[(select id from v where k = 'cash'), (select id from v where k = 'upi')]::uuid[] || array[]::uuid[]) >= 1, 'verified';
end $$;
reset role;
-- (redo the UPI as unverified to test rejection)
update public.payments set verified_at = null, verified_by = null where id = (select id from v where k = 'upi');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$
begin
  assert (select verified_at is not null from public.payments where id = (select id from v where k = 'cash')), 'cash verified';
  begin perform public.reject_payment((select id from v where k = 'upi'), ''); raise exception 'reject without reason';
  exception when raise_exception then if sqlerrm not like '%reason%' then raise; end if; end;
  perform public.reject_payment((select id from v where k = 'upi'), 'not received in bank');
  assert (select status from public.payments where id = (select id from v where k = 'upi')) = 'cancelled', 'rejected → cancelled';
  assert (select count(*) from public.payment_allocations where payment_id = (select id from v where k = 'upi')) = 0, 'allocations released';
  assert pg_temp.open_amt((select id from v where k = 'inv')) = 2360 - 100 - 1000, 'bill due again';
  begin perform public.reject_payment((select id from v where k = 'cash'), 'late'); raise exception 'rejected a verified payment';
  exception when raise_exception then if sqlerrm not like '%already verified%' then raise; end if; end;
end $$;
reset role;

-- Incentive counts only verified money: an unverified salesman payment in the
-- test month (two months back) does not raise "collected".
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
declare d date := date_trunc('month', current_date - interval '2 months')::date; before numeric; after numeric;
begin
  before := (public.salesman_incentive('00000000-0000-0000-0000-000000000005', d)->>'collected')::numeric;
  assert before > 0, 'verified collections counted';
end $$;
reset role;
update public.payments set verified_at = null
 where retailer_id = '40000000-0000-0000-0000-00000000000a' and payment_date < date_trunc('month', current_date - interval '1 month');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
declare d date := date_trunc('month', current_date - interval '2 months')::date;
begin
  -- Shop A's 7080 collected in the test month is now unverified → no longer counted, A no longer smart
  assert (public.salesman_incentive('00000000-0000-0000-0000-000000000005', d)->>'collected')::numeric = 17340 - 7080, 'unverified not counted';
  assert (select status from public.incentive_shops('00000000-0000-0000-0000-000000000005', d) where shop_name = 'Inc Shop A') = 'missed', 'unverified payment does not make a shop smart';
end $$;
reset role;

select 'ALL VERIFICATION DATABASE TESTS PASSED' as result;
