-- =============================================================================
-- One shared warehouse for every brand (0035), the stock-movement guard (0037)
-- and removing a user (0036). Runs after the other suites (reuses their users,
-- brands, warehouses, products and suppliers).
-- =============================================================================
\set ON_ERROR_STOP 1
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);

create temp table k (k text primary key, v uuid);
grant all on k to authenticated;
insert into k select 'cq', id from public.brands where code = 'CQ' and tenant_id = 'a9e70000-0000-4000-8000-000000000001';
insert into k select 'bl', id from public.brands where code = 'BL' and tenant_id = 'a9e70000-0000-4000-8000-000000000001';
insert into k select 'cqwh', id from public.warehouses where name = 'CONQRETE Warehouse';
insert into k select 'cqp', id from public.products where brand_id = (select v from k where k = 'cq') and is_active order by created_at limit 1;
insert into k select 'blp', id from public.products where brand_id = (select v from k where k = 'bl') and is_active order by created_at limit 1;
insert into k select 'sup', id from public.suppliers where is_active order by created_at limit 1;

-- ---------- a shared warehouse takes stock of every brand ----------
do $$
declare v_wh uuid; v_p uuid; v_c uuid;
begin
  insert into public.warehouses (name, brand_id) values ('Shared Test WH', null) returning id into v_wh;
  insert into k values ('sh', v_wh);
  insert into public.stock_movements (product_id, warehouse_id, movement_type, qty, created_by)
  values ((select v from k where k = 'cqp'), v_wh, 'stock_in', 10, auth.uid()),
         ((select v from k where k = 'blp'), v_wh, 'stock_in', 7, auth.uid());
  assert (select brand_id from public.stock_movements where warehouse_id = v_wh and product_id = (select v from k where k = 'blp')) = (select v from k where k = 'bl'),
    'a movement keeps its product''s brand in the shared warehouse';
  assert (select sum(qty) from public.stock_movements where warehouse_id = v_wh) = 17, 'both brands in one warehouse';

  -- a brand-only warehouse still refuses the other brand
  begin
    insert into public.stock_movements (product_id, warehouse_id, movement_type, qty, created_by)
    values ((select v from k where k = 'blp'), (select v from k where k = 'cqwh'), 'stock_in', 1, auth.uid());
    raise exception 'BLUEI stock entered the CONQRETE-only warehouse';
  exception when raise_exception then null;
  end;

  -- one purchase bill is for one brand
  begin
    perform public.save_purchase(null, (select v from k where k = 'sup'), v_wh, current_date, null, 30, 0, null,
      jsonb_build_array(jsonb_build_object('product_id', (select v from k where k = 'cqp'), 'qty', 1, 'unit_cost', 10),
                        jsonb_build_object('product_id', (select v from k where k = 'blp'), 'qty', 1, 'unit_cost', 10)));
    raise exception 'a purchase mixed two brands';
  exception when raise_exception then null;
  end;
  v_p := public.save_purchase(null, (select v from k where k = 'sup'), v_wh, current_date, null, 30, 0, null,
    jsonb_build_array(jsonb_build_object('product_id', (select v from k where k = 'blp'), 'qty', 2, 'unit_cost', 10)));
  assert (select brand_id from public.purchases where id = v_p) = (select v from k where k = 'bl'), 'purchase takes the brand of its products';
  begin
    perform public.save_purchase(null, (select v from k where k = 'sup'), (select v from k where k = 'cqwh'), current_date, null, 30, 0, null,
      jsonb_build_array(jsonb_build_object('product_id', (select v from k where k = 'blp'), 'qty', 1, 'unit_cost', 10)));
    raise exception 'BLUEI purchase into the CONQRETE-only warehouse';
  exception when raise_exception then null;
  end;

  -- a stock count in the shared warehouse covers the brand you choose
  begin
    perform public.start_stock_count(v_wh, 'no brand');
    raise exception 'count of a shared warehouse without a brand';
  exception when raise_exception then null;
  end;
  v_c := public.start_stock_count(v_wh, 'BL count', (select v from k where k = 'bl'));
  assert (select brand_id from public.stock_counts where id = v_c) = (select v from k where k = 'bl'), 'count is for BLUEI';
  assert not exists (select 1 from public.stock_count_lines l join public.products p on p.id = l.product_id
                      where l.count_id = v_c and p.brand_id <> (select v from k where k = 'bl')), 'only BLUEI products on the sheet';
  assert (select system_qty from public.stock_count_lines where count_id = v_c and product_id = (select v from k where k = 'blp')) = 7,
    'system qty is the BLUEI stock in the shared warehouse';
  update public.stock_counts set status = 'cancelled' where id = v_c;
