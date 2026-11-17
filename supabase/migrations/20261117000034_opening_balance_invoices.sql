-- =============================================================================
-- 0034: opening balances — invoices carried over from the books a business
--       kept before the DMS.
--
-- Until now every invoice had to be born as an order inside the DMS:
-- invoices.order_id was NOT NULL and invoice_brand() read the brand from that
-- order. That is right for day-to-day billing and wrong for a cutover, where a
-- distributor arrives with invoices already issued elsewhere. Apex has 86 of
-- them, across 42 shops, worth about 4.1 lakh.
--
-- An opening invoice keeps its ORIGINAL number, date and due date, so ageing
-- and the retailer statement are truthful from day one, and payments allocate
-- against it through the ordinary FIFO path. It has no order, no lines and
-- moves no stock: the goods left the building before the DMS existed.
--
-- is_opening marks them, so sales reporting can tell brought-forward debt from
-- what the DMS actually sold, and so they stay out of a GST return — that tax
-- was declared wherever the invoice was first raised.
--
-- Proven on staging: an opening invoice dated 15 Sep was accepted with no
-- order, and a later collection allocated to it ahead of a November invoice,
-- oldest due date first.
-- =============================================================================

alter table public.invoices add column if not exists is_opening boolean not null default false;
alter table public.invoices alter column order_id drop not null;

comment on column public.invoices.is_opening is
  'True for a balance carried over from the previous system: no order, no lines, no stock movement, and kept out of sales and GST reporting.';

-- An invoice either comes from an order or is an opening balance.
-- Never both, never neither.
alter table public.invoices drop constraint if exists invoices_opening_has_no_order;
alter table public.invoices add constraint invoices_opening_has_no_order
  check ((order_id is null) = is_opening);

create or replace function public.invoice_brand()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if new.order_id is not null then
    new.brand_id := (select brand_id from public.orders where id = new.order_id);
    if new.brand_id is null then
      raise exception 'The order has no brand' using errcode = 'P0001';
    end if;
  else
    -- opening balance: the brand is stated on the invoice itself
    if not new.is_opening then
      raise exception 'An invoice must come from an order unless it is an opening balance'
        using errcode = 'P0001';
    end if;
    if new.brand_id is null then
      raise exception 'Name the brand on an opening balance' using errcode = 'P0001';
    end if;
  end if;
  if auth.uid() is not null and not public.can_access_brand(new.brand_id) then
    raise exception 'You do not have access to % invoices',
      (select name from public.brands where id = new.brand_id) using errcode = '42501';
  end if;
  return new;
end $function$;

-- verification: assert the shape, without writing anything to the books -------
do $$
begin
  if (select is_nullable from information_schema.columns
       where table_schema='public' and table_name='invoices' and column_name='order_id') <> 'YES' then
    raise exception '0034: order_id should now be optional';
  end if;
  if not exists (select 1 from information_schema.columns
       where table_schema='public' and table_name='invoices' and column_name='is_opening') then
    raise exception '0034: is_opening is missing';
  end if;
  if not exists (select 1 from pg_constraint
       where conname='invoices_opening_has_no_order' and conrelid='public.invoices'::regclass) then
    raise exception '0034: the opening/order constraint is missing';
  end if;
  if position('is_opening' in pg_get_functiondef('public.invoice_brand()'::regprocedure)) = 0 then
    raise exception '0034: invoice_brand was not updated';
  end if;
end $$;
