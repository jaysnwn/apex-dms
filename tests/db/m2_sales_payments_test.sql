-- =============================================================================
-- M2–M5 tests: quotations, GST, invoice confirm (stock + credit checks),
-- duplicates, IGST, payments (FIFO, manual, cheques), dispatch, cancellation,
-- credit notes, ledger, cost privacy, classification, route plans, expenses.
-- Runs after m0 and m1 tests.
-- =============================================================================
\set ON_ERROR_STOP 1

-- clean slate for orders created by earlier tests (they used direct inserts)
create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated;

-- ---------- Billing: quotation with discount + GST ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$
declare v_o uuid; v_inv uuid; o record; v_again uuid;
begin
  v_o := public.save_quotation(null, '20000000-0000-0000-0000-000000000001', 15, 'first order',
    '[{"product_id":"30000000-0000-0000-0000-000000000001","qty":10,"discount_pct":5},
      {"product_id":"30000000-0000-0000-0000-000000000002","qty":20}]'::jsonb);
  select * into o from public.orders where id = v_o;
  assert o.status = 'quotation', 'should be quotation';
  assert o.taxable_total = 14370.50, 'taxable ' || o.taxable_total;
  assert o.tax_total = 2586.69, 'tax ' || o.tax_total;
  assert o.grand_total = 16957 and o.round_off = -0.19, 'grand ' || o.grand_total || ' ro ' || o.round_off;

  v_inv := public.confirm_order(v_o);
  v_again := public.confirm_order(v_o);
  assert v_inv = v_again, 'second confirm must return the same invoice';
  assert (select count(*) from public.invoices where order_id = v_o) = 1, 'exactly one invoice';
  assert (select status from public.orders where id = v_o) = 'invoiced', 'order invoiced';
  assert (select not is_igst and cgst_total + sgst_total = 2586.69 and igst_total = 0 and due_date = invoice_date + 15
            from public.invoices where id = v_inv), 'CGST/SGST split and due date';
  assert (select invoice_no ~ '^CQ/[0-9]{2}-[0-9]{2}/[0-9]{5}$' and length(invoice_no) <= 16 from public.invoices where id = v_inv),
    'brand-wise invoice number: ' || (select invoice_no from public.invoices where id = v_inv);
  insert into ids values ('inv1', v_inv);

  -- reserved stock now reduces availability (power bank 50 on hand, 10 reserved)
  assert public.product_available('30000000-0000-0000-0000-000000000001') = 40, 'available after invoice';

  -- not enough stock -> blocked with a clear message
  v_o := public.save_quotation(null, '20000000-0000-0000-0000-000000000001', 15, null,
    '[{"product_id":"30000000-0000-0000-0000-000000000001","qty":1000}]'::jsonb);
  begin
    perform public.confirm_order(v_o);
    raise exception 'stock short not detected';
  exception when raise_exception then
    if sqlerrm not like 'Not enough stock%needed 1000, available 40%' then raise; end if;
  end;
  insert into ids values ('big_quote', v_o);
end $$;
reset role;

