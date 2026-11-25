-- Returns and shop credit (0040)
--
-- A return ("Return items" on an invoice) stays a GST credit note underneath
-- (section 34: an issued tax invoice is never edited). What changes:
--
--   1. Round-off. A return is rounded to whole rupees like the invoice, and the
--      return that brings the last unit back takes exactly what is left of the
--      invoice, so a fully returned invoice ends at ₹0.00, not at its ₹0.18
--      round-off.
--   2. Shop credit. When a return is bigger than what is still unpaid on the
--      invoice, the payment money already applied to it is released, newest
--      allocation first, and applied to the shop's other unpaid bills (oldest
--      first). What is left is the shop's credit ("advance"): the existing
--      allocate_unallocated() spends it on the next invoice automatically.
--      Before this an invoice could go below zero and the Outstanding screen,
--      the credit-limit check and the statement's "bills due" lost that money.
--   3. Giving money back. retailer_refunds records cash or UPI handed back to a
--      shop out of its credit. A refund is funded from the shop's unapplied
--      payments (rows in payment_allocations with refund_id instead of
--      invoice_id), so every "unapplied money" figure already counts it.
--      Statements show it as a debit; payments that funded a refund cannot be
--      cancelled or rejected until the refund is cancelled.
--   4. The credit-limit check at invoicing counts the shop's credit.
--
-- Existing invoices below zero are corrected the same way (2 on staging, none
-- in production).

-- -----------------------------------------------------------------------------
-- 1. Tables
-- -----------------------------------------------------------------------------
alter table public.credit_notes add column round_off numeric(6,2) not null default 0;

create table public.retailer_refunds (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id),
  refund_no     text not null,
  retailer_id   uuid not null,
  refund_date   date not null,
  amount        numeric(14,2) not null check (amount > 0),
  method        public.payment_method not null check (method in ('cash', 'upi')),
  reference_no  text,
  notes         text,
  status        text not null default 'issued' check (status in ('issued', 'cancelled')),
  cancelled_at  timestamptz,
  cancelled_by  uuid,
  cancel_reason text,
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  unique (tenant_id, refund_no),
  unique (tenant_id, id),
  foreign key (tenant_id, retailer_id) references public.retailers (tenant_id, id)
);
create index retailer_refunds_retailer_idx on public.retailer_refunds (retailer_id, refund_date);

create trigger aa_tenant_stamp before insert or update of tenant_id on public.retailer_refunds
  for each row execute function public.tenant_stamp();
create trigger retailer_refunds_audit after insert or delete or update on public.retailer_refunds
  for each row execute function public.audit_row();
create trigger retailer_refunds_no_delete before delete on public.retailer_refunds
  for each row execute function public.prevent_mutation();

alter table public.retailer_refunds enable row level security;
create policy definer_tenant_fence on public.retailer_refunds for all to app_definer
  using (tenant_id = (select public.current_tenant_id()))
  with check (tenant_id = (select public.current_tenant_id()));
create policy retailer_refunds_select on public.retailer_refunds for select to authenticated
  using (tenant_id = (select public.current_tenant_id())
         and ((select public.has_role('super_admin', 'manager', 'billing'))
              or (public.has_role('salesman') and public.can_see_retailer(retailer_id))));
revoke all on public.retailer_refunds from anon;
revoke insert, update, delete, truncate on public.retailer_refunds from authenticated;
grant select on public.retailer_refunds to authenticated;
grant all on public.retailer_refunds to app_definer;

-- An allocation now applies payment money either to an invoice or to a refund.
alter table public.payment_allocations alter column invoice_id drop not null;
alter table public.payment_allocations add column refund_id uuid;
alter table public.payment_allocations
  add constraint payment_allocations_refund_id_fkey foreign key (tenant_id, refund_id) references public.retailer_refunds (tenant_id, id),
  add constraint payment_allocations_one_target check (num_nonnulls(invoice_id, refund_id) = 1),
  add constraint payment_allocations_payment_id_refund_id_key unique (payment_id, refund_id);

-- -----------------------------------------------------------------------------
-- 2. Release money applied beyond what an invoice still owes
--    Internal: called by create_credit_note and by this migration.
-- -----------------------------------------------------------------------------
create or replace function public.release_excess_credit(p_invoice_id uuid)
returns numeric language plpgsql security definer set search_path = public as $$
declare
  v_open numeric := public.invoice_open_amount(p_invoice_id);
  v_a    record;
  v_take numeric;
  v_done numeric := 0;
