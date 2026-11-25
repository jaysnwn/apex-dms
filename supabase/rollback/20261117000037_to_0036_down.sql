-- =============================================================================
-- ROLLBACK of 0037 back to 0036. Run as ONE transaction.
-- Restores the 0036 stock movement guard (owner and grants are unchanged).
-- =============================================================================
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

  -- The product's brand decides the movement's brand. A shared warehouse
  -- (no brand) takes every brand; a brand warehouse only its own.
  new.brand_id := v_brand;
  if v_wh_brand is not null and v_wh_brand <> v_brand then
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
