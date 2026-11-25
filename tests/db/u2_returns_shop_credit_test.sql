-- =============================================================================
-- Returns and shop credit (0040)
--
-- Shop "Return Shop": invoice A (3 cables, ₹527) and B (2 cables, ₹352).
-- ₹527 cash pays A. Then:
--   1. return 1 cable of A   → return ₹176 (rounded), A's extra ₹176 moves to B
--   2. return the other 2    → return takes exactly what is left (₹351);
--                              B is paid, ₹175 stays as shop credit
--   3. statement and Outstanding agree; nothing below zero
--   4. money given back: limits, UPI reference, statement debit, payment guard,
--      re-allocation keeps it, cancel puts the credit back
--   5. the next invoice uses the credit; credit limit counts it
--   6. who may do what
-- Cable: ₹149 + 18% GST (exclusive).
-- =============================================================================
\set ON_ERROR_STOP 1
select set_config('request.jwt.claim.sub', '', false);

insert into public.retailers (shop_name, mobile, billing_city, billing_state_code)
values ('Return Shop', '9311100001', 'Sangamner', '27');

create temp table rs (k text primary key, v uuid);
grant all on rs to authenticated;
insert into rs select 'shop', id from public.retailers where mobile = '9311100001';

-- ---------- invoices A and B, A paid in cash (billing) ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$
declare v_r uuid := (select v from rs where k = 'shop'); v_o uuid; v_a uuid; v_b uuid; v_p uuid;
begin
  v_o := public.save_quotation(null, v_r, 15, null, '[{"product_id":"30000000-0000-0000-0000-000000000002","qty":3}]'::jsonb);
  v_a := public.confirm_order(v_o);
  v_o := public.save_quotation(null, v_r, 15, null, '[{"product_id":"30000000-0000-0000-0000-000000000002","qty":2}]'::jsonb);
  v_b := public.confirm_order(v_o);
  insert into rs values ('a', v_a), ('b', v_b);
  assert (select grand_total from public.invoices where id = v_a) = 527, 'A is ₹527';
  assert (select grand_total from public.invoices where id = v_b) = 352, 'B is ₹352';

  v_p := public.record_payment(v_r, 527, 'cash');
  insert into rs values ('pay', v_p);
  assert (select balance from public.invoice_balances where invoice_id = v_a) = 0, 'A paid';
  assert (select balance from public.invoice_balances where invoice_id = v_b) = 352, 'B unpaid';
end $$;
reset role;

-- ---------- 1. part return: rounded, extra moves to the other bill ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$
declare v_r uuid := (select v from rs where k = 'shop'); v_a uuid := (select v from rs where k = 'a'); v_b uuid := (select v from rs where k = 'b');
        v_line uuid; v_cn uuid;
begin
  select id into v_line from public.invoice_lines where invoice_id = v_a;
  v_cn := public.create_credit_note(v_a, '1 cable came back', false, jsonb_build_array(jsonb_build_object('invoice_line_id', v_line, 'qty', 1)));
  assert (select taxable_total = 149 and cgst_total + sgst_total = 26.82 and grand_total = 176 and round_off = 0.18
            from public.credit_notes where id = v_cn), 'return of 1 cable: ₹175.82 rounded to ₹176';
  assert (select balance from public.invoice_balances where invoice_id = v_a) = 0, 'A stays at zero, not -176';
  assert (select balance from public.invoice_balances where invoice_id = v_b) = 176, 'A''s extra ₹176 paid part of B';
  assert public.shop_credit(v_r) = 0, 'no credit yet';
end $$;
reset role;

-- ---------- 2. return the rest: exactly what is left; credit remains ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$
declare v_r uuid := (select v from rs where k = 'shop'); v_a uuid := (select v from rs where k = 'a'); v_b uuid := (select v from rs where k = 'b');
        v_line uuid; v_cn uuid;
begin
  select id into v_line from public.invoice_lines where invoice_id = v_a;
  begin
    perform public.create_credit_note(v_a, 'too many', false, jsonb_build_array(jsonb_build_object('invoice_line_id', v_line, 'qty', 3)));
    raise exception 'returned more than was sold';
  exception when raise_exception then
    if sqlerrm not like 'Only 2 of%can still be returned' then raise; end if;
  end;
  v_cn := public.create_credit_note(v_a, '2 more came back', false, jsonb_build_array(jsonb_build_object('invoice_line_id', v_line, 'qty', 2)));
  assert (select grand_total = 351 and round_off = -0.64 from public.credit_notes where id = v_cn),
    'last return takes what is left: ₹527 − ₹176 = ₹351 (lines ₹351.64)';
  assert (select credited from public.invoice_balances where invoice_id = v_a) = 527, 'A fully returned';
  assert (select balance from public.invoice_balances where invoice_id = v_a) = 0, 'A exactly zero';
  assert (select balance from public.invoice_balances where invoice_id = v_b) = 0, 'B now paid';
  assert public.shop_credit(v_r) = 175, 'shop credit ₹175, got ' || public.shop_credit(v_r);
  assert (select outstanding = 0 and unallocated = 175 from public.retailer_balances where retailer_id = v_r), 'Outstanding shows the credit';
  begin
    perform public.create_credit_note(v_a, 'again', false, jsonb_build_array(jsonb_build_object('invoice_line_id', v_line, 'qty', 1)));
    raise exception 'returned a fully returned invoice';
  exception when raise_exception then
    if sqlerrm not like 'Only 0 of%' then raise; end if;
  end;
end $$;
reset role;

