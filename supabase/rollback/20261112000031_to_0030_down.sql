-- =============================================================================
-- ROLLBACK of 0031 back to 0030. Run as ONE transaction.
--
-- Puts guard_invoice_update back exactly as 0016 left it, which means with no
-- search path of its own (0023 then set one from the side; run 0023's line
-- again afterwards if you are rolling back only 0031). The body is written out
-- in full here for the same reason it is written out in the migration: the
-- repository, not the database, says what the code is.
--
-- Also removes classified_at from retailer_directory.
-- =============================================================================
create or replace function public.guard_invoice_update()
returns trigger
language plpgsql
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

-- CREATE OR REPLACE VIEW cannot drop a column, so the view is rebuilt.
drop view public.retailer_directory;
create view public.retailer_directory
with (security_invoker = true) as
 select r.id, r.code, r.shop_name, r.owner_name, r.mobile, r.alt_mobile, r.gstin,
    r.billing_address, r.billing_city, r.billing_state_code, r.billing_pincode,
    r.delivery_address, r.delivery_city, r.delivery_pincode, r.salesman_id,
    r.route_id, r.route_sequence, r.credit_days, r.credit_limit, r.status,
    r.classification, r.notes, r.created_by, r.created_at, r.updated_at,
    rt.name as route_name, s.full_name as salesman_name, r.search_text
   from retailers r
     left join routes rt on rt.id = r.route_id
     left join profiles s on s.id = r.salesman_id;
grant select on public.retailer_directory to authenticated;
revoke all on public.retailer_directory from anon;

comment on table public.number_series is null;
comment on table public.share_links is null;
