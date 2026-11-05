-- =============================================================================
-- APEX DMS — M2–M6 business logic
--   quotations -> invoices (GST, stock + credit checks, gapless numbers)
--   cancellation, credit notes, dispatch (full only), delivery
--   payments (FIFO / manual allocation, cheques), promises, ledger
--   retailer classification, route plans, expense reimbursement, report views
-- Every function that changes money or stock is SECURITY DEFINER with an
-- explicit role check, so the rules hold even for direct API calls.
-- =============================================================================

alter table public.company_settings
  add column if not exists salesman_max_discount numeric(5,2) not null default 5
    check (salesman_max_discount between 0 and 100);
alter table public.retailers add column if not exists classified_at timestamptz;

-- -----------------------------------------------------------------------------
-- GST line calculation (single source of truth)
--   inclusive price -> taxable unit = price / (1 + rate)
--   discount applies to the taxable value, before GST
-- -----------------------------------------------------------------------------
create or replace function public.calc_line(
  p_qty numeric, p_price numeric, p_mode public.price_tax_mode, p_discount_pct numeric, p_rate numeric
) returns table (gross numeric, discount numeric, taxable numeric, tax numeric)
language sql immutable set search_path = public as $$
  with b as (
    select round(p_qty * case when p_mode = 'inclusive' then p_price / (1 + p_rate / 100) else p_price end, 2) as g
  ), d as (
    select g, round(g * coalesce(p_discount_pct, 0) / 100, 2) as disc from b
  )
  select g, disc, g - disc, round((g - disc) * p_rate / 100, 2) from d
$$;

