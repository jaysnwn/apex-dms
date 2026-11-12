-- =============================================================================
-- 0032: the GST on an inclusive-priced line, to the exact paisa
--       (audit finding 16: the GST maths exists twice and the two can drift)
--
-- calc_line worked an inclusive price out in two steps: first the price
-- without tax, then that times the quantity.
--
--   round(p_qty * (p_price / (1 + p_rate / 100)), 2)
--
-- The first step is a division that rarely ends. Postgres keeps 16 decimal
-- places of it and drops the rest, and multiplying afterwards turns those
-- dropped places into a missing paisa. Seven of a 14.50 line, inclusive of
-- 12%:
--
--   exact:     7 * 14.50 / 1.12  = 101.50 / 1.12 = 90.625        -> 90.63
--   two steps: 14.50 / 1.12      = 12.9464285714285714
--              7 * that          = 90.6249999999999998           -> 90.62
--
-- 90.625 is the taxable value, and rounded to the nearest paisa it is 90.63.
-- The line now divides once, at the end, so nothing is dropped on the way:
--
--   round(p_qty * p_price / (1 + p_rate / 100), 2)
--
-- Nothing else about the function changes, and an exclusive-priced line is
-- untouched (it does no division at all). Across every line the columns can
-- hold -- 10,780 of them, see tests/parity/gst.sh -- 7 come out a paisa
-- higher than before, every one of them inclusive-priced, and each is now the
-- exact value. Invoices already issued keep the amounts they were issued
-- with: they are stored, not worked out again.
--
-- This is also what lets the browser preview agree with the database to the
-- paisa, which it now does on all 10,780 (lib/gst.ts, same test).
--
-- Rollback: supabase/rollback/20261112000032_to_0031_down.sql
-- =============================================================================

create or replace function public.calc_line(
  p_qty numeric, p_price numeric, p_mode public.price_tax_mode,
  p_discount_pct numeric, p_rate numeric)
returns table(gross numeric, discount numeric, taxable numeric, tax numeric)
language sql immutable
set search_path = public
as $function$
  with b as (
    select round(case when p_mode = 'inclusive'
                      then p_qty * p_price / (1 + p_rate / 100)
                      else p_qty * p_price end, 2) as g
  ), d as (
    select g, round(g * coalesce(p_discount_pct, 0) / 100, 2) as disc from b
  )
  select g, disc, g - disc, round((g - disc) * p_rate / 100, 2) from d
$function$;

-- verification ---------------------------------------------------------------
do $$
declare v_gross numeric; v_tax numeric;
begin
  -- the line from the note above: seven of 14.50, inclusive of 12%
  select gross into v_gross from public.calc_line(7, 14.50, 'inclusive', 0, 12);
  if v_gross <> 90.63 then
    raise exception '0032: 7 of a 14.50 line inclusive of 12%% should be 90.63 taxable, got %', v_gross;
  end if;

  -- an exclusive line is not affected: 7 * 14.50 = 101.50, tax 12% = 12.18
  select gross, tax into v_gross, v_tax from public.calc_line(7, 14.50, 'exclusive', 0, 12);
  if v_gross <> 101.50 or v_tax <> 12.18 then
    raise exception '0032: an exclusive line changed: gross %, tax %', v_gross, v_tax;
  end if;

  -- a line that divides evenly is unchanged either way: 2 of 118.00 at 18%
  select gross into v_gross from public.calc_line(2, 118.00, 'inclusive', 0, 18);
  if v_gross <> 200.00 then
    raise exception '0032: 2 of a 118.00 line inclusive of 18%% should be 200.00 taxable, got %', v_gross;
  end if;

  if not exists (select 1 from pg_proc
                  where oid = 'public.calc_line(numeric,numeric,public.price_tax_mode,numeric,numeric)'::regprocedure
                    and proconfig @> array['search_path=public'] and provolatile = 'i') then
    raise exception '0032: calc_line must stay immutable with a fixed search path';
  end if;
end $$;
