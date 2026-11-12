-- =============================================================================
-- ROLLBACK of 0032 back to 0031. Run as ONE transaction.
-- Puts calc_line back to working an inclusive price out in two steps, exactly
-- as migration 0008 wrote it. Note what this brings back: seven of a 14.50
-- line inclusive of 12% returns to 90.62 taxable, a paisa under the exact
-- 90.625, and the browser preview (lib/gst.ts) disagrees with the database
-- again on that line and six others. Invoices issued meanwhile keep their
-- stored amounts either way.
-- =============================================================================
create or replace function public.calc_line(
  p_qty numeric, p_price numeric, p_mode public.price_tax_mode,
  p_discount_pct numeric, p_rate numeric)
returns table(gross numeric, discount numeric, taxable numeric, tax numeric)
language sql immutable
set search_path = public
as $function$
  with b as (
    select round(p_qty * case when p_mode = 'inclusive' then p_price / (1 + p_rate / 100) else p_price end, 2) as g
  ), d as (
    select g, round(g * coalesce(p_discount_pct, 0) / 100, 2) as disc from b
  )
  select g, disc, g - disc, round((g - disc) * p_rate / 100, 2) from d
$function$;

do $$
declare v_gross numeric;
begin
  select gross into v_gross from public.calc_line(7, 14.50, 'inclusive', 0, 12);
  if v_gross <> 90.62 then
    raise exception 'rollback 0032: expected the two-step 90.62 back, got %', v_gross;
  end if;
end $$;