end $$;

-- ---------- a one-brand user sees the shared warehouse, but only books their brand ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000011', false);   -- CONQRETE-only store
do $$
begin
  assert exists (select 1 from public.warehouses where id = (select v from k where k = 'sh')), 'shared warehouse visible to a one-brand user';
  begin
    insert into public.stock_movements (product_id, warehouse_id, movement_type, qty, created_by)
    values ((select v from k where k = 'blp'), (select v from k where k = 'sh'), 'stock_in', 1, auth.uid());
    raise exception 'CONQRETE-only user booked BLUEI stock';
  exception when insufficient_privilege or raise_exception then null;
  end;
end $$;

-- ---------- removing a user ----------
select set_config('request.jwt.claim.sub', '', false);
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000099', 'new-hire@apex.test', '{"role":"billing"}', '{"full_name":"Neha New"}');
insert into public.tenant_members (tenant_id, user_id, role, is_active)
select 'a9e70000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000099', 'billing', true
where not exists (select 1 from public.tenant_members where tenant_id = 'a9e70000-0000-4000-8000-000000000001' and user_id = '00000000-0000-0000-0000-000000000099');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
do $$
begin
  begin
    perform public.remove_member(auth.uid());
    raise exception 'super admin removed themself';
  exception when raise_exception then null;
  end;
  assert public.remove_member('00000000-0000-0000-0000-000000000099') = 'deleted', 'a user with no history is deleted';
  assert not exists (select 1 from public.tenant_members where user_id = '00000000-0000-0000-0000-000000000099'
                       and tenant_id = 'a9e70000-0000-4000-8000-000000000001'), 'membership gone';

  -- the salesman has visits, orders and payments: kept on the records, access gone
  assert public.remove_member('00000000-0000-0000-0000-000000000005') = 'removed', 'a user with history is removed, not deleted';
  assert (select not is_active and removed_at is not null from public.tenant_members
           where user_id = '00000000-0000-0000-0000-000000000005' and tenant_id = 'a9e70000-0000-4000-8000-000000000001'), 'removed and inactive';
  assert not exists (select 1 from public.list_members() where id = '00000000-0000-0000-0000-000000000005'), 'hidden from the user list';
  assert not exists (select 1 from public.profile_brands where user_id = '00000000-0000-0000-0000-000000000005'
                       and tenant_id = 'a9e70000-0000-4000-8000-000000000001'), 'brand access taken away';

  -- adding the same email again brings them back
  assert public.add_member('sales1@apex.test', 'salesman') = '00000000-0000-0000-0000-000000000005', 'add_member returns the same person';
  assert (select is_active and removed_at is null from public.tenant_members
           where user_id = '00000000-0000-0000-0000-000000000005' and tenant_id = 'a9e70000-0000-4000-8000-000000000001'), 'restored';
end $$;

-- only the Super Admin removes users
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
do $$
begin
  perform public.remove_member('00000000-0000-0000-0000-000000000003');
  raise exception 'a manager removed a user';
exception when insufficient_privilege then null;
end $$;
select set_config('request.jwt.claim.sub', '', false);
