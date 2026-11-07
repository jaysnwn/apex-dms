-- =============================================================================
-- Multi-brand separation (0015): CONQRETE and BLUEI behave as two independent
-- inventories. Runs after the other suites (reuses users, retailers, products).
-- =============================================================================
\set ON_ERROR_STOP 1
select set_config('request.jwt.claim.sub', '', false);

-- Two extra users with ONE brand each
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000011', 'cq-store@apex.test', '{"role":"warehouse"}', '{"full_name":"Chetan CQ Store"}'),
  ('00000000-0000-0000-0000-000000000012', 'bl-mgr@apex.test',   '{"role":"manager"}',   '{"full_name":"Bhavna BL Manager"}');
insert into public.profile_brands (user_id, brand_id)
select '00000000-0000-0000-0000-000000000011', id from public.brands where name = 'CONQRETE';
insert into public.profile_brands (user_id, brand_id)
select '00000000-0000-0000-0000-000000000012', id from public.brands where name = 'BLUEI';

create temp table b (k text primary key, v uuid);
grant all on b to authenticated;
insert into b select 'cq', id from public.brands where name = 'CONQRETE';
insert into b select 'bl', id from public.brands where name = 'BLUEI';
insert into b select 'cqwh', id from public.warehouses where name = 'CONQRETE Warehouse';
insert into b select 'blwh', id from public.warehouses where name = 'BLUEI Warehouse';

do $$ begin
  assert (select code from public.brands where name = 'CONQRETE') = 'CQ', 'CONQRETE code';
  assert (select code from public.brands where name = 'BLUEI') = 'BL', 'BLUEI code';
  assert (select count(*) from public.warehouses where brand_id is null) = 0, 'every warehouse has a brand';
  assert (select count(*) from public.categories where brand_id = (select v from b where k = 'bl')) >= 5, 'BLUEI has its own categories';
end $$;

-- ---------- Super Admin: BLUEI catalogue, same SKU allowed across brands ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
declare v_cat_cq uuid := (select id from public.categories where brand_id = (select v from b where k = 'cq') limit 1);
begin
  insert into public.products (id, name, brand_id, sku, purchase_cost, retailer_price, mrp, gst_rate, min_stock_qty)
  values ('31000000-0000-0000-0000-000000000001', 'BLUEI 65W Charger', (select v from b where k = 'bl'), 'CH65', 500, 799, 1499, 18, 20),
         ('31000000-0000-0000-0000-000000000002', 'CONQRETE Havoc 65W Charger', (select v from b where k = 'cq'), 'CH65', 600, 899, 1599, 18, 10);

  begin
    insert into public.products (name, brand_id, sku) values ('dup', (select v from b where k = 'bl'), 'ch65');
    raise exception 'duplicate SKU inside one brand accepted';
  exception when unique_violation then null;
  end;
  begin
    insert into public.products (name, brand_id, sku, category_id) values ('wrong cat', (select v from b where k = 'bl'), 'X1', v_cat_cq);
    raise exception 'category of another brand accepted';
  exception when raise_exception then
    if sqlerrm not like '%category belongs to another brand%' then raise; end if;
  end;

  insert into public.stock_movements (product_id, warehouse_id, movement_type, qty, reason, created_by)
  values ('31000000-0000-0000-0000-000000000001', (select v from b where k = 'blwh'), 'opening', 300, 'opening', auth.uid()),
         ('31000000-0000-0000-0000-000000000002', (select v from b where k = 'cqwh'), 'opening', 500, 'opening', auth.uid());

  -- CONQRETE charger into the BLUEI warehouse: refused
  begin
    insert into public.stock_movements (product_id, warehouse_id, movement_type, qty, created_by)
    values ('31000000-0000-0000-0000-000000000002', (select v from b where k = 'blwh'), 'stock_in', 5, auth.uid());
    raise exception 'cross-brand stock accepted';
  exception when raise_exception then
    if sqlerrm not like '%cannot enter another brand%' then raise; end if;
  end;
  -- and a transfer between the brands' warehouses is impossible
  begin
    perform public.transfer_stock('31000000-0000-0000-0000-000000000002', (select v from b where k = 'cqwh'), (select v from b where k = 'blwh'), 5);
    raise exception 'cross-brand transfer accepted';
  exception when raise_exception then
    if sqlerrm not like '%cannot enter another brand%' then raise; end if;
  end;
  assert (select on_hand from public.stock_on_hand where product_id = '31000000-0000-0000-0000-000000000002'
           and warehouse_id = (select v from b where k = 'cqwh')) = 500, 'failed transfer left stock untouched';

  -- audit rows carry the brand
  assert exists (select 1 from public.audit_log where table_name = 'products'
                  and record_id = '31000000-0000-0000-0000-000000000001' and brand_id = (select v from b where k = 'bl')), 'audit brand';