-- ---------- Salesman: discount cap, cannot confirm ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000005', false);
set role authenticated;
do $$
declare v_o uuid;
begin
  begin
    perform public.save_quotation(null, '20000000-0000-0000-0000-000000000001', 15, null,
      '[{"product_id":"30000000-0000-0000-0000-000000000002","qty":5,"discount_pct":6}]'::jsonb);
    raise exception 'salesman discount above cap accepted';
  exception when raise_exception then
    if sqlerrm not like '%at most 5 percent%' then raise; end if;
  end;
  v_o := public.save_quotation(null, '20000000-0000-0000-0000-000000000001', 15, null,
    '[{"product_id":"30000000-0000-0000-0000-000000000002","qty":5,"discount_pct":5}]'::jsonb,
    'aaaaaaaa-0000-0000-0000-000000000001');
  -- offline replay with the same client id returns the same order
  assert public.save_quotation(null, '20000000-0000-0000-0000-000000000001', 15, null,
    '[{"product_id":"30000000-0000-0000-0000-000000000002","qty":5}]'::jsonb,
    'aaaaaaaa-0000-0000-0000-000000000001') = v_o, 'idempotent replay';
  begin
    perform public.confirm_order(v_o);
    raise exception 'salesman confirmed an invoice';
  exception when insufficient_privilege then null;
  end;
  -- salesman cannot quote for a retailer outside his route
  begin
    perform public.save_quotation(null, '20000000-0000-0000-0000-000000000002', 15, null,
      '[{"product_id":"30000000-0000-0000-0000-000000000002","qty":1}]'::jsonb);
    raise exception 'salesman quoted for another route';
  exception when insufficient_privilege then null;
  end;
  -- cost is hidden
  begin
    perform unit_cost from public.invoice_lines limit 1;
    raise exception 'salesman read unit_cost';
  exception when insufficient_privilege then null;
  end;
  assert (select count(*) from public.sales_costs) = 0, 'salesman must not see sales costs';
  assert (select count(*) from public.sales_register) > 0, 'salesman sees his sales';
end $$;
reset role;

-- ---------- Credit limit ----------
update public.retailers set credit_limit = 20000 where id = '20000000-0000-0000-0000-000000000001';
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$
declare v_o uuid;
begin
  v_o := public.save_quotation(null, '20000000-0000-0000-0000-000000000001', 30, null,
    '[{"product_id":"30000000-0000-0000-0000-000000000001","qty":5}]'::jsonb);
  insert into ids values ('over_limit', v_o);
  begin
    perform public.confirm_order(v_o);
    raise exception 'credit limit not enforced';
  exception when raise_exception then
    if sqlerrm not like 'Credit limit exceeded%' then raise; end if;
  end;
  begin
    perform public.confirm_order(v_o, true);   -- billing cannot override
    raise exception 'billing overrode the credit limit';
  exception when raise_exception then
    if sqlerrm not like 'Credit limit exceeded%' then raise; end if;
  end;
end $$;
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);  -- manager
set role authenticated;
do $$
declare v_inv uuid;
begin
  v_inv := public.confirm_order((select v from ids where k = 'over_limit'), true);
  insert into ids values ('inv2', v_inv);
  assert (select credit_days = 30 and due_date = invoice_date + 30 from public.invoices where id = v_inv), 'own credit period';
end $$;
reset role;

-- ---------- IGST for an out-of-state retailer ----------
-- a registered (GSTIN) buyer needs a billing address and PIN on the invoice
update public.retailers set billing_address = 'Ring Road', billing_pincode = '395002' where mobile = '9822000010';
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$
declare v_o uuid; v_inv uuid; v_r uuid := (select id from public.retailers where mobile = '9822000010');
begin
  v_o := public.save_quotation(null, v_r, 10, null, '[{"product_id":"30000000-0000-0000-0000-000000000002","qty":10}]'::jsonb);
  v_inv := public.confirm_order(v_o);
  insert into ids values ('inv_igst', v_inv);
  assert (select is_igst and igst_total = 268.20 and cgst_total = 0 and place_of_supply = '24'
            from public.invoices where id = v_inv), 'IGST invoice';
end $$;
reset role;

-- ---------- Payments: FIFO, cheque, bounce, manual, advance ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$
declare
  v_inv1 uuid := (select v from ids where k = 'inv1');
  v_inv2 uuid := (select v from ids where k = 'inv2');
  v_p uuid; v_chq uuid; v_due date;
