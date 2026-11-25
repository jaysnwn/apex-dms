-- =============================================================================
-- ROLLBACK of 0034 back to 0033. Run as ONE transaction.
-- Opening-balance invoices (carried over from the previous system, no order)
-- cannot exist before 0034: this stops if there are any.
-- =============================================================================
do $$ begin
  if exists (select 1 from public.invoices where order_id is null or is_opening) then
    raise exception 'Rollback 0034: opening-balance invoices exist. Remove them first.';
  end if;
end $$;
alter table public.invoices drop constraint if exists invoices_opening_has_no_order;
CREATE OR REPLACE FUNCTION public.invoice_brand()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  new.brand_id := (select brand_id from public.orders where id = new.order_id);
  if new.brand_id is null then raise exception 'The order has no brand' using errcode = 'P0001'; end if;
  if auth.uid() is not null and not public.can_access_brand(new.brand_id) then
    raise exception 'You do not have access to % invoices', (select name from public.brands where id = new.brand_id) using errcode = '42501';
  end if;
  return new;
end $function$
;

alter table public.invoices alter column order_id set not null;
alter table public.invoices drop column if exists is_opening;