end $$;
reset role;

-- ---------- CONQRETE-only warehouse user sees nothing of BLUEI ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000011', false);
set role authenticated;
do $$ begin
  assert (select count(*) from public.catalog where brand_id = (select v from b where k = 'bl')) = 0, 'no BLUEI catalogue';
  assert (select count(*) from public.catalog where brand_id = (select v from b where k = 'cq')) > 0, 'CONQRETE catalogue visible';
  assert (select count(*) from public.product_stock where brand_id = (select v from b where k = 'bl')) = 0, 'no BLUEI stock';
  assert (select count(*) from public.warehouses where brand_id = (select v from b where k = 'bl')) = 0, 'no BLUEI warehouse';
  assert (select count(*) from public.stock_movements where brand_id = (select v from b where k = 'bl')) = 0, 'no BLUEI movements';
  assert (select count(*) from public.stock_ledger where brand_id = (select v from b where k = 'bl')) = 0, 'no BLUEI ledger';
  assert (select count(*) from public.categories where brand_id = (select v from b where k = 'bl')) = 0, 'no BLUEI categories';
  begin
    insert into public.stock_movements (product_id, warehouse_id, movement_type, qty, created_by)
    values ('31000000-0000-0000-0000-000000000001', (select v from b where k = 'blwh'), 'stock_in', 5, auth.uid());
    raise exception 'CONQRETE user changed BLUEI stock';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.start_stock_count((select v from b where k = 'blwh'));
    raise exception 'CONQRETE user started a BLUEI count';
  exception when insufficient_privilege then null;
  end;
  -- warehouse staff cannot adjust stock directly (counts or a manager do that)
  begin
    insert into public.stock_movements (product_id, warehouse_id, movement_type, qty, reason, created_by)
    values ('31000000-0000-0000-0000-000000000002', (select v from b where k = 'cqwh'), 'adjustment', -1, 'x', auth.uid());
    raise exception 'warehouse posted an adjustment';
  exception when insufficient_privilege then null;
  end;
  -- outward with a reason is allowed
  insert into public.stock_movements (product_id, warehouse_id, movement_type, qty, reason, reference_no, client_uuid, created_by)
  values ('31000000-0000-0000-0000-000000000002', (select v from b where k = 'cqwh'), 'stock_out', -2, 'Sample to retailer', 'S-1',
          '99999999-0000-0000-0000-000000000001', auth.uid());
  begin
    insert into public.stock_movements (product_id, warehouse_id, movement_type, qty, reason, client_uuid, created_by)
    values ('31000000-0000-0000-0000-000000000002', (select v from b where k = 'cqwh'), 'stock_out', -2, 'Sample to retailer',
            '99999999-0000-0000-0000-000000000001', auth.uid());
    raise exception 'double submit posted twice';
  exception when unique_violation then null;
  end;
  begin
    insert into public.stock_movements (product_id, warehouse_id, movement_type, qty, created_by)
    values ('31000000-0000-0000-0000-000000000002', (select v from b where k = 'cqwh'), 'stock_out', -1, auth.uid());
    raise exception 'stock out without reason';
  exception when raise_exception then null;
  end;
  -- ledger shows before / after
  assert (select balance_before = 500 and balance_after = 498 and created_by_name = 'Chetan CQ Store' from public.stock_ledger
           where reference_no = 'S-1'), 'ledger before/after';
