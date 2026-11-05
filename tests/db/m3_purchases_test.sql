-- =============================================================================
-- Purchases: suppliers, PO, receive (stock + cost), GST split, duplicate bill,
-- supplier payments (advance, FIFO, manual), cancellation, privacy.
-- Runs after m0–m2 tests.
-- =============================================================================
\set ON_ERROR_STOP 1

create temp table pids (k text primary key, v uuid);
grant all on pids to authenticated;

-- ---------- Billing: suppliers ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$
declare v_cq uuid; v_gj uuid;
begin
  assert (select count(*) from public.suppliers where name in ('CONQRETE', 'BLUEI')) = 2, 'seeded suppliers';
  update public.suppliers set gstin = '27aabcc1234d1z5', mobile = '+91 98220 00099' where name = 'CONQRETE';
  select id into v_cq from public.suppliers where name = 'CONQRETE';
  assert (select state_code = '27' and gstin = '27AABCC1234D1Z5' and mobile = '9822000099' from public.suppliers where id = v_cq), 'supplier normalised';
  insert into public.suppliers (name, gstin) values ('Gujarat Traders', '24ABCDE1234F1Z5') returning id into v_gj;
  assert (select code ~ '^SUP-[0-9]{4}$' from public.suppliers where id = v_gj), 'supplier code';
  insert into pids values ('cq', v_cq), ('gj', v_gj);
end $$;
reset role;

-- ---------- Billing: PO, receive, cost update ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$
declare v_po uuid; v_wh uuid; v_before numeric; p record; v_pay uuid; v_po2 uuid; v_ig uuid;
begin
  select id into v_wh from public.warehouses where name = 'Main Warehouse';
  v_before := (select coalesce(sum(qty), 0) from public.stock_movements where product_id = '30000000-0000-0000-0000-000000000001' and warehouse_id = v_wh);

  -- advance paid before the bill exists
  v_pay := public.record_supplier_payment((select v from pids where k = 'cq'), 5000, 'bank_transfer', null, 'NEFT-1');
  assert (select count(*) from public.supplier_payment_allocations where payment_id = v_pay) = 0, 'advance unallocated';

  v_po := public.save_purchase(null, (select v from pids where k = 'cq'), v_wh, null, null, 30, 100, 'first PO',
    '[{"product_id":"30000000-0000-0000-0000-000000000001","qty":20,"unit_cost":900,"discount_pct":10}]'::jsonb);
  select * into p from public.purchases where id = v_po;
  assert p.status = 'ordered' and p.purchase_no like 'APX/PUR/__-__/%', 'PO created';
  -- 20 × 900 = 18000, −10% = 16200, GST 18% = 2916 (in-state), + 100 freight = 19216
  assert p.taxable_total = 16200 and p.cgst_total = 1458 and p.sgst_total = 1458 and p.igst_total = 0, 'GST split ' || p.taxable_total;
  assert p.grand_total = 19216, 'grand ' || p.grand_total;

  -- edit while ordered
  perform public.save_purchase(v_po, (select v from pids where k = 'cq'), v_wh, null, null, 30, 100, 'first PO',
    '[{"product_id":"30000000-0000-0000-0000-000000000001","qty":25,"unit_cost":900,"discount_pct":10}]'::jsonb);
  assert (select qty from public.purchase_lines where purchase_id = v_po) = 25, 'edited qty';

  begin perform public.receive_purchase(v_po, '', current_date); raise exception 'no bill no accepted';
  exception when raise_exception then if sqlerrm not like '%bill number%' then raise; end if; end;

  perform public.receive_purchase(v_po, 'CQ/2026/101', current_date);
  select * into p from public.purchases where id = v_po;
  assert p.status = 'received' and p.due_date = current_date + 30, 'received with due date';
  assert (select coalesce(sum(qty), 0) from public.stock_movements where product_id = '30000000-0000-0000-0000-000000000001' and warehouse_id = v_wh) = v_before + 25, 'stock added';
  assert (select unit_cost from public.stock_movements where reference_type = 'purchase' and reference_id = v_po) = 810, 'net cost 810';
  assert (select purchase_cost from public.products where id = '30000000-0000-0000-0000-000000000001') = 810, 'product cost updated';
  -- the 5000 advance got applied to the new bill
  assert public.purchase_open_amount(v_po) = p.grand_total - 5000, 'advance applied: ' || public.purchase_open_amount(v_po);

  begin perform public.receive_purchase(v_po, 'X', current_date); raise exception 'double receive';
  exception when raise_exception then if sqlerrm not like '%already been received%' then raise; end if; end;
  begin perform public.save_purchase(v_po, (select v from pids where k = 'cq'), v_wh, null, null, 30, 0, null,
      '[{"product_id":"30000000-0000-0000-0000-000000000001","qty":1,"unit_cost":1}]'::jsonb);
    raise exception 'edited a received purchase';
  exception when raise_exception then if sqlerrm not like '%not yet received%' then raise; end if; end;

  -- same bill number from the same supplier is refused
  v_po2 := public.save_purchase(null, (select v from pids where k = 'cq'), v_wh, null, null, 30, 0, null,
    '[{"product_id":"30000000-0000-0000-0000-000000000002","qty":10,"unit_cost":118,"cost_mode":"inclusive"}]'::jsonb);
  begin perform public.receive_purchase(v_po2, 'cq/2026/101', current_date); raise exception 'duplicate bill accepted';
  exception when raise_exception then if sqlerrm not like '%already entered%' then raise; end if; end;
  perform public.receive_purchase(v_po2, 'CQ/2026/102', current_date - 5, null, false);
  assert (select taxable_total from public.purchases where id = v_po2) = 1000, 'inclusive cost → taxable 1000';

  -- out-of-state supplier → IGST
  v_ig := public.save_purchase(null, (select v from pids where k = 'gj'), v_wh, null, null, 15, 0, null,
    '[{"product_id":"30000000-0000-0000-0000-000000000002","qty":10,"unit_cost":100}]'::jsonb);
  assert (select is_igst and igst_total = 180 and cgst_total = 0 from public.purchases where id = v_ig), 'IGST purchase';

  insert into pids values ('po1', v_po), ('po2', v_po2), ('ig', v_ig);
