-- =============================================================================
-- ROLLBACK of 0035 back to 0034. Run as ONE transaction.
-- A warehouse shared by both brands (brand_id empty) cannot exist before 0035:
-- give it a brand first, or this stops.
-- =============================================================================
do $$ begin
  if exists (select 1 from public.warehouses where brand_id is null) then
    raise exception 'Rollback 0035: a warehouse has no brand (shared). Give it a brand first.';
  end if;
end $$;
drop function if exists public.start_stock_count(uuid, text, uuid);
CREATE OR REPLACE FUNCTION public.warehouse_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end $function$
;

CREATE OR REPLACE FUNCTION public.product_brand_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end $function$
;

CREATE OR REPLACE FUNCTION public.stock_movement_before_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end $function$
;

CREATE OR REPLACE FUNCTION public.purchase_brand()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end $function$
;

CREATE OR REPLACE FUNCTION public.stock_count_brand()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  new.brand_id := (select brand_id from public.warehouses where id = new.warehouse_id);
  if auth.uid() is not null and not public.can_access_brand(new.brand_id) then
    raise exception 'You do not have access to this brand' using errcode = '42501';
  end if;
  return new;
end $function$
;

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

CREATE OR REPLACE FUNCTION public.save_purchase(p_purchase_id uuid, p_supplier_id uuid, p_warehouse_id uuid, p_order_date date, p_expected_date date, p_credit_days integer, p_other_charges numeric, p_notes text, p_lines jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end $function$
;

revoke all on function public.start_stock_count(uuid, text) from public, anon;
grant execute on function public.start_stock_count(uuid, text) to authenticated, service_role;
grant create on schema public to app_definer;
alter function public.start_stock_count(uuid, text) owner to app_definer;
revoke create on schema public from app_definer;
drop policy if exists warehouses_select on public.warehouses;
create policy warehouses_select on public.warehouses as PERMISSIVE for SELECT to authenticated using (((tenant_id = ( SELECT current_tenant_id() AS current_tenant_id)) AND (( SELECT is_active_user() AS is_active_user) AND (brand_id = ANY (( SELECT my_brand_ids() AS my_brand_ids)::uuid[])))));
drop policy if exists warehouses_insert on public.warehouses;
create policy warehouses_insert on public.warehouses as PERMISSIVE for INSERT to authenticated with check (((tenant_id = ( SELECT current_tenant_id() AS current_tenant_id)) AND (( SELECT has_role(VARIADIC ARRAY['super_admin'::app_role, 'manager'::app_role]) AS has_role) AND (brand_id = ANY (( SELECT my_brand_ids() AS my_brand_ids)::uuid[])))));
drop policy if exists warehouses_update on public.warehouses;
create policy warehouses_update on public.warehouses as PERMISSIVE for UPDATE to authenticated using (((tenant_id = ( SELECT current_tenant_id() AS current_tenant_id)) AND (( SELECT has_role(VARIADIC ARRAY['super_admin'::app_role, 'manager'::app_role]) AS has_role) AND (brand_id = ANY (( SELECT my_brand_ids() AS my_brand_ids)::uuid[]))))) with check (((tenant_id = ( SELECT current_tenant_id() AS current_tenant_id)) AND (( SELECT has_role(VARIADIC ARRAY['super_admin'::app_role, 'manager'::app_role]) AS has_role) AND (brand_id = ANY (( SELECT my_brand_ids() AS my_brand_ids)::uuid[])))));
alter table public.warehouses alter column brand_id set not null;
