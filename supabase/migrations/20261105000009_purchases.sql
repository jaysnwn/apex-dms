-- =============================================================================
-- APEX DMS — Purchases: suppliers, purchase orders, goods receipt (stock in),
-- supplier bills with input GST, supplier payments (FIFO), payables.
--
-- Flow:  Purchase order (status 'ordered', editable)
--          → Receive: enter the supplier's bill no. + date → stock is added
--            to the chosen warehouse at the net cost, status 'received'
--          → Pay the supplier: FIFO by due date, or pick bills by hand
-- A direct purchase (no PO) is simply "save and receive" in one step.
-- Costs are visible only to Super Admin, Manager and Billing. Warehouse staff
-- see what to receive (products and quantities) through purchase_receipts.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Suppliers
-- -----------------------------------------------------------------------------
create table public.suppliers (
  id            uuid primary key default gen_random_uuid(),
  code          text not null,
  name          text not null check (length(trim(name)) > 0),
  gstin         text check (gstin is null or gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$'),
  state_code    char(2),
  contact_name  text,
  mobile        text check (mobile is null or mobile ~ '^[6-9][0-9]{9}$'),
  email         text,
  address       text,
  city          text,
  pincode       text,
  credit_days   integer not null default 30 check (credit_days between 0 and 365),
  bank_details  text,
  notes         text,
  is_active     boolean not null default true,
  created_by    uuid references public.profiles (id) default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index suppliers_code_key on public.suppliers (code);
create unique index suppliers_name_key on public.suppliers (lower(name));
create unique index suppliers_gstin_key on public.suppliers (gstin) where gstin is not null;
create trigger suppliers_updated_at before update on public.suppliers
  for each row execute function public.set_updated_at();

-- Tidy values; state comes from the GSTIN; code SUP-0001, SUP-0002 …
create or replace function public.supplier_normalise()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.name := trim(regexp_replace(new.name, '\s+', ' ', 'g'));
  new.gstin := nullif(upper(trim(coalesce(new.gstin, ''))), '');
  new.mobile := nullif(right(regexp_replace(coalesce(new.mobile, ''), '\D', '', 'g'), 10), '');
  if new.gstin is not null then new.state_code := left(new.gstin, 2); end if;
  if new.code is null or trim(new.code) = '' then
    new.code := 'SUP-' || lpad((coalesce((select max(substring(code from 5)::int) from public.suppliers where code ~ '^SUP-[0-9]+$'), 0) + 1)::text, 4, '0');
  end if;
  return new;
end $$;
revoke all on function public.supplier_normalise() from public, anon, authenticated;
create trigger suppliers_normalise before insert or update on public.suppliers
  for each row execute function public.supplier_normalise();

insert into public.suppliers (name, credit_days, notes) values
  ('CONQRETE', 30, 'Add GSTIN, address and contact details'),
  ('BLUEI', 30, 'Add GSTIN, address and contact details');

-- -----------------------------------------------------------------------------
-- 2. Purchases and lines
-- -----------------------------------------------------------------------------
create type public.purchase_status as enum ('ordered', 'received', 'cancelled');

create table public.purchases (
  id                 uuid primary key default gen_random_uuid(),
  purchase_no        text not null unique,
  supplier_id        uuid not null references public.suppliers (id),
  warehouse_id       uuid not null references public.warehouses (id),
  status             public.purchase_status not null default 'ordered',
  order_date         date not null default ((now() at time zone 'Asia/Kolkata')::date),
  expected_date      date,
  supplier_bill_no   text,
  supplier_bill_date date,
  received_date      date,
  credit_days        integer not null default 30 check (credit_days between 0 and 365),
  due_date           date,
  is_igst            boolean not null default false,
  subtotal           numeric(14,2) not null default 0,
  discount_total     numeric(14,2) not null default 0,
  taxable_total      numeric(14,2) not null default 0,
  cgst_total         numeric(14,2) not null default 0,
  sgst_total         numeric(14,2) not null default 0,
  igst_total         numeric(14,2) not null default 0,
  other_charges      numeric(14,2) not null default 0 check (other_charges >= 0),
  round_off          numeric(6,2) not null default 0,
  grand_total        numeric(14,2) not null default 0,
  notes              text,
  received_by        uuid references public.profiles (id),
  received_at        timestamptz,
  cancelled_at       timestamptz,
  cancelled_by       uuid references public.profiles (id),
  cancel_reason      text,
  created_by         uuid references public.profiles (id) default auth.uid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint purchase_received_fields check (
    status <> 'received' or (supplier_bill_no is not null and supplier_bill_date is not null
                             and received_date is not null and due_date is not null))
);
create index purchases_supplier_idx on public.purchases (supplier_id, status);
create index purchases_warehouse_idx on public.purchases (warehouse_id);
create index purchases_status_idx on public.purchases (status, order_date desc);
create unique index purchases_supplier_bill_key on public.purchases (supplier_id, lower(supplier_bill_no))
  where status <> 'cancelled' and supplier_bill_no is not null;
create trigger purchases_updated_at before update on public.purchases
  for each row execute function public.set_updated_at();

create table public.purchase_lines (
  id               uuid primary key default gen_random_uuid(),
  purchase_id      uuid not null references public.purchases (id) on delete cascade,
  line_no          integer not null,
  product_id       uuid not null references public.products (id),
  qty              numeric(12,3) not null check (qty > 0),
  unit_cost        numeric(12,2) not null check (unit_cost >= 0),
  cost_mode        public.price_tax_mode not null default 'exclusive',
  discount_pct     numeric(5,2) not null default 0 check (discount_pct between 0 and 100),
  discount_amount  numeric(14,2) not null default 0,
  gst_rate         numeric(5,2) not null,
  taxable_value    numeric(14,2) not null,
  cgst             numeric(14,2) not null default 0,
  sgst             numeric(14,2) not null default 0,
  igst             numeric(14,2) not null default 0,
  line_total       numeric(14,2) not null,
  unique (purchase_id, line_no)
);
create index purchase_lines_product_idx on public.purchase_lines (product_id);

-- -----------------------------------------------------------------------------
-- 3. Supplier payments and allocations
-- -----------------------------------------------------------------------------
create table public.supplier_payments (
  id             uuid primary key default gen_random_uuid(),
  payment_no     text not null unique,
  supplier_id    uuid not null references public.suppliers (id),
  payment_date   date not null,
  amount         numeric(14,2) not null check (amount > 0),
  method         public.payment_method not null,
  reference_no   text,
  status         text not null default 'paid' check (status in ('paid', 'cancelled')),
  notes          text,
  cancel_reason  text,
  created_by     uuid references public.profiles (id) default auth.uid(),
  created_at     timestamptz not null default now()
);
create index supplier_payments_supplier_idx on public.supplier_payments (supplier_id, payment_date);

create table public.supplier_payment_allocations (
  id            uuid primary key default gen_random_uuid(),
  payment_id    uuid not null references public.supplier_payments (id) on delete cascade,
  purchase_id   uuid not null references public.purchases (id),
  amount        numeric(14,2) not null check (amount > 0),
  is_auto       boolean not null default false,
  created_at    timestamptz not null default now(),
  unique (payment_id, purchase_id)
);
create index supplier_payment_allocations_purchase_idx on public.supplier_payment_allocations (purchase_id);

-- -----------------------------------------------------------------------------
-- 4. Security: read for office roles (suppliers also for warehouse);
--    all purchase writes go through the functions below.
-- -----------------------------------------------------------------------------
alter table public.suppliers enable row level security;
alter table public.purchases enable row level security;
alter table public.purchase_lines enable row level security;
alter table public.supplier_payments enable row level security;
alter table public.supplier_payment_allocations enable row level security;

revoke all on public.suppliers, public.purchases, public.purchase_lines,
              public.supplier_payments, public.supplier_payment_allocations from anon, authenticated;
grant select on public.suppliers, public.purchases, public.purchase_lines,
                public.supplier_payments, public.supplier_payment_allocations to authenticated;
grant insert, update on public.suppliers to authenticated;

create policy suppliers_select on public.suppliers for select to authenticated
  using (public.has_role('super_admin', 'manager', 'billing', 'warehouse'));
create policy suppliers_insert on public.suppliers for insert to authenticated
  with check (public.has_role('super_admin', 'manager', 'billing'));
create policy suppliers_update on public.suppliers for update to authenticated
  using (public.has_role('super_admin', 'manager', 'billing'))
  with check (public.has_role('super_admin', 'manager', 'billing'));
create policy purchases_select on public.purchases for select to authenticated
  using (public.has_role('super_admin', 'manager', 'billing'));
create policy purchase_lines_select on public.purchase_lines for select to authenticated
  using (public.has_role('super_admin', 'manager', 'billing'));
create policy supplier_payments_select on public.supplier_payments for select to authenticated
  using (public.has_role('super_admin', 'manager', 'billing'));
create policy supplier_payment_allocations_select on public.supplier_payment_allocations for select to authenticated
  using (public.has_role('super_admin', 'manager', 'billing'));

do $$
declare t text;
begin
  foreach t in array array['suppliers', 'purchases', 'purchase_lines', 'supplier_payments', 'supplier_payment_allocations'] loop
    execute format('create trigger %1$s_audit after insert or update or delete on public.%1$I
                      for each row execute function public.audit_row()', t);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 5. Save a purchase order (create or edit while 'ordered')
--    p_lines: [{product_id, qty, unit_cost, cost_mode?, discount_pct?}]
--    cost_mode defaults to 'exclusive' (cost before GST, as on supplier bills).
-- -----------------------------------------------------------------------------
create or replace function public.save_purchase(
  p_purchase_id uuid,
  p_supplier_id uuid,
  p_warehouse_id uuid,
  p_order_date date,
  p_expected_date date,
  p_credit_days integer,
  p_other_charges numeric,
  p_notes text,
  p_lines jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id    uuid;
  v_p     public.purchases%rowtype;
  v_sup   public.suppliers%rowtype;
  v_state char(2);
  v_igst  boolean;
  v_line  jsonb;
  v_prod  record;
  v_no    integer := 0;
  v_qty   numeric;
  v_cost  numeric;
  v_mode  public.price_tax_mode;
  v_disc  numeric;
  v_c     record;
  v_sub numeric := 0; v_dsc numeric := 0; v_txb numeric := 0; v_tax numeric := 0;
  v_cg numeric := 0; v_sg numeric := 0; v_ig numeric := 0;
  v_other numeric := round(coalesce(p_other_charges, 0), 2);
  v_exact numeric; v_grand numeric;
  v_date date := coalesce(p_order_date, (now() at time zone 'Asia/Kolkata')::date);
begin
  if not public.has_role('super_admin', 'manager', 'billing') then
    raise exception 'Only office staff can create purchases' using errcode = '42501';
  end if;
  select * into v_sup from public.suppliers where id = p_supplier_id;
  if not found or not v_sup.is_active then raise exception 'Choose an active supplier' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.warehouses where id = p_warehouse_id) then
    raise exception 'Choose the warehouse the goods will arrive at' using errcode = 'P0001';
  end if;
  if coalesce(jsonb_array_length(p_lines), 0) = 0 then raise exception 'Add at least one product' using errcode = 'P0001'; end if;
  if p_credit_days is null or p_credit_days < 0 or p_credit_days > 365 then
    raise exception 'Credit period must be 0–365 days' using errcode = 'P0001';
  end if;
  if v_other < 0 then raise exception 'Other charges cannot be negative' using errcode = 'P0001'; end if;

  select coalesce(state_code, '27') into v_state from public.company_settings where id = 1;
  v_igst := v_sup.state_code is not null and v_sup.state_code <> v_state;

  if p_purchase_id is null then
    insert into public.purchases (purchase_no, supplier_id, warehouse_id, order_date, expected_date, credit_days,
                                  is_igst, other_charges, notes, created_by)
    values (public.next_document_number('PUR', v_date), p_supplier_id, p_warehouse_id, v_date, p_expected_date,
            p_credit_days, v_igst, v_other, nullif(trim(p_notes), ''), auth.uid())
    returning id into v_id;
  else
    select * into v_p from public.purchases where id = p_purchase_id for update;
    if not found then raise exception 'Purchase not found' using errcode = 'P0002'; end if;
    if v_p.status <> 'ordered' then
      raise exception 'Only purchase orders that are not yet received can be edited' using errcode = 'P0001';
    end if;
    update public.purchases
       set supplier_id = p_supplier_id, warehouse_id = p_warehouse_id, order_date = v_date,
           expected_date = p_expected_date, credit_days = p_credit_days, is_igst = v_igst,
           other_charges = v_other, notes = nullif(trim(p_notes), '')
     where id = p_purchase_id;
    delete from public.purchase_lines where purchase_id = p_purchase_id;
    v_id := p_purchase_id;
  end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_no := v_no + 1;
    select id, name, gst_rate into v_prod from public.products where id = (v_line ->> 'product_id')::uuid;
    if not found then raise exception 'Product on line % not found', v_no using errcode = 'P0001'; end if;
    v_qty := (v_line ->> 'qty')::numeric;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Quantity for % must be more than zero', v_prod.name using errcode = 'P0001';
    end if;
    v_cost := (v_line ->> 'unit_cost')::numeric;
    if v_cost is null or v_cost < 0 then
      raise exception 'Enter the purchase cost for %', v_prod.name using errcode = 'P0001';
    end if;
    v_mode := coalesce(nullif(v_line ->> 'cost_mode', ''), 'exclusive')::public.price_tax_mode;
    v_disc := coalesce(nullif(v_line ->> 'discount_pct', '')::numeric, 0);
    if v_disc < 0 or v_disc > 100 then raise exception 'Discount must be 0–100%%' using errcode = 'P0001'; end if;
    select * into v_c from public.calc_line(v_qty, v_cost, v_mode, v_disc, v_prod.gst_rate);
    insert into public.purchase_lines (purchase_id, line_no, product_id, qty, unit_cost, cost_mode, discount_pct,
                                       discount_amount, gst_rate, taxable_value, cgst, sgst, igst, line_total)
    values (v_id, v_no, v_prod.id, v_qty, v_cost, v_mode, v_disc, v_c.discount, v_prod.gst_rate, v_c.taxable,
            case when v_igst then 0 else round(v_c.tax / 2, 2) end,
            case when v_igst then 0 else v_c.tax - round(v_c.tax / 2, 2) end,
            case when v_igst then v_c.tax else 0 end,
            v_c.taxable + v_c.tax);
    v_sub := v_sub + v_c.gross;
    v_dsc := v_dsc + v_c.discount;
    v_txb := v_txb + v_c.taxable;
    v_tax := v_tax + v_c.tax;
    v_cg := v_cg + case when v_igst then 0 else round(v_c.tax / 2, 2) end;
    v_sg := v_sg + case when v_igst then 0 else v_c.tax - round(v_c.tax / 2, 2) end;
    v_ig := v_ig + case when v_igst then v_c.tax else 0 end;
  end loop;

  v_exact := v_txb + v_tax + v_other;
  v_grand := round(v_exact, 0);
  update public.purchases
     set subtotal = v_sub, discount_total = v_dsc, taxable_total = v_txb,
         cgst_total = v_cg, sgst_total = v_sg, igst_total = v_ig,
         round_off = v_grand - v_exact, grand_total = v_grand
   where id = v_id;
  return v_id;
end $$;

-- -----------------------------------------------------------------------------
-- 6. Amount still payable on a received purchase
-- -----------------------------------------------------------------------------
create or replace function public.purchase_open_amount(p_purchase_id uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select p.grand_total
       - coalesce((select sum(a.amount) from public.supplier_payment_allocations a
                     join public.supplier_payments sp on sp.id = a.payment_id
                    where a.purchase_id = p.id and sp.status = 'paid'), 0)
    from public.purchases p where p.id = p_purchase_id
$$;

-- FIFO: oldest due bill first.
create or replace function public.supplier_fifo_allocate(p_payment_id uuid)
returns numeric language plpgsql security definer set search_path = public as $$
declare
  v_pay public.supplier_payments%rowtype;
  v_left numeric; v_bill record; v_open numeric; v_take numeric; v_done numeric := 0;
begin
  select * into v_pay from public.supplier_payments where id = p_payment_id for update;
  if v_pay.status <> 'paid' then return 0; end if;
  v_left := v_pay.amount - coalesce((select sum(amount) from public.supplier_payment_allocations where payment_id = p_payment_id), 0);
  for v_bill in
    select id from public.purchases
     where supplier_id = v_pay.supplier_id and status = 'received'
     order by due_date, supplier_bill_date, purchase_no
     for update
  loop
    exit when v_left <= 0;
    v_open := public.purchase_open_amount(v_bill.id);
    continue when v_open <= 0;
    v_take := least(v_open, v_left);
    insert into public.supplier_payment_allocations (payment_id, purchase_id, amount, is_auto)
    values (p_payment_id, v_bill.id, v_take, true)
    on conflict (payment_id, purchase_id) do nothing;
    if found then v_left := v_left - v_take; v_done := v_done + v_take; end if;
  end loop;
  return v_done;
end $$;

-- Advances paid before a bill arrived get applied when the bill is received.
create or replace function public.supplier_allocate_unallocated(p_supplier_id uuid)
returns numeric language plpgsql security definer set search_path = public as $$
declare v_p record; v_total numeric := 0;
begin
  for v_p in
    select sp.id from public.supplier_payments sp
     where sp.supplier_id = p_supplier_id and sp.status = 'paid'
       and sp.amount > coalesce((select sum(amount) from public.supplier_payment_allocations a where a.payment_id = sp.id), 0)
     order by sp.payment_date, sp.created_at
  loop
    v_total := v_total + public.supplier_fifo_allocate(v_p.id);
  end loop;
  return v_total;
end $$;

-- -----------------------------------------------------------------------------
-- 7. Receive goods: stock in at net cost, bill details, due date
-- -----------------------------------------------------------------------------
create or replace function public.receive_purchase(
  p_purchase_id uuid,
  p_bill_no text,
  p_bill_date date,
  p_received_date date default null,
  p_update_cost boolean default true
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_p     public.purchases%rowtype;
  v_l     record;
  v_net   numeric;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_recv  date := coalesce(p_received_date, (now() at time zone 'Asia/Kolkata')::date);
begin
  if not public.has_role('super_admin', 'manager', 'billing', 'warehouse') then
    raise exception 'Not allowed to receive goods' using errcode = '42501';
  end if;
  select * into v_p from public.purchases where id = p_purchase_id for update;
  if not found then raise exception 'Purchase not found' using errcode = 'P0002'; end if;
  if v_p.status = 'received' then raise exception 'These goods have already been received' using errcode = 'P0001'; end if;
  if v_p.status = 'cancelled' then raise exception 'This purchase order is cancelled' using errcode = 'P0001'; end if;
  if coalesce(trim(p_bill_no), '') = '' then raise exception 'Enter the supplier''s bill number' using errcode = 'P0001'; end if;
  if p_bill_date is null then raise exception 'Enter the supplier''s bill date' using errcode = 'P0001'; end if;
  if p_bill_date > v_today or v_recv > v_today then
    raise exception 'Bill date and received date cannot be in the future' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.purchases where supplier_id = v_p.supplier_id and id <> v_p.id and status <> 'cancelled'
              and lower(supplier_bill_no) = lower(trim(p_bill_no))) then
    raise exception 'Bill % from this supplier is already entered', trim(p_bill_no) using errcode = 'P0001';
  end if;

  update public.purchases
     set status = 'received', supplier_bill_no = trim(p_bill_no), supplier_bill_date = p_bill_date,
         received_date = v_recv, due_date = p_bill_date + credit_days,
         received_by = auth.uid(), received_at = now()
   where id = p_purchase_id;

  for v_l in
    select pl.product_id, sum(pl.qty) as qty, sum(pl.taxable_value) as taxable
      from public.purchase_lines pl where pl.purchase_id = p_purchase_id
     group by pl.product_id order by pl.product_id
  loop
    v_net := round(v_l.taxable / v_l.qty, 4);
    insert into public.stock_movements (product_id, warehouse_id, movement_type, qty, unit_cost, reference_type, reference_id, reason, created_by)
    values (v_l.product_id, v_p.warehouse_id, 'stock_in', v_l.qty, v_net, 'purchase', p_purchase_id,
            'Purchase ' || v_p.purchase_no || ' · bill ' || trim(p_bill_no), auth.uid());
    if coalesce(p_update_cost, true) then
      update public.products
         set purchase_cost = case when purchase_cost_mode = 'inclusive' then round(v_net * (1 + gst_rate / 100), 2) else round(v_net, 2) end
       where id = v_l.product_id;
    end if;
  end loop;

  perform public.supplier_allocate_unallocated(v_p.supplier_id);
end $$;

-- -----------------------------------------------------------------------------
-- 8. Cancel: an order simply closes; a received purchase takes its stock back
--    out (only if that stock is still there) and must have no payments.
-- -----------------------------------------------------------------------------
create or replace function public.cancel_purchase(p_purchase_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_p public.purchases%rowtype; v_l record;
begin
  select * into v_p from public.purchases where id = p_purchase_id for update;
  if not found then raise exception 'Purchase not found' using errcode = 'P0002'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Enter a reason' using errcode = 'P0001'; end if;
  if v_p.status = 'cancelled' then raise exception 'Already cancelled' using errcode = 'P0001'; end if;
  if v_p.status = 'ordered' and not public.has_role('super_admin', 'manager', 'billing') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if v_p.status = 'received' then
    if not public.has_role('super_admin', 'manager') then
      raise exception 'Only a Manager can cancel a received purchase' using errcode = '42501';
    end if;
    if exists (select 1 from public.supplier_payment_allocations a join public.supplier_payments sp on sp.id = a.payment_id
                where a.purchase_id = p_purchase_id and sp.status = 'paid') then
      raise exception 'Payments are applied to this bill. Cancel or move those payments first.' using errcode = 'P0001';
    end if;
    for v_l in
      select product_id, sum(qty) as qty from public.purchase_lines where purchase_id = p_purchase_id group by product_id order by product_id
    loop
      insert into public.stock_movements (product_id, warehouse_id, movement_type, qty, reference_type, reference_id, reason, created_by)
      values (v_l.product_id, v_p.warehouse_id, 'adjustment', -v_l.qty, 'purchase', p_purchase_id,
              'Purchase ' || v_p.purchase_no || ' cancelled: ' || trim(p_reason), auth.uid());
    end loop;
  end if;
  update public.purchases
     set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = trim(p_reason)
   where id = p_purchase_id;
end $$;

-- -----------------------------------------------------------------------------
-- 9. Pay a supplier. p_allocations [{purchase_id, amount}] or null for FIFO.
--    Anything not covered by bills stays as an advance and is applied to the
--    next bill received from that supplier.
-- -----------------------------------------------------------------------------
create or replace function public.record_supplier_payment(
  p_supplier_id uuid,
  p_amount numeric,
  p_method public.payment_method,
  p_payment_date date default null,
  p_reference text default null,
  p_notes text default null,
  p_allocations jsonb default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid; v_a jsonb; v_amt numeric; v_open numeric; v_sum numeric := 0;
  v_date date := coalesce(p_payment_date, (now() at time zone 'Asia/Kolkata')::date);
begin
  if not public.has_role('super_admin', 'manager', 'billing') then
    raise exception 'Only office staff can pay suppliers' using errcode = '42501';
  end if;
  if not exists (select 1 from public.suppliers where id = p_supplier_id) then
    raise exception 'Supplier not found' using errcode = 'P0001';
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be more than zero' using errcode = 'P0001'; end if;
  if p_method in ('upi', 'bank_transfer', 'cheque') and coalesce(trim(p_reference), '') = '' then
    raise exception 'Enter the % reference number', case p_method when 'cheque' then 'cheque' when 'upi' then 'UPI' else 'transaction' end
      using errcode = 'P0001';
  end if;
  if v_date > (now() at time zone 'Asia/Kolkata')::date then
    raise exception 'Payment date cannot be in the future' using errcode = 'P0001';
  end if;
  perform 1 from public.suppliers where id = p_supplier_id for update;
  insert into public.supplier_payments (payment_no, supplier_id, payment_date, amount, method, reference_no, notes, created_by)
  values (public.next_document_number('SPAY', v_date), p_supplier_id, v_date, round(p_amount, 2), p_method,
          nullif(trim(p_reference), ''), nullif(trim(p_notes), ''), auth.uid())
  returning id into v_id;

  if p_allocations is not null and jsonb_array_length(p_allocations) > 0 then
    for v_a in select * from jsonb_array_elements(p_allocations) loop
      v_amt := round((v_a ->> 'amount')::numeric, 2);
      continue when v_amt is null or v_amt <= 0;
      if not exists (select 1 from public.purchases where id = (v_a ->> 'purchase_id')::uuid
                      and supplier_id = p_supplier_id and status = 'received') then
        raise exception 'Bill does not belong to this supplier' using errcode = 'P0001';
      end if;
      v_open := public.purchase_open_amount((v_a ->> 'purchase_id')::uuid);
      if v_amt > v_open then
        raise exception 'Amount ₹% is more than the bill balance ₹%', trim_scale(v_amt), trim_scale(v_open) using errcode = 'P0001';
      end if;
      v_sum := v_sum + v_amt;
      if v_sum > round(p_amount, 2) then raise exception 'Bill amounts add up to more than the payment' using errcode = 'P0001'; end if;
      insert into public.supplier_payment_allocations (payment_id, purchase_id, amount, is_auto)
      values (v_id, (v_a ->> 'purchase_id')::uuid, v_amt, false);
    end loop;
  else
    perform public.supplier_fifo_allocate(v_id);
  end if;
  return v_id;
end $$;

create or replace function public.cancel_supplier_payment(p_payment_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role('super_admin', 'manager') then
    raise exception 'Only a Manager can cancel a supplier payment' using errcode = '42501';
  end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Enter a reason' using errcode = 'P0001'; end if;
  update public.supplier_payments set status = 'cancelled', cancel_reason = trim(p_reason)
   where id = p_payment_id and status = 'paid';
  if not found then raise exception 'Payment not found or already cancelled' using errcode = 'P0001'; end if;
  delete from public.supplier_payment_allocations where payment_id = p_payment_id;
end $$;

-- -----------------------------------------------------------------------------
-- 10. Views
-- -----------------------------------------------------------------------------
-- Open bills with ageing (office roles only, via RLS on purchases)
create or replace view public.purchase_balances
with (security_invoker = true) as
select p.id as purchase_id, p.purchase_no, p.supplier_id, p.supplier_bill_no, p.supplier_bill_date, p.due_date,
       p.grand_total,
       coalesce(a.paid, 0) as paid,
       p.grand_total - coalesce(a.paid, 0) as balance,
       greatest(((now() at time zone 'Asia/Kolkata')::date - p.due_date), 0) as days_overdue
  from public.purchases p
  left join (select a.purchase_id, sum(a.amount) as paid
               from public.supplier_payment_allocations a
               join public.supplier_payments sp on sp.id = a.payment_id and sp.status = 'paid'
              group by a.purchase_id) a on a.purchase_id = p.id
 where p.status = 'received';
grant select on public.purchase_balances to authenticated;

-- Supplier statement: bills increase what we owe (credit), payments reduce it (debit)
create or replace view public.supplier_ledger
with (security_invoker = true) as
select p.supplier_id, p.supplier_bill_date as entry_date, p.received_at as created_at, 'bill'::text as kind,
       p.id as doc_id, p.purchase_no as doc_no,
       'Bill ' || p.supplier_bill_no || ' · due ' || to_char(p.due_date, 'DD Mon YYYY') as narration,
       0::numeric as debit, p.grand_total as credit
  from public.purchases p where p.status = 'received'
union all
select sp.supplier_id, sp.payment_date, sp.created_at, 'payment', sp.id, sp.payment_no,
       initcap(replace(sp.method::text, '_', ' ')) || coalesce(' · ' || sp.reference_no, ''),
       sp.amount, 0
  from public.supplier_payments sp where sp.status = 'paid';
grant select on public.supplier_ledger to authenticated;

-- What the warehouse needs to receive: no costs, no totals.
create or replace view public.purchase_receipts as
select p.id as purchase_id, p.purchase_no, p.status, p.order_date, p.expected_date, p.received_date,
       p.supplier_bill_no, p.credit_days, p.warehouse_id, w.name as warehouse_name, s.name as supplier_name,
       pl.line_no, pl.product_id, pr.name as product_name, pr.sku, pr.unit_code, pl.qty
  from public.purchases p
  join public.suppliers s on s.id = p.supplier_id
  join public.warehouses w on w.id = p.warehouse_id
  join public.purchase_lines pl on pl.purchase_id = p.id
  join public.products pr on pr.id = pl.product_id
 where public.has_role('super_admin', 'manager', 'billing', 'warehouse');
grant select on public.purchase_receipts to authenticated;

-- Purchase register for reports (office roles)
create or replace view public.purchase_register
with (security_invoker = true) as
select pl.id as line_id, p.id as purchase_id, p.purchase_no, p.supplier_bill_no, p.supplier_bill_date, p.received_date,
       p.supplier_id, s.name as supplier_name, pl.product_id, pr.name as product_name, pr.sku,
       pr.brand_id, b.name as brand_name, pl.qty, pl.taxable_value, pl.cgst + pl.sgst + pl.igst as tax, pl.line_total
  from public.purchase_lines pl
  join public.purchases p on p.id = pl.purchase_id and p.status = 'received'
  join public.suppliers s on s.id = p.supplier_id
  join public.products pr on pr.id = pl.product_id
  join public.brands b on b.id = pr.brand_id;
grant select on public.purchase_register to authenticated;

revoke all on public.purchase_balances, public.supplier_ledger, public.purchase_receipts, public.purchase_register from anon;

-- -----------------------------------------------------------------------------
-- 11. Function privileges
-- -----------------------------------------------------------------------------
revoke all on function public.save_purchase(uuid, uuid, uuid, date, date, integer, numeric, text, jsonb) from public, anon;
revoke all on function public.purchase_open_amount(uuid) from public, anon;
revoke all on function public.supplier_fifo_allocate(uuid) from public, anon, authenticated;
revoke all on function public.supplier_allocate_unallocated(uuid) from public, anon, authenticated;
revoke all on function public.receive_purchase(uuid, text, date, date, boolean) from public, anon;
revoke all on function public.cancel_purchase(uuid, text) from public, anon;
revoke all on function public.record_supplier_payment(uuid, numeric, public.payment_method, date, text, text, jsonb) from public, anon;
revoke all on function public.cancel_supplier_payment(uuid, text) from public, anon;
grant execute on function
  public.save_purchase(uuid, uuid, uuid, date, date, integer, numeric, text, jsonb),
  public.purchase_open_amount(uuid),
  public.receive_purchase(uuid, text, date, date, boolean),
  public.cancel_purchase(uuid, text),
  public.record_supplier_payment(uuid, numeric, public.payment_method, date, text, text, jsonb),
  public.cancel_supplier_payment(uuid, text)
to authenticated;
