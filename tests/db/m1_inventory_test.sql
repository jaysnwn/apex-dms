-- =============================================================================
-- M1 exit tests: stock guard, transfers, counts, valuation, retailer checks.
-- Runs after m0_security_test.sql (reuses its users, retailers and product).
-- =============================================================================
\set ON_ERROR_STOP 1

insert into public.warehouses (id, name, brand_id)
select '60000000-0000-0000-0000-000000000002', 'Nashik Godown', id from public.brands where name = 'CONQRETE';
insert into public.products (id, name, brand_id, sku, purchase_cost, purchase_cost_mode, retailer_price, mrp, gst_rate)
select '30000000-0000-0000-0000-000000000002', 'Type-C Cable 1m', id, 'BL-TC1M', 118, 'inclusive', 149, 299, 18
  from public.brands where name = 'CONQRETE';

-- ---------- Warehouse staff ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', false);
set role authenticated;
do $$
declare
  v_main uuid := (select id from public.warehouses where name = 'CONQRETE Warehouse');
  v_nsk  uuid := '60000000-0000-0000-0000-000000000002';
  v_cost numeric;
  v_count uuid;
begin
  -- inbound cost filled from product (inclusive 118 @18% -> 100 excl.)
  insert into public.stock_movements (product_id, warehouse_id, movement_type, qty)
  values ('30000000-0000-0000-0000-000000000002', v_main, 'stock_in', 100);
  reset role;
  select unit_cost into v_cost from public.stock_movements
   where product_id = '30000000-0000-0000-0000-000000000002' order by id desc limit 1;
  set role authenticated;
  assert v_cost = 100, 'inbound cost should be 100 excl GST, got ' || v_cost;

  -- reason required
  begin
    insert into public.stock_movements (product_id, warehouse_id, movement_type, qty)
    values ('30000000-0000-0000-0000-000000000002', v_main, 'damage', -2);
    raise exception 'damage without reason accepted';
  exception when raise_exception then
    if sqlerrm not like '%reason is required%' then raise; end if;
  end;

  -- cannot go negative
  begin
    insert into public.stock_movements (product_id, warehouse_id, movement_type, qty, reason)
    values ('30000000-0000-0000-0000-000000000002', v_main, 'damage', -101, 'dropped');
    raise exception 'negative stock accepted';
  exception when raise_exception then
    if sqlerrm not like '%Not enough stock%' then raise; end if;
  end;

  insert into public.stock_movements (product_id, warehouse_id, movement_type, qty, reason)
  values ('30000000-0000-0000-0000-000000000002', v_main, 'damage', -2, 'dropped');

  -- transfer 30 to Nashik
  perform public.transfer_stock('30000000-0000-0000-0000-000000000002', v_main, v_nsk, 30, 'rebalance');
  assert (select on_hand from public.stock_on_hand
           where product_id = '30000000-0000-0000-0000-000000000002' and warehouse_id = v_main) = 68, 'main should be 68';
  assert (select on_hand from public.stock_on_hand
           where product_id = '30000000-0000-0000-0000-000000000002' and warehouse_id = v_nsk) = 30, 'nashik should be 30';
  begin
    perform public.transfer_stock('30000000-0000-0000-0000-000000000002', v_nsk, v_main, 31);
    raise exception 'over-transfer accepted';
  exception when raise_exception then
    if sqlerrm not like '%Not enough stock%' then raise; end if;
  end;

  -- stock count: start, count, submit
  v_count := public.start_stock_count(v_main, 'monthly count');
  update public.stock_count_lines set counted_qty = 65
   where count_id = v_count and product_id = '30000000-0000-0000-0000-000000000002';
  update public.stock_counts set status = 'submitted' where id = v_count;
  begin
    perform public.approve_stock_count(v_count);
    raise exception 'warehouse approved a count';
  exception when insufficient_privilege then null;
  end;
  -- valuation hidden from warehouse
  assert (select count(*) from public.inventory_valuation) = 0, 'warehouse must not see valuation';
  -- warehouse sees availability through product_stock
  assert (select available from public.product_stock where product_id = '30000000-0000-0000-0000-000000000002') = 98,
    'available should be 98';