-- ---------- 3. statement and Outstanding agree ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);  -- manager
set role authenticated;
do $$
declare v_r uuid := (select v from rs where k = 'shop'); s record;
begin
  select * into s from public.account_statement('retailer', v_r, null, null);
  assert s.closing = -175, 'closing -175 (credit), got ' || s.closing;
  assert s.bills_due = 0 and s.advance = 175, 'bills due 0, advance 175';
  assert s.closing = s.bills_due - s.advance, 'closing = bills due − advance';
  assert (select balance from public.account_statement_entries('retailer', v_r, null, null) order by line_no desc limit 1) = -175,
    'running balance ends at -175';
end $$;
reset role;

-- ---------- 4. giving money back ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', false);  -- billing
set role authenticated;
do $$
declare v_r uuid := (select v from rs where k = 'shop'); v_f uuid; s record;
begin
  begin
    perform public.record_refund(v_r, 200, 'cash');
    raise exception 'refunded more than the credit';
  exception when raise_exception then
    if sqlerrm not like 'Only ₹175 of shop credit%' then raise; end if;
  end;
  begin
    perform public.record_refund(v_r, 50, 'upi');
    raise exception 'UPI refund without reference';
  exception when raise_exception then
    if sqlerrm not like 'Enter the UPI reference%' then raise; end if;
  end;
  begin
    perform public.record_refund(v_r, 50, 'cheque');
    raise exception 'cheque refund accepted';
  exception when raise_exception then
    if sqlerrm not like 'Give money back in cash or UPI%' then raise; end if;
  end;
  v_f := public.record_refund(v_r, 100, 'cash', null, null, 'Returned cables');
  insert into rs values ('refund', v_f);
  assert (select refund_no like '%/RFD/%' and status = 'issued' from public.retailer_refunds where id = v_f), 'refund numbered';
  assert public.shop_credit(v_r) = 75, 'credit 75 after ₹100 back';
  assert (select unallocated from public.retailer_balances where retailer_id = v_r) = 75, 'Outstanding shows 75';
  assert exists (select 1 from public.retailer_ledger where retailer_id = v_r and kind = 'refund' and debit = 100), 'ledger shows the refund';
  select * into s from public.account_statement('retailer', v_r, null, null);
  assert s.refunded = 100 and s.closing = -75 and s.advance = 75 and s.closing = s.bills_due - s.advance, 'statement counts the refund';
  assert exists (select 1 from public.account_statement_entries('retailer', v_r, null, null) where kind = 'refund' and debit = 100), 'statement line';
  -- re-allocating the payment keeps the money that went back
  perform public.reallocate_payment((select v from rs where k = 'pay'), null);
  assert (select sum(amount) from public.payment_allocations where refund_id = v_f) = 100, 'refund still funded';
  assert public.shop_credit(v_r) = 75, 'credit unchanged by re-allocation';
  -- billing cannot cancel a refund
  begin
    perform public.cancel_refund(v_f, 'mistake');
    raise exception 'billing cancelled a refund';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);  -- manager
set role authenticated;
do $$
declare v_r uuid := (select v from rs where k = 'shop'); v_f uuid := (select v from rs where k = 'refund');
begin
  begin
    perform public.set_payment_status((select v from rs where k = 'pay'), 'cancelled', 'test');
    raise exception 'cancelled a payment that funded a refund';
  exception when raise_exception then
    if sqlerrm not like 'Part of this payment was given back%' then raise; end if;
  end;
  perform public.cancel_refund(v_f, 'Entered twice');
  assert (select status from public.retailer_refunds where id = v_f) = 'cancelled', 'cancelled';
  assert public.shop_credit(v_r) = 175, 'credit back to 175';
  assert not exists (select 1 from public.account_statement_entries('retailer', v_r, null, null) where kind = 'refund'), 'cancelled refund leaves the statement';
  begin
    perform public.cancel_refund(v_f, 'again');
    raise exception 'cancelled twice';
  exception when raise_exception then
    if sqlerrm not like 'Refund is already cancelled%' then raise; end if;
  end;
end $$;
reset role;

-- salesman cannot give money back
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000005', false);
set role authenticated;
do $$
begin
  perform public.record_refund((select v from rs where k = 'shop'), 10, 'cash');
  raise exception 'salesman gave money back';
exception when insufficient_privilege then null;
end $$;
reset role;

-- ---------- 5. the next invoice uses the credit; credit limit counts it ----------
update public.retailers set credit_limit = 200 where id = (select v from rs where k = 'shop');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$
declare v_r uuid := (select v from rs where k = 'shop'); v_o uuid; v_c uuid;
begin
  -- 2 cables (₹352) with a ₹200 limit: allowed, because ₹175 credit is spent first (352 − 175 = 177 ≤ 200)
  v_o := public.save_quotation(null, v_r, 15, null, '[{"product_id":"30000000-0000-0000-0000-000000000002","qty":2}]'::jsonb);
  v_c := public.confirm_order(v_o);
  assert (select balance from public.invoice_balances where invoice_id = v_c) = 177, 'new bill uses the ₹175 credit';
  assert public.shop_credit(v_r) = 0, 'credit used up';
end $$;
reset role;

-- ---------- final reconciliation for the shop ----------
do $$
declare v_r uuid := (select v from rs where k = 'shop'); b record;
begin
  select * into b from public.retailer_balances where retailer_id = v_r;
  assert b.outstanding - b.unallocated
         = b.total_invoiced - b.total_credited - b.total_received
           + coalesce((select sum(amount) from public.retailer_refunds where retailer_id = v_r and status = 'issued'), 0),
    'Outstanding net = invoiced − returned − received + given back';
  assert not exists (select 1 from public.invoice_balances where balance < 0), 'no invoice anywhere below zero';
end $$;
