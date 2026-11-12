-- =============================================================================
-- 0029: complete, explicit definitions of every function that earlier
--       migrations changed by text replacement (audit finding 1).
--
-- Migrations 0015, 0016, 0022 and 0024 read a function's stored text, replaced
-- one line and stored it again. The result was correct, but no file in this
-- repository showed the complete function that actually runs. This migration
-- states all 11 of them in full. It changes NO logic: it stops unless every
-- function's code is the same before and after (comments and spacing aside).
-- From here on a function is changed only by writing it out in full
-- (tests/app/run.sh refuses the text-replacement pattern in new migrations).
--
-- Rollback: supabase/rollback/20261112000029_to_0028_down.sql
-- =============================================================================
create table mt_rollback.function_src_0029 (sig text primary key, src text not null, logic text not null);
insert into mt_rollback.function_src_0029
select p.oid::regprocedure::text, pg_get_functiondef(p.oid),
       md5(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g'))
         || ' ' || p.prosecdef || ' ' || coalesce(array_to_string(p.proconfig, ','), '') || ' ' || p.proowner::regrole
  from pg_proc p
 where p.oid in ('public.start_stock_count(uuid, text)'::regprocedure,
                 'public.confirm_order(uuid, boolean, boolean)'::regprocedure,
                 'public.create_credit_note(uuid, text, boolean, jsonb)'::regprocedure,
                 'public.save_quotation(uuid, uuid, integer, text, jsonb, uuid)'::regprocedure,
                 'public.approve_incentives(date, boolean)'::regprocedure,
                 'public.plan_route(uuid, uuid, date, text)'::regprocedure,
                 'public.record_location(numeric, numeric, numeric, timestamp with time zone)'::regprocedure,
                 'public.route_assign(uuid, uuid, date, text)'::regprocedure,
                 'public.expense_save(uuid, uuid, uuid, numeric, date, uuid, uuid, text, text, text, text, text, boolean, uuid, text)'::regprocedure,
                 'public.reimburse_expenses(jsonb, date, public.payment_method, text, text, text, uuid)'::regprocedure,
                 'public.visit_check_out(uuid, uuid, numeric, numeric, numeric, text, text, timestamp with time zone, uuid)'::regprocedure);

-- -----------------------------------------------------------------------------
-- start_stock_count(uuid, text)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.start_stock_count(p_warehouse_id uuid, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
begin
  if not public.has_role('super_admin', 'manager', 'warehouse') then
    raise exception 'Only warehouse staff or managers can start a stock count' using errcode = '42501';
  end if;

  insert into public.stock_counts (warehouse_id, notes, counted_by)
  values (p_warehouse_id, p_notes, auth.uid())
  returning id into v_id;

  insert into public.stock_count_lines (count_id, product_id, location_id, system_qty, counted_qty)
  select v_id, p.id, p.default_location_id,
         coalesce((select sum(sm.qty) from public.stock_movements sm
                    where sm.product_id = p.id and sm.warehouse_id = p_warehouse_id), 0),
         null
    from public.products p
   where p.is_active and p.brand_id = (select w.brand_id from public.warehouses w where w.id = p_warehouse_id);

  return v_id;
end $function$

;

-- -----------------------------------------------------------------------------
-- confirm_order(uuid, boolean, boolean)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.confirm_order(p_order_id uuid, p_override_credit boolean DEFAULT false, p_override_stock boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_order  public.orders%rowtype;
  v_ret    public.retailers%rowtype;
  v_state  char(2);
  v_igst   boolean;
  v_inv    uuid;
  v_short  text;
  v_out    numeric;
  v_date   date := (now() at time zone 'Asia/Kolkata')::date;
  v_cg     numeric;
  v_sg     numeric;
  v_ig     numeric;
begin
  if not public.has_role('super_admin', 'manager', 'billing') then
    raise exception 'Only office staff can confirm invoices' using errcode = '42501';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found' using errcode = 'P0002'; end if;
  select id into v_inv from public.invoices where order_id = p_order_id;
  if v_inv is not null then return v_inv; end if;          -- already invoiced: no duplicate
  if v_order.status <> 'quotation' then
    raise exception 'This order is % and cannot be invoiced', v_order.status using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.order_lines where order_id = p_order_id) then
    raise exception 'The order has no products' using errcode = 'P0001';
  end if;

  select * into v_ret from public.retailers where id = v_order.retailer_id;
  if v_ret.status in ('blocked', 'inactive', 'on_hold') then
    raise exception 'Retailer account is %. Change the account status before invoicing.', v_ret.status using errcode = 'P0001';
  end if;

  -- Lock products (fixed order avoids deadlocks), then check availability.
  perform 1 from public.products where id in (select product_id from public.order_lines where order_id = p_order_id)
   order by id for update;
  select string_agg(format('%s (needed %s, available %s)', p.name, trim_scale(l.need),
                           trim_scale(public.product_available(l.product_id))), '; ' order by p.name)
    into v_short
    from (select product_id, sum(qty) as need from public.order_lines where order_id = p_order_id group by product_id) l
    join public.products p on p.id = l.product_id
   where public.product_available(l.product_id) < l.need;
  if v_short is not null and not (p_override_stock and public.has_role('super_admin', 'manager')) then
    raise exception 'Not enough stock: %', v_short using errcode = 'P0001', hint = 'STOCK_SHORT';
  end if;

  -- Credit limit (0 = no limit)
  if v_ret.credit_limit > 0 then
    select coalesce(sum(public.invoice_open_amount(id)), 0) into v_out
      from public.invoices where retailer_id = v_ret.id and status = 'issued';
    if v_out + v_order.grand_total > v_ret.credit_limit
       and not (p_override_credit and public.has_role('super_admin', 'manager')) then
      raise exception 'Credit limit exceeded: outstanding ₹%, this invoice ₹%, limit ₹%',
        trim_scale(v_out), trim_scale(v_order.grand_total), trim_scale(v_ret.credit_limit)
        using errcode = 'P0001', hint = 'CREDIT_LIMIT';
    end if;
  end if;

  select coalesce(state_code, '27') into v_state from public.company_settings where id = 1;
  v_igst := v_ret.billing_state_code <> v_state;
  select coalesce(sum(case when v_igst then 0 else round(tax_amount / 2, 2) end), 0),
         coalesce(sum(case when v_igst then 0 else tax_amount - round(tax_amount / 2, 2) end), 0),
         coalesce(sum(case when v_igst then tax_amount else 0 end), 0)
    into v_cg, v_sg, v_ig
    from public.order_lines where order_id = p_order_id;

  insert into public.invoices (
    invoice_no, fy, order_id, retailer_id, invoice_date, credit_days, due_date, place_of_supply, is_igst,
    retailer_snapshot, subtotal, discount_total, taxable_total, cgst_total, sgst_total, igst_total,
    round_off, grand_total, created_by)
  values (
    public.brand_document_number(v_order.brand_id, 'INV', v_date), public.fy_label(v_date), p_order_id, v_ret.id, v_date,
    v_order.credit_days, v_date + v_order.credit_days, v_ret.billing_state_code, v_igst,
    jsonb_build_object(
      'code', v_ret.code, 'shop_name', v_ret.shop_name, 'owner_name', v_ret.owner_name, 'mobile', v_ret.mobile,
      'gstin', v_ret.gstin, 'billing_address', v_ret.billing_address, 'billing_city', v_ret.billing_city,
      'billing_pincode', v_ret.billing_pincode, 'state_code', v_ret.billing_state_code,
      'delivery_address', coalesce(v_ret.delivery_address, v_ret.billing_address),
      'delivery_city', coalesce(v_ret.delivery_city, v_ret.billing_city),
      'delivery_pincode', coalesce(v_ret.delivery_pincode, v_ret.billing_pincode)),
    v_order.subtotal, v_order.discount_total, v_order.taxable_total, v_cg, v_sg, v_ig,
    v_order.round_off, v_order.grand_total, auth.uid())
  returning id into v_inv;

  insert into public.invoice_lines (invoice_id, line_no, product_id, product_name, sku, hsn_code, unit_code, qty,
    unit_price, price_mode, discount_pct, discount_amount, taxable_value, gst_rate, cgst, sgst, igst, line_total, unit_cost)
  select v_inv, l.line_no, l.product_id, p.name, p.sku, p.hsn_code, p.unit_code, l.qty,
         l.unit_price, l.price_mode, l.discount_pct, l.discount_amount, l.taxable_value, l.gst_rate,
         case when v_igst then 0 else round(l.tax_amount / 2, 2) end,
         case when v_igst then 0 else l.tax_amount - round(l.tax_amount / 2, 2) end,
         case when v_igst then l.tax_amount else 0 end,
         l.line_total, round(public.product_avg_cost(l.product_id), 4)
    from public.order_lines l join public.products p on p.id = l.product_id
   where l.order_id = p_order_id
   order by l.line_no;

  update public.orders set status = 'invoiced' where id = p_order_id;

  -- Use any advance / unallocated money the retailer already paid.
  perform public.allocate_unallocated(v_ret.id);
  return v_inv;
end $function$

;

-- -----------------------------------------------------------------------------
-- create_credit_note(uuid, text, boolean, jsonb)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_credit_note(p_invoice_id uuid, p_reason text, p_restock boolean, p_lines jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_inv   public.invoices%rowtype;
  v_cn    uuid;
  v_l     jsonb;
  v_il    public.invoice_lines%rowtype;
  v_qty   numeric;
  v_done  numeric;
  v_r     numeric;
  v_wh    uuid;
  v_date  date := (now() at time zone 'Asia/Kolkata')::date;
  t_tx numeric := 0; t_c numeric := 0; t_s numeric := 0; t_g numeric := 0;
  v_tx numeric; v_c numeric; v_s numeric; v_g numeric;
begin
  if not public.has_role('super_admin', 'manager', 'billing') then
    raise exception 'Only office staff can issue credit notes' using errcode = '42501';
  end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Enter a reason' using errcode = 'P0001'; end if;
  select * into v_inv from public.invoices where id = p_invoice_id for update;
  if not found or v_inv.status <> 'issued' then raise exception 'Invoice not found or cancelled' using errcode = 'P0001'; end if;
  if coalesce(jsonb_array_length(p_lines), 0) = 0 then raise exception 'Choose at least one line' using errcode = 'P0001'; end if;
  select warehouse_id into v_wh from public.dispatches where invoice_id = p_invoice_id and status in ('dispatched', 'delivered');

  insert into public.credit_notes (credit_note_no, fy, invoice_id, retailer_id, note_date, reason, restock,
                                   taxable_total, grand_total, created_by)
  values (public.brand_document_number(v_inv.brand_id, 'CN', v_date), public.fy_label(v_date), p_invoice_id, v_inv.retailer_id, v_date,
          trim(p_reason), coalesce(p_restock, false) and v_wh is not null, 0, 0.01, auth.uid())
  returning id into v_cn;

  for v_l in select * from jsonb_array_elements(p_lines) loop
    v_qty := (v_l ->> 'qty')::numeric;
    continue when v_qty is null or v_qty <= 0;
    select * into v_il from public.invoice_lines where id = (v_l ->> 'invoice_line_id')::uuid and invoice_id = p_invoice_id;
    if not found then raise exception 'Line does not belong to this invoice' using errcode = 'P0001'; end if;
    select coalesce(sum(cl.qty), 0) into v_done
      from public.credit_note_lines cl join public.credit_notes c on c.id = cl.credit_note_id
     where cl.invoice_line_id = v_il.id and c.status = 'issued';
    if v_qty > v_il.qty - v_done then
      raise exception 'Only % of % can still be credited', trim_scale(v_il.qty - v_done), v_il.product_name using errcode = 'P0001';
    end if;
    v_r := v_qty / v_il.qty;
    v_tx := round(v_il.taxable_value * v_r, 2);
    v_c := round(v_il.cgst * v_r, 2); v_s := round(v_il.sgst * v_r, 2); v_g := round(v_il.igst * v_r, 2);
    insert into public.credit_note_lines (credit_note_id, invoice_line_id, qty, taxable_value, cgst, sgst, igst, line_total)
    values (v_cn, v_il.id, v_qty, v_tx, v_c, v_s, v_g, v_tx + v_c + v_s + v_g);
    t_tx := t_tx + v_tx; t_c := t_c + v_c; t_s := t_s + v_s; t_g := t_g + v_g;
    if coalesce(p_restock, false) and v_wh is not null then
      insert into public.stock_movements (product_id, warehouse_id, movement_type, qty, reference_type, reference_id, reason, created_by)
      values (v_il.product_id, v_wh, 'credit_note_return', v_qty, 'credit_note', v_cn, 'Returned on credit note', auth.uid());
    end if;
  end loop;

  if t_tx + t_c + t_s + t_g <= 0 then raise exception 'Credit note amount must be more than zero' using errcode = 'P0001'; end if;
  update public.credit_notes
     set taxable_total = t_tx, cgst_total = t_c, sgst_total = t_s, igst_total = t_g, grand_total = t_tx + t_c + t_s + t_g
   where id = v_cn;
  return v_cn;
end $function$

;

-- -----------------------------------------------------------------------------
-- save_quotation(uuid, uuid, integer, text, jsonb, uuid)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_quotation(p_order_id uuid, p_retailer_id uuid, p_credit_days integer, p_notes text, p_lines jsonb, p_client_uuid uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_role   public.app_role := public.current_app_role();
  v_order  public.orders%rowtype;
  v_id     uuid;
  v_line   jsonb;
  v_prod   record;
  v_no     integer := 0;
  v_price  numeric;
  v_disc   numeric;
  v_qty    numeric;
  v_max    numeric;
  v_bmax   numeric;
  v_c      record;
  v_sub    numeric := 0;
  v_dsc    numeric := 0;
  v_txb    numeric := 0;
  v_tax    numeric := 0;
  v_grand  numeric;
begin
  if v_role is null or v_role = 'warehouse' then
    raise exception 'Your role cannot create orders' using errcode = '42501';
  end if;
  if not public.can_see_retailer(p_retailer_id) then
    raise exception 'Retailer not found' using errcode = '42501';
  end if;
  if (select status from public.retailers where id = p_retailer_id) in ('blocked', 'inactive') then
    raise exception 'This retailer account is blocked or inactive' using errcode = 'P0001';
  end if;
  if coalesce(jsonb_array_length(p_lines), 0) = 0 then
    raise exception 'Add at least one product' using errcode = 'P0001';
  end if;
  if p_credit_days is null or p_credit_days < 0 or p_credit_days > 365 then
    raise exception 'Credit period must be 0–365 days' using errcode = 'P0001';
  end if;
  select salesman_max_discount, billing_max_discount into v_max, v_bmax from public.company_settings where id = 1;

  if p_order_id is null and p_client_uuid is not null then
    select id into v_id from public.orders where client_uuid = p_client_uuid;
    if v_id is not null then return v_id; end if;   -- double submit / offline replay
  end if;

  if p_order_id is null then
    insert into public.orders (order_no, retailer_id, credit_days, notes, salesman_id, client_uuid, created_by)
    values (public.next_document_number('ORD'), p_retailer_id, p_credit_days, nullif(trim(p_notes), ''),
            case when v_role = 'salesman' then auth.uid()
                 else (select salesman_id from public.retailers where id = p_retailer_id) end,
            p_client_uuid, auth.uid())
    returning id into v_id;
  else
    select * into v_order from public.orders where id = p_order_id for update;
    if not found then raise exception 'Order not found' using errcode = 'P0002'; end if;
    if v_order.status <> 'quotation' then
      raise exception 'Only quotations can be edited (this order is %)', v_order.status using errcode = 'P0001';
    end if;
    if v_role = 'salesman' and v_order.created_by <> auth.uid() then
      raise exception 'You can only edit your own quotations' using errcode = '42501';
    end if;
    update public.orders
       set retailer_id = p_retailer_id, credit_days = p_credit_days, notes = nullif(trim(p_notes), '')
     where id = p_order_id;
    delete from public.order_lines where order_id = p_order_id;
    v_id := p_order_id;
  end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_no := v_no + 1;
    select id, name, retailer_price, retailer_price_mode, gst_rate, is_active
      into v_prod from public.products where id = (v_line ->> 'product_id')::uuid;
    if not found or not v_prod.is_active then
      raise exception 'Product on line % is not available', v_no using errcode = 'P0001';
    end if;
    v_qty := (v_line ->> 'qty')::numeric;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Quantity for % must be more than zero', v_prod.name using errcode = 'P0001';
    end if;
    v_price := v_prod.retailer_price;
    if v_role in ('super_admin', 'manager') and nullif(v_line ->> 'unit_price', '') is not null then
      v_price := (v_line ->> 'unit_price')::numeric;
      if v_price < 0 then raise exception 'Price cannot be negative' using errcode = 'P0001'; end if;
    end if;
    v_disc := coalesce(nullif(v_line ->> 'discount_pct', '')::numeric, 0);
    if v_disc < 0 or v_disc > 100 then raise exception 'Discount must be 0–100%%' using errcode = 'P0001'; end if;
    if (v_role = 'salesman' and v_disc > v_max) or (v_role = 'billing' and v_disc > v_bmax) then
      raise exception 'You can give at most % percent discount (line: %)', trim_scale(case when v_role = 'billing' then v_bmax else v_max end), v_prod.name using errcode = 'P0001';
    end if;

    select * into v_c from public.calc_line(v_qty, v_price, v_prod.retailer_price_mode, v_disc, v_prod.gst_rate);
    insert into public.order_lines (order_id, line_no, product_id, qty, unit_price, price_mode, discount_pct,
                                    discount_amount, gst_rate, taxable_value, tax_amount, line_total)
    values (v_id, v_no, v_prod.id, v_qty, v_price, v_prod.retailer_price_mode, v_disc,
            v_c.discount, v_prod.gst_rate, v_c.taxable, v_c.tax, v_c.taxable + v_c.tax);
    v_sub := v_sub + v_c.gross;
    v_dsc := v_dsc + v_c.discount;
    v_txb := v_txb + v_c.taxable;
    v_tax := v_tax + v_c.tax;
  end loop;

  v_grand := round(v_txb + v_tax, 0);
  update public.orders
     set subtotal = v_sub, discount_total = v_dsc, taxable_total = v_txb, tax_total = v_tax,
         round_off = v_grand - (v_txb + v_tax), grand_total = v_grand
   where id = v_id;
  return v_id;
end $function$

;

-- -----------------------------------------------------------------------------
-- approve_incentives(date, boolean)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_incentives(p_month date, p_override boolean DEFAULT false)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_from date := date_trunc('month', p_month)::date;
  v_s public.incentive_schemes;
  v_sm record; v_j jsonb; v_n int := 0;
begin
  if not public.has_role('super_admin', 'manager') then
    raise exception 'Only a Manager can approve incentives' using errcode = '42501';
  end if;
  v_s := public.incentive_scheme_for(v_from);
  if v_s.id is null then raise exception 'No incentive scheme for this month' using errcode = 'P0001'; end if;
  if (now() at time zone 'Asia/Kolkata')::date <= (v_from + interval '1 month - 1 day')::date + v_s.smart_pay_days
     and not (p_override and public.has_role('super_admin')) then
    raise exception 'Figures for % are final only after %', to_char(v_from, 'Mon YYYY'),
      to_char((v_from + interval '1 month - 1 day')::date + v_s.smart_pay_days + 1, 'DD Mon YYYY') using errcode = 'P0001';
  end if;
  for v_sm in select id from public.tenant_people where role = 'salesman' and is_active order by full_name loop
    continue when exists (select 1 from public.incentive_payouts where salesman_id = v_sm.id and month = v_from);
    v_j := public.salesman_incentive(v_sm.id, v_from);
    insert into public.incentive_payouts (salesman_id, month, scheme_id, net_sales, billed_shops, smart_shops, collection_due,
      collected, collection_pct, sales_earned, billed_earned, smart_earned, collection_earned, total, detail)
    values (v_sm.id, v_from, v_s.id, (v_j->>'net_sales')::numeric, (v_j->>'billed_shops')::int, (v_j->>'smart_shops')::int,
      (v_j->>'collection_due')::numeric, (v_j->>'collected')::numeric, (v_j->>'collection_pct')::numeric,
      (v_j->>'sales_earned')::numeric, (v_j->>'billed_earned')::numeric, (v_j->>'smart_earned')::numeric,
      (v_j->>'collection_earned')::numeric, (v_j->>'total')::numeric,
      v_j || jsonb_build_object('shops', (select jsonb_agg(to_jsonb(s)) from public.incentive_shops(v_sm.id, v_from) s where s.status <> 'not_billed' or s.due_amount > 0)));
    v_n := v_n + 1;
  end loop;
  return v_n;
end $function$

;

-- -----------------------------------------------------------------------------
-- plan_route(uuid, uuid, date, text)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.plan_route(p_route_id uuid, p_salesman_id uuid, p_date date, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_plan uuid;
begin
  perform public.require_route_admin();
  if not exists (select 1 from public.tenant_people where id = p_salesman_id and role = 'salesman' and is_active) then
    raise exception 'Choose an active salesman' using errcode = 'P0001';
  end if;
  if p_date < public.ist_today() then raise exception 'Choose today or a later date' using errcode = 'P0001'; end if;
  select id into v_plan from public.route_plans where route_id = p_route_id and plan_date = p_date and status = 'planned';
  if v_plan is null then
    delete from public.route_plans rp where route_id = p_route_id and plan_date = p_date and status = 'cancelled'
      and not exists (select 1 from public.visits v where v.route_plan_id = rp.id);
    insert into public.route_plans (route_id, salesman_id, plan_date, notes, source, created_by)
    values (p_route_id, p_salesman_id, p_date, nullif(trim(p_notes), ''), 'manual', auth.uid())
    returning id into v_plan;
  else
    update public.route_plans set salesman_id = p_salesman_id, notes = coalesce(nullif(trim(p_notes), ''), notes), source = 'manual' where id = v_plan;
    update public.visits set salesman_id = p_salesman_id
     where route_plan_id = v_plan and status = 'planned' and checkin_at is null;
  end if;
  insert into public.visits (route_plan_id, route_id, retailer_id, salesman_id, planned_date, planned_sequence, source)
  select v_plan, p_route_id, r.id, p_salesman_id, p_date, r.route_sequence, 'manual'
    from public.route_outlets ro join public.retailers r on r.id = ro.retailer_id
   where ro.route_id = p_route_id and ro.is_active and r.status in ('active', 'on_hold')
     and not exists (select 1 from public.visits v where v.retailer_id = r.id and v.planned_date = p_date and v.status not in ('rescheduled', 'cancelled'))
  on conflict do nothing;
  perform public.route_log(p_route_id, 'extra_day', jsonb_build_object('date', p_date, 'salesman', (select full_name from public.profiles where id = p_salesman_id)));
  return v_plan;
end $function$

;

-- -----------------------------------------------------------------------------
-- record_location(numeric, numeric, numeric, timestamp with time zone)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_location(p_lat numeric, p_lng numeric, p_accuracy numeric, p_at timestamp with time zone)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not exists (select 1 from public.tenant_people where id = auth.uid() and is_active and share_location and role = 'salesman') then
    return false;
  end if;
  if p_lat is null or p_lng is null then return false; end if;
  insert into public.salesman_locations (salesman_id, recorded_at, latitude, longitude, accuracy_m, source)
  values (auth.uid(), least(coalesce(p_at, now()), now()), p_lat, p_lng, p_accuracy, 'ping');
  return true;
end $function$

;

-- -----------------------------------------------------------------------------
-- route_assign(uuid, uuid, date, text)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.route_assign(p_route uuid, p_salesman uuid, p_start date, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_cur public.route_assignments%rowtype; v_id uuid;
begin
  perform public.require_route_admin();
  perform 1 from public.routes where id = p_route and archived_at is null for update;
  if not found then raise exception 'Route not found' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.tenant_people where id = p_salesman and role = 'salesman' and is_active) then
    raise exception 'Choose an active salesman' using errcode = 'P0001';
  end if;
  if p_start is null or p_start < public.ist_today() then
    raise exception 'The start date cannot be in the past (past visits keep their salesman)' using errcode = 'P0001';
  end if;
  select * into v_cur from public.route_assignments where route_id = p_route and end_date is null for update;
  if found then
    if v_cur.salesman_id = p_salesman then
      if v_cur.status = 'paused' then
        update public.route_assignments set status = 'active' where id = v_cur.id;
        perform public.route_log(p_route, 'assignment_resumed', jsonb_build_object('salesman_id', p_salesman));
      end if;
      return v_cur.id;
    end if;
    -- ends the day before; an assignment that had not started yet ends before it began (kept as history)
    update public.route_assignments set end_date = greatest(p_start - 1, v_cur.start_date - 1), ended_by = auth.uid() where id = v_cur.id;
  end if;
  insert into public.route_assignments (route_id, salesman_id, start_date, notes) values (p_route, p_salesman, p_start, nullif(trim(p_notes), ''))
  returning id into v_id;
  update public.visits set salesman_id = p_salesman
   where route_id = p_route and planned_date >= p_start and status = 'planned' and checkin_at is null
     and not exists (select 1 from public.visit_events e where e.visit_id = visits.id);
  update public.route_plans set salesman_id = p_salesman where route_id = p_route and plan_date >= p_start and status = 'planned';
  perform public.sync_route_salesmen();
  perform public.route_log(p_route, 'assigned', jsonb_build_object('salesman_id', p_salesman,
    'salesman', (select full_name from public.profiles where id = p_salesman), 'from', p_start,
    'previous', (select full_name from public.profiles where id = v_cur.salesman_id)));
  return v_id;
end $function$

;

-- -----------------------------------------------------------------------------
-- expense_save(uuid, uuid, uuid, numeric, date, uuid, uuid, text, text, text, text, text, boolean, uuid, text)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.expense_save(p_id uuid, p_employee_id uuid, p_category_id uuid, p_amount numeric, p_expense_date date, p_route_id uuid, p_brand_id uuid, p_description text, p_payment_method text, p_paid_by text, p_receipt_path text, p_notes text, p_submit boolean, p_client_uuid uuid, p_source text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_role public.app_role := public.current_app_role();
  v_office boolean;
  v_emp uuid;
  v_days integer;
  v_cat public.expense_categories%rowtype;
  e public.expenses%rowtype;
  v_status text;
  v_changes text[] := '{}';
begin
  if v_role is null then raise exception 'Your account is not active' using errcode = '42501'; end if;
  v_office := v_role in ('super_admin', 'manager', 'billing');
  v_emp := coalesce(p_employee_id, v_uid);
  if v_emp <> v_uid and not v_office then
    raise exception 'You can enter only your own expenses' using errcode = '42501';
  end if;
  if not exists (select 1 from public.tenant_people where id = v_emp and is_active) then
    raise exception 'Choose an active employee' using errcode = 'P0001';
  end if;

  -- Same form sent twice (double tap, retry after a timeout): return the first one.
  if p_id is null and p_client_uuid is not null then
    select * into e from public.expenses where client_uuid = p_client_uuid;
    if found then
      if e.created_by <> v_uid then raise exception 'Duplicate request' using errcode = 'P0001'; end if;
      return jsonb_build_object('id', e.id, 'expense_no', e.expense_no, 'status', e.status, 'duplicate', true);
    end if;
  end if;

  select * into v_cat from public.expense_categories where id = p_category_id;
  if not found or not v_cat.is_active then raise exception 'Choose an expense category' using errcode = 'P0001'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Enter an amount above zero' using errcode = 'P0001'; end if;
  if p_amount > 1000000 then raise exception 'Amount looks too large (limit ₹10,00,000)' using errcode = 'P0001'; end if;
  if round(p_amount, 2) <> p_amount then raise exception 'Amount can have at most 2 decimals' using errcode = 'P0001'; end if;
  if p_expense_date is null or p_expense_date > public.ist_today() then
    raise exception 'The expense date cannot be in the future' using errcode = 'P0001';
  end if;
  if p_expense_date < date '2020-01-01' then raise exception 'Check the expense date' using errcode = 'P0001'; end if;
  if not v_office then
    select expense_claim_days into v_days from public.company_settings where id = 1;
    if p_expense_date < public.ist_today() - coalesce(v_days, 60) then
      raise exception 'Expenses older than % days must be entered by the office', coalesce(v_days, 60) using errcode = 'P0001';
    end if;
  end if;
  if coalesce(p_paid_by, 'employee') not in ('employee', 'company') then raise exception 'Choose who paid' using errcode = 'P0001'; end if;
  if p_payment_method is not null and p_payment_method not in ('cash', 'upi', 'bank', 'company_card', 'other') then
    raise exception 'Choose a payment method' using errcode = 'P0001';
  end if;
  if p_route_id is not null and not exists (select 1 from public.routes where id = p_route_id) then
    raise exception 'Unknown route' using errcode = 'P0001';
  end if;
  if p_brand_id is not null and not public.can_access_brand(p_brand_id) then
    raise exception 'You do not have access to this brand' using errcode = '42501';
  end if;
  if length(coalesce(p_description, '')) > 500 or length(coalesce(p_notes, '')) > 1000 then
    raise exception 'Description or notes are too long' using errcode = 'P0001';
  end if;

  if p_id is null then
    if p_receipt_path is not null and not public.is_own_upload(p_receipt_path) then
      raise exception 'Upload the receipt again' using errcode = '42501';
    end if;
    begin
      insert into public.expenses (employee_id, created_by, source, category_id, amount, expense_date, route_id, brand_id,
                                   description, payment_method, paid_by, receipt_path, notes, status, client_uuid)
      values (v_emp, v_uid,
              case when v_role = 'salesman' then 'salesman_app' when p_source = 'salesman_app' then 'salesman_app' else 'office' end,
              p_category_id, p_amount, p_expense_date, p_route_id, p_brand_id,
              nullif(trim(p_description), ''), p_payment_method, coalesce(p_paid_by, 'employee'), p_receipt_path,
              case when v_office then nullif(trim(p_notes), '') end, 'draft', p_client_uuid)
      returning * into e;
    exception when unique_violation then
      -- the same form arrived twice at the same moment; the first one won
      select * into e from public.expenses where client_uuid = p_client_uuid and created_by = v_uid;
      if not found then raise; end if;
      return jsonb_build_object('id', e.id, 'expense_no', e.expense_no, 'status', e.status, 'duplicate', true);
    end;
    perform public.expense_log(e.id, 'created', null, 'draft', e.amount,
      case when v_emp <> v_uid then 'Entered by the office for the employee' end);
  else
    select * into e from public.expenses where id = p_id for update;
    if not found or not public.can_see_expense(e.employee_id, e.brand_id) then
      raise exception 'Expense not found' using errcode = 'P0001';
    end if;
    if e.status in ('draft', 'returned') then
      if not (e.employee_id = v_uid or e.created_by = v_uid or v_role in ('super_admin', 'manager')) then
        raise exception 'You cannot edit this expense' using errcode = '42501';
      end if;
    elsif e.status = 'submitted' then
      if v_role not in ('super_admin', 'manager') then
        raise exception 'This expense is waiting for approval and is locked' using errcode = 'P0001';
      end if;
    else
      raise exception 'A % expense cannot be edited', e.status using errcode = 'P0001';
    end if;
    if v_emp <> e.employee_id and not v_office then
      raise exception 'Only the office can change the employee' using errcode = '42501';
    end if;
    if p_receipt_path is distinct from e.receipt_path and p_receipt_path is not null
       and not public.is_own_upload(p_receipt_path) then
      raise exception 'Upload the receipt again' using errcode = '42501';
    end if;
    if e.amount <> p_amount then v_changes := array_append(v_changes, format('amount %s → %s', e.amount, p_amount)); end if;
    if e.expense_date <> p_expense_date then v_changes := array_append(v_changes, format('date %s → %s', e.expense_date, p_expense_date)); end if;
    if e.category_id <> p_category_id then v_changes := array_append(v_changes, 'category'); end if;
    if e.employee_id <> v_emp then v_changes := array_append(v_changes, 'employee'); end if;
    if e.paid_by <> coalesce(p_paid_by, 'employee') then v_changes := array_append(v_changes, ('paid by ' || coalesce(p_paid_by, 'employee'))); end if;
    if e.receipt_path is distinct from p_receipt_path then v_changes := array_append(v_changes, 'receipt'); end if;
    update public.expenses set
      employee_id = v_emp, category_id = p_category_id, amount = p_amount, expense_date = p_expense_date,
      route_id = p_route_id, brand_id = p_brand_id, description = nullif(trim(p_description), ''),
      payment_method = p_payment_method, paid_by = coalesce(p_paid_by, 'employee'), receipt_path = p_receipt_path,
      notes = case when v_office then nullif(trim(p_notes), '') else notes end
    where id = p_id returning * into e;
    perform public.expense_log(e.id, 'edited', e.status, e.status, e.amount,
      nullif(array_to_string(v_changes, ', '), ''));
  end if;

  v_status := e.status;
  if p_submit and e.status in ('draft', 'returned') then
    v_status := public.expense_submit_internal(e.id);
  end if;
  select * into e from public.expenses where id = e.id;
  return jsonb_build_object('id', e.id, 'expense_no', e.expense_no, 'status', v_status, 'duplicate', false);
end $function$

;

-- -----------------------------------------------------------------------------
-- reimburse_expenses(jsonb, date, public.payment_method, text, text, text, uuid)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reimburse_expenses(p_lines jsonb, p_paid_on date, p_method payment_method, p_reference text, p_notes text, p_proof_path text, p_client_uuid uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid; v_emp uuid; v_total numeric := 0; v_amt numeric; v_no text; v_name text;
  e public.expenses%rowtype; l jsonb;
  v_ids uuid[];
begin
  if not public.can_reimburse_expenses() then
    raise exception 'You are not allowed to reimburse expenses' using errcode = '42501';
  end if;
  if p_client_uuid is not null then
    select id into v_id from public.reimbursements where client_uuid = p_client_uuid;
    if found then return v_id; end if;
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Choose the expenses to pay' using errcode = 'P0001';
  end if;
  if p_paid_on is null or p_paid_on > public.ist_today() then raise exception 'The payment date cannot be in the future' using errcode = 'P0001'; end if;
  if p_method = 'cheque' and coalesce(trim(p_reference), '') = '' then raise exception 'Enter the cheque number' using errcode = 'P0001'; end if;
  if p_proof_path is not null and not public.is_own_upload(p_proof_path) then
    raise exception 'Upload the payment proof again' using errcode = '42501';
  end if;
  select array_agg((x ->> 'expense_id')::uuid) into v_ids from jsonb_array_elements(p_lines) x;
  if cardinality(v_ids) <> (select count(distinct u) from unnest(v_ids) u) then
    raise exception 'An expense is listed twice' using errcode = 'P0001';
  end if;

  -- Lock in a fixed order so two payments for the same expenses wait for each other,
  -- then look for the same request again (it may have committed while we waited).
  perform 1 from public.expenses where id = any (v_ids) order by id for update;
  if p_client_uuid is not null then
    select id into v_id from public.reimbursements where client_uuid = p_client_uuid;
    if found then return v_id; end if;
  end if;
  for e in select * from public.expenses where id = any (v_ids) order by id loop
    if not public.can_see_expense(e.employee_id, e.brand_id) then raise exception 'Expense not found' using errcode = 'P0001'; end if;
    if v_emp is null then v_emp := e.employee_id;
    elsif v_emp <> e.employee_id then raise exception 'Pay one employee at a time' using errcode = 'P0001';
    end if;
    if e.status <> 'approved' then raise exception 'Expense % is not approved', e.expense_no using errcode = 'P0001'; end if;
    if e.paid_by <> 'employee' then raise exception 'Expense % was paid by the company; nothing to reimburse', e.expense_no using errcode = 'P0001'; end if;
    select (x ->> 'amount')::numeric into v_amt from jsonb_array_elements(p_lines) x where (x ->> 'expense_id')::uuid = e.id;
    if v_amt is null or v_amt <= 0 or round(v_amt, 2) <> v_amt then
      raise exception 'Enter the amount to pay for %', e.expense_no using errcode = 'P0001';
    end if;
    if v_amt > e.approved_amount - e.reimbursed_amount then
      raise exception 'Only ₹% is outstanding on %', e.approved_amount - e.reimbursed_amount, e.expense_no using errcode = 'P0001';
    end if;
    if p_paid_on < e.expense_date then raise exception 'Payment date is before the expense date of %', e.expense_no using errcode = 'P0001'; end if;
    v_total := v_total + v_amt;
  end loop;
  if v_emp is null or (select count(*) from public.expenses where id = any (v_ids)) <> cardinality(v_ids) then
    raise exception 'Some expenses were not found' using errcode = 'P0001';
  end if;

  v_no := public.next_document_number('RMB', p_paid_on);
  insert into public.reimbursements (employee_id, paid_on, amount, method, reference_no, notes, proof_path, client_uuid, reimbursement_no, created_by)
  values (v_emp, p_paid_on, v_total, p_method, nullif(trim(p_reference), ''), nullif(trim(p_notes), ''), p_proof_path, p_client_uuid, v_no, auth.uid())
  returning id into v_id;

  for l in select * from jsonb_array_elements(p_lines) loop
    v_amt := (l ->> 'amount')::numeric;
    insert into public.reimbursement_lines (reimbursement_id, expense_id, amount) values (v_id, (l ->> 'expense_id')::uuid, v_amt);
    update public.expenses set reimbursed_amount = reimbursed_amount + v_amt where id = (l ->> 'expense_id')::uuid
    returning * into e;
    perform public.expense_log(e.id, 'reimbursed', 'approved', 'approved', v_amt,
      v_no || case when e.outstanding > 0 then format(' · part payment, ₹%s still due', e.outstanding) else ' · fully paid' end);
  end loop;

  select full_name into v_name from public.profiles where id = v_emp;
  perform public.post_journal('reimbursement', v_id, 'paid', p_paid_on, v_no || ' · ' || coalesce(v_name, ''), null,
    jsonb_build_array(
      jsonb_build_object('account', 'Employee payable', 'employee_id', v_emp, 'debit', v_total),
      jsonb_build_object('account', public.expense_credit_account(p_method::text), 'credit', v_total)));
  return v_id;
end $function$

;

-- -----------------------------------------------------------------------------
-- visit_check_out(uuid, uuid, numeric, numeric, numeric, text, text, timestamp with time zone, uuid)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.visit_check_out(p_visit uuid, p_retailer uuid, p_lat numeric, p_lng numeric, p_accuracy numeric, p_remarks text, p_photo_path text, p_at timestamp with time zone, p_client_uuid uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v public.visits%rowtype; v_at timestamptz; v_res jsonb; v_prev jsonb;
begin
  if not public.is_active_user() then raise exception 'Not signed in' using errcode = '42501'; end if;
  if p_client_uuid is not null then
    select result into v_prev from public.visit_events where client_uuid = p_client_uuid;
    if found then return v_prev || '{"duplicate": true}'; end if;
  end if;
  v_at := public.field_time(p_at);
  v := public.visit_for(p_visit, p_retailer, v_at, false);
  if v.status = 'completed' then raise exception 'This visit is already completed' using errcode = 'P0001'; end if;
  if v.checkin_at is null or v.status <> 'in_progress' then
    raise exception 'Check in at the outlet first' using errcode = 'P0001', hint = 'CHECK_IN_FIRST';
  end if;
  if p_photo_path is not null and not public.is_own_upload(p_photo_path) then
    raise exception 'Upload the photo again' using errcode = '42501';
  end if;
  update public.visits set status = 'completed', checkout_at = greatest(v_at, checkin_at),
         checkout_latitude = p_lat, checkout_longitude = p_lng, checkout_accuracy_m = p_accuracy,
         remarks = coalesce(nullif(trim(p_remarks), ''), remarks), photo_path = coalesce(p_photo_path, photo_path)
   where id = v.id;
  v_res := jsonb_build_object('visit_id', v.id, 'status', 'completed', 'checkout_at', greatest(v_at, v.checkin_at));
  insert into public.visit_events (visit_id, action, client_uuid, happened_at, latitude, longitude, accuracy_m, result)
  values (v.id, 'check_out', p_client_uuid, v_at, p_lat, p_lng, p_accuracy, v_res);
  if p_lat is not null and p_lng is not null then
    insert into public.salesman_locations (salesman_id, recorded_at, latitude, longitude, accuracy_m, source, visit_id)
    values (auth.uid(), v_at, p_lat, p_lng, p_accuracy, 'check_out', v.id);
  end if;
  return v_res;
end $function$

;

-- -----------------------------------------------------------------------------
-- Check: all 11 functions exist and none changed its logic, security mode,
-- search path or owner.
-- -----------------------------------------------------------------------------
do $$
declare v text;
begin
  if (select count(*) from mt_rollback.function_src_0029) <> 11 then
    raise exception '0029: expected 11 functions, found %', (select count(*) from mt_rollback.function_src_0029);
  end if;
  select string_agg(b.sig, ', ') into v
    from mt_rollback.function_src_0029 b
    join pg_proc p on p.oid = b.sig::regprocedure
   where b.logic <> md5(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g'))
         || ' ' || p.prosecdef || ' ' || coalesce(array_to_string(p.proconfig, ','), '') || ' ' || p.proowner::regrole;
  if v is not null then
    raise exception '0029: the database''s copy differs from this file for: %. Nothing was changed; compare them before retrying', v;
  end if;
end $$;
alter table mt_rollback.function_src_0029 drop column logic;