begin
  if v_open is null or v_open >= 0 then return 0; end if;
  for v_a in
    select a.* from public.payment_allocations a join public.payments p on p.id = a.payment_id
     where a.invoice_id = p_invoice_id and p.status in ('received', 'cheque_pending')
     order by a.created_at desc, a.id desc
  loop
    exit when v_open >= 0;
    v_take := least(v_a.amount, -v_open);
    -- allocations are never edited in place: replace the row with the smaller amount
    delete from public.payment_allocations where id = v_a.id;
    if v_a.amount - v_take > 0 then
      insert into public.payment_allocations (tenant_id, payment_id, invoice_id, amount, is_auto, allocated_by)
      values (v_a.tenant_id, v_a.payment_id, p_invoice_id, v_a.amount - v_take, v_a.is_auto, v_a.allocated_by);
    end if;
    v_open := v_open + v_take;
    v_done := v_done + v_take;
  end loop;
  return v_done;
end $$;
revoke all on function public.release_excess_credit(uuid) from public, anon, authenticated;

-- FIFO: when the payment already pays part of a bill (money released by a
-- return and applied again), add to that row instead of skipping the bill.
-- Rows are never edited in place, so the old row is replaced.
create or replace function public.fifo_allocate(p_payment_id uuid)
returns numeric language plpgsql security definer set search_path = public as $$
declare
  v_pay  public.payments%rowtype;
  v_left numeric;
  v_inv  record;
  v_open numeric;
  v_take numeric;
  v_had  numeric;
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
    select amount into v_had from public.payment_allocations where payment_id = p_payment_id and invoice_id = v_inv.id;
    if found then
      delete from public.payment_allocations where payment_id = p_payment_id and invoice_id = v_inv.id;
    end if;
    insert into public.payment_allocations (payment_id, invoice_id, amount, is_auto, allocated_by)
    values (p_payment_id, v_inv.id, coalesce(v_had, 0) + v_take, true, auth.uid());
    v_left := v_left - v_take;
    v_done := v_done + v_take;
  end loop;
  return v_done;
end $$;

-- -----------------------------------------------------------------------------
-- 3. Returns (credit notes): round-off, release, re-apply
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
  v_sum   numeric;
  v_prev  numeric;
  v_grand numeric;
begin
  if not public.has_role('super_admin', 'manager', 'billing') then
    raise exception 'Only office staff can record returns' using errcode = '42501';
  end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Enter a reason' using errcode = 'P0001'; end if;
  select * into v_inv from public.invoices where id = p_invoice_id for update;
  if not found or v_inv.status <> 'issued' then raise exception 'Invoice not found or cancelled' using errcode = 'P0001'; end if;
  perform 1 from public.retailers where id = v_inv.retailer_id for update;   -- serialise money moves per shop
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
     where cl.invoice_line_id = v_il.id and c.status = 'issued' and c.id <> v_cn;
    if v_qty > v_il.qty - v_done then
      raise exception 'Only % of % can still be returned', trim_scale(v_il.qty - v_done), v_il.product_name using errcode = 'P0001';
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

  v_sum := t_tx + t_c + t_s + t_g;
  if v_sum <= 0 then raise exception 'Return amount must be more than zero' using errcode = 'P0001'; end if;

  -- Whole rupees, like the invoice. The return that brings the last unit back
  -- takes exactly what is left of the invoice.
  select coalesce(sum(grand_total), 0) into v_prev
    from public.credit_notes where invoice_id = p_invoice_id and status = 'issued' and id <> v_cn;
  if not exists (
       select 1 from public.invoice_lines il
        where il.invoice_id = p_invoice_id
          and il.qty > coalesce((select sum(cl.qty) from public.credit_note_lines cl join public.credit_notes c on c.id = cl.credit_note_id
                                  where cl.invoice_line_id = il.id and c.status = 'issued'), 0)) then
    v_grand := v_inv.grand_total - v_prev;
  else
    v_grand := case when round(v_sum) > 0 then round(v_sum) else v_sum end;
    v_grand := least(v_grand, v_inv.grand_total - v_prev);
  end if;
  if v_grand <= 0 then raise exception 'Nothing is left to return on this invoice' using errcode = 'P0001'; end if;

  update public.credit_notes
     set taxable_total = t_tx, cgst_total = t_c, sgst_total = t_s, igst_total = t_g,
         round_off = v_grand - v_sum, grand_total = v_grand
   where id = v_cn;

  -- Money already applied beyond what the invoice now owes goes to the shop's
  -- other unpaid bills; what is left stays as shop credit for the next bill.
  perform public.release_excess_credit(p_invoice_id);
  perform public.allocate_unallocated(v_inv.retailer_id);
  return v_cn;