end $$;
reset role;

-- ---------- BLUEI-only manager ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000012', false);
set role authenticated;
do $$
declare v_count uuid; v_po uuid; v_ret uuid; v_line uuid; v_sup uuid := (select id from public.suppliers where name = 'BLUEI');
begin
  assert (select count(*) from public.products where brand_id = (select v from b where k = 'cq')) = 0, 'BLUEI manager sees no CONQRETE products';
  assert (select count(*) from public.inventory_valuation where brand_id = (select v from b where k = 'cq')) = 0, 'no CONQRETE valuation';
  assert (select count(*) from public.audit_log where brand_id = (select v from b where k = 'cq')) = 0, 'no CONQRETE audit rows';

  -- count sheet lists BLUEI products only
  v_count := public.start_stock_count((select v from b where k = 'blwh'), 'BL count');
  assert (select count(*) from public.stock_count_lines l join public.products p on p.id = l.product_id
           where l.count_id = v_count and p.brand_id <> (select v from b where k = 'bl')) = 0, 'count sheet has only BLUEI';
  assert (select count(*) from public.stock_count_lines where count_id = v_count) >= 1, 'count sheet not empty';
  update public.stock_counts set status = 'cancelled' where id = v_count;

  -- adjust to physical count
  assert public.adjust_stock_to('31000000-0000-0000-0000-000000000001', (select v from b where k = 'blwh'), 296, 'Count difference') = -4, 'adjust -4';
  assert (select on_hand from public.stock_on_hand where product_id = '31000000-0000-0000-0000-000000000001') = 296, 'now 296';
  begin
    perform public.adjust_stock_to('31000000-0000-0000-0000-000000000001', (select v from b where k = 'blwh'), 296, 'again');
    raise exception 'zero adjustment accepted';
  exception when raise_exception then null;
  end;

  -- purchase: a CONQRETE product cannot go on a BLUEI purchase
  begin
    perform public.save_purchase(null, v_sup, (select v from b where k = 'blwh'), null, null, 30, 0, null,
      '[{"product_id":"31000000-0000-0000-0000-000000000002","qty":5,"unit_cost":600}]'::jsonb);
    raise exception 'cross-brand purchase line accepted';
  exception when raise_exception then
    if sqlerrm not like '%separate purchase for each brand%' and sqlerrm not like '%not%' then raise; end if;
  end;
  v_po := public.save_purchase(null, v_sup, (select v from b where k = 'blwh'), null, null, 30, 0, null,
    '[{"product_id":"31000000-0000-0000-0000-000000000001","qty":100,"unit_cost":500}]'::jsonb);
  assert (select brand_id from public.purchases where id = v_po) = (select v from b where k = 'bl'), 'purchase brand';
  perform public.receive_purchase(v_po, 'BL/77', current_date);
  assert (select on_hand from public.stock_on_hand where product_id = '31000000-0000-0000-0000-000000000001') = 396, 'received 100';
  assert (select balance from public.purchase_balances where purchase_id = v_po) = 59000, 'owe 59,000 (500 x 100 + 18%)';

  -- return 10 to the supplier
  select id into v_line from public.purchase_lines where purchase_id = v_po;
  v_ret := public.create_purchase_return(v_po, 'Damaged in transit',
             jsonb_build_array(jsonb_build_object('purchase_line_id', v_line, 'qty', 10)), '99999999-0000-0000-0000-000000000002');
  assert public.create_purchase_return(v_po, 'Damaged in transit',
             jsonb_build_array(jsonb_build_object('purchase_line_id', v_line, 'qty', 10)), '99999999-0000-0000-0000-000000000002') = v_ret,
    'double submit returns the same return';
  assert (select return_no ~ '^BLDN/[0-9]{2}-[0-9]{2}/[0-9]{5}$' from public.purchase_returns where id = v_ret), 'debit note number';
  assert (select grand_total from public.purchase_returns where id = v_ret) = 5900, 'return value 5,900';
  assert (select on_hand from public.stock_on_hand where product_id = '31000000-0000-0000-0000-000000000001') = 386, 'stock down by 10';
  assert (select balance from public.purchase_balances where purchase_id = v_po) = 53100, 'payable down to 53,100';
  assert public.purchase_open_amount(v_po) = 53100, 'open amount';
  assert exists (select 1 from public.supplier_ledger where kind = 'return' and doc_no = (select return_no from public.purchase_returns where id = v_ret)),
    'supplier ledger shows the return';
  begin
    perform public.create_purchase_return(v_po, 'more', jsonb_build_array(jsonb_build_object('purchase_line_id', v_line, 'qty', 91)));
    raise exception 'returned more than bought';
  exception when raise_exception then
    if sqlerrm not like '%can still be returned%' then raise; end if;
  end;
  begin
    perform public.cancel_purchase(v_po, 'oops');
    raise exception 'cancelled a bill with returns';
  exception when raise_exception then
    if sqlerrm not like '%already returned%' then raise; end if;
  end;
  assert (select count(*) from public.stock_ledger where movement_type = 'purchase_return') = 1, 'return in ledger';
