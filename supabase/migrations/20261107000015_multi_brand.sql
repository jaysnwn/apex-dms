-- =============================================================================
-- APEX DMS — Multi-brand separation: CONQRETE and BLUEI run as two independent
-- inventories inside one application.
--
--   * every product, category, warehouse, stock movement, stock count,
--     purchase, order, invoice and credit note belongs to exactly one brand
--   * a user sees and changes only the brands assigned to him (profile_brands);
--     Super Admin always has every brand
--   * stock of one brand can never enter a warehouse of another brand, so a
--     "transfer" between brands is impossible by construction
--   * SKUs are unique within a brand; invoices and credit notes are numbered
--     per brand (CQ/26-27/00001, CQCN/26-27/00001 — within GST's 16 characters)
--   * audit log rows carry the brand
-- Also in this migration: distributor price, manual stock out / adjust-to-count,
-- stock ledger with before/after balances, purchase returns, reorder list.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Brands: short code (used in document numbers) and logo
-- -----------------------------------------------------------------------------
insert into public.brands (name) select 'CONQRETE' where not exists (select 1 from public.brands where lower(name) = 'conqrete');
insert into public.brands (name) select 'BLUEI' where not exists (select 1 from public.brands where lower(name) = 'bluei');

alter table public.brands
  add column if not exists code text,
  add column if not exists logo_path text,
  add column if not exists updated_at timestamptz not null default now();

do $$
declare b record; v_code text; n int;
begin
  for b in select id, name from public.brands where code is null order by created_at, name loop
    v_code := case upper(b.name) when 'CONQRETE' then 'CQ' when 'BLUEI' then 'BL'
                else upper(left(regexp_replace(b.name, '[^A-Za-z0-9]', '', 'g') || 'XX', 2)) end;
    n := 0;
    while exists (select 1 from public.brands where code = v_code) loop
      n := n + 1;
      v_code := left(v_code, 1) || n::text;
    end loop;
    update public.brands set code = v_code where id = b.id;
  end loop;
end $$;

alter table public.brands alter column code set not null;
alter table public.brands add constraint brands_code_format check (code ~ '^[A-Z0-9]{2}$');
create unique index if not exists brands_code_key on public.brands (code);

-- -----------------------------------------------------------------------------
-- 2. Brand access per user
-- -----------------------------------------------------------------------------
create table public.profile_brands (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  brand_id   uuid not null references public.brands (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, brand_id)
);
alter table public.profile_brands enable row level security;

-- Everyone who exists today keeps access to both brands (Super Admin can narrow it).
insert into public.profile_brands (user_id, brand_id)
select p.id, b.id from public.profiles p cross join public.brands b
on conflict do nothing;

-- Brands the signed-in user may work with. Super Admin: all.
create or replace function public.my_brand_ids()
returns uuid[]
language sql stable security definer set search_path = public as $$
  select case
    when public.has_role('super_admin') then coalesce((select array_agg(id) from public.brands), '{}')
    when not public.is_active_user() then '{}'::uuid[]
    else coalesce((select array_agg(brand_id) from public.profile_brands where user_id = auth.uid()), '{}')
  end
$$;

create or replace function public.can_access_brand(p_brand uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select p_brand = any (public.my_brand_ids())
$$;

revoke all on function public.my_brand_ids(), public.can_access_brand(uuid) from public, anon;
grant execute on function public.my_brand_ids(), public.can_access_brand(uuid) to authenticated;

create policy profile_brands_select on public.profile_brands for select to authenticated
  using (user_id = (select auth.uid()) or (select public.has_role('super_admin', 'manager')));
create policy profile_brands_insert on public.profile_brands for insert to authenticated
  with check ((select public.has_role('super_admin')));
create policy profile_brands_delete on public.profile_brands for delete to authenticated
  using ((select public.has_role('super_admin')));

-- Replace a user's brands in one call (Super Admin).
create or replace function public.set_user_brands(p_user uuid, p_brands uuid[])
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role('super_admin') then
    raise exception 'Only the Super Admin can change brand access' using errcode = '42501';
  end if;
  delete from public.profile_brands where user_id = p_user and not (brand_id = any (coalesce(p_brands, '{}')));
  insert into public.profile_brands (user_id, brand_id)
  select p_user, b from unnest(coalesce(p_brands, '{}')) b
  on conflict do nothing;
end $$;
revoke all on function public.set_user_brands(uuid, uuid[]) from public, anon;
grant execute on function public.set_user_brands(uuid, uuid[]) to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Categories belong to a brand
-- -----------------------------------------------------------------------------
alter table public.categories add column if not exists brand_id uuid references public.brands (id);
drop index if exists public.categories_name_key;

do $$
declare
  v_first uuid := (select id from public.brands order by (upper(name) = 'CONQRETE') desc, created_at, name limit 1);
  v_cat record; v_br record; v_copy uuid;
begin
  -- Each existing category goes to the brand that uses it most (or the first brand).
  update public.categories c
     set brand_id = coalesce(
           (select p.brand_id from public.products p where p.category_id = c.id
             group by p.brand_id order by count(*) desc limit 1), v_first)
   where c.brand_id is null;

  -- Every other brand gets its own copy of each category name.
  for v_cat in select id, name, brand_id, is_active from public.categories loop
    for v_br in select id from public.brands where id <> v_cat.brand_id loop
      select id into v_copy from public.categories where brand_id = v_br.id and lower(name) = lower(v_cat.name);
      if v_copy is null then
        insert into public.categories (name, brand_id, is_active) values (v_cat.name, v_br.id, v_cat.is_active) returning id into v_copy;
      end if;
      -- products of that brand that pointed at the other brand's category move to their own copy
      update public.products set category_id = v_copy where category_id = v_cat.id and brand_id = v_br.id;
      v_copy := null;
    end loop;
  end loop;
end $$;

alter table public.categories alter column brand_id set not null;
create unique index categories_brand_name_key on public.categories (brand_id, lower(name));

-- -----------------------------------------------------------------------------
-- 4. Warehouses belong to a brand
-- -----------------------------------------------------------------------------
alter table public.warehouses add column if not exists brand_id uuid references public.brands (id);

do $$
declare
  v_first uuid := (select id from public.brands order by (upper(name) = 'CONQRETE') desc, created_at, name limit 1);
  v_bad   text;
  v_br    record;
begin
  -- A warehouse that already holds stock of two brands cannot be split automatically.
  select string_agg(w.name, ', ') into v_bad
    from public.warehouses w
   where (select count(distinct p.brand_id) from public.stock_movements sm join public.products p on p.id = sm.product_id
           where sm.warehouse_id = w.id) > 1;
  if v_bad is not null then
    raise exception 'Warehouse(s) % hold stock of more than one brand. Move one brand''s stock out before running this migration.', v_bad;
  end if;

  update public.warehouses w
     set brand_id = coalesce(
           (select p.brand_id from public.stock_movements sm join public.products p on p.id = sm.product_id
             where sm.warehouse_id = w.id limit 1),
           (select p.brand_id from public.products p where p.default_warehouse_id = w.id
             group by p.brand_id order by count(*) desc limit 1),
           v_first)
   where w.brand_id is null;

  -- Every brand gets at least one warehouse.
  for v_br in select id, name from public.brands loop
    if not exists (select 1 from public.warehouses where brand_id = v_br.id) then
      insert into public.warehouses (name, brand_id) values (v_br.name || ' Warehouse', v_br.id);
    end if;
  end loop;

  -- The single original warehouse is renamed after its brand.
  update public.warehouses w
     set name = (select name from public.brands where id = w.brand_id) || ' Warehouse'
   where w.name = 'Main Warehouse'
     and not exists (select 1 from public.warehouses x
                      where lower(x.name) = lower((select name from public.brands where id = w.brand_id) || ' Warehouse'));
end $$;

alter table public.warehouses alter column brand_id set not null;
create index if not exists warehouses_brand_idx on public.warehouses (brand_id);

-- A warehouse's brand cannot change once it has stock history.
create or replace function public.warehouse_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.can_access_brand(new.brand_id) then
    raise exception 'You do not have access to this brand' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and new.brand_id <> old.brand_id
     and (exists (select 1 from public.stock_movements where warehouse_id = old.id)
          or exists (select 1 from public.purchases where warehouse_id = old.id)) then
    raise exception 'This warehouse already has stock records of %; its brand cannot change. Create a new warehouse instead.',
      (select name from public.brands where id = old.brand_id) using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function public.warehouse_guard() from public, anon, authenticated;
create trigger warehouses_brand_guard before insert or update on public.warehouses
  for each row execute function public.warehouse_guard();

drop policy if exists warehouses_select on public.warehouses;
drop policy if exists warehouses_insert on public.warehouses;
drop policy if exists warehouses_update on public.warehouses;
create policy warehouses_select on public.warehouses for select to authenticated
  using ((select public.is_active_user()) and brand_id = any ((select public.my_brand_ids())::uuid[]));
create policy warehouses_insert on public.warehouses for insert to authenticated
  with check ((select public.has_role('super_admin', 'manager')) and brand_id = any ((select public.my_brand_ids())::uuid[]));
create policy warehouses_update on public.warehouses for update to authenticated
  using ((select public.has_role('super_admin', 'manager')) and brand_id = any ((select public.my_brand_ids())::uuid[]))
  with check ((select public.has_role('super_admin', 'manager')) and brand_id = any ((select public.my_brand_ids())::uuid[]));

drop policy if exists categories_select on public.categories;
drop policy if exists categories_insert on public.categories;
drop policy if exists categories_update on public.categories;
create policy categories_select on public.categories for select to authenticated
  using ((select public.is_active_user()) and brand_id = any ((select public.my_brand_ids())::uuid[]));
create policy categories_insert on public.categories for insert to authenticated
  with check ((select public.has_role('super_admin', 'manager')) and brand_id = any ((select public.my_brand_ids())::uuid[]));
create policy categories_update on public.categories for update to authenticated
  using ((select public.has_role('super_admin', 'manager')) and brand_id = any ((select public.my_brand_ids())::uuid[]))
  with check ((select public.has_role('super_admin', 'manager')) and brand_id = any ((select public.my_brand_ids())::uuid[]));

-- -----------------------------------------------------------------------------
-- 5. Products: SKU unique within the brand, distributor price, brand guard
-- -----------------------------------------------------------------------------
alter table public.products
  add column if not exists distributor_price numeric(12,2) not null default 0 check (distributor_price >= 0),
  add column if not exists distributor_price_mode public.price_tax_mode not null default 'exclusive';

drop index if exists public.products_sku_key;
drop index if exists public.products_barcode_key;
create unique index products_brand_sku_key on public.products (brand_id, lower(sku));
create unique index products_brand_barcode_key on public.products (brand_id, barcode) where barcode is not null;
create index if not exists products_brand_idx on public.products (brand_id);

-- Default warehouse of the product's own brand.
update public.products p
   set default_warehouse_id = (select w.id from public.warehouses w where w.brand_id = p.brand_id order by w.created_at limit 1),
       default_location_id = null
 where p.default_warehouse_id is not null
   and (select brand_id from public.warehouses where id = p.default_warehouse_id) <> p.brand_id;

create or replace function public.product_brand_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.can_access_brand(new.brand_id) then
    raise exception 'You do not have access to this brand' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and new.brand_id <> old.brand_id
     and (exists (select 1 from public.stock_movements where product_id = old.id)
          or exists (select 1 from public.order_lines where product_id = old.id)
          or exists (select 1 from public.purchase_lines where product_id = old.id)) then
    raise exception 'This product already has stock or orders under %; its brand cannot change. Add it again under the other brand.',
      (select name from public.brands where id = old.brand_id) using errcode = 'P0001';
  end if;
  if new.category_id is not null and (select brand_id from public.categories where id = new.category_id) <> new.brand_id then
    raise exception 'The category belongs to another brand' using errcode = 'P0001';
  end if;
  if new.default_warehouse_id is not null and (select brand_id from public.warehouses where id = new.default_warehouse_id) <> new.brand_id then
    raise exception 'The warehouse belongs to another brand' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function public.product_brand_guard() from public, anon, authenticated;
create trigger products_brand_guard before insert or update on public.products
  for each row execute function public.product_brand_guard();

drop policy if exists products_select on public.products;
drop policy if exists products_insert on public.products;
drop policy if exists products_update on public.products;
create policy products_select on public.products for select to authenticated
  using ((select public.has_role('super_admin', 'manager', 'billing')) and brand_id = any ((select public.my_brand_ids())::uuid[]));
create policy products_insert on public.products for insert to authenticated
  with check ((select public.has_role('super_admin', 'manager')) and brand_id = any ((select public.my_brand_ids())::uuid[]));
create policy products_update on public.products for update to authenticated
  using ((select public.has_role('super_admin', 'manager')) and brand_id = any ((select public.my_brand_ids())::uuid[]))
  with check ((select public.has_role('super_admin', 'manager')) and brand_id = any ((select public.my_brand_ids())::uuid[]));

-- -----------------------------------------------------------------------------
-- 6. Stock movements carry the brand; cross-brand movement is impossible
-- -----------------------------------------------------------------------------
alter table public.stock_movements
  add column if not exists brand_id uuid references public.brands (id),
  add column if not exists movement_date date not null default ((now() at time zone 'Asia/Kolkata')::date),
  add column if not exists reference_no text,
  add column if not exists notes text,
  add column if not exists client_uuid uuid;

-- stock_movements is append-only (prevent_mutation); lift the guard for this backfill only.
alter table public.stock_movements disable trigger user;
update public.stock_movements sm set brand_id = p.brand_id, movement_date = (sm.created_at at time zone 'Asia/Kolkata')::date
  from public.products p where p.id = sm.product_id and sm.brand_id is null;
alter table public.stock_movements enable trigger user;

alter table public.stock_movements alter column brand_id set not null;
create index if not exists stock_movements_brand_idx on public.stock_movements (brand_id, created_at desc);
create unique index if not exists stock_movements_client_uuid_key on public.stock_movements (client_uuid) where client_uuid is not null;

alter table public.stock_movements drop constraint if exists stock_movement_sign;
alter table public.stock_movements add constraint stock_movement_sign check (
  (movement_type in ('opening', 'stock_in', 'transfer_in', 'dispatch_reversal', 'credit_note_return') and qty > 0) or
  (movement_type in ('transfer_out', 'damage', 'dispatch', 'stock_out', 'purchase_return') and qty < 0) or
  (movement_type in ('adjustment', 'reconciliation'))
);

create or replace function public.stock_movement_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cost      numeric;
  v_mode      public.price_tax_mode;
  v_gst       numeric;
  v_on_hand   numeric;
  v_name      text;
  v_brand     uuid;
  v_wh_brand  uuid;
  v_wh_name   text;
begin
  select purchase_cost, purchase_cost_mode, gst_rate, name, brand_id
    into v_cost, v_mode, v_gst, v_name, v_brand
    from public.products where id = new.product_id
     for update;
  select brand_id, name into v_wh_brand, v_wh_name from public.warehouses where id = new.warehouse_id;

  -- Brand separation: the product's brand decides; the warehouse must be of that brand.
  new.brand_id := v_brand;
  if v_wh_brand is distinct from v_brand then
    raise exception '% is a % product, but % is a % warehouse. Stock of one brand cannot enter another brand''s warehouse.',
      v_name, (select name from public.brands where id = v_brand),
      v_wh_name, (select name from public.brands where id = v_wh_brand) using errcode = 'P0001';
  end if;
  if auth.uid() is not null and not public.can_access_brand(v_brand) then
    raise exception 'You do not have access to % inventory', (select name from public.brands where id = v_brand) using errcode = '42501';
  end if;

  if new.movement_type in ('adjustment', 'damage', 'stock_out') and coalesce(trim(new.reason), '') = '' then
    raise exception 'A reason is required for % entries', replace(new.movement_type::text, '_', ' ') using errcode = 'P0001';
  end if;

  if new.unit_cost is null and new.qty > 0 then
    new.unit_cost := case when v_mode = 'inclusive' then round(v_cost / (1 + v_gst / 100), 4) else v_cost end;
  end if;

  if new.qty < 0 then
    select coalesce(sum(qty), 0) into v_on_hand
      from public.stock_movements
     where product_id = new.product_id and warehouse_id = new.warehouse_id;
    if v_on_hand + new.qty < 0 then
      raise exception 'Not enough stock of %: % available in this warehouse, % requested',
        v_name, trim_scale(v_on_hand), trim_scale(-new.qty) using errcode = 'P0001';
    end if;
  end if;

  return new;
end $$;
revoke all on function public.stock_movement_before_insert() from public, anon, authenticated;

drop policy if exists stock_movements_select on public.stock_movements;
drop policy if exists stock_movements_insert on public.stock_movements;
create policy stock_movements_select on public.stock_movements for select to authenticated
  using ((select public.has_role('super_admin', 'manager', 'billing', 'warehouse')) and brand_id = any ((select public.my_brand_ids())::uuid[]));
-- Dispatch / returns / count corrections come only from security-definer functions.
-- Adjustments are for Super Admin and Manager (warehouse staff use stock counts).
create policy stock_movements_insert on public.stock_movements for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and brand_id = any ((select public.my_brand_ids())::uuid[])
    and movement_type not in ('dispatch', 'dispatch_reversal', 'credit_note_return', 'reconciliation', 'purchase_return')
    and ((select public.has_role('super_admin', 'manager'))
         or ((select public.has_role('warehouse')) and movement_type <> 'adjustment'))
  );

-- Set stock to what was physically counted (one product). Returns the difference posted.
create or replace function public.adjust_stock_to(
  p_product_id uuid, p_warehouse_id uuid, p_physical numeric, p_reason text, p_notes text default null, p_client_uuid uuid default null
) returns numeric
language plpgsql security definer set search_path = public as $$
declare v_on_hand numeric; v_diff numeric;
begin
  if not public.has_role('super_admin', 'manager') then
    raise exception 'Only a Manager or Super Admin can adjust stock' using errcode = '42501';
  end if;
  if p_physical is null or p_physical < 0 then raise exception 'Physical stock must be zero or more' using errcode = 'P0001'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Choose the reason for the adjustment' using errcode = 'P0001'; end if;
  if p_client_uuid is not null and exists (select 1 from public.stock_movements where client_uuid = p_client_uuid) then
    return (select qty from public.stock_movements where client_uuid = p_client_uuid);   -- double submit
  end if;
  perform 1 from public.products where id = p_product_id for update;
  select coalesce(sum(qty), 0) into v_on_hand from public.stock_movements
   where product_id = p_product_id and warehouse_id = p_warehouse_id;
  v_diff := p_physical - v_on_hand;
  if v_diff = 0 then raise exception 'Physical stock matches the system. Nothing to adjust.' using errcode = 'P0001'; end if;
  insert into public.stock_movements (product_id, warehouse_id, movement_type, qty, reason, notes, client_uuid, created_by)
  values (p_product_id, p_warehouse_id, 'adjustment', v_diff,
          trim(p_reason) || ' (system ' || trim_scale(v_on_hand) || ', physical ' || trim_scale(p_physical) || ')',
          nullif(trim(coalesce(p_notes, '')), ''), p_client_uuid, auth.uid());
  return v_diff;
end $$;
revoke all on function public.adjust_stock_to(uuid, uuid, numeric, text, text, uuid) from public, anon;
grant execute on function public.adjust_stock_to(uuid, uuid, numeric, text, text, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 7. Stock counts belong to the warehouse's brand; sheets list that brand only
-- -----------------------------------------------------------------------------
alter table public.stock_counts add column if not exists brand_id uuid references public.brands (id);
update public.stock_counts c set brand_id = w.brand_id from public.warehouses w where w.id = c.warehouse_id and c.brand_id is null;
alter table public.stock_counts alter column brand_id set not null;

create or replace function public.stock_count_brand()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.brand_id := (select brand_id from public.warehouses where id = new.warehouse_id);
  if auth.uid() is not null and not public.can_access_brand(new.brand_id) then
    raise exception 'You do not have access to this brand' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function public.stock_count_brand() from public, anon, authenticated;
create trigger stock_counts_brand before insert or update of warehouse_id on public.stock_counts
  for each row execute function public.stock_count_brand();

-- Count sheets: only the products of the warehouse's brand.
do $$
declare v_src text := pg_get_functiondef('public.start_stock_count(uuid, text)'::regprocedure);
begin
  if position('   where p.is_active;' in v_src) = 0 then
    raise exception 'start_stock_count body changed; update migration 0015';
  end if;
  execute replace(v_src, '   where p.is_active;',
    '   where p.is_active and p.brand_id = (select w.brand_id from public.warehouses w where w.id = p_warehouse_id);');
end $$;

drop policy if exists stock_counts_select on public.stock_counts;
drop policy if exists stock_counts_insert on public.stock_counts;
drop policy if exists stock_counts_update on public.stock_counts;
create policy stock_counts_select on public.stock_counts for select to authenticated
  using ((select public.has_role('super_admin', 'manager', 'billing', 'warehouse')) and brand_id = any ((select public.my_brand_ids())::uuid[]));
create policy stock_counts_insert on public.stock_counts for insert to authenticated
  with check ((select public.has_role('super_admin', 'manager', 'warehouse')) and status in ('draft', 'submitted')
              and brand_id = any ((select public.my_brand_ids())::uuid[]));
create policy stock_counts_update on public.stock_counts for update to authenticated
  using ((select public.has_role('super_admin', 'manager', 'warehouse')) and status in ('draft', 'submitted')
         and brand_id = any ((select public.my_brand_ids())::uuid[]))
  with check (
    (select public.has_role('super_admin', 'manager', 'warehouse'))
    and (status <> 'approved' or (select public.has_role('super_admin', 'manager')))
  );
drop policy if exists stock_count_lines_select on public.stock_count_lines;
create policy stock_count_lines_select on public.stock_count_lines for select to authenticated
  using (exists (select 1 from public.stock_counts c where c.id = count_id));

-- -----------------------------------------------------------------------------
-- 8. Suppliers (default brand, delivery lead time) and purchases
-- -----------------------------------------------------------------------------
alter table public.suppliers
  add column if not exists brand_id uuid references public.brands (id),
  add column if not exists lead_days integer not null default 8 check (lead_days between 0 and 180);
update public.suppliers s set brand_id = b.id from public.brands b
 where s.brand_id is null and lower(s.name) = lower(b.name);

alter table public.purchases add column if not exists brand_id uuid references public.brands (id);
update public.purchases p set brand_id = w.brand_id from public.warehouses w where w.id = p.warehouse_id and p.brand_id is null;
do $$
begin
  if exists (select 1 from public.purchase_lines pl join public.purchases p on p.id = pl.purchase_id
               join public.products pr on pr.id = pl.product_id where pr.brand_id <> p.brand_id) then
    raise exception 'Some purchases contain products of another brand than their warehouse. Fix them before this migration.';
  end if;
end $$;
alter table public.purchases alter column brand_id set not null;
create index if not exists purchases_brand_idx on public.purchases (brand_id, order_date desc);

create or replace function public.purchase_brand()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.brand_id := (select brand_id from public.warehouses where id = new.warehouse_id);
  if auth.uid() is not null and not public.can_access_brand(new.brand_id) then
    raise exception 'You do not have access to this brand' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and new.brand_id <> old.brand_id and exists (select 1 from public.purchase_lines where purchase_id = new.id) then
    raise exception 'The warehouse belongs to another brand than the products on this purchase' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' and new.status = 'cancelled' and old.status = 'received'
     and exists (select 1 from public.purchase_returns where purchase_id = new.id) then
    raise exception 'Goods were already returned against this bill; it cannot be cancelled.' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function public.purchase_brand() from public, anon, authenticated;

create or replace function public.purchase_line_brand()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_pb uuid; v_b uuid; v_name text;
begin
  select brand_id into v_pb from public.purchases where id = new.purchase_id;
  select brand_id, name into v_b, v_name from public.products where id = new.product_id;
  if v_b <> v_pb then
    raise exception '% is a % product; this purchase is for %. Make a separate purchase for each brand.',
      v_name, (select name from public.brands where id = v_b), (select name from public.brands where id = v_pb) using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function public.purchase_line_brand() from public, anon, authenticated;
create trigger purchase_lines_brand before insert or update of product_id on public.purchase_lines
  for each row execute function public.purchase_line_brand();

drop policy if exists purchases_select on public.purchases;
drop policy if exists purchase_lines_select on public.purchase_lines;
create policy purchases_select on public.purchases for select to authenticated
  using (public.has_role('super_admin', 'manager', 'billing') and brand_id = any ((select public.my_brand_ids())::uuid[]));
create policy purchase_lines_select on public.purchase_lines for select to authenticated
  using (exists (select 1 from public.purchases p where p.id = purchase_id));

-- -----------------------------------------------------------------------------
-- 9. Purchase returns (debit notes to the supplier)
-- -----------------------------------------------------------------------------
create table public.purchase_returns (
  id             uuid primary key default gen_random_uuid(),
  return_no      text not null unique,
  purchase_id    uuid not null references public.purchases (id),
  supplier_id    uuid not null references public.suppliers (id),
  brand_id       uuid not null references public.brands (id),
  warehouse_id   uuid not null references public.warehouses (id),
  return_date    date not null default ((now() at time zone 'Asia/Kolkata')::date),
  reason         text not null check (length(trim(reason)) > 0),
  taxable_total  numeric(14,2) not null default 0,
  cgst_total     numeric(14,2) not null default 0,
  sgst_total     numeric(14,2) not null default 0,
  igst_total     numeric(14,2) not null default 0,
  grand_total    numeric(14,2) not null default 0,
  client_uuid    uuid unique,
  created_by     uuid references public.profiles (id) default auth.uid(),
  created_at     timestamptz not null default now()
);
create index purchase_returns_purchase_idx on public.purchase_returns (purchase_id);
create table public.purchase_return_lines (
  id                uuid primary key default gen_random_uuid(),
  return_id         uuid not null references public.purchase_returns (id) on delete cascade,
  purchase_line_id  uuid not null references public.purchase_lines (id),
  product_id        uuid not null references public.products (id),
  qty               numeric(12,3) not null check (qty > 0),
  taxable_value     numeric(14,2) not null,
  cgst              numeric(14,2) not null default 0,
  sgst              numeric(14,2) not null default 0,
  igst              numeric(14,2) not null default 0,
  line_total        numeric(14,2) not null
);
alter table public.purchase_returns enable row level security;
alter table public.purchase_return_lines enable row level security;
create policy purchase_returns_select on public.purchase_returns for select to authenticated
  using (public.has_role('super_admin', 'manager', 'billing') and brand_id = any ((select public.my_brand_ids())::uuid[]));
create policy purchase_return_lines_select on public.purchase_return_lines for select to authenticated
  using (exists (select 1 from public.purchase_returns r where r.id = return_id));
create trigger purchase_returns_audit after insert or update or delete on public.purchase_returns
  for each row execute function public.audit_row();

create trigger purchases_brand before insert or update on public.purchases
  for each row execute function public.purchase_brand();

-- Brand-wise document numbers. INV: CQ/26-27/00001 · others: CQCN/26-27/00001, CQDN/...
create or replace function public.brand_document_number(p_brand uuid, p_kind text, p_date date default current_date)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_code  text := (select code from public.brands where id = p_brand);
  v_fy    text := public.fy_label(p_date);
  v_type  text;
  v_value integer;
begin
  if v_code is null then raise exception 'Brand missing on the document' using errcode = 'P0001'; end if;
  v_type := p_kind || '-' || v_code;
  insert into public.number_series (doc_type, fy) values (v_type, v_fy) on conflict (doc_type, fy) do nothing;
  update public.number_series set next_value = next_value + 1
   where doc_type = v_type and fy = v_fy
  returning next_value - 1 into v_value;
  if p_kind = 'INV' then
    return v_code || '/' || v_fy || '/' || lpad(v_value::text, 5, '0');
  end if;
  return v_code || p_kind || '/' || v_fy || '/' || lpad(v_value::text, 5, '0');
end $$;
revoke all on function public.brand_document_number(uuid, text, date) from public, anon, authenticated;

create or replace function public.create_purchase_return(p_purchase_id uuid, p_reason text, p_lines jsonb, p_client_uuid uuid default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_p    public.purchases%rowtype;
  v_id   uuid;
  v_l    jsonb;
  v_pl   public.purchase_lines%rowtype;
  v_qty  numeric;
  v_done numeric;
  v_r    numeric;
  v_date date := (now() at time zone 'Asia/Kolkata')::date;
  v_tx numeric; v_c numeric; v_s numeric; v_g numeric;
  t_tx numeric := 0; t_c numeric := 0; t_s numeric := 0; t_g numeric := 0;
begin
  if not public.has_role('super_admin', 'manager', 'billing') then
    raise exception 'Only office staff can return goods to a supplier' using errcode = '42501';
  end if;
  if p_client_uuid is not null then
    select id into v_id from public.purchase_returns where client_uuid = p_client_uuid;
    if v_id is not null then return v_id; end if;
  end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Enter the reason for the return' using errcode = 'P0001'; end if;
  select * into v_p from public.purchases where id = p_purchase_id for update;
  if not found or v_p.status <> 'received' then
    raise exception 'Only received purchases can be returned' using errcode = 'P0001';
  end if;
  if not public.can_access_brand(v_p.brand_id) then raise exception 'You do not have access to this brand' using errcode = '42501'; end if;
  if coalesce(jsonb_array_length(p_lines), 0) = 0 then raise exception 'Choose what to return' using errcode = 'P0001'; end if;

  insert into public.purchase_returns (return_no, purchase_id, supplier_id, brand_id, warehouse_id, return_date, reason, client_uuid, created_by)
  values (public.brand_document_number(v_p.brand_id, 'DN', v_date), v_p.id, v_p.supplier_id, v_p.brand_id, v_p.warehouse_id,
          v_date, trim(p_reason), p_client_uuid, auth.uid())
  returning id into v_id;

  for v_l in select * from jsonb_array_elements(p_lines) loop
    v_qty := nullif(v_l ->> 'qty', '')::numeric;
    continue when v_qty is null or v_qty <= 0;
    select * into v_pl from public.purchase_lines where id = (v_l ->> 'purchase_line_id')::uuid and purchase_id = p_purchase_id;
    if not found then raise exception 'Line does not belong to this purchase' using errcode = 'P0001'; end if;
    select coalesce(sum(rl.qty), 0) into v_done from public.purchase_return_lines rl where rl.purchase_line_id = v_pl.id;
    if v_qty > v_pl.qty - v_done then
      raise exception 'Only % of % can still be returned on this bill',
        trim_scale(v_pl.qty - v_done), (select name from public.products where id = v_pl.product_id) using errcode = 'P0001';
    end if;
    v_r := v_qty / v_pl.qty;
    v_tx := round(v_pl.taxable_value * v_r, 2);
    v_c := round(v_pl.cgst * v_r, 2); v_s := round(v_pl.sgst * v_r, 2); v_g := round(v_pl.igst * v_r, 2);
    insert into public.purchase_return_lines (return_id, purchase_line_id, product_id, qty, taxable_value, cgst, sgst, igst, line_total)
    values (v_id, v_pl.id, v_pl.product_id, v_qty, v_tx, v_c, v_s, v_g, v_tx + v_c + v_s + v_g);
    insert into public.stock_movements (product_id, warehouse_id, movement_type, qty, reference_type, reference_id, reference_no, reason, created_by)
    values (v_pl.product_id, v_p.warehouse_id, 'purchase_return', -v_qty, 'purchase_return', v_id,
            (select return_no from public.purchase_returns where id = v_id),
            'Returned to supplier: ' || trim(p_reason), auth.uid());
    t_tx := t_tx + v_tx; t_c := t_c + v_c; t_s := t_s + v_s; t_g := t_g + v_g;
  end loop;

  if t_tx + t_c + t_s + t_g <= 0 then raise exception 'Enter the quantity to return' using errcode = 'P0001'; end if;
  update public.purchase_returns
     set taxable_total = t_tx, cgst_total = t_c, sgst_total = t_s, igst_total = t_g, grand_total = t_tx + t_c + t_s + t_g
   where id = v_id;
  return v_id;
end $$;
revoke all on function public.create_purchase_return(uuid, text, jsonb, uuid) from public, anon;
grant execute on function public.create_purchase_return(uuid, text, jsonb, uuid) to authenticated;

-- What we owe on a bill now also subtracts goods returned.
create or replace function public.purchase_open_amount(p_purchase_id uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select p.grand_total
       - coalesce((select sum(r.grand_total) from public.purchase_returns r where r.purchase_id = p.id), 0)
       - coalesce((select sum(a.amount) from public.supplier_payment_allocations a
                     join public.supplier_payments sp on sp.id = a.payment_id
                    where a.purchase_id = p.id and sp.status = 'paid'), 0)
    from public.purchases p where p.id = p_purchase_id
$$;

create or replace view public.purchase_balances
with (security_invoker = true) as
select p.id as purchase_id, p.purchase_no, p.supplier_id, p.supplier_bill_no, p.supplier_bill_date, p.due_date,
       p.grand_total,
       coalesce(a.paid, 0) as paid,
       p.grand_total - coalesce(rt.returned, 0) - coalesce(a.paid, 0) as balance,
       greatest(((now() at time zone 'Asia/Kolkata')::date - p.due_date), 0) as days_overdue,
       coalesce(rt.returned, 0) as returned,
       p.brand_id
  from public.purchases p
  left join (select a.purchase_id, sum(a.amount) as paid
               from public.supplier_payment_allocations a
               join public.supplier_payments sp on sp.id = a.payment_id and sp.status = 'paid'
              group by a.purchase_id) a on a.purchase_id = p.id
  left join (select purchase_id, sum(grand_total) as returned from public.purchase_returns group by purchase_id) rt
         on rt.purchase_id = p.id
 where p.status = 'received';

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
  from public.supplier_payments sp where sp.status = 'paid'
union all
select r.supplier_id, r.return_date, r.created_at, 'return', r.purchase_id, r.return_no,
       'Goods returned · ' || r.reason, r.grand_total, 0
  from public.purchase_returns r;

-- Warehouse view of what to receive: own brands only.
create or replace view public.purchase_receipts as
select p.id as purchase_id, p.purchase_no, p.status, p.order_date, p.expected_date, p.received_date,
       p.supplier_bill_no, p.credit_days, p.warehouse_id, w.name as warehouse_name, s.name as supplier_name,
       pl.line_no, pl.product_id, pr.name as product_name, pr.sku, pr.unit_code, pl.qty
  from public.purchases p
  join public.suppliers s on s.id = p.supplier_id
  join public.warehouses w on w.id = p.warehouse_id
  join public.purchase_lines pl on pl.purchase_id = p.id
  join public.products pr on pr.id = pl.product_id
 where public.has_role('super_admin', 'manager', 'billing', 'warehouse')
   and p.brand_id = any (public.my_brand_ids());

-- -----------------------------------------------------------------------------
-- 10. Orders, invoices and credit notes: one brand each, brand-wise numbering
-- -----------------------------------------------------------------------------
alter table public.orders add column if not exists brand_id uuid references public.brands (id);
alter table public.invoices add column if not exists brand_id uuid references public.brands (id);
alter table public.credit_notes add column if not exists brand_id uuid references public.brands (id);

do $$
begin
  if exists (select 1 from public.order_lines l join public.products p on p.id = l.product_id
              group by l.order_id having count(distinct p.brand_id) > 1) then
    raise exception 'Some orders contain products of both brands. Split them before this migration.';
  end if;
end $$;

update public.orders o set brand_id = (select p.brand_id from public.order_lines l join public.products p on p.id = l.product_id
                                        where l.order_id = o.id limit 1)
 where o.brand_id is null;
-- invoices and credit notes are locked documents; lift their guards for this backfill only.
alter table public.invoices disable trigger user;
update public.invoices i set brand_id = o.brand_id from public.orders o where o.id = i.order_id and i.brand_id is null;
alter table public.invoices enable trigger user;
alter table public.credit_notes disable trigger user;
update public.credit_notes c set brand_id = i.brand_id from public.invoices i where i.id = c.invoice_id and c.brand_id is null;
alter table public.credit_notes enable trigger user;
create index if not exists invoices_brand_idx on public.invoices (brand_id, invoice_date desc);

-- The first product decides the order's brand; every other line must match.
create or replace function public.order_line_brand()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_b uuid; v_ob uuid; v_name text;
begin
  select brand_id, name into v_b, v_name from public.products where id = new.product_id;
  if auth.uid() is not null and not public.can_access_brand(v_b) then
    raise exception 'You do not have access to % products', (select name from public.brands where id = v_b) using errcode = '42501';
  end if;
  select brand_id into v_ob from public.orders where id = new.order_id for update;
  if v_ob is null or not exists (select 1 from public.order_lines where order_id = new.order_id and id <> new.id) then
    if v_ob is distinct from v_b then update public.orders set brand_id = v_b where id = new.order_id; end if;
  elsif v_ob <> v_b then
    raise exception 'One order can contain one brand only: % is a % product, this order is for %.',
      v_name, (select name from public.brands where id = v_b), (select name from public.brands where id = v_ob) using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function public.order_line_brand() from public, anon, authenticated;
create trigger order_lines_brand before insert or update of product_id on public.order_lines
  for each row execute function public.order_line_brand();

create or replace function public.invoice_brand()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.brand_id := (select brand_id from public.orders where id = new.order_id);
  if new.brand_id is null then raise exception 'The order has no brand' using errcode = 'P0001'; end if;
  if auth.uid() is not null and not public.can_access_brand(new.brand_id) then
    raise exception 'You do not have access to % invoices', (select name from public.brands where id = new.brand_id) using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function public.invoice_brand() from public, anon, authenticated;
create trigger invoices_brand before insert on public.invoices
  for each row execute function public.invoice_brand();

create or replace function public.credit_note_brand()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.brand_id := (select brand_id from public.invoices where id = new.invoice_id);
  return new;
end $$;
revoke all on function public.credit_note_brand() from public, anon, authenticated;
create trigger credit_notes_brand before insert on public.credit_notes
  for each row execute function public.credit_note_brand();

-- confirm_order / create_credit_note: brand-wise numbers instead of the APX series.
do $$
declare v_src text;
begin
  v_src := pg_get_functiondef('public.confirm_order(uuid, boolean)'::regprocedure);
  if position('public.next_document_number(''INV'', v_date)' in v_src) = 0 then
    raise exception 'confirm_order body changed; update migration 0015';
  end if;
  execute replace(v_src, 'public.next_document_number(''INV'', v_date)', 'public.brand_document_number(v_order.brand_id, ''INV'', v_date)');

  v_src := pg_get_functiondef('public.create_credit_note(uuid, text, boolean, jsonb)'::regprocedure);
  if position('public.next_document_number(''CN'', v_date)' in v_src) = 0 then
    raise exception 'create_credit_note body changed; update migration 0015';
  end if;
  execute replace(v_src, 'public.next_document_number(''CN'', v_date)', 'public.brand_document_number(v_inv.brand_id, ''CN'', v_date)');
end $$;

-- -----------------------------------------------------------------------------
-- 11. Audit log rows carry the brand
-- -----------------------------------------------------------------------------
alter table public.audit_log add column if not exists brand_id uuid;
create index if not exists audit_log_brand_idx on public.audit_log (brand_id, changed_at desc);

create or replace function public.audit_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_id  text;
  v_brand uuid;
begin
  -- Skip no-op updates (only updated_at changed)
  if tg_op = 'UPDATE' and (v_old - 'updated_at') = (v_new - 'updated_at') then
    return new;
  end if;

  v_id := coalesce(v_new ->> 'id', v_old ->> 'id');
  v_brand := nullif(coalesce(v_new ->> 'brand_id', v_old ->> 'brand_id'), '')::uuid;
  if v_brand is null and tg_table_name = 'brands' then v_brand := v_id::uuid; end if;

  insert into public.audit_log (table_name, record_id, action, old_data, new_data, changed_by, brand_id)
  values (tg_table_name, v_id, tg_op, v_old, v_new, auth.uid(), v_brand);

  return coalesce(new, old);
end $$;
revoke all on function public.audit_row() from public, anon, authenticated;

drop policy if exists audit_log_select on public.audit_log;
create policy audit_log_select on public.audit_log for select to authenticated
  using ((select public.has_role('super_admin', 'manager'))
         and (brand_id is null or brand_id = any ((select public.my_brand_ids())::uuid[])));

do $$
declare t text;
begin
  foreach t in array array['brands', 'categories', 'warehouses', 'profile_brands'] loop
    if not exists (select 1 from pg_trigger where tgname = t || '_audit') then
      execute format('create trigger %1$s_audit after insert or update or delete on public.%1$I
                      for each row execute function public.audit_row()', t);
    end if;
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 12. Views: everything filtered to the user's brands
-- -----------------------------------------------------------------------------
create or replace view public.catalog as
select p.id, p.name, p.sku, p.barcode, p.hsn_code, p.description,
       p.brand_id, b.name as brand_name,
       p.category_id, c.name as category_name,
       p.unit_code, p.retailer_price, p.retailer_price_mode, p.mrp, p.mrp_mode,
       p.gst_rate, p.min_stock_qty, p.default_warehouse_id, p.default_location_id,
       p.is_active,
       (select pi.storage_path from public.product_images pi
         where pi.product_id = p.id order by pi.is_primary desc, pi.sort_order limit 1) as image_path,
       p.distributor_price, p.distributor_price_mode, p.created_at
  from public.products p
  join public.brands b on b.id = p.brand_id
  left join public.categories c on c.id = p.category_id
 where public.is_active_user()
   and p.brand_id = any (public.my_brand_ids());

create or replace view public.stock_on_hand as
select sm.product_id, sm.warehouse_id, sum(sm.qty) as on_hand
  from public.stock_movements sm
 where public.is_active_user()
   and sm.brand_id = any (public.my_brand_ids())
 group by sm.product_id, sm.warehouse_id;

create or replace view public.product_stock as
select p.id as product_id,
       coalesce(oh.on_hand, 0)                              as on_hand,
       coalesce(r.reserved, 0)                              as reserved,
       coalesce(oh.on_hand, 0) - coalesce(r.reserved, 0)    as available,
       p.min_stock_qty,
       (coalesce(oh.on_hand, 0) - coalesce(r.reserved, 0)) <= p.min_stock_qty as is_low,
       p.brand_id,
       (coalesce(oh.on_hand, 0) - coalesce(r.reserved, 0)) <= 0 as is_out
  from public.products p
  left join (select product_id, sum(on_hand) as on_hand from public.stock_on_hand group by product_id) oh
         on oh.product_id = p.id
  left join public.stock_reserved r on r.product_id = p.id
 where public.is_active_user()
   and p.brand_id = any (public.my_brand_ids());

-- Every movement with the balance before and after it (per product and warehouse).
create or replace view public.stock_ledger with (security_barrier = true) as
select sm.id, sm.created_at, sm.movement_date, sm.brand_id, b.name as brand_name,
       sm.product_id, p.name as product_name, p.sku,
       sm.warehouse_id, w.name as warehouse_name,
       sm.movement_type, sm.qty, sm.reference_type, sm.reference_id, sm.reference_no, sm.reason, sm.notes,
       sm.created_by, pr.full_name as created_by_name,
       sum(sm.qty) over (partition by sm.product_id, sm.warehouse_id order by sm.created_at, sm.id) - sm.qty as balance_before,
       sum(sm.qty) over (partition by sm.product_id, sm.warehouse_id order by sm.created_at, sm.id) as balance_after
  from public.stock_movements sm
  join public.products p on p.id = sm.product_id
  join public.brands b on b.id = sm.brand_id
  join public.warehouses w on w.id = sm.warehouse_id
  left join public.profiles pr on pr.id = sm.created_by
 where public.has_role('super_admin', 'manager', 'billing', 'warehouse')
   and sm.brand_id = any (public.my_brand_ids());
grant select on public.stock_ledger to authenticated;
revoke all on public.stock_ledger from anon;

-- -----------------------------------------------------------------------------
-- 13. Reorder list (Purchases): goods arrive lead_days after ordering
-- -----------------------------------------------------------------------------
alter table public.company_settings
  add column if not exists reorder_lead_days integer not null default 8 check (reorder_lead_days between 0 and 180),
  add column if not exists reorder_cover_days integer not null default 30 check (reorder_cover_days between 1 and 365);

-- avg_daily = units invoiced in the last 30 days / 30
-- reorder when available + on order <= max(minimum stock, avg_daily × lead days)
-- suggested qty brings stock up to max(2 × minimum, avg_daily × (lead + cover days))
create or replace function public.reorder_suggestions(p_brand uuid)
returns table (
  product_id uuid, name text, sku text, category_name text, unit_code text,
  available numeric, on_order numeric, min_stock_qty numeric, sold_30d numeric, avg_daily numeric,
  days_left numeric, reorder_point numeric, suggested_qty numeric, unit_cost numeric, cost_mode public.price_tax_mode,
  supplier_id uuid, supplier_name text, lead_days integer, urgency text
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_lead  integer;
  v_cover integer;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if not public.has_role('super_admin', 'manager', 'billing') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if not public.can_access_brand(p_brand) then
    raise exception 'You do not have access to this brand' using errcode = '42501';
  end if;
  select reorder_lead_days, reorder_cover_days into v_lead, v_cover from public.company_settings where id = 1;
  v_lead := coalesce(v_lead, 8); v_cover := coalesce(v_cover, 30);

  return query
  with prod as (
    select p.* from public.products p where p.brand_id = p_brand and p.is_active
  ), onhand as (
    select sm.product_id, sum(sm.qty) as q from public.stock_movements sm where sm.brand_id = p_brand group by sm.product_id
  ), reserved as (
    select il.product_id, sum(il.qty) as q
      from public.invoice_lines il join public.invoices i on i.id = il.invoice_id
      left join public.dispatches d on d.invoice_id = i.id
     where i.status = 'issued' and i.brand_id = p_brand and (d.id is null or d.status = 'picking')
     group by il.product_id
  ), sold as (
    select il.product_id, sum(il.qty) as q
      from public.invoice_lines il join public.invoices i on i.id = il.invoice_id
     where i.status = 'issued' and i.brand_id = p_brand and i.invoice_date > v_today - 30
     group by il.product_id
  ), ordered as (
    select pl.product_id, sum(pl.qty) as q
      from public.purchase_lines pl join public.purchases pu on pu.id = pl.purchase_id
     where pu.status = 'ordered' and pu.brand_id = p_brand
     group by pl.product_id
  ), last_sup as (
    select distinct on (pl.product_id) pl.product_id, pu.supplier_id
      from public.purchase_lines pl join public.purchases pu on pu.id = pl.purchase_id
     where pu.brand_id = p_brand and pu.status <> 'cancelled'
     order by pl.product_id, pu.order_date desc, pu.created_at desc
  ), calc as (
    select pr.id, pr.name, pr.sku, c.name as cat, pr.unit_code,
           coalesce(oh.q, 0) - coalesce(rs.q, 0) as avail,
           coalesce(od.q, 0) as on_ord,
           pr.min_stock_qty as mn,
           coalesce(sd.q, 0) as s30,
           round(coalesce(sd.q, 0) / 30.0, 3) as daily,
           pr.purchase_cost, pr.purchase_cost_mode,
           coalesce(ls.supplier_id, (select s.id from public.suppliers s where s.brand_id = p_brand and s.is_active order by s.created_at limit 1)) as sup
      from prod pr
      left join public.categories c on c.id = pr.category_id
      left join onhand oh on oh.product_id = pr.id
      left join reserved rs on rs.product_id = pr.id
      left join sold sd on sd.product_id = pr.id
      left join ordered od on od.product_id = pr.id
      left join last_sup ls on ls.product_id = pr.id
  )
  select x.id, x.name, x.sku, x.cat, x.unit_code,
         x.avail, x.on_ord, x.mn, x.s30, x.daily,
         case when x.daily > 0 then round(x.avail / x.daily, 1) end,
         greatest(x.mn, ceil(x.daily * coalesce(s.lead_days, v_lead))),
         greatest(ceil(greatest(2 * x.mn, x.daily * (coalesce(s.lead_days, v_lead) + v_cover)) - x.avail - x.on_ord), 1),
         x.purchase_cost, x.purchase_cost_mode,
         x.sup, s.name, coalesce(s.lead_days, v_lead),
         case when x.avail <= 0 then 'out'
              when x.daily > 0 and x.avail / x.daily < coalesce(s.lead_days, v_lead) then 'urgent'
              else 'low' end
    from calc x
    left join public.suppliers s on s.id = x.sup
   where x.avail + x.on_ord <= greatest(x.mn, ceil(x.daily * coalesce(s.lead_days, v_lead)))
     and (x.mn > 0 or x.daily > 0 or x.avail <= 0)
   order by case when x.avail <= 0 then 0 when x.daily > 0 and x.avail / x.daily < coalesce(s.lead_days, v_lead) then 1 else 2 end,
            x.name;
end $$;
revoke all on function public.reorder_suggestions(uuid) from public, anon;
grant execute on function public.reorder_suggestions(uuid) to authenticated;