end $$;

-- -----------------------------------------------------------------------------
-- 4. Giving shop credit back (cash or UPI)
-- -----------------------------------------------------------------------------
-- Unapplied money of a shop's received payments dated on or before p_on.
create or replace function public.shop_credit(p_retailer_id uuid, p_on date default null)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(sum(p.amount - coalesce((select sum(a.amount) from public.payment_allocations a where a.payment_id = p.id), 0)), 0)
    from public.payments p
   where p.retailer_id = p_retailer_id and p.status = 'received'
     and (p_on is null or p.payment_date <= p_on)
$$;
revoke all on function public.shop_credit(uuid, date) from public, anon;
grant execute on function public.shop_credit(uuid, date) to authenticated;

create or replace function public.record_refund(p_retailer_id uuid, p_amount numeric, p_method public.payment_method,
                                                p_refund_date date default null, p_reference text default null, p_notes text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_date   date := coalesce(p_refund_date, (now() at time zone 'Asia/Kolkata')::date);
  v_amt    numeric := round(p_amount, 2);
  v_credit numeric;
  v_id     uuid;
  v_p      record;
  v_free   numeric;
  v_left   numeric;
  v_take   numeric;
begin
  if not public.has_role('super_admin', 'manager', 'billing') then
    raise exception 'Only office staff can give money back' using errcode = '42501';
  end if;
  perform 1 from public.retailers where id = p_retailer_id for update;
  if not found then raise exception 'Retailer not found' using errcode = 'P0002'; end if;
  if v_amt is null or v_amt <= 0 then raise exception 'Amount must be more than zero' using errcode = 'P0001'; end if;
  if p_method is null or p_method not in ('cash', 'upi') then
    raise exception 'Give money back in cash or UPI' using errcode = 'P0001';
  end if;
  if p_method = 'upi' and coalesce(trim(p_reference), '') = '' then
    raise exception 'Enter the UPI reference number' using errcode = 'P0001';
  end if;
  if v_date > (now() at time zone 'Asia/Kolkata')::date then
    raise exception 'Date cannot be in the future' using errcode = 'P0001';
  end if;
  v_credit := public.shop_credit(p_retailer_id, v_date);
  if v_amt > v_credit then
    raise exception 'Only ₹% of shop credit is available on %', trim_scale(v_credit), to_char(v_date, 'DD-Mon-YYYY')
      using errcode = 'P0001', hint = 'NO_CREDIT';
  end if;

  insert into public.retailer_refunds (refund_no, retailer_id, refund_date, amount, method, reference_no, notes, created_by)
  values (public.next_document_number('RFD', v_date), p_retailer_id, v_date, v_amt, p_method,
          nullif(trim(p_reference), ''), nullif(trim(p_notes), ''), auth.uid())
  returning id into v_id;

  -- fund it from the newest unapplied payments
  v_left := v_amt;
  for v_p in
    select p.id, p.amount - coalesce((select sum(a.amount) from public.payment_allocations a where a.payment_id = p.id), 0) as free
      from public.payments p
     where p.retailer_id = p_retailer_id and p.status = 'received' and p.payment_date <= v_date
     order by p.payment_date desc, p.created_at desc
  loop
    exit when v_left <= 0;
    continue when v_p.free <= 0;
    v_take := least(v_p.free, v_left);
    insert into public.payment_allocations (payment_id, refund_id, amount, is_auto, allocated_by)
    values (v_p.id, v_id, v_take, true, auth.uid());
    v_left := v_left - v_take;
  end loop;
  if v_left > 0 then raise exception 'Shop credit changed while saving. Try again.' using errcode = 'P0001'; end if;
  return v_id;
end $$;
revoke all on function public.record_refund(uuid, numeric, public.payment_method, date, text, text) from public, anon;
grant execute on function public.record_refund(uuid, numeric, public.payment_method, date, text, text) to authenticated;

create or replace function public.cancel_refund(p_refund_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_r public.retailer_refunds%rowtype;
begin
  if not public.has_role('super_admin', 'manager') then
    raise exception 'Only a Super Admin or Manager can cancel a refund' using errcode = '42501';
  end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Enter the reason' using errcode = 'P0001'; end if;
  select * into v_r from public.retailer_refunds where id = p_refund_id for update;
  if not found then raise exception 'Refund not found' using errcode = 'P0002'; end if;
  if v_r.status <> 'issued' then raise exception 'Refund is already cancelled' using errcode = 'P0001'; end if;
  perform 1 from public.retailers where id = v_r.retailer_id for update;
  update public.retailer_refunds
     set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = trim(p_reason)
   where id = p_refund_id;
  delete from public.payment_allocations where refund_id = p_refund_id;
  perform public.allocate_unallocated(v_r.retailer_id);
end $$;
revoke all on function public.cancel_refund(uuid, text) from public, anon;
grant execute on function public.cancel_refund(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 5. Payments that funded a refund stay put
-- -----------------------------------------------------------------------------
create or replace function public.reallocate_payment(p_payment_id uuid, p_allocations jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_pay public.payments%rowtype; v_a jsonb; v_amt numeric; v_open numeric; v_sum numeric := 0; v_refunded numeric;
begin
  if not public.has_role('super_admin', 'manager', 'billing') then
    raise exception 'Only office staff can re-allocate payments' using errcode = '42501';
  end if;
  select * into v_pay from public.payments where id = p_payment_id for update;
  if not found or v_pay.status not in ('received', 'cheque_pending') then
    raise exception 'Payment not found or not active' using errcode = 'P0001';
  end if;
  perform 1 from public.retailers where id = v_pay.retailer_id for update;
  -- money given back from this payment is not re-applied
  select coalesce(sum(amount), 0) into v_refunded from public.payment_allocations where payment_id = p_payment_id and refund_id is not null;
  delete from public.payment_allocations where payment_id = p_payment_id and invoice_id is not null;
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
    if v_sum + v_refunded > v_pay.amount then raise exception 'Allocations add up to more than the payment' using errcode = 'P0001'; end if;
    insert into public.payment_allocations (payment_id, invoice_id, amount, is_auto, allocated_by)
    values (p_payment_id, (v_a ->> 'invoice_id')::uuid, v_amt, false, auth.uid());
  end loop;
end $$;

create or replace function public.payment_refund_guard(p_payment_id uuid)
returns void language plpgsql stable security definer set search_path = public as $$
declare v_no text;
begin
  select string_agg(r.refund_no, ', ' order by r.refund_no) into v_no
    from public.payment_allocations a join public.retailer_refunds r on r.id = a.refund_id
   where a.payment_id = p_payment_id;
  if v_no is not null then
    raise exception 'Part of this payment was given back to the shop (%). Cancel that refund first.', v_no
      using errcode = 'P0001', hint = 'PAYMENT_REFUNDED';
  end if;
end $$;
revoke all on function public.payment_refund_guard(uuid) from public, anon, authenticated;

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
  if p_status in ('bounced', 'cancelled') then perform public.payment_refund_guard(p_payment_id); end if;
  update public.payments
     set status = p_status,
         notes = case when nullif(trim(p_note), '') is null then notes
                      else concat_ws(' | ', notes, initcap(p_status::text) || ': ' || trim(p_note)) end
   where id = p_payment_id;
  if p_status in ('bounced', 'cancelled') then
    delete from public.payment_allocations where payment_id = p_payment_id;   -- invoices become due again
  end if;
end $$;

create or replace function public.reject_payment(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role('super_admin', 'manager', 'billing') then
    raise exception 'Only office staff can reject collections' using errcode = '42501';
  end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Enter the reason' using errcode = 'P0001'; end if;
  perform public.payment_refund_guard(p_id);
  update public.payments
     set status = 'cancelled',
         notes = concat_ws(' | ', notes, 'Rejected at verification: ' || trim(p_reason))
   where id = p_id and verified_at is null and status in ('received', 'cheque_pending');
  if not found then raise exception 'Payment not found or already verified' using errcode = 'P0001'; end if;
  delete from public.payment_allocations where payment_id = p_id;
end $$;

-- -----------------------------------------------------------------------------
-- 6. Credit limit counts the shop's credit
-- -----------------------------------------------------------------------------
create or replace function public.confirm_order(p_order_id uuid, p_override_credit boolean default false, p_override_stock boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
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

  -- Credit limit (0 = no limit). The shop's credit is spent on this invoice
  -- straight away, so it counts against what is owed.
  if v_ret.credit_limit > 0 then
    select coalesce(sum(public.invoice_open_amount(id)), 0) into v_out
      from public.invoices where retailer_id = v_ret.id and status = 'issued';
    v_out := v_out - public.shop_credit(v_ret.id);
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
end $$;

-- -----------------------------------------------------------------------------
-- 7. Ledger and statements show money given back
-- -----------------------------------------------------------------------------
create or replace view public.retailer_ledger with (security_invoker = true) as
 SELECT i.retailer_id,
    i.invoice_date AS entry_date,
    i.created_at,
    'invoice'::text AS kind,
    i.id AS doc_id,
    i.invoice_no AS doc_no,
    'Invoice · due '::text || to_char(i.due_date::timestamp with time zone, 'DD Mon YYYY'::text) AS narration,
    i.grand_total AS debit,
    0::numeric AS credit
   FROM invoices i
  WHERE i.status = 'issued'::invoice_status
UNION ALL
 SELECT c.retailer_id,
    c.note_date AS entry_date,
    c.created_at,
    'credit_note'::text AS kind,
    c.id AS doc_id,
    c.credit_note_no AS doc_no,
    'Return · '::text || c.reason AS narration,
    0 AS debit,
    c.grand_total AS credit
   FROM credit_notes c
  WHERE c.status = 'issued'::credit_note_status
UNION ALL
 SELECT p.retailer_id,
    p.payment_date AS entry_date,
    p.created_at,
    'payment'::text AS kind,
    p.id AS doc_id,
    p.receipt_no AS doc_no,
    (initcap(replace(p.method::text, '_'::text, ' '::text)) || COALESCE(' · '::text || p.reference_no, ''::text)) ||
        CASE
            WHEN p.status = 'cheque_pending'::payment_status THEN ' (cheque not yet cleared)'::text
            ELSE ''::text
        END AS narration,
    0 AS debit,
    p.amount AS credit
   FROM payments p
  WHERE p.status = ANY (ARRAY['received'::payment_status, 'cheque_pending'::payment_status])
UNION ALL
 SELECT f.retailer_id,
    f.refund_date AS entry_date,
    f.created_at,
    'refund'::text AS kind,
    f.id AS doc_id,
    f.refund_no AS doc_no,
    ('Money given back · '::text || initcap(f.method::text)) || COALESCE(' · '::text || f.reference_no, ''::text) AS narration,
    f.amount AS debit,
    0::numeric AS credit
   FROM retailer_refunds f
  WHERE f.status = 'issued'::text;

drop function public.account_statement(text, uuid, date, date);
create function public.account_statement(p_scope text, p_id uuid, p_from date default null, p_to date default null)
returns table (
  shop_position   integer,
  retailer_id     uuid,
  code            text,
  shop_name       text,
  owner_name      text,
  mobile          text,
  gstin           text,
  billing_address text,
  billing_city    text,
  credit_days     integer,
  credit_limit    numeric,
  retailer_status text,
  territory_id    uuid,
  territory_name  text,
  route_id        uuid,
  route_name      text,
  route_code      text,
  town_id         uuid,
  town_name       text,
  opening         numeric,
  invoiced        numeric,
  carried_over    numeric,
  credit_notes    numeric,
  collected       numeric,
  closing         numeric,
  bills_due       numeric,
  advance         numeric,
  overdue         numeric,
  entries         integer,
  unverified      numeric,
  refunded        numeric
)
language plpgsql stable security invoker set search_path = public as $$
#variable_conflict use_column
declare
  v_to date := coalesce(p_to, (now() at time zone 'Asia/Kolkata')::date);
begin
  if p_from is not null and p_from > v_to then
    raise exception 'The start date is after the end date' using errcode = '22023';
  end if;

  return query
  with s as (
    select * from public.statement_retailers(p_scope, p_id)
  ), inv as (
    select i.id, i.retailer_id, i.invoice_date, i.due_date, i.grand_total, i.is_opening
      from public.invoices i join s on s.retailer_id = i.retailer_id
     where i.status = 'issued' and i.invoice_date <= v_to
  ), cn as (
    select c.invoice_id, c.retailer_id, c.note_date, c.grand_total
      from public.credit_notes c join s on s.retailer_id = c.retailer_id
     where c.status = 'issued' and c.note_date <= v_to
  ), pay as (
    select p.id, p.retailer_id, p.payment_date, p.amount, p.verified_at
      from public.payments p join s on s.retailer_id = p.retailer_id
     where p.status = 'received' and p.payment_date <= v_to
  ), rf as (
    select f.id, f.retailer_id, f.refund_date, f.amount
      from public.retailer_refunds f join s on s.retailer_id = f.retailer_id
     where f.status = 'issued' and f.refund_date <= v_to
  ), alloc as (
    -- both the payment and the bill (or the refund) exist by the end date
    select a.invoice_id, a.payment_id, a.amount
      from public.payment_allocations a
      join pay on pay.id = a.payment_id
      join inv on inv.id = a.invoice_id
    union all
    select null::uuid, a.payment_id, a.amount
      from public.payment_allocations a
      join pay on pay.id = a.payment_id
      join rf on rf.id = a.refund_id
  ), cn_inv as (
    select invoice_id, sum(grand_total) as amount from cn group by invoice_id
  ), al_inv as (
    select invoice_id, sum(amount) as amount from alloc where invoice_id is not null group by invoice_id
  ), al_pay as (
    select payment_id, sum(amount) as amount from alloc group by payment_id
  ), bills as (
    select b.retailer_id,
           sum(greatest(b.balance, 0)) as due,
           sum(greatest(b.balance, 0)) filter (where b.due_date < v_to) as overdue
      from (select inv.retailer_id, inv.due_date,
                   inv.grand_total - coalesce(c.amount, 0) - coalesce(a.amount, 0) as balance
              from inv
              left join cn_inv c on c.invoice_id = inv.id
              left join al_inv a on a.invoice_id = inv.id) b
     group by b.retailer_id
  ), i_agg as (
    select retailer_id,
           sum(grand_total) filter (where invoice_date < p_from) as before,
           sum(grand_total) filter (where p_from is null or invoice_date >= p_from) as period,
           sum(grand_total) filter (where is_opening and (p_from is null or invoice_date >= p_from)) as carried,
           count(*) filter (where p_from is null or invoice_date >= p_from) as n
      from inv group by retailer_id
  ), c_agg as (
    select retailer_id,
           sum(grand_total) filter (where note_date < p_from) as before,
           sum(grand_total) filter (where p_from is null or note_date >= p_from) as period,
           count(*) filter (where p_from is null or note_date >= p_from) as n
      from cn group by retailer_id
  ), p_agg as (
    select pay.retailer_id,
           sum(pay.amount) filter (where pay.payment_date < p_from) as before,
           sum(pay.amount) filter (where p_from is null or pay.payment_date >= p_from) as period,
           count(*) filter (where p_from is null or pay.payment_date >= p_from) as n,
           sum(pay.amount - coalesce(ap.amount, 0)) as advance,
           sum(pay.amount) filter (where pay.verified_at is null) as unverified
      from pay left join al_pay ap on ap.payment_id = pay.id
     group by pay.retailer_id
  ), r_agg as (
    select retailer_id,
           sum(amount) filter (where refund_date < p_from) as before,
           sum(amount) filter (where p_from is null or refund_date >= p_from) as period,
           count(*) filter (where p_from is null or refund_date >= p_from) as n
      from rf group by retailer_id
  ), agg as (
    select s.retailer_id,
           coalesce(i.before, 0) - coalesce(c.before, 0) - coalesce(p.before, 0) + coalesce(r.before, 0) as opening,
           coalesce(i.period, 0) as invoiced,
           coalesce(i.carried, 0) as carried_over,
           coalesce(c.period, 0) as credit_notes,
           coalesce(p.period, 0) as collected,
           coalesce(r.period, 0) as refunded,
           coalesce(b.due, 0) as bills_due,
           coalesce(b.overdue, 0) as overdue,
           coalesce(p.advance, 0) as advance,
           (coalesce(i.n, 0) + coalesce(c.n, 0) + coalesce(p.n, 0) + coalesce(r.n, 0))::integer as entries,
           coalesce(p.unverified, 0) as unverified
      from s
      left join i_agg i on i.retailer_id = s.retailer_id
      left join c_agg c on c.retailer_id = s.retailer_id
      left join p_agg p on p.retailer_id = s.retailer_id
      left join r_agg r on r.retailer_id = s.retailer_id
      left join bills b on b.retailer_id = s.retailer_id
  )
  select s.shop_position, s.retailer_id, r.code, r.shop_name, r.owner_name, r.mobile, r.gstin, r.billing_address, r.billing_city,
         r.credit_days, r.credit_limit, r.status::text,
         s.territory_id, s.territory_name, s.route_id, s.route_name, s.route_code, s.town_id, s.town_name,
         a.opening, a.invoiced, a.carried_over, a.credit_notes, a.collected,
         a.opening + a.invoiced - a.credit_notes - a.collected + a.refunded,
         a.bills_due, a.advance, a.overdue, a.entries, a.unverified, a.refunded
    from s
    join public.retailers r on r.id = s.retailer_id
    join agg a on a.retailer_id = s.retailer_id
   order by s.shop_position;
end $$;

create or replace function public.account_statement_entries(p_scope text, p_id uuid, p_from date default null, p_to date default null)
returns table (
  line_no       bigint,
  shop_position integer,
  retailer_id   uuid,
  entry_date    date,
  kind          text,
  doc_id        uuid,
  doc_no        text,
  method        text,
  reference_no  text,
  reason        text,
  is_opening    boolean,
  due_date      date,
  against       text,
  on_account    numeric,
  debit         numeric,
  credit        numeric,
  balance       numeric
)
language plpgsql stable security invoker set search_path = public as $$
#variable_conflict use_column
declare
  v_to date := coalesce(p_to, (now() at time zone 'Asia/Kolkata')::date);
begin
  if p_from is not null and p_from > v_to then
    raise exception 'The start date is after the end date' using errcode = '22023';
  end if;

  return query
  with s as (
    select * from public.statement_retailers(p_scope, p_id)
  ), inv as (
    select i.* from public.invoices i join s on s.retailer_id = i.retailer_id
     where i.status = 'issued' and i.invoice_date <= v_to
  ), cn as (
    select c.* from public.credit_notes c join s on s.retailer_id = c.retailer_id
     where c.status = 'issued' and c.note_date <= v_to
  ), pay as (
    select p.* from public.payments p join s on s.retailer_id = p.retailer_id
     where p.status = 'received' and p.payment_date <= v_to
  ), rf as (
    select f.* from public.retailer_refunds f join s on s.retailer_id = f.retailer_id
     where f.status = 'issued' and f.refund_date <= v_to
  ), alloc as (
    select a.payment_id, a.amount, inv.invoice_no as doc_no, inv.invoice_date as doc_date
      from public.payment_allocations a
      join pay on pay.id = a.payment_id
      join inv on inv.id = a.invoice_id
    union all
    select a.payment_id, a.amount, rf.refund_no, rf.refund_date
      from public.payment_allocations a
      join pay on pay.id = a.payment_id
      join rf on rf.id = a.refund_id
  ), al_pay as (
    select payment_id, sum(amount) as amount,
           string_agg(doc_no, ', ' order by doc_date, doc_no) as against
      from alloc group by payment_id
  ), opening as (
    select s.retailer_id, coalesce(sum(x.amount), 0) as amount
      from s
      left join (select retailer_id, grand_total as amount from inv where invoice_date < p_from
                 union all select retailer_id, -grand_total from cn where note_date < p_from
                 union all select retailer_id, -amount from pay where payment_date < p_from
                 union all select retailer_id, amount from rf where refund_date < p_from) x on x.retailer_id = s.retailer_id
     group by s.retailer_id
  ), e as (
    select inv.retailer_id, inv.invoice_date as entry_date, inv.created_at, 'invoice'::text as kind, inv.id as doc_id,
           inv.invoice_no as doc_no, null::text as method, null::text as reference_no, null::text as reason,
           inv.is_opening, inv.due_date, null::text as against, null::numeric as on_account,
           inv.grand_total as debit, 0::numeric as credit
      from inv where p_from is null or inv.invoice_date >= p_from
    union all
    select cn.retailer_id, cn.note_date, cn.created_at, 'credit_note', cn.id, cn.credit_note_no, null, null, cn.reason,
           false, null::date, i.invoice_no, null::numeric,
           0::numeric, cn.grand_total
      from cn left join inv i on i.id = cn.invoice_id
     where p_from is null or cn.note_date >= p_from
    union all
    select pay.retailer_id, pay.payment_date, pay.created_at, 'payment', pay.id, pay.receipt_no, pay.method::text, pay.reference_no, null,
           false, null::date,
           ap.against, pay.amount - coalesce(ap.amount, 0),
           0::numeric, pay.amount
      from pay left join al_pay ap on ap.payment_id = pay.id
     where p_from is null or pay.payment_date >= p_from
    union all
    select rf.retailer_id, rf.refund_date, rf.created_at, 'refund', rf.id, rf.refund_no, rf.method::text, rf.reference_no, rf.notes,
           false, null::date, null::text, null::numeric,
           rf.amount, 0::numeric
      from rf where p_from is null or rf.refund_date >= p_from
  )
  select row_number() over (order by s.shop_position, e.entry_date, e.created_at, e.doc_id),
         s.shop_position, e.retailer_id, e.entry_date, e.kind, e.doc_id, e.doc_no, e.method, e.reference_no, e.reason,
         e.is_opening, e.due_date, e.against, e.on_account, e.debit, e.credit,
         o.amount + sum(e.debit - e.credit) over (partition by e.retailer_id order by e.entry_date, e.created_at, e.doc_id
                                                  rows between unbounded preceding and current row)
    from e
    join s on s.retailer_id = e.retailer_id
    join opening o on o.retailer_id = e.retailer_id
   order by 1;
end $$;

revoke all on function public.account_statement(text, uuid, date, date) from public, anon;
grant execute on function public.account_statement(text, uuid, date, date) to authenticated;

-- -----------------------------------------------------------------------------
-- 8. Owners: the definer functions run inside the tenant fence
-- -----------------------------------------------------------------------------
grant create on schema public to app_definer;
alter function public.release_excess_credit(uuid) owner to app_definer;
alter function public.shop_credit(uuid, date) owner to app_definer;
alter function public.record_refund(uuid, numeric, public.payment_method, date, text, text) owner to app_definer;
alter function public.cancel_refund(uuid, text) owner to app_definer;
alter function public.payment_refund_guard(uuid) owner to app_definer;
revoke create on schema public from app_definer;

-- -----------------------------------------------------------------------------
-- 9. Correct invoices that are below zero today
-- -----------------------------------------------------------------------------
do $$
declare
  v_prev text := current_setting('app.tenant_id', true);
  v record;
begin
  -- computed here, not with invoice_open_amount(): that runs inside the
  -- tenant fence and sees nothing until a tenant is chosen
  for v in
    select i.tenant_id, i.id, i.retailer_id
      from public.invoices i
     where i.status = 'issued'
       and i.grand_total
           - coalesce((select sum(c.grand_total) from public.credit_notes c where c.invoice_id = i.id and c.status = 'issued'), 0)
           - coalesce((select sum(a.amount) from public.payment_allocations a join public.payments p on p.id = a.payment_id
                        where a.invoice_id = i.id and p.status in ('received', 'cheque_pending')), 0) < 0
     order by i.tenant_id, i.invoice_date, i.invoice_no
  loop
    perform set_config('app.tenant_id', v.tenant_id::text, true);
    perform public.release_excess_credit(v.id);
    perform public.allocate_unallocated(v.retailer_id);
  end loop;
  perform set_config('app.tenant_id', coalesce(v_prev, ''), true);
end $$;

-- -----------------------------------------------------------------------------
-- 10. Checks
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from public.invoices i
              where i.status = 'issued'
                and i.grand_total
                    - coalesce((select sum(c.grand_total) from public.credit_notes c where c.invoice_id = i.id and c.status = 'issued'), 0)
                    - coalesce((select sum(a.amount) from public.payment_allocations a join public.payments p on p.id = a.payment_id
                                 where a.invoice_id = i.id and p.status in ('received', 'cheque_pending')), 0) < 0) then
    raise exception '0040 check failed: an invoice is still below zero';
  end if;
  if exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prosecdef
               and pg_get_userbyid(p.proowner) <> 'app_definer'
               and p.proname not in (select * from public.platform_definer_allowlist())) then
    raise exception '0040 check failed: owner-rights function outside the fence';
  end if;
  if (select count(*) from pg_proc
       where pronamespace = 'public'::regnamespace
         and proname in ('account_statement', 'account_statement_entries')
         and not prosecdef and provolatile = 's') <> 2 then
    raise exception '0040 check failed: statement functions must stay read-only and security invoker';
  end if;
end $$;
