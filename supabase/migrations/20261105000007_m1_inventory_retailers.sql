-- =============================================================================
-- APEX DMS — M1: inventory rules, stock counts, valuation, retailer checks
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Stock movement guard
--    * serialises movements per product (row lock) so two users cannot both
--      take the last unit
--    * stock in a warehouse can never go below zero
--    * adjustments and damage need a reason
--    * inbound cost defaults to the product's purchase cost (excl. GST), so
--      warehouse staff never see or type costs
-- -----------------------------------------------------------------------------
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
begin
  select purchase_cost, purchase_cost_mode, gst_rate, name
    into v_cost, v_mode, v_gst, v_name
    from public.products where id = new.product_id
     for update;

  if new.movement_type in ('adjustment', 'damage') and coalesce(trim(new.reason), '') = '' then
    raise exception 'A reason is required for % entries', new.movement_type using errcode = 'P0001';
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

create trigger stock_movements_guard
  before insert on public.stock_movements
  for each row execute function public.stock_movement_before_insert();

-- -----------------------------------------------------------------------------
-- 2. Warehouse transfer: one call, two linked movements (out + in)
--    Runs as the caller, so the normal stock_movements insert policy applies.
-- -----------------------------------------------------------------------------
create or replace function public.transfer_stock(
  p_product_id uuid,
  p_from_warehouse uuid,
  p_to_warehouse uuid,
  p_qty numeric,
  p_reason text default null,
  p_to_location uuid default null
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_group uuid := gen_random_uuid();
begin
  if p_qty is null or p_qty <= 0 then
    raise exception 'Transfer quantity must be more than zero' using errcode = 'P0001';
  end if;
  if p_from_warehouse = p_to_warehouse then
    raise exception 'Choose two different warehouses' using errcode = 'P0001';
  end if;

  insert into public.stock_movements (product_id, warehouse_id, movement_type, qty, transfer_group, reason)
  values (p_product_id, p_from_warehouse, 'transfer_out', -p_qty, v_group, p_reason);

  insert into public.stock_movements (product_id, warehouse_id, location_id, movement_type, qty, transfer_group, reason)
  values (p_product_id, p_to_warehouse, p_to_location, 'transfer_in', p_qty, v_group, p_reason);

  return v_group;
end $$;
revoke all on function public.transfer_stock(uuid, uuid, uuid, numeric, text, uuid) from public, anon;
grant execute on function public.transfer_stock(uuid, uuid, uuid, numeric, text, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Physical stock counts
--    draft (count sheet) -> submitted -> approved (posts reconciliation) | cancelled
--    Blank counted_qty = not counted, ignored on approval.
-- -----------------------------------------------------------------------------
alter table public.stock_count_lines alter column counted_qty drop not null;

create or replace function public.start_stock_count(p_warehouse_id uuid, p_notes text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
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
   where p.is_active;

  return v_id;
end $$;

create or replace function public.approve_stock_count(p_count_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count   public.stock_counts%rowtype;
  v_line    record;
  v_current numeric;
  v_posted  integer := 0;
begin
  if not public.has_role('super_admin', 'manager') then
    raise exception 'Only a Manager or Super Administrator can approve a stock count' using errcode = '42501';
  end if;

  select * into v_count from public.stock_counts where id = p_count_id for update;
  if not found then raise exception 'Stock count not found' using errcode = 'P0002'; end if;
  if v_count.status <> 'submitted' then
    raise exception 'Only a submitted count can be approved (this one is %)', v_count.status using errcode = 'P0001';
  end if;

  for v_line in
    select * from public.stock_count_lines where count_id = p_count_id and counted_qty is not null
  loop
    -- Compare with stock as it is now, so movements made after the count started are respected.
    perform 1 from public.products where id = v_line.product_id for update;
    select coalesce(sum(qty), 0) into v_current
      from public.stock_movements
     where product_id = v_line.product_id and warehouse_id = v_count.warehouse_id;

    update public.stock_count_lines set system_qty = v_current where id = v_line.id;

    if v_line.counted_qty - v_current <> 0 then
      insert into public.stock_movements (product_id, warehouse_id, location_id, movement_type, qty,
                                          reference_type, reference_id, reason)
      values (v_line.product_id, v_count.warehouse_id, v_line.location_id, 'reconciliation',
              v_line.counted_qty - v_current, 'stock_count', p_count_id, 'Physical stock count');
      v_posted := v_posted + 1;
    end if;
  end loop;

  update public.stock_counts
     set status = 'approved', approved_by = auth.uid(), approved_at = now()
   where id = p_count_id;

  return v_posted;
end $$;

revoke all on function public.start_stock_count(uuid, text) from public, anon;
revoke all on function public.approve_stock_count(uuid) from public, anon;
grant execute on function public.start_stock_count(uuid, text), public.approve_stock_count(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Inventory valuation at weighted average purchase cost (excl. GST)
--    security_invoker: only roles that can read products (Admin, Manager,
--    Billing) get rows.
-- -----------------------------------------------------------------------------
create or replace view public.inventory_valuation
with (security_invoker = true) as
select p.id as product_id, p.name, p.sku, p.brand_id, b.name as brand_name,
       coalesce(sum(sm.qty), 0) as on_hand,
       coalesce(
         sum(sm.qty * sm.unit_cost) filter (where sm.movement_type in ('opening', 'stock_in') and sm.unit_cost is not null)
           / nullif(sum(sm.qty) filter (where sm.movement_type in ('opening', 'stock_in') and sm.unit_cost is not null), 0),
         case when p.purchase_cost_mode = 'inclusive' then p.purchase_cost / (1 + p.gst_rate / 100) else p.purchase_cost end
       )::numeric(12,2) as avg_cost,
       (coalesce(sum(sm.qty), 0) * coalesce(
         sum(sm.qty * sm.unit_cost) filter (where sm.movement_type in ('opening', 'stock_in') and sm.unit_cost is not null)
           / nullif(sum(sm.qty) filter (where sm.movement_type in ('opening', 'stock_in') and sm.unit_cost is not null), 0),
         case when p.purchase_cost_mode = 'inclusive' then p.purchase_cost / (1 + p.gst_rate / 100) else p.purchase_cost end
       ))::numeric(14,2) as stock_value
  from public.products p
  join public.brands b on b.id = p.brand_id
  left join public.stock_movements sm on sm.product_id = p.id
 group by p.id, b.name;

grant select on public.inventory_valuation to authenticated;
revoke all on public.inventory_valuation from anon;

-- -----------------------------------------------------------------------------
-- 5. Retailer clean-up on save: trimmed names, upper-case GSTIN, state code
--    taken from the GSTIN.
-- -----------------------------------------------------------------------------
create or replace function public.retailer_normalise()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.shop_name := trim(new.shop_name);
  new.owner_name := nullif(trim(coalesce(new.owner_name, '')), '');
  new.gstin := nullif(upper(replace(coalesce(new.gstin, ''), ' ', '')), '');
  if new.gstin is not null then
    new.billing_state_code := left(new.gstin, 2);
  end if;
  new.billing_city := nullif(trim(coalesce(new.billing_city, '')), '');
  return new;
end $$;

create trigger retailers_normalise
  before insert or update on public.retailers
  for each row execute function public.retailer_normalise();

-- -----------------------------------------------------------------------------
-- 6. Duplicate retailer check, used before saving (incl. "create retailer from
--    New Order" in M2). Returns minimal details so a salesman learns a shop
--    already exists without seeing other routes' data.
-- -----------------------------------------------------------------------------
create or replace function public.find_retailer_duplicates(
  p_mobile text,
  p_gstin text default null,
  p_shop_name text default null,
  p_city text default null,
  p_exclude_id uuid default null
) returns table (id uuid, code text, shop_name text, city text, mobile_hint text, reason text)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select r.id, r.code, r.shop_name, r.billing_city,
         '******' || right(r.mobile, 4),
         case
           when nullif(p_mobile, '') is not null and (r.mobile = p_mobile or r.alt_mobile = p_mobile) then 'Same mobile number'
           when nullif(upper(p_gstin), '') is not null and r.gstin = upper(p_gstin) then 'Same GSTIN'
           else 'Similar shop name'
         end
    from public.retailers r
   where public.is_active_user()
     and (p_exclude_id is null or r.id <> p_exclude_id)
     and (
       (nullif(p_mobile, '') is not null and (r.mobile = p_mobile or r.alt_mobile = p_mobile))
       or (nullif(upper(p_gstin), '') is not null and r.gstin = upper(p_gstin))
       or (nullif(trim(p_shop_name), '') is not null
           and extensions.similarity(lower(r.shop_name), lower(trim(p_shop_name))) >= 0.55
           and (nullif(trim(p_city), '') is null or r.billing_city is null
                or lower(r.billing_city) = lower(trim(p_city))))
     )
   order by 6, 3
   limit 10
$$;
revoke all on function public.find_retailer_duplicates(text, text, text, text, uuid) from public, anon;
grant execute on function public.find_retailer_duplicates(text, text, text, text, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 7. Retailer list with assignment names, for the retailer screens.
-- -----------------------------------------------------------------------------
create or replace view public.retailer_directory
with (security_invoker = true) as
select r.*, rt.name as route_name, s.full_name as salesman_name
  from public.retailers r
  left join public.routes rt on rt.id = r.route_id
  left join public.profiles s on s.id = r.salesman_id;

grant select on public.retailer_directory to authenticated;
revoke all on public.retailer_directory from anon;
