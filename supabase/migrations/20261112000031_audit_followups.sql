-- =============================================================================
-- 0031: the last three items from the November 2026 architecture audit.
--
--  1. guard_invoice_update (findings 12 and 18). The function is stated here in
--     full, with its search path inside the definition.
--
--     Why it was reported as unsafe in the live database: 0001 created it, 0006
--     set its search path, and 0016 then re-created it with CREATE OR REPLACE.
--     That command keeps nothing it is not given, so the search path set in
--     0006 was silently dropped and the live function has had a mutable one
--     ever since. 0023 sets it again, from the side, which leaves the same trap
--     for the next person who re-creates the function. Stating SET search_path
--     as part of the definition is the only form that cannot be lost this way.
--     The body is unchanged: this migration stops unless the logic is identical
--     before and after.
--
--  2. retailer_directory gains classified_at. The retailer page has a
--     "Classified" line that reads this column, and the view never selected it,
--     so the line has never appeared. The column exists on the table and is
--     already shown as a label (classification); only the date was missing.
--     Added at the end, which is what CREATE OR REPLACE VIEW allows.
--
--  3. number_series and share_links are recorded as deliberately having row
--     level security with no policy, so the Supabase linter's note on them is
--     not mistaken for an unfinished job. No policy means no direct access
--     through the API, which is what these two need: they are written only by
--     owner-rights functions (document numbering, and the public /d share
--     links). Adding a policy would open a door, not close one.
--
-- Rollback: supabase/rollback/20261112000031_to_0030_down.sql
-- =============================================================================

-- 1 ---------------------------------------------------------------- the guard
create or replace function public.guard_invoice_update()
returns trigger
language plpgsql
set search_path = public
as $function$
declare v_free text[] := array['status','cancelled_at','cancelled_by','cancel_reason'];
begin
  if current_setting('apex.invoice_terms_change', true) = 'on' then
    v_free := v_free || array['credit_days','due_date'];
  end if;
  if (to_jsonb(new) - v_free) is distinct from (to_jsonb(old) - v_free) then
    raise exception 'Issued invoices cannot be edited; use cancellation or a credit note' using errcode = 'P0001';
  end if;
  if old.status = 'cancelled' then
    raise exception 'Invoice % is already cancelled', old.invoice_no using errcode = 'P0001';
  end if;
  return new;
end $function$;

-- 2 ------------------------------------------------------------- the view
create or replace view public.retailer_directory
with (security_invoker = true) as
 select r.id,
    r.code,
    r.shop_name,
    r.owner_name,
    r.mobile,
    r.alt_mobile,
    r.gstin,
    r.billing_address,
    r.billing_city,
    r.billing_state_code,
    r.billing_pincode,
    r.delivery_address,
    r.delivery_city,
    r.delivery_pincode,
    r.salesman_id,
    r.route_id,
    r.route_sequence,
    r.credit_days,
    r.credit_limit,
    r.status,
    r.classification,
    r.notes,
    r.created_by,
    r.created_at,
    r.updated_at,
    rt.name as route_name,
    s.full_name as salesman_name,
    r.search_text,
    r.classified_at
   from retailers r
     left join routes rt on rt.id = r.route_id
     left join profiles s on s.id = r.salesman_id;

-- 3 ------------------------------------------------------------ the two notes
comment on table public.number_series is
  'Document numbering. Row level security on, no policy, on purpose: reached only through owner-rights functions, never directly from the API.';
comment on table public.share_links is
  'Public share links for documents (/d/<token>). Row level security on, no policy, on purpose: reached only through owner-rights functions, never directly from the API.';

-- verification ---------------------------------------------------------------
do $$
declare v_logic text;
begin
  -- The body above must be the body that 0016 left running, character for
  -- character once comments and spacing are set aside. The hash is recorded
  -- here rather than read from the database, so the repository alone says what
  -- the function should be. If someone edits the body, this stops the
  -- migration: changing the logic is a separate migration, with its own note.
  select md5(regexp_replace(regexp_replace(prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g'))
    into v_logic from pg_proc where oid = 'public.guard_invoice_update()'::regprocedure;
  if v_logic is distinct from 'dc368e1ac53db216c470351a70a7937c' then
    raise exception '0031: guard_invoice_update body is not the one this migration expects (got %)', v_logic;
  end if;

  if not exists (select 1 from pg_proc
                  where oid = 'public.guard_invoice_update()'::regprocedure
                    and proconfig @> array['search_path=public']) then
    raise exception '0031: guard_invoice_update has no fixed search path';
  end if;

  if not exists (select 1 from pg_attribute
                  where attrelid = 'public.retailer_directory'::regclass
                    and attname = 'classified_at' and attnum > 0) then
    raise exception '0031: retailer_directory does not expose classified_at';
  end if;

  if not exists (select 1 from pg_class
                  where oid = 'public.retailer_directory'::regclass
                    and reloptions @> array['security_invoker=true']) then
    raise exception '0031: retailer_directory must keep security_invoker';
  end if;

  -- the trigger that uses the function must still be attached
  if not exists (select 1 from pg_trigger
                  where tgrelid = 'public.invoices'::regclass and not tgisinternal
                    and tgfoid = 'public.guard_invoice_update()'::regprocedure) then
    raise exception '0031: the invoice guard trigger is missing';
  end if;
end $$;