end $$;
reset role;

-- a movement after the count started (sold/damaged 1) must be respected on approval
insert into public.stock_movements (product_id, warehouse_id, movement_type, qty, reason)
select '30000000-0000-0000-0000-000000000002', id, 'damage', -1, 'late damage' from public.warehouses where name = 'CONQRETE Warehouse';

-- ---------- Manager approves ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
declare v_main uuid := (select id from public.warehouses where name = 'CONQRETE Warehouse');
        v_count uuid := (select id from public.stock_counts where status = 'submitted' limit 1);
begin
  assert public.approve_stock_count(v_count) >= 1, 'count should post at least one reconciliation';
  assert (select on_hand from public.stock_on_hand
           where product_id = '30000000-0000-0000-0000-000000000002' and warehouse_id = v_main) = 65,
    'after count main should equal counted 65';
  -- untouched (blank) lines did not change the power bank stock
  assert (select on_hand from public.stock_on_hand
           where product_id = '30000000-0000-0000-0000-000000000001' and warehouse_id = v_main) = 50,
    'uncounted product must not change';
  begin
    perform public.approve_stock_count(v_count);
    raise exception 'count approved twice';
  exception when raise_exception then null;
  end;
end $$;
reset role;

-- ---------- Billing: valuation ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$ begin
  assert (select stock_value from public.inventory_valuation where sku = 'BL-TC1M') = 9500,
    'cable value 95 x 100 = 9500, got ' || (select stock_value from public.inventory_valuation where sku = 'BL-TC1M');
  assert (select stock_value from public.inventory_valuation where sku = 'CQ-PB20K') = 45000,
    'power bank value 50 x 900';
end $$;
reset role;

-- ---------- Retailer normalisation & duplicates ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$ begin
  insert into public.retailers (shop_name, mobile, gstin, billing_city)
  values ('  Sai Mobile Gallery ', '9822000010', '24abcde1234f1z5', 'Surat');
  assert (select billing_state_code from public.retailers where mobile = '9822000010') = '24', 'state from GSTIN';
  assert (select gstin from public.retailers where mobile = '9822000010') = '24ABCDE1234F1Z5', 'gstin upper';
  assert (select shop_name from public.retailers where mobile = '9822000010') = 'Sai Mobile Gallery', 'trimmed';

  assert exists (select 1 from public.find_retailer_duplicates('9822000010') where reason = 'Same mobile number'), 'mobile dup';
  assert exists (select 1 from public.find_retailer_duplicates('9000000000', '24ABCDE1234F1Z5') where reason = 'Same GSTIN'), 'gstin dup';
  assert exists (select 1 from public.find_retailer_duplicates('9000000000', null, 'Sai Mobile Galery', 'Surat')
                  where reason = 'Similar shop name'), 'name dup';
  assert not exists (select 1 from public.find_retailer_duplicates('9000000000', null, 'Ganesh Traders', 'Surat')), 'false dup';
  begin
    insert into public.retailers (shop_name, mobile) values ('Copy', '9822000010');
    raise exception 'duplicate mobile accepted';
  exception when unique_violation then null;
  end;
end $$;
reset role;

-- salesman 1 sees the duplicate hint for a retailer outside his route, but not the retailer row
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000005', false);
set role authenticated;
do $$ begin
  assert exists (select 1 from public.find_retailer_duplicates('9822000010')), 'salesman gets duplicate hint';
  assert not exists (select 1 from public.retailers where mobile = '9822000010'), 'salesman must not read that retailer';
  assert (select count(*) from public.inventory_valuation) = 0, 'salesman must not see valuation';
end $$;
reset role;

select 'ALL M1 DATABASE TESTS PASSED' as result;
