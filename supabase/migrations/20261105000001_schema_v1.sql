-- =============================================================================
-- APEX TRADING CO. DMS — Schema v1 (M0)
-- Full schema for every module, so later milestones only add logic, not tables.
-- Principles:
--   * Stock and money change only through new ledger rows (append-only).
--   * Issued invoices are frozen; corrections go through credit notes.
--   * Every financial / inventory table is audited (see 0003 migration).
-- =============================================================================

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
create type public.app_role as enum ('super_admin', 'manager', 'billing', 'warehouse', 'salesman');
create type public.price_tax_mode as enum ('inclusive', 'exclusive');
create type public.stock_movement_type as enum (
  'opening', 'stock_in', 'transfer_out', 'transfer_in', 'adjustment',
  'damage', 'reconciliation', 'dispatch', 'dispatch_reversal', 'credit_note_return'
);
create type public.stock_count_status as enum ('draft', 'submitted', 'approved', 'cancelled');
create type public.retailer_status as enum ('active', 'on_hold', 'blocked', 'inactive');
create type public.retailer_class as enum ('star', 'average', 'needs_attention', 'high_credit_risk');
create type public.order_status as enum ('quotation', 'invoiced', 'dispatched', 'delivered', 'cancelled');
create type public.invoice_status as enum ('issued', 'cancelled');
create type public.credit_note_status as enum ('issued', 'cancelled');
create type public.dispatch_status as enum ('picking', 'dispatched', 'delivered');
create type public.payment_method as enum ('cash', 'upi', 'bank_transfer', 'cheque');
create type public.payment_status as enum ('received', 'cheque_pending', 'bounced', 'cancelled');
create type public.promise_status as enum ('open', 'kept', 'broken', 'cancelled');
create type public.visit_status as enum ('planned', 'completed', 'missed');
create type public.expense_category as enum ('fuel', 'food', 'parking', 'accommodation', 'travel', 'other');
create type public.expense_status as enum ('submitted', 'approved', 'rejected', 'reimbursed');

-- -----------------------------------------------------------------------------
-- Generic helpers
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create or replace function public.prevent_mutation()
returns trigger language plpgsql as $$
begin
  raise exception '% rows are append-only; % is not allowed', tg_table_name, lower(tg_op)
    using errcode = 'P0001';
end $$;

-- Indian financial year label for a date: 2026-11-05 -> '26-27'
create or replace function public.fy_label(p_date date)
returns text language sql immutable as $$
  select case
    when extract(month from p_date) >= 4
      then to_char(p_date, 'YY') || '-' || to_char(p_date + interval '1 year', 'YY')
    else to_char(p_date - interval '1 year', 'YY') || '-' || to_char(p_date, 'YY')
  end
$$;

-- -----------------------------------------------------------------------------
-- Users & company
-- -----------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null default '',
  email       text,
  phone       text,
  role        public.app_role not null default 'salesman',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

create table public.company_settings (
  id               smallint primary key default 1 check (id = 1),
  legal_name       text not null default 'APEX TRADING CO.',
  gstin            text,
  state_code       char(2),                -- GST state code, e.g. '27' for Maharashtra
  address          text,
  phone            text,
  email            text,
  bank_details     text,
  invoice_terms    text,
  doc_prefix       text not null default 'APX',
  updated_at       timestamptz not null default now()
);
create trigger company_settings_updated_at before update on public.company_settings
  for each row execute function public.set_updated_at();
insert into public.company_settings (id, state_code) values (1, '27');

-- Gapless document numbering. One row per document type per financial year.
create table public.number_series (
  doc_type    text not null,     -- 'INV', 'CN', 'RCPT', 'ORD', 'DSP'
  fy          text not null,     -- '26-27'
  next_value  integer not null default 1 check (next_value > 0),
  primary key (doc_type, fy)
);

-- Returns e.g. 'APX/INV/26-27/00001'. The row lock makes numbers gapless and
-- unique under concurrency; a rolled-back transaction also rolls back the number.
create or replace function public.next_document_number(p_doc_type text, p_date date default current_date)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fy     text := public.fy_label(p_date);
  v_value  integer;
  v_prefix text;