end $$;
reset role;

-- ---------- Orders: one brand each, brand-wise invoice numbers ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$
declare v_o uuid; v_i uuid;
begin
  begin
    perform public.save_quotation(null, '20000000-0000-0000-0000-000000000001', 15, null,
      '[{"product_id":"31000000-0000-0000-0000-000000000001","qty":1},{"product_id":"31000000-0000-0000-0000-000000000002","qty":1}]'::jsonb);
    raise exception 'mixed-brand order accepted';
  exception when raise_exception then
    if sqlerrm not like '%one brand only%' then raise; end if;
  end;
  v_o := public.save_quotation(null, '20000000-0000-0000-0000-000000000001', 15, null,
    '[{"product_id":"31000000-0000-0000-0000-000000000001","qty":2}]'::jsonb);
  assert (select brand_id from public.orders where id = v_o) = (select v from b where k = 'bl'), 'order brand BLUEI';
  -- editing the quotation to the other brand moves the order to that brand
  perform public.save_quotation(v_o, '20000000-0000-0000-0000-000000000001', 15, null,
    '[{"product_id":"31000000-0000-0000-0000-000000000002","qty":2}]'::jsonb);
  assert (select brand_id from public.orders where id = v_o) = (select v from b where k = 'cq'), 'order moved to CONQRETE';
  perform public.save_quotation(v_o, '20000000-0000-0000-0000-000000000001', 15, null,
    '[{"product_id":"31000000-0000-0000-0000-000000000001","qty":2}]'::jsonb);
  v_i := public.confirm_order(v_o);
  assert (select invoice_no ~ '^BL/[0-9]{2}-[0-9]{2}/00001$' and brand_id = (select v from b where k = 'bl') from public.invoices where id = v_i),
    'first BLUEI invoice: ' || (select invoice_no from public.invoices where id = v_i);
end $$;
reset role;

-- ---------- Reorder list ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
declare r record;
begin
  update public.products set min_stock_qty = 1000 where id = '31000000-0000-0000-0000-000000000001';
  select * into r from public.reorder_suggestions((select v from b where k = 'bl')) where product_id = '31000000-0000-0000-0000-000000000001';
  assert r.product_id is not null, 'low product suggested';
  assert r.suggested_qty >= 2000 - r.available, 'suggestion brings stock to 2 x minimum, got ' || r.suggested_qty;
  assert r.supplier_name = 'BLUEI' and r.lead_days = 8, 'supplier and lead time';
  assert not exists (select 1 from public.reorder_suggestions((select v from b where k = 'bl')) x
                      join public.products p on p.id = x.product_id where p.brand_id <> (select v from b where k = 'bl')),
    'only BLUEI products in the BLUEI reorder list';
end $$;
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000011', false);
set role authenticated;
do $$ begin
  begin
    perform * from public.reorder_suggestions((select v from b where k = 'bl'));
    raise exception 'warehouse read reorder list';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

select 'ALL BRAND SEPARATION DATABASE TESTS PASSED' as result;