end $$;
reset role;

-- ---------- Payments: FIFO and manual ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$
declare v_pay uuid; v_open1 numeric; v_open2 numeric;
begin
  v_open1 := public.purchase_open_amount((select v from pids where k = 'po1'));
  v_open2 := public.purchase_open_amount((select v from pids where k = 'po2'));
  -- po2 bill date is 5 days older, so it is due first
  v_pay := public.record_supplier_payment((select v from pids where k = 'cq'), v_open2 + 1000, 'upi', null, 'UPI-77');
  assert public.purchase_open_amount((select v from pids where k = 'po2')) = 0, 'older bill cleared first';
  assert public.purchase_open_amount((select v from pids where k = 'po1')) = v_open1 - 1000, 'rest to next bill';

  begin
    perform public.record_supplier_payment((select v from pids where k = 'cq'), 100, 'upi');
    raise exception 'UPI without reference accepted';
  exception when raise_exception then if sqlerrm not like '%UPI reference%' then raise; end if; end;

  perform public.record_supplier_payment((select v from pids where k = 'cq'), 500, 'cash', null, null, null,
    jsonb_build_array(jsonb_build_object('purchase_id', (select v from pids where k = 'po1'), 'amount', 500)));
  assert public.purchase_open_amount((select v from pids where k = 'po1')) = v_open1 - 1500, 'manual allocation';
  assert (select sum(credit - debit) from public.supplier_ledger where supplier_id = (select v from pids where k = 'cq'))
       = (select sum(balance) from public.purchase_balances where supplier_id = (select v from pids where k = 'cq')), 'ledger = balances';

  -- billing cannot cancel a received purchase or a payment
  begin perform public.cancel_purchase((select v from pids where k = 'po1'), 'x'); raise exception 'billing cancelled received';
  exception when insufficient_privilege then null; end;
  begin perform public.cancel_supplier_payment(v_pay, 'x'); raise exception 'billing cancelled payment';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- ---------- Manager: cancellations ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
declare v_stock numeric; v_wh uuid;
begin
  select id into v_wh from public.warehouses where name = 'Main Warehouse';
  begin perform public.cancel_purchase((select v from pids where k = 'po1'), 'wrong'); raise exception 'cancelled a paid bill';
  exception when raise_exception then if sqlerrm not like '%Payments are applied%' then raise; end if; end;
  -- the IGST order was never received: simple cancel
  perform public.cancel_purchase((select v from pids where k = 'ig'), 'not needed');
  assert (select status from public.purchases where id = (select v from pids where k = 'ig')) = 'cancelled', 'PO cancelled';
  -- cancel all CONQRETE payments, then the received bill can be cancelled and its stock leaves
  perform public.cancel_supplier_payment(id, 'test') from public.supplier_payments
    where supplier_id = (select v from pids where k = 'cq') and status = 'paid';
  v_stock := (select sum(qty) from public.stock_movements where product_id = '30000000-0000-0000-0000-000000000002' and warehouse_id = v_wh);
  perform public.cancel_purchase((select v from pids where k = 'po2'), 'entered twice');
  assert (select sum(qty) from public.stock_movements where product_id = '30000000-0000-0000-0000-000000000002' and warehouse_id = v_wh) = v_stock - 10, 'stock reversed';
end $$;
reset role;

-- ---------- Privacy: warehouse and salesman ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', false);
set role authenticated;
do $$
declare v_po uuid; v_wh uuid;
begin
  assert (select count(*) from public.purchases) = 0, 'warehouse cannot see purchase costs';
  assert (select count(*) from public.suppliers) >= 3, 'warehouse sees suppliers';
  assert (select count(*) from public.purchase_receipts) >= 1, 'warehouse sees what to receive';
  begin
    perform public.save_purchase(null, (select id from public.suppliers where name = 'BLUEI'), (select id from public.warehouses limit 1),
      null, null, 30, 0, null, '[{"product_id":"30000000-0000-0000-0000-000000000002","qty":1,"unit_cost":1}]'::jsonb);
    raise exception 'warehouse created a purchase';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- warehouse can receive a PO created by billing
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$ begin
  insert into pids values ('po3', public.save_purchase(null, (select id from public.suppliers where name = 'BLUEI'),
    (select id from public.warehouses where name = 'Main Warehouse'), null, null, 30, 0, null,
    '[{"product_id":"30000000-0000-0000-0000-000000000002","qty":5,"unit_cost":100}]'::jsonb));
end $$;
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', false);
set role authenticated;
do $$ begin
  perform public.receive_purchase((select v from pids where k = 'po3'), 'BL-55', current_date);
  assert (select status from public.purchase_receipts where purchase_id = (select v from pids where k = 'po3') limit 1) = 'received', 'warehouse received';
end $$;
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000005', false);
set role authenticated;
do $$ begin
  assert (select count(*) from public.suppliers) = 0, 'salesman sees no suppliers';
  assert (select count(*) from public.purchase_receipts) = 0, 'salesman sees no receipts';
  assert (select count(*) from public.supplier_payments) = 0, 'salesman sees no supplier payments';
end $$;
reset role;

select 'ALL PURCHASE DATABASE TESTS PASSED' as result;