begin
  select due_date into v_due from public.invoices where id = v_inv1;
  -- 10,000 cash goes to the oldest due invoice (inv1, due in 15 days) first
  v_p := public.record_payment('20000000-0000-0000-0000-000000000001', 10000, 'cash');
  assert (select balance from public.invoice_balances where invoice_id = v_inv1) = 6957, 'inv1 partial';
  assert (select due_date from public.invoices where id = v_inv1) = v_due, 'due date unchanged';

  -- reference required for UPI
  begin
    perform public.record_payment('20000000-0000-0000-0000-000000000001', 100, 'upi');
    raise exception 'UPI without reference accepted';
  exception when raise_exception then null;
  end;

  -- cheque: allocated but not counted as paid until cleared
  v_chq := public.record_payment('20000000-0000-0000-0000-000000000001', 6957, 'cheque', null, '000123', current_date, 'SBI');
  assert (select status from public.payments where id = v_chq) = 'cheque_pending', 'cheque pending';
  assert (select balance = 6957 and cheque_pending = 6957 from public.invoice_balances where invoice_id = v_inv1), 'pending not paid';
  perform public.set_payment_status(v_chq, 'received');
  assert (select balance from public.invoice_balances where invoice_id = v_inv1) = 0, 'inv1 settled after clearing';

  -- bounced cheque frees the invoice again
  v_chq := public.record_payment('20000000-0000-0000-0000-000000000001', 1000, 'cheque', null, '000124');
  assert (select count(*) from public.payment_allocations where payment_id = v_chq) = 1, 'cheque allocated to inv2';
  perform public.set_payment_status(v_chq, 'bounced', 'insufficient funds');
  assert (select count(*) from public.payment_allocations where payment_id = v_chq) = 0, 'bounce removes allocation';

  -- manual allocation and over-allocation guard
  begin
    perform public.record_payment('20000000-0000-0000-0000-000000000001', 100000, 'cash', null, null, null, null, null,
      jsonb_build_array(jsonb_build_object('invoice_id', v_inv2, 'amount', 99999)));
    raise exception 'over-allocation accepted';
  exception when raise_exception then
    if sqlerrm not like 'Allocation%more than the invoice balance%' then raise; end if;
  end;
  v_p := public.record_payment('20000000-0000-0000-0000-000000000001', 3000, 'bank_transfer', null, 'UTR123', null, null, null,
    jsonb_build_array(jsonb_build_object('invoice_id', v_inv2, 'amount', 2000)));
  assert (select sum(amount) from public.payment_allocations where payment_id = v_p) = 2000, 'manual allocation';
  assert (select unallocated from public.retailer_balances where retailer_id = '20000000-0000-0000-0000-000000000001') = 1000,
    'unallocated 1000, got ' || (select unallocated from public.retailer_balances where retailer_id = '20000000-0000-0000-0000-000000000001');
  -- re-allocate to FIFO picks up the rest
  perform public.reallocate_payment(v_p, null);
  assert (select sum(amount) from public.payment_allocations where payment_id = v_p) = 3000, 'fifo reallocation';
end $$;
reset role;

-- ---------- Dispatch & delivery ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', false);  -- warehouse
set role authenticated;
do $$
declare v_inv1 uuid := (select v from ids where k = 'inv1'); v_d uuid; v_main uuid := (select id from public.warehouses where name = 'CONQRETE Warehouse');
begin
  v_d := public.dispatch_invoice(v_inv1, v_main, 'MH17 AB 1234', null);
  assert (select on_hand from public.stock_on_hand where product_id = '30000000-0000-0000-0000-000000000001' and warehouse_id = v_main) = 40,
    'power bank deducted on dispatch';
  assert public.product_available('30000000-0000-0000-0000-000000000001') = 35, 'reserved released for dispatched, inv2 still reserves 5';
  begin
    perform public.dispatch_invoice(v_inv1, v_main);
    raise exception 'double dispatch accepted';
  exception when raise_exception then null;
  end;
  perform public.confirm_delivery(v_d, 'received by owner');
  assert (select o.status from public.orders o join public.invoices i on i.order_id = o.id where i.id = v_inv1) = 'delivered', 'delivered';
end $$;
reset role;

-- ---------- Cancellation & credit notes ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$
declare v_inv1 uuid := (select v from ids where k = 'inv1'); v_igst uuid := (select v from ids where k = 'inv_igst'); v_cn uuid; v_line uuid;
        v_main uuid := (select id from public.warehouses where name = 'CONQRETE Warehouse');