-- -----------------------------------------------------------------------------
-- Stock helpers
-- -----------------------------------------------------------------------------
create or replace function public.product_available(p_product_id uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce((select sum(qty) from public.stock_movements where product_id = p_product_id), 0)
       - coalesce((select sum(il.qty)
                     from public.invoice_lines il
                     join public.invoices i on i.id = il.invoice_id
                     left join public.dispatches d on d.invoice_id = i.id
                    where il.product_id = p_product_id and i.status = 'issued'
                      and (d.id is null or d.status = 'picking')), 0)
$$;
revoke all on function public.product_available(uuid) from public, anon;
grant execute on function public.product_available(uuid) to authenticated;

-- Weighted average cost (excl. GST) for gross-profit snapshots.
create or replace function public.product_avg_cost(p_product_id uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(
    (select sum(qty * unit_cost) / nullif(sum(qty), 0) from public.stock_movements
      where product_id = p_product_id and movement_type in ('opening', 'stock_in') and unit_cost is not null),
    (select case when purchase_cost_mode = 'inclusive' then purchase_cost / (1 + gst_rate / 100) else purchase_cost end
       from public.products where id = p_product_id),
    0)
$$;
revoke all on function public.product_avg_cost(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Quotations: create or edit (status stays 'quotation')
-- p_lines: [{product_id, qty, discount_pct?, unit_price?}]
-- -----------------------------------------------------------------------------
create or replace function public.save_quotation(
  p_order_id uuid,
  p_retailer_id uuid,
  p_credit_days integer,
  p_notes text,
  p_lines jsonb,
  p_client_uuid uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
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
  select salesman_max_discount into v_max from public.company_settings where id = 1;

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
    if v_role in ('super_admin', 'manager', 'billing') and nullif(v_line ->> 'unit_price', '') is not null then
      v_price := (v_line ->> 'unit_price')::numeric;
      if v_price < 0 then raise exception 'Price cannot be negative' using errcode = 'P0001'; end if;
    end if;
    v_disc := coalesce(nullif(v_line ->> 'discount_pct', '')::numeric, 0);
    if v_disc < 0 or v_disc > 100 then raise exception 'Discount must be 0–100%%' using errcode = 'P0001'; end if;
    if v_role = 'salesman' and v_disc > v_max then
      raise exception 'Salesmen can give at most % percent discount (line: %)', trim_scale(v_max), v_prod.name using errcode = 'P0001';
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
end $$;

-- -----------------------------------------------------------------------------
-- Payment allocation helpers
-- open amount = total - credit notes - allocations of live payments
-- -----------------------------------------------------------------------------
create or replace function public.invoice_open_amount(p_invoice_id uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select i.grand_total
       - coalesce((select sum(grand_total) from public.credit_notes where invoice_id = i.id and status = 'issued'), 0)
       - coalesce((select sum(a.amount) from public.payment_allocations a join public.payments p on p.id = a.payment_id
                    where a.invoice_id = i.id and p.status in ('received', 'cheque_pending')), 0)
    from public.invoices i where i.id = p_invoice_id
$$;
revoke all on function public.invoice_open_amount(uuid) from public, anon;
grant execute on function public.invoice_open_amount(uuid) to authenticated;

-- FIFO: oldest due date first, then oldest invoice. Returns amount allocated.
create or replace function public.fifo_allocate(p_payment_id uuid)
returns numeric language plpgsql security definer set search_path = public as $$
declare
  v_pay  public.payments%rowtype;
  v_left numeric;
  v_inv  record;
  v_open numeric;
  v_take numeric;
  v_done numeric := 0;
begin
  select * into v_pay from public.payments where id = p_payment_id for update;
  if v_pay.status not in ('received', 'cheque_pending') then return 0; end if;
  v_left := v_pay.amount - coalesce((select sum(amount) from public.payment_allocations where payment_id = p_payment_id), 0);
  for v_inv in
    select id from public.invoices
     where retailer_id = v_pay.retailer_id and status = 'issued'
     order by due_date, invoice_date, invoice_no
     for update
  loop
    exit when v_left <= 0;
    v_open := public.invoice_open_amount(v_inv.id);
    continue when v_open <= 0;
    v_take := least(v_open, v_left);
    insert into public.payment_allocations (payment_id, invoice_id, amount, is_auto, allocated_by)
    values (p_payment_id, v_inv.id, v_take, true, auth.uid())
    on conflict (payment_id, invoice_id) do nothing;
    if found then
      v_left := v_left - v_take;
      v_done := v_done + v_take;
    end if;
  end loop;
  return v_done;
end $$;
revoke all on function public.fifo_allocate(uuid) from public, anon, authenticated;

-- Allocate any unallocated money (advances) of a retailer, oldest payment first.
create or replace function public.allocate_unallocated(p_retailer_id uuid)
returns numeric language plpgsql security definer set search_path = public as $$
declare v_p record; v_total numeric := 0;
begin
  for v_p in
    select p.id from public.payments p
     where p.retailer_id = p_retailer_id and p.status in ('received', 'cheque_pending')
       and p.amount > coalesce((select sum(amount) from public.payment_allocations a where a.payment_id = p.id), 0)
     order by p.payment_date, p.created_at
  loop
    v_total := v_total + public.fifo_allocate(v_p.id);
  end loop;
  return v_total;
end $$;
revoke all on function public.allocate_unallocated(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Confirm a quotation into a GST invoice (same order record, never a copy)
-- -----------------------------------------------------------------------------
create or replace function public.confirm_order(p_order_id uuid, p_override_credit boolean default false)
returns uuid
language plpgsql security definer set search_path = public as $$
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
  if v_short is not null then
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
    public.next_document_number('INV', v_date), public.fy_label(v_date), p_order_id, v_ret.id, v_date,
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
end $$;

-- -----------------------------------------------------------------------------
-- Cancel an invoice: only before dispatch, with no payments or credit notes.
-- Billing staff may cancel same-day invoices; Manager / Admin any time.
-- -----------------------------------------------------------------------------
create or replace function public.cancel_invoice(p_invoice_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_inv public.invoices%rowtype;
begin
  select * into v_inv from public.invoices where id = p_invoice_id for update;
  if not found then raise exception 'Invoice not found' using errcode = 'P0002'; end if;
  if not (public.has_role('super_admin', 'manager')
          or (public.has_role('billing') and v_inv.invoice_date = (now() at time zone 'Asia/Kolkata')::date)) then
    raise exception 'Only a Manager can cancel an invoice after its invoice date' using errcode = '42501';
  end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Enter a cancellation reason' using errcode = 'P0001'; end if;
  if v_inv.status = 'cancelled' then raise exception 'Invoice is already cancelled' using errcode = 'P0001'; end if;
  if exists (select 1 from public.dispatches where invoice_id = p_invoice_id and status in ('dispatched', 'delivered')) then
    raise exception 'Invoice has been dispatched. Use a credit note instead.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.payment_allocations a join public.payments p on p.id = a.payment_id
              where a.invoice_id = p_invoice_id and p.status in ('received', 'cheque_pending')) then
    raise exception 'Payments are allocated to this invoice. Re-allocate them first.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.credit_notes where invoice_id = p_invoice_id and status = 'issued') then
    raise exception 'Invoice has credit notes and cannot be cancelled' using errcode = 'P0001';
  end if;

  update public.invoices
     set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = trim(p_reason)
   where id = p_invoice_id;
  update public.orders set status = 'cancelled', cancel_reason = trim(p_reason) where id = v_inv.order_id;
  delete from public.dispatches where invoice_id = p_invoice_id and status = 'picking';
end $$;

-- -----------------------------------------------------------------------------
-- Dispatch (full invoice, one dispatch). Stock leaves the warehouse here.
-- -----------------------------------------------------------------------------
create or replace function public.dispatch_invoice(
  p_invoice_id uuid, p_warehouse_id uuid, p_vehicle text default null, p_remarks text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_inv public.invoices%rowtype;
  v_dsp uuid;
  v_line record;
begin
  if not public.has_role('super_admin', 'manager', 'warehouse') then
    raise exception 'Only warehouse staff or managers can dispatch' using errcode = '42501';
  end if;
  select * into v_inv from public.invoices where id = p_invoice_id for update;
  if not found or v_inv.status <> 'issued' then
    raise exception 'Invoice not found or cancelled' using errcode = 'P0001';
  end if;
  select id into v_dsp from public.dispatches where invoice_id = p_invoice_id;
  if v_dsp is not null and exists (select 1 from public.dispatches where id = v_dsp and status <> 'picking') then
    raise exception 'This invoice has already been dispatched' using errcode = 'P0001';
  end if;

  if v_dsp is null then
    insert into public.dispatches (dispatch_no, invoice_id, warehouse_id, status, vehicle_no, picked_by,
                                   dispatched_by, dispatched_at, delivery_remarks)
    values (public.next_document_number('DSP'), p_invoice_id, p_warehouse_id, 'dispatched', nullif(trim(p_vehicle), ''),
            auth.uid(), auth.uid(), now(), nullif(trim(p_remarks), ''))
    returning id into v_dsp;
  else
    update public.dispatches
       set warehouse_id = p_warehouse_id, status = 'dispatched', vehicle_no = nullif(trim(p_vehicle), ''),
           dispatched_by = auth.uid(), dispatched_at = now(), delivery_remarks = nullif(trim(p_remarks), '')
     where id = v_dsp;
  end if;

  for v_line in
    select product_id, sum(qty) as qty from public.invoice_lines where invoice_id = p_invoice_id group by product_id order by product_id
  loop
    insert into public.stock_movements (product_id, warehouse_id, movement_type, qty, reference_type, reference_id, reason, created_by)
    values (v_line.product_id, p_warehouse_id, 'dispatch', -v_line.qty, 'dispatch', v_dsp, 'Invoice ' || v_inv.invoice_no, auth.uid());
  end loop;

  update public.orders set status = 'dispatched' where id = v_inv.order_id;
  return v_dsp;
end $$;

create or replace function public.confirm_delivery(p_dispatch_id uuid, p_remarks text default null, p_proof_path text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_d public.dispatches%rowtype;
begin
  if not public.has_role('super_admin', 'manager', 'warehouse', 'salesman') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select * into v_d from public.dispatches where id = p_dispatch_id for update;
  if not found then raise exception 'Dispatch not found' using errcode = 'P0002'; end if;
  if v_d.status <> 'dispatched' then raise exception 'Only dispatched goods can be marked delivered' using errcode = 'P0001'; end if;
  if public.has_role('salesman') and not public.can_see_retailer((select retailer_id from public.invoices where id = v_d.invoice_id)) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  update public.dispatches
     set status = 'delivered', delivered_at = now(), delivery_confirmed_by = auth.uid(),
         delivery_remarks = coalesce(nullif(trim(p_remarks), ''), delivery_remarks),
         proof_path = coalesce(p_proof_path, proof_path)
   where id = p_dispatch_id;
  update public.orders set status = 'delivered'
   where id = (select order_id from public.invoices where id = v_d.invoice_id);
end $$;

-- -----------------------------------------------------------------------------
-- Payments
-- p_allocations (optional, manual): [{invoice_id, amount}] ; null = FIFO
-- Cheques start as 'cheque_pending' (allocated, but not counted as paid until cleared).
-- -----------------------------------------------------------------------------
create or replace function public.record_payment(
  p_retailer_id uuid,
  p_amount numeric,
  p_method public.payment_method,
  p_payment_date date default null,
  p_reference text default null,
  p_cheque_date date default null,
  p_bank text default null,
  p_notes text default null,
  p_allocations jsonb default null,
  p_visit_id uuid default null,
  p_client_uuid uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id   uuid;
  v_a    jsonb;
  v_amt  numeric;
  v_open numeric;
  v_sum  numeric := 0;
  v_date date := coalesce(p_payment_date, (now() at time zone 'Asia/Kolkata')::date);
begin
  if not (public.has_role('super_admin', 'manager', 'billing')
          or (public.has_role('salesman') and public.can_see_retailer(p_retailer_id))) then
    raise exception 'Not allowed to record payments for this retailer' using errcode = '42501';
  end if;
  if p_client_uuid is not null then
    select id into v_id from public.payments where client_uuid = p_client_uuid;
    if v_id is not null then return v_id; end if;
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be more than zero' using errcode = 'P0001'; end if;
  if p_method in ('upi', 'bank_transfer', 'cheque') and coalesce(trim(p_reference), '') = '' then
    raise exception 'Enter the % reference number', case p_method when 'cheque' then 'cheque' when 'upi' then 'UPI' else 'transaction' end
      using errcode = 'P0001';
  end if;
  if v_date > (now() at time zone 'Asia/Kolkata')::date then
    raise exception 'Payment date cannot be in the future' using errcode = 'P0001';
  end if;

  perform 1 from public.retailers where id = p_retailer_id for update;   -- serialise allocations per retailer

  insert into public.payments (receipt_no, retailer_id, payment_date, amount, method, reference_no, cheque_date, bank_name,
                               status, collected_by, visit_id, notes, client_uuid, created_by)
  values (public.next_document_number('RCPT', v_date), p_retailer_id, v_date, round(p_amount, 2), p_method,
          nullif(trim(p_reference), ''), p_cheque_date, nullif(trim(p_bank), ''),
          (case when p_method = 'cheque' then 'cheque_pending' else 'received' end)::public.payment_status,
          auth.uid(), p_visit_id, nullif(trim(p_notes), ''), p_client_uuid, auth.uid())
  returning id into v_id;

  if p_allocations is not null and jsonb_array_length(p_allocations) > 0 then
    for v_a in select * from jsonb_array_elements(p_allocations) loop
      v_amt := round((v_a ->> 'amount')::numeric, 2);
      continue when v_amt is null or v_amt <= 0;
      if not exists (select 1 from public.invoices where id = (v_a ->> 'invoice_id')::uuid
                      and retailer_id = p_retailer_id and status = 'issued') then
        raise exception 'Invoice does not belong to this retailer' using errcode = 'P0001';
      end if;
      v_open := public.invoice_open_amount((v_a ->> 'invoice_id')::uuid);
      if v_amt > v_open then
        raise exception 'Allocation ₹% is more than the invoice balance ₹%', trim_scale(v_amt), trim_scale(v_open) using errcode = 'P0001';
      end if;
      v_sum := v_sum + v_amt;
      if v_sum > round(p_amount, 2) then
        raise exception 'Allocations add up to more than the payment' using errcode = 'P0001';
      end if;
      insert into public.payment_allocations (payment_id, invoice_id, amount, is_auto, allocated_by)
      values (v_id, (v_a ->> 'invoice_id')::uuid, v_amt, false, auth.uid());
    end loop;
  else
    perform public.fifo_allocate(v_id);
  end if;
  return v_id;
end $$;

-- Re-allocate a payment manually (replaces its current allocations).
create or replace function public.reallocate_payment(p_payment_id uuid, p_allocations jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_pay public.payments%rowtype; v_a jsonb; v_amt numeric; v_open numeric; v_sum numeric := 0;
begin
  if not public.has_role('super_admin', 'manager', 'billing') then
    raise exception 'Only office staff can re-allocate payments' using errcode = '42501';
  end if;
  select * into v_pay from public.payments where id = p_payment_id for update;
  if not found or v_pay.status not in ('received', 'cheque_pending') then
    raise exception 'Payment not found or not active' using errcode = 'P0001';
  end if;
  perform 1 from public.retailers where id = v_pay.retailer_id for update;
  delete from public.payment_allocations where payment_id = p_payment_id;
  if p_allocations is null or jsonb_array_length(p_allocations) = 0 then
    perform public.fifo_allocate(p_payment_id);
    return;
  end if;
  for v_a in select * from jsonb_array_elements(p_allocations) loop
    v_amt := round((v_a ->> 'amount')::numeric, 2);
    continue when v_amt is null or v_amt <= 0;
    if not exists (select 1 from public.invoices where id = (v_a ->> 'invoice_id')::uuid
                    and retailer_id = v_pay.retailer_id and status = 'issued') then
      raise exception 'Invoice does not belong to this retailer' using errcode = 'P0001';
    end if;
    v_open := public.invoice_open_amount((v_a ->> 'invoice_id')::uuid);
    if v_amt > v_open then
      raise exception 'Allocation ₹% is more than the invoice balance ₹%', trim_scale(v_amt), trim_scale(v_open) using errcode = 'P0001';
    end if;
    v_sum := v_sum + v_amt;
    if v_sum > v_pay.amount then raise exception 'Allocations add up to more than the payment' using errcode = 'P0001'; end if;
    insert into public.payment_allocations (payment_id, invoice_id, amount, is_auto, allocated_by)
    values (p_payment_id, (v_a ->> 'invoice_id')::uuid, v_amt, false, auth.uid());
  end loop;
end $$;

-- Cheque cleared / bounced, or payment cancelled (entered by mistake).
create or replace function public.set_payment_status(p_payment_id uuid, p_status public.payment_status, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_pay public.payments%rowtype;
begin
  if not public.has_role('super_admin', 'manager', 'billing') then
    raise exception 'Only office staff can change payment status' using errcode = '42501';
  end if;
  select * into v_pay from public.payments where id = p_payment_id for update;
  if not found then raise exception 'Payment not found' using errcode = 'P0002'; end if;
  if not (
       (v_pay.status = 'cheque_pending' and p_status in ('received', 'bounced'))
    or (v_pay.status in ('received', 'cheque_pending') and p_status = 'cancelled' and public.has_role('super_admin', 'manager'))
  ) then
    raise exception 'Cannot change a % payment to %', v_pay.status, p_status using errcode = 'P0001';
  end if;
  update public.payments
     set status = p_status,
         notes = case when nullif(trim(p_note), '') is null then notes
                      else concat_ws(' | ', notes, initcap(p_status::text) || ': ' || trim(p_note)) end
   where id = p_payment_id;
  if p_status in ('bounced', 'cancelled') then
    delete from public.payment_allocations where payment_id = p_payment_id;   -- invoices become due again
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Credit notes: return or price correction against an invoice.
-- p_lines: [{invoice_line_id, qty}]
-- -----------------------------------------------------------------------------
create or replace function public.create_credit_note(p_invoice_id uuid, p_reason text, p_restock boolean, p_lines jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
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
  values (public.next_document_number('CN', v_date), public.fy_label(v_date), p_invoice_id, v_inv.retailer_id, v_date,
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
end $$;

-- -----------------------------------------------------------------------------
-- Retailer ledger (statement lines). Running balance is computed by the reader.
-- -----------------------------------------------------------------------------
create or replace view public.retailer_ledger
with (security_invoker = true) as
select i.retailer_id, i.invoice_date as entry_date, i.created_at, 'invoice'::text as kind, i.id as doc_id, i.invoice_no as doc_no,
       'Invoice · due ' || to_char(i.due_date, 'DD Mon YYYY') as narration, i.grand_total as debit, 0::numeric as credit
  from public.invoices i where i.status = 'issued'
union all
select c.retailer_id, c.note_date, c.created_at, 'credit_note', c.id, c.credit_note_no,
       'Credit note · ' || c.reason, 0, c.grand_total
  from public.credit_notes c where c.status = 'issued'
union all
select p.retailer_id, p.payment_date, p.created_at, 'payment', p.id, p.receipt_no,
       initcap(replace(p.method::text, '_', ' ')) || coalesce(' · ' || p.reference_no, '')
         || case when p.status = 'cheque_pending' then ' (cheque not yet cleared)' else '' end,
       0, p.amount
  from public.payments p where p.status in ('received', 'cheque_pending');

grant select on public.retailer_ledger to authenticated;
revoke all on public.retailer_ledger from anon;

-- -----------------------------------------------------------------------------
-- Hide invoice-line cost from everyone except Admin / Manager / Billing.
-- -----------------------------------------------------------------------------
revoke select on public.invoice_lines from authenticated;
grant select (id, invoice_id, line_no, product_id, product_name, sku, hsn_code, unit_code, qty, unit_price, price_mode,
              discount_pct, discount_amount, taxable_value, gst_rate, cgst, sgst, igst, line_total)
  on public.invoice_lines to authenticated;

-- Sales register: one row per invoice line (issued invoices), for reports.
-- Owner rights (it needs brand data from products), filtered to what the
-- caller may see: office/warehouse everything, a salesman his own retailers.
create or replace view public.sales_register as
select il.id as line_id, i.id as invoice_id, i.invoice_no, i.invoice_date, i.due_date, i.retailer_id,
       r.code as retailer_code, r.shop_name, r.route_id, rt.name as route_name,
       o.salesman_id, s.full_name as salesman_name,
       il.product_id, il.product_name, il.sku, p.brand_id, b.name as brand_name, p.category_id,
       il.qty, il.taxable_value, il.cgst + il.sgst + il.igst as tax, il.line_total
  from public.invoice_lines il
  join public.invoices i on i.id = il.invoice_id and i.status = 'issued'
  join public.orders o on o.id = i.order_id
  join public.retailers r on r.id = i.retailer_id
  left join public.routes rt on rt.id = r.route_id
  left join public.profiles s on s.id = o.salesman_id
  join public.products p on p.id = il.product_id
  join public.brands b on b.id = p.brand_id
 where public.has_role('super_admin', 'manager', 'billing', 'warehouse')
    or (public.has_role('salesman') and public.can_see_retailer(i.retailer_id));
grant select on public.sales_register to authenticated;
revoke all on public.sales_register from anon;

-- Cost of each sold line (owner rights, filtered to roles that may see cost).
create or replace view public.sales_costs as
select il.id as line_id, il.invoice_id, round(il.qty * il.unit_cost, 2) as cost
  from public.invoice_lines il
  join public.invoices i on i.id = il.invoice_id and i.status = 'issued'
 where public.has_role('super_admin', 'manager', 'billing');
grant select on public.sales_costs to authenticated;
revoke all on public.sales_costs from anon;

-- -----------------------------------------------------------------------------
-- Retailer classification (Star / Average / Needs Attention / High Credit Risk)
-- Looks at the last 180 days: purchase frequency and value, on-time payment,
-- overdue history and credit behaviour.
-- -----------------------------------------------------------------------------
create or replace function public.classify_retailers()
returns integer language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  if not public.has_role('super_admin', 'manager') then
    raise exception 'Only a Manager can run classification' using errcode = '42501';
  end if;

  with inv as (
    select i.retailer_id, i.id, i.invoice_date, i.due_date, i.grand_total,
           public.invoice_open_amount(i.id) as open_amt,
           (select max(p.payment_date) from public.payment_allocations a join public.payments p on p.id = a.payment_id
             where a.invoice_id = i.id and p.status = 'received') as last_paid
      from public.invoices i
     where i.status = 'issued' and i.invoice_date >= current_date - 180
  ), stats as (
    select r.id as retailer_id, r.credit_limit,
           count(inv.id) as n_inv,
           count(inv.id) filter (where inv.invoice_date >= current_date - 90) as n_inv_90,
           max(inv.invoice_date) as last_invoice,
           count(inv.id) filter (where inv.open_amt <= 0 and inv.last_paid <= inv.due_date) as on_time,
           count(inv.id) filter (where inv.open_amt <= 0 or inv.due_date < current_date) as judged,
           coalesce(sum(inv.open_amt) filter (where inv.open_amt > 0), 0) as outstanding,
           coalesce(max(current_date - inv.due_date) filter (where inv.open_amt > 0), 0) as max_overdue_days,
           exists (select 1 from public.payments p where p.retailer_id = r.id and p.status = 'bounced'
                    and p.payment_date >= current_date - 90) as bounced
      from public.retailers r
      left join inv on inv.retailer_id = r.id
     group by r.id
  ), cls as (
    select retailer_id,
           case
             when n_inv = 0 then null
             when max_overdue_days > 45 or bounced or (credit_limit > 0 and outstanding > credit_limit) then 'high_credit_risk'
             when max_overdue_days > 15 or last_invoice < current_date - 60
                  or (judged >= 3 and on_time::numeric / judged < 0.6) then 'needs_attention'
             when n_inv_90 >= 4 and max_overdue_days <= 0 and (judged = 0 or on_time::numeric / judged >= 0.9) then 'star'
             else 'average'
           end::public.retailer_class as c
      from stats
  )
  update public.retailers r set classification = cls.c, classified_at = now()
    from cls where cls.retailer_id = r.id and r.classification is distinct from cls.c;
  get diagnostics v_count = row_count;
  update public.retailers set classified_at = now() where classified_at is null or classified_at < now() - interval '1 minute';
  return v_count;
end $$;

-- -----------------------------------------------------------------------------
-- Route plan for a day: creates one planned visit per retailer on the route.
-- -----------------------------------------------------------------------------
create or replace function public.plan_route(p_route_id uuid, p_salesman_id uuid, p_date date, p_notes text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_plan uuid;
begin
  if not public.has_role('super_admin', 'manager') then
    raise exception 'Only a Manager can plan routes' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = p_salesman_id and role = 'salesman' and is_active) then
    raise exception 'Choose an active salesman' using errcode = 'P0001';
  end if;
  insert into public.route_plans (route_id, salesman_id, plan_date, notes, created_by)
  values (p_route_id, p_salesman_id, p_date, nullif(trim(p_notes), ''), auth.uid())
  on conflict (salesman_id, plan_date, route_id) do update set notes = coalesce(excluded.notes, public.route_plans.notes)
  returning id into v_plan;

  insert into public.visits (route_plan_id, retailer_id, salesman_id, planned_date)
  select v_plan, r.id, p_salesman_id, p_date
    from public.retailers r
   where r.route_id = p_route_id and r.status in ('active', 'on_hold')
     and not exists (select 1 from public.visits v
                      where v.retailer_id = r.id and v.salesman_id = p_salesman_id and v.planned_date = p_date);
  return v_plan;
end $$;

-- -----------------------------------------------------------------------------
-- Expense reimbursement: pays a set of approved expenses in one entry.
-- -----------------------------------------------------------------------------
create or replace function public.reimburse_expenses(p_expense_ids uuid[], p_method public.payment_method, p_reference text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_salesman uuid; v_n integer; v_total numeric;
begin
  if not public.has_role('super_admin', 'manager') then
    raise exception 'Only a Manager can reimburse expenses' using errcode = '42501';
  end if;
  select count(distinct salesman_id), min(salesman_id::text)::uuid, sum(amount)
    into v_n, v_salesman, v_total
    from public.expenses where id = any (p_expense_ids) and status = 'approved';
  if coalesce(v_n, 0) = 0 then raise exception 'Choose approved expenses' using errcode = 'P0001'; end if;
  if v_n > 1 then raise exception 'Reimburse one salesman at a time' using errcode = 'P0001'; end if;
  if (select count(*) from public.expenses where id = any (p_expense_ids)) <> (select count(*) from public.expenses where id = any (p_expense_ids) and status = 'approved') then
    raise exception 'Only approved expenses can be reimbursed' using errcode = 'P0001';
  end if;
  insert into public.reimbursements (salesman_id, amount, method, reference_no, created_by)
  values (v_salesman, v_total, p_method, nullif(trim(p_reference), ''), auth.uid())
  returning id into v_id;
  update public.expenses set status = 'reimbursed', reimbursement_id = v_id where id = any (p_expense_ids);
  return v_id;
end $$;

-- -----------------------------------------------------------------------------
-- Grants: callable by signed-in users (each function checks the role itself)
-- -----------------------------------------------------------------------------
revoke all on function public.save_quotation(uuid, uuid, integer, text, jsonb, uuid) from public, anon;
revoke all on function public.confirm_order(uuid, boolean) from public, anon;
revoke all on function public.cancel_invoice(uuid, text) from public, anon;
revoke all on function public.dispatch_invoice(uuid, uuid, text, text) from public, anon;
revoke all on function public.confirm_delivery(uuid, text, text) from public, anon;
revoke all on function public.record_payment(uuid, numeric, public.payment_method, date, text, date, text, text, jsonb, uuid, uuid) from public, anon;
revoke all on function public.reallocate_payment(uuid, jsonb) from public, anon;
revoke all on function public.set_payment_status(uuid, public.payment_status, text) from public, anon;
revoke all on function public.create_credit_note(uuid, text, boolean, jsonb) from public, anon;
revoke all on function public.classify_retailers() from public, anon;
revoke all on function public.plan_route(uuid, uuid, date, text) from public, anon;
revoke all on function public.reimburse_expenses(uuid[], public.payment_method, text) from public, anon;
revoke all on function public.calc_line(numeric, numeric, public.price_tax_mode, numeric, numeric) from public, anon;

grant execute on function
  public.save_quotation(uuid, uuid, integer, text, jsonb, uuid),
  public.confirm_order(uuid, boolean),
  public.cancel_invoice(uuid, text),
  public.dispatch_invoice(uuid, uuid, text, text),
  public.confirm_delivery(uuid, text, text),
  public.record_payment(uuid, numeric, public.payment_method, date, text, date, text, text, jsonb, uuid, uuid),
  public.reallocate_payment(uuid, jsonb),
  public.set_payment_status(uuid, public.payment_status, text),
  public.create_credit_note(uuid, text, boolean, jsonb),
  public.classify_retailers(),
  public.plan_route(uuid, uuid, date, text),
  public.reimburse_expenses(uuid[], public.payment_method, text),
  public.calc_line(numeric, numeric, public.price_tax_mode, numeric, numeric)
to authenticated;