begin
  insert into public.number_series (doc_type, fy) values (p_doc_type, v_fy)
  on conflict (doc_type, fy) do nothing;

  update public.number_series
     set next_value = next_value + 1
   where doc_type = p_doc_type and fy = v_fy
  returning next_value - 1 into v_value;

  select doc_prefix into v_prefix from public.company_settings where id = 1;
  return coalesce(v_prefix, 'APX') || '/' || p_doc_type || '/' || v_fy || '/' || lpad(v_value::text, 5, '0');
end $$;
revoke all on function public.next_document_number(text, date) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Catalogue & warehouses
-- -----------------------------------------------------------------------------
create table public.brands (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
create unique index brands_name_key on public.brands (lower(name));
insert into public.brands (name) values ('CONQRETE'), ('BLUEI');

create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
create unique index categories_name_key on public.categories (lower(name));
insert into public.categories (name) values
  ('Power Banks'), ('Chargers & Adapters'), ('Cables'), ('Earphones & Audio'), ('Accessories');

create table public.units (
  code  text primary key,
  name  text not null
);
insert into public.units (code, name) values
  ('PCS', 'Pieces'), ('BOX', 'Box'), ('SET', 'Set'), ('PKT', 'Packet');

create table public.warehouses (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  address     text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
create unique index warehouses_name_key on public.warehouses (lower(name));
insert into public.warehouses (name) values ('Main Warehouse');

create table public.warehouse_locations (
  id            uuid primary key default gen_random_uuid(),
  warehouse_id  uuid not null references public.warehouses (id),
  code          text not null,          -- rack / shelf, e.g. 'R2-S3'
  description   text,
  is_active     boolean not null default true,
  unique (warehouse_id, code)
);

create table public.products (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  brand_id              uuid not null references public.brands (id),
  sku                   text not null,            -- model number / SKU
  category_id           uuid references public.categories (id),
  barcode               text,
  hsn_code              text,
  description           text,
  unit_code             text not null default 'PCS' references public.units (code),
  purchase_cost         numeric(12,2) not null default 0 check (purchase_cost >= 0),
  purchase_cost_mode    public.price_tax_mode not null default 'exclusive',
  retailer_price        numeric(12,2) not null default 0 check (retailer_price >= 0),
  retailer_price_mode   public.price_tax_mode not null default 'exclusive',
  mrp                   numeric(12,2) not null default 0 check (mrp >= 0),
  mrp_mode              public.price_tax_mode not null default 'inclusive',
  gst_rate              numeric(5,2) not null default 18 check (gst_rate >= 0 and gst_rate <= 40),
  min_stock_qty         numeric(12,3) not null default 0 check (min_stock_qty >= 0),
  default_warehouse_id  uuid references public.warehouses (id),
  default_location_id   uuid references public.warehouse_locations (id),
  is_active             boolean not null default true,
  created_by            uuid references public.profiles (id) default auth.uid(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create unique index products_sku_key on public.products (lower(sku));
create unique index products_barcode_key on public.products (barcode) where barcode is not null;
create index products_brand_idx on public.products (brand_id);
create index products_name_trgm on public.products using gin (name gin_trgm_ops);
create trigger products_updated_at before update on public.products
  for each row execute function public.set_updated_at();

create table public.product_images (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references public.products (id) on delete cascade,
  storage_path  text not null,
  is_primary    boolean not null default false,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now()
);
create unique index product_images_one_primary on public.product_images (product_id) where is_primary;

-- -----------------------------------------------------------------------------
-- Stock ledger (append-only). On-hand = sum(qty). Signed quantities.
-- -----------------------------------------------------------------------------
create table public.stock_movements (
  id              bigint generated always as identity primary key,
  product_id      uuid not null references public.products (id),
  warehouse_id    uuid not null references public.warehouses (id),
  location_id     uuid references public.warehouse_locations (id),
  movement_type   public.stock_movement_type not null,
  qty             numeric(12,3) not null check (qty <> 0),
  unit_cost       numeric(12,4),
  reference_type  text,          -- 'dispatch', 'stock_count', 'credit_note', ...
  reference_id    uuid,
  transfer_group  uuid,          -- links transfer_out + transfer_in
  reason          text,
  created_by      uuid references public.profiles (id) default auth.uid(),
  created_at      timestamptz not null default now(),
  constraint stock_movement_sign check (
    (movement_type in ('opening', 'stock_in', 'transfer_in', 'dispatch_reversal', 'credit_note_return') and qty > 0) or
    (movement_type in ('transfer_out', 'damage', 'dispatch') and qty < 0) or
    (movement_type in ('adjustment', 'reconciliation'))
  )
);
create index stock_movements_product_idx on public.stock_movements (product_id, warehouse_id);
create index stock_movements_ref_idx on public.stock_movements (reference_type, reference_id);
create trigger stock_movements_no_update before update or delete on public.stock_movements
  for each row execute function public.prevent_mutation();

create table public.stock_counts (
  id            uuid primary key default gen_random_uuid(),
  warehouse_id  uuid not null references public.warehouses (id),
  status        public.stock_count_status not null default 'draft',
  notes         text,
  counted_by    uuid references public.profiles (id) default auth.uid(),
  approved_by   uuid references public.profiles (id),
  approved_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create trigger stock_counts_updated_at before update on public.stock_counts
  for each row execute function public.set_updated_at();

create table public.stock_count_lines (
  id            uuid primary key default gen_random_uuid(),
  count_id      uuid not null references public.stock_counts (id) on delete cascade,
  product_id    uuid not null references public.products (id),
  location_id   uuid references public.warehouse_locations (id),
  system_qty    numeric(12,3) not null,
  counted_qty   numeric(12,3) not null check (counted_qty >= 0),
  variance      numeric(12,3) generated always as (counted_qty - system_qty) stored,
  unique (count_id, product_id, location_id)
);

-- -----------------------------------------------------------------------------
-- Routes & retailers
-- -----------------------------------------------------------------------------
create table public.routes (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null,
  description          text,
  default_salesman_id  uuid references public.profiles (id),
  is_active            boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create unique index routes_name_key on public.routes (lower(name));
create trigger routes_updated_at before update on public.routes
  for each row execute function public.set_updated_at();

create sequence public.retailer_code_seq;

create table public.retailers (
  id                  uuid primary key default gen_random_uuid(),
  code                text not null unique
                        default ('APX-R-' || lpad(nextval('public.retailer_code_seq')::text, 4, '0')),
  shop_name           text not null,
  owner_name          text,
  mobile              text not null check (mobile ~ '^[6-9][0-9]{9}$'),
  alt_mobile          text,
  gstin               text check (gstin is null or gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
  billing_address     text,
  billing_city        text,
  billing_state_code  char(2) not null default '27',
  billing_pincode     text,
  delivery_address    text,
  delivery_city       text,
  delivery_pincode    text,
  salesman_id         uuid references public.profiles (id),
  route_id            uuid references public.routes (id),
  route_sequence      integer,
  credit_days         integer not null default 15 check (credit_days between 0 and 365),
  credit_limit        numeric(14,2) not null default 0 check (credit_limit >= 0),
  status              public.retailer_status not null default 'active',
  classification      public.retailer_class,
  notes               text,
  created_by          uuid references public.profiles (id) default auth.uid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create unique index retailers_mobile_key on public.retailers (mobile);
create unique index retailers_gstin_key on public.retailers (gstin) where gstin is not null;
create index retailers_shop_trgm on public.retailers using gin (shop_name gin_trgm_ops);
create index retailers_route_idx on public.retailers (route_id);
create index retailers_salesman_idx on public.retailers (salesman_id);
create trigger retailers_updated_at before update on public.retailers
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Orders (one record moves quotation -> invoiced -> dispatched -> delivered)
-- -----------------------------------------------------------------------------
create table public.orders (
  id              uuid primary key default gen_random_uuid(),
  order_no        text not null unique,
  retailer_id     uuid not null references public.retailers (id),
  status          public.order_status not null default 'quotation',
  order_date      date not null default current_date,
  credit_days     integer not null check (credit_days between 0 and 365),
  salesman_id     uuid references public.profiles (id),
  notes           text,
  subtotal        numeric(14,2) not null default 0,
  discount_total  numeric(14,2) not null default 0,
  taxable_total   numeric(14,2) not null default 0,
  tax_total       numeric(14,2) not null default 0,
  round_off       numeric(6,2)  not null default 0,
  grand_total     numeric(14,2) not null default 0,
  client_uuid     uuid unique,   -- idempotency key for offline / double submit
  cancel_reason   text,
  created_by      uuid references public.profiles (id) default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index orders_retailer_idx on public.orders (retailer_id);
create index orders_status_idx on public.orders (status);
create trigger orders_updated_at before update on public.orders
  for each row execute function public.set_updated_at();

create table public.order_lines (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references public.orders (id) on delete cascade,
  line_no          integer not null,
  product_id       uuid not null references public.products (id),
  qty              numeric(12,3) not null check (qty > 0),
  unit_price       numeric(12,2) not null check (unit_price >= 0),
  price_mode       public.price_tax_mode not null,
  discount_pct     numeric(5,2) not null default 0 check (discount_pct between 0 and 100),
  discount_amount  numeric(12,2) not null default 0 check (discount_amount >= 0),
  gst_rate         numeric(5,2) not null,
  taxable_value    numeric(14,2) not null default 0,
  tax_amount       numeric(14,2) not null default 0,
  line_total       numeric(14,2) not null default 0,
  unique (order_id, line_no)
);

-- -----------------------------------------------------------------------------
-- Invoices (frozen once issued) & credit notes
-- -----------------------------------------------------------------------------
create table public.invoices (
  id                 uuid primary key default gen_random_uuid(),
  invoice_no         text not null unique,
  fy                 text not null,
  order_id           uuid not null unique references public.orders (id),  -- one invoice per order
  retailer_id        uuid not null references public.retailers (id),
  invoice_date       date not null,
  credit_days        integer not null check (credit_days between 0 and 365),
  due_date           date not null,
  place_of_supply    char(2) not null,
  is_igst            boolean not null,
  retailer_snapshot  jsonb not null,   -- name, GSTIN, addresses at time of issue
  subtotal           numeric(14,2) not null,
  discount_total     numeric(14,2) not null,
  taxable_total      numeric(14,2) not null,
  cgst_total         numeric(14,2) not null,
  sgst_total         numeric(14,2) not null,
  igst_total         numeric(14,2) not null,
  round_off          numeric(6,2)  not null,
  grand_total        numeric(14,2) not null check (grand_total >= 0),
  status             public.invoice_status not null default 'issued',
  cancelled_at       timestamptz,
  cancelled_by       uuid references public.profiles (id),
  cancel_reason      text,
  created_by         uuid references public.profiles (id) default auth.uid(),
  created_at         timestamptz not null default now(),
  constraint invoice_due_date check (due_date = invoice_date + credit_days)
);
create index invoices_retailer_idx on public.invoices (retailer_id, due_date);

-- Only cancellation fields may change after issue.
create or replace function public.guard_invoice_update()
returns trigger language plpgsql as $$
begin
  if (to_jsonb(new) - array['status','cancelled_at','cancelled_by','cancel_reason'])
     is distinct from (to_jsonb(old) - array['status','cancelled_at','cancelled_by','cancel_reason']) then
    raise exception 'Issued invoices cannot be edited; use cancellation or a credit note' using errcode = 'P0001';
  end if;
  if old.status = 'cancelled' then
    raise exception 'Invoice % is already cancelled', old.invoice_no using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger invoices_guard before update on public.invoices
  for each row execute function public.guard_invoice_update();
create trigger invoices_no_delete before delete on public.invoices
  for each row execute function public.prevent_mutation();

create table public.invoice_lines (
  id               uuid primary key default gen_random_uuid(),
  invoice_id       uuid not null references public.invoices (id),
  line_no          integer not null,
  product_id       uuid not null references public.products (id),
  product_name     text not null,
  sku              text not null,
  hsn_code         text,
  unit_code        text not null,
  qty              numeric(12,3) not null check (qty > 0),
  unit_price       numeric(12,2) not null,
  price_mode       public.price_tax_mode not null,
  discount_pct     numeric(5,2) not null default 0,
  discount_amount  numeric(12,2) not null default 0,
  taxable_value    numeric(14,2) not null,
  gst_rate         numeric(5,2) not null,
  cgst             numeric(14,2) not null default 0,
  sgst             numeric(14,2) not null default 0,
  igst             numeric(14,2) not null default 0,
  line_total       numeric(14,2) not null,
  unit_cost        numeric(12,4) not null default 0,  -- cost snapshot for gross profit
  unique (invoice_id, line_no)
);
create trigger invoice_lines_frozen before update or delete on public.invoice_lines
  for each row execute function public.prevent_mutation();

create table public.credit_notes (
  id              uuid primary key default gen_random_uuid(),
  credit_note_no  text not null unique,
  fy              text not null,
  invoice_id      uuid not null references public.invoices (id),
  retailer_id     uuid not null references public.retailers (id),
  note_date       date not null default current_date,
  reason          text not null,
  restock         boolean not null default false,
  taxable_total   numeric(14,2) not null,
  cgst_total      numeric(14,2) not null default 0,
  sgst_total      numeric(14,2) not null default 0,
  igst_total      numeric(14,2) not null default 0,
  grand_total     numeric(14,2) not null check (grand_total > 0),
  status          public.credit_note_status not null default 'issued',
  created_by      uuid references public.profiles (id) default auth.uid(),
  created_at      timestamptz not null default now()
);
create index credit_notes_invoice_idx on public.credit_notes (invoice_id);
create trigger credit_notes_no_delete before delete on public.credit_notes
  for each row execute function public.prevent_mutation();

create table public.credit_note_lines (
  id              uuid primary key default gen_random_uuid(),
  credit_note_id  uuid not null references public.credit_notes (id),
  invoice_line_id uuid not null references public.invoice_lines (id),
  qty             numeric(12,3) not null check (qty > 0),
  taxable_value   numeric(14,2) not null,
  cgst            numeric(14,2) not null default 0,
  sgst            numeric(14,2) not null default 0,
  igst            numeric(14,2) not null default 0,
  line_total      numeric(14,2) not null
);
create trigger credit_note_lines_frozen before update or delete on public.credit_note_lines
  for each row execute function public.prevent_mutation();

-- -----------------------------------------------------------------------------
-- Dispatch (every invoice ships in full, in one dispatch)
-- -----------------------------------------------------------------------------
create table public.dispatches (
  id                uuid primary key default gen_random_uuid(),
  dispatch_no       text not null unique,
  invoice_id        uuid not null unique references public.invoices (id),
  warehouse_id      uuid not null references public.warehouses (id),
  status            public.dispatch_status not null default 'picking',
  vehicle_no        text,
  picked_by         uuid references public.profiles (id),
  dispatched_by     uuid references public.profiles (id),
  dispatched_at     timestamptz,
  delivered_at      timestamptz,
  delivery_confirmed_by uuid references public.profiles (id),
  delivery_remarks  text,
  proof_path        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create trigger dispatches_updated_at before update on public.dispatches
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Payments, allocations, promises
-- -----------------------------------------------------------------------------
create table public.payments (
  id             uuid primary key default gen_random_uuid(),
  receipt_no     text not null unique,
  retailer_id    uuid not null references public.retailers (id),
  payment_date   date not null default current_date,
  amount         numeric(14,2) not null check (amount > 0),
  method         public.payment_method not null,
  reference_no   text,           -- UPI ref / UTR / cheque no
  cheque_date    date,
  bank_name      text,
  status         public.payment_status not null default 'received',
  collected_by   uuid references public.profiles (id) default auth.uid(),
  visit_id       uuid,
  notes          text,
  client_uuid    uuid unique,
  created_by     uuid references public.profiles (id) default auth.uid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index payments_retailer_idx on public.payments (retailer_id, payment_date);
create trigger payments_updated_at before update on public.payments
  for each row execute function public.set_updated_at();
create trigger payments_no_delete before delete on public.payments
  for each row execute function public.prevent_mutation();

create table public.payment_allocations (
  id            uuid primary key default gen_random_uuid(),
  payment_id    uuid not null references public.payments (id),
  invoice_id    uuid not null references public.invoices (id),
  amount        numeric(14,2) not null check (amount > 0),
  is_auto       boolean not null default true,     -- FIFO vs manual
  allocated_by  uuid references public.profiles (id) default auth.uid(),
  created_at    timestamptz not null default now(),
  unique (payment_id, invoice_id)
);
create index payment_allocations_invoice_idx on public.payment_allocations (invoice_id);
create trigger payment_allocations_no_update before update on public.payment_allocations
  for each row execute function public.prevent_mutation();

create table public.payment_promises (
  id             uuid primary key default gen_random_uuid(),
  retailer_id    uuid not null references public.retailers (id),
  invoice_id     uuid references public.invoices (id),
  promised_date  date not null,
  amount         numeric(14,2) not null check (amount > 0),
  status         public.promise_status not null default 'open',
  remarks        text,
  created_by     uuid references public.profiles (id) default auth.uid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create trigger payment_promises_updated_at before update on public.payment_promises
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Field: route plans, visits, targets
-- -----------------------------------------------------------------------------
create table public.route_plans (
  id           uuid primary key default gen_random_uuid(),
  route_id     uuid not null references public.routes (id),
  salesman_id  uuid not null references public.profiles (id),
  plan_date    date not null,
  notes        text,
  created_by   uuid references public.profiles (id) default auth.uid(),
  created_at   timestamptz not null default now(),
  unique (salesman_id, plan_date, route_id)
);

create table public.visits (
  id             uuid primary key default gen_random_uuid(),
  route_plan_id  uuid references public.route_plans (id),
  retailer_id    uuid not null references public.retailers (id),
  salesman_id    uuid not null references public.profiles (id),
  planned_date   date not null,
  status         public.visit_status not null default 'planned',
  checkin_at     timestamptz,
  checkout_at    timestamptz,
  latitude       numeric(9,6),
  longitude      numeric(9,6),
  gps_accuracy_m numeric(8,1),
  remarks        text,
  missed_reason  text,
  client_uuid    uuid unique,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index visits_salesman_date_idx on public.visits (salesman_id, planned_date);
create index visits_retailer_idx on public.visits (retailer_id);
create trigger visits_updated_at before update on public.visits
  for each row execute function public.set_updated_at();
alter table public.payments add constraint payments_visit_fk foreign key (visit_id) references public.visits (id);

create table public.targets (
  id                 uuid primary key default gen_random_uuid(),
  salesman_id        uuid not null references public.profiles (id),
  period_start       date not null,
  period_end         date not null check (period_end >= period_start),
  sales_target       numeric(14,2) not null default 0,
  collection_target  numeric(14,2) not null default 0,
  set_by             uuid references public.profiles (id) default auth.uid(),
  created_at         timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Expenses
-- -----------------------------------------------------------------------------
create table public.reimbursements (
  id           uuid primary key default gen_random_uuid(),
  salesman_id  uuid not null references public.profiles (id),
  paid_on      date not null default current_date,
  amount       numeric(14,2) not null check (amount > 0),
  method       public.payment_method not null,
  reference_no text,
  created_by   uuid references public.profiles (id) default auth.uid(),
  created_at   timestamptz not null default now()
);

create table public.expenses (
  id                uuid primary key default gen_random_uuid(),
  salesman_id       uuid not null references public.profiles (id) default auth.uid(),
  route_id          uuid references public.routes (id),
  expense_date      date not null default current_date,
  category          public.expense_category not null,
  amount            numeric(12,2) not null check (amount > 0),
  description       text,
  receipt_path      text,
  status            public.expense_status not null default 'submitted',
  reviewed_by       uuid references public.profiles (id),
  reviewed_at       timestamptz,
  rejection_reason  text,
  reimbursement_id  uuid references public.reimbursements (id),
  client_uuid       uuid unique,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint expense_rejection_reason check (status <> 'rejected' or coalesce(trim(rejection_reason), '') <> '')
);
create index expenses_salesman_idx on public.expenses (salesman_id, expense_date);
create trigger expenses_updated_at before update on public.expenses
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Audit log (written only by triggers; see 0003)
-- -----------------------------------------------------------------------------
create table public.audit_log (
  id          bigint generated always as identity primary key,
  table_name  text not null,
  record_id   text,
  action      text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  old_data    jsonb,
  new_data    jsonb,
  changed_by  uuid,
  changed_at  timestamptz not null default now()
);
create index audit_log_table_idx on public.audit_log (table_name, record_id);
create index audit_log_time_idx on public.audit_log (changed_at desc);
create index audit_log_user_idx on public.audit_log (changed_by);
create trigger audit_log_immutable before update or delete on public.audit_log
  for each row execute function public.prevent_mutation();