begin
  begin
    perform public.cancel_invoice(v_inv1, 'test');
    raise exception 'cancelled a dispatched invoice';
  exception when raise_exception then null;
  end;
  perform public.cancel_invoice(v_igst, 'Customer changed mind');
  assert (select status from public.invoices where id = v_igst) = 'cancelled', 'cancelled';
  assert public.product_available('30000000-0000-0000-0000-000000000002') = 75, 'cable reservation released (95 - 20 dispatched... )';

  select id into v_line from public.invoice_lines where invoice_id = v_inv1 and line_no = 1;
  v_cn := public.create_credit_note(v_inv1, '2 units returned damaged', true,
    jsonb_build_array(jsonb_build_object('invoice_line_id', v_line, 'qty', 2)));
  assert (select taxable_total = 2278.10 from public.credit_notes where id = v_cn), 'credit note taxable 2278.10';
  assert (select on_hand from public.stock_on_hand where product_id = '30000000-0000-0000-0000-000000000001' and warehouse_id = v_main) = 42,
    'restocked 2';
  begin
    perform public.create_credit_note(v_inv1, 'too many', false,
      jsonb_build_array(jsonb_build_object('invoice_line_id', v_line, 'qty', 9)));
    raise exception 'over-credit accepted';
  exception when raise_exception then
    if sqlerrm not like 'Only 8 of%' then raise; end if;
  end;
  assert (select count(*) from public.retailer_ledger where retailer_id = '20000000-0000-0000-0000-000000000001') >= 6, 'ledger rows';
end $$;
reset role;

-- ---------- Manager: classification, route plan ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
declare v_plan uuid;
begin
  perform public.classify_retailers();
  assert (select classification from public.retailers where id = '20000000-0000-0000-0000-000000000001') is not null, 'classified';
  v_plan := public.plan_route('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000005', current_date);
  assert (select count(*) from public.visits where route_plan_id = v_plan) >= 1, 'visits created';
  perform public.plan_route('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000005', current_date);
  assert (select count(*) from public.visits where route_plan_id = v_plan) =
         (select count(*) from public.retailers where route_id = '10000000-0000-0000-0000-000000000001'), 'no duplicate visits';
end $$;
reset role;

-- ---------- Salesman: visit + expense ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000005', false);
set role authenticated;
do $$ begin
  perform public.visit_check_in(v.id, null, 19.57, 74.21, 15, now(), null) from public.visits v
   where v.salesman_id = auth.uid() and v.planned_date = current_date;
  perform public.visit_check_out(v.id, null, 19.57, 74.21, 15, 'ok', null, now(), null) from public.visits v
   where v.salesman_id = auth.uid() and v.planned_date = current_date;
  assert (select count(*) from public.visits where status = 'completed') >= 1, 'visit completed';
  perform public.expense_save(null, null, (select id from public.expense_categories where code = 'fuel'), 450, current_date,
    '10000000-0000-0000-0000-000000000001', null, 'Petrol', 'cash', 'employee', null, null, true, null, 'salesman_app');
  begin
    update public.expenses set status = 'approved' where employee_id = auth.uid();
    raise exception 'salesman approved own expense';
  exception when insufficient_privilege or check_violation then null;
  end;
end $$;
reset role;

update public.profiles set can_reimburse = true where id = '00000000-0000-0000-0000-000000000002';
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$ declare v_r uuid; begin
  perform public.expense_review(array(select id from public.expenses where amount = 450), 'approve');
  v_r := public.reimburse_expenses((select jsonb_agg(jsonb_build_object('expense_id', id, 'amount', 450)) from public.expenses where amount = 450),
                                   current_date, 'upi', 'UPI-1', null, null, null);
  assert (select amount from public.reimbursements where id = v_r) = 450, 'reimbursed 450';
  assert (select reimbursement_status from public.expenses where amount = 450) = 'reimbursed', 'expense reimbursed';
end $$;
reset role;

select 'ALL M2-M5 DATABASE TESTS PASSED' as result;
