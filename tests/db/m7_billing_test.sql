-- =============================================================================
-- Fast billing rules (0016): price / discount authority, stock override,
-- GST buyer details, changing an invoice's payment terms, categories.
-- Runs after m0–m6 (reuses users, retailers and the CONQRETE Havoc charger).
-- =============================================================================
\set ON_ERROR_STOP 1
select set_config('request.jwt.claim.sub', '', false);
create temp table t7 (k text primary key, id uuid);
grant all on t7 to authenticated;

-- A GST-registered shop without an address, and a plain unregistered shop.
insert into public.retailers (id, shop_name, mobile, gstin) values
  ('41000000-0000-0000-0000-000000000001', 'Registered Shop', '9811200001', '27AAAAA1234A1Z5');
insert into public.retailers (id, shop_name, mobile) values
  ('41000000-0000-0000-0000-000000000002', 'Walk-in Shop', '9811200002');

-- ---------- Billing staff ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$
declare v_o uuid; v_i uuid;
begin
  -- price typed by Billing is ignored (product price 899 is used)
  v_o := public.save_quotation(null, '41000000-0000-0000-0000-000000000002', 0, null,
    '[{"product_id":"31000000-0000-0000-0000-000000000002","qty":1,"unit_price":1}]'::jsonb);
  assert (select unit_price from public.order_lines where order_id = v_o) = 899, 'billing cannot change the price';
  -- discount above the billing cap (10%) is refused
  begin
    perform public.save_quotation(null, '41000000-0000-0000-0000-000000000002', 0, null,
      '[{"product_id":"31000000-0000-0000-0000-000000000002","qty":1,"discount_pct":15}]'::jsonb);
    raise exception 'billing gave 15%%';
  exception when raise_exception then
    if sqlerrm not like '%at most 10 percent%' then raise; end if;
  end;
  -- unregistered shop under ₹50,000: name + state are enough; cash (0 days) → due today
  v_i := public.confirm_order(v_o);
  assert (select due_date = invoice_date and credit_days = 0 from public.invoices where id = v_i), 'immediate payment due today';
  insert into t7 values ('inv', v_i);

  -- registered shop without address / PIN: blocked
  v_o := public.save_quotation(null, '41000000-0000-0000-0000-000000000001', 21, null,
    '[{"product_id":"31000000-0000-0000-0000-000000000002","qty":1,"discount_pct":10}]'::jsonb);
  insert into t7 values ('reg_order', v_o);
  begin
    perform public.confirm_order(v_o);
    raise exception 'invoice without buyer address accepted';
  exception when raise_exception then
    if sqlerrm not like '%billing address, PIN code%' then raise; end if;
  end;
  update public.retailers set billing_address = 'Station Road', billing_pincode = '422605' where id = '41000000-0000-0000-0000-000000000001';
  v_i := public.confirm_order(v_o);
  assert (select due_date = invoice_date + 21 from public.invoices where id = v_i), '21 days';

  -- more than in stock: Billing cannot override
  v_o := public.save_quotation(null, '41000000-0000-0000-0000-000000000001', 15, null,
    '[{"product_id":"31000000-0000-0000-0000-000000000002","qty":100000}]'::jsonb);
  insert into t7 values ('big', v_o);
  begin
    perform public.confirm_order(v_o, false, true);
    raise exception 'billing overrode stock';
  exception when raise_exception then
    if sqlerrm not like '%Not enough stock%' then raise; end if;
  end;

  -- payment terms of an issued invoice: not for Billing
  begin
    perform public.change_invoice_terms((select id from t7 where k = 'inv'), 30, 'agreed');
    raise exception 'billing changed terms';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- ---------- Manager ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
declare v_i uuid := (select id from t7 where k = 'inv'); v_cat uuid; v_used uuid;
begin
  -- stock override (back-order): allowed for a manager
  assert public.confirm_order((select id from t7 where k = 'big'), false, true) is not null, 'manager stock override';

  -- change terms: due date follows, nothing else can change
  assert public.change_invoice_terms(v_i, 30, 'Agreed with owner') = (select invoice_date + 30 from public.invoices where id = v_i), 'new due date';
  assert (select credit_days = 30 and due_date = invoice_date + 30 from public.invoices where id = v_i), 'terms saved';
  begin
    update public.invoices set credit_days = 45, due_date = invoice_date + 45 where id = v_i;
    raise exception 'invoice terms changed without the function';
  exception when raise_exception or insufficient_privilege then null;
  end;
  assert exists (select 1 from public.audit_log where table_name = 'invoice_terms' and record_id = v_i::text
                  and new_data ->> 'reason' = 'Agreed with owner'), 'terms change logged with reason';

  -- categories: unused can be deleted, used cannot
  insert into public.categories (name, brand_id) select 'Temp', id from public.brands where name = 'CONQRETE' returning id into v_cat;
  delete from public.categories where id = v_cat;
  assert not exists (select 1 from public.categories where id = v_cat), 'unused category deleted';
  update public.products set category_id = (select id from public.categories where brand_id = (select brand_id from public.products where id = '31000000-0000-0000-0000-000000000002') order by sort_order limit 1)
   where id = '31000000-0000-0000-0000-000000000002' returning category_id into v_used;
  begin
    delete from public.categories where id = v_used;
    raise exception 'used category deleted';
  exception when foreign_key_violation then null;
  end;
  assert (select count(*) from public.categories where sort_order = 0) = 0, 'categories have a display order';
end $$;
reset role;

select 'ALL BILLING DATABASE TESTS PASSED' as result;
