-- =============================================================================
-- APEX DMS — Fast billing rules
--   * categories: display order, delete when unused
--   * confirm_order: optional stock override (Super Admin / Manager only)
--   * save_quotation: price changes only by Super Admin / Manager; Billing staff
--     limited to billing_max_discount, salesmen to salesman_max_discount
--   * invoices: GST-mandatory buyer details checked before an invoice exists
--   * change_invoice_terms: Super Admin / Manager can change an issued invoice's
--     credit period (due date follows); nothing else on an invoice can change
-- =============================================================================

-- 1. Categories -----------------------------------------------------------------
alter table public.categories add column if not exists sort_order integer not null default 0;
with o as (select id, row_number() over (partition by brand_id order by name) * 10 as n from public.categories)
update public.categories c set sort_order = o.n from o where o.id = c.id and c.sort_order = 0;

-- New categories go to the end of their brand's list.
create or replace function public.category_sort_default()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.sort_order, 0) = 0 then
    new.sort_order := coalesce((select max(sort_order) from public.categories where brand_id = new.brand_id), 0) + 10;
  end if;
  return new;
end $$;
revoke all on function public.category_sort_default() from public, anon, authenticated;
drop trigger if exists categories_sort_default on public.categories;
create trigger categories_sort_default before insert on public.categories
  for each row execute function public.category_sort_default();

-- Products keep their category: a category in use cannot be deleted (foreign key),
-- the screen offers "move products to …" first.
drop policy if exists categories_delete on public.categories;
create policy categories_delete on public.categories for delete to authenticated
  using ((select public.has_role('super_admin', 'manager')) and brand_id = any ((select public.my_brand_ids())::uuid[]));

-- 2. Discount authority -----------------------------------------------------------
alter table public.company_settings
  add column if not exists billing_max_discount numeric(5,2) not null default 10 check (billing_max_discount between 0 and 100);

do $$
declare v_src text := pg_get_functiondef('public.save_quotation(uuid, uuid, integer, text, jsonb, uuid)'::regprocedure);
  r text[][] := array[
    array['  v_max    numeric;', E'  v_max    numeric;\n  v_bmax   numeric;'],
    array['select salesman_max_discount into v_max from public.company_settings where id = 1;',
          'select salesman_max_discount, billing_max_discount into v_max, v_bmax from public.company_settings where id = 1;'],
    array['if v_role in (''super_admin'', ''manager'', ''billing'') and nullif(v_line ->> ''unit_price'', '''') is not null then',
          'if v_role in (''super_admin'', ''manager'') and nullif(v_line ->> ''unit_price'', '''') is not null then'],
    array['if v_role = ''salesman'' and v_disc > v_max then',
          'if (v_role = ''salesman'' and v_disc > v_max) or (v_role = ''billing'' and v_disc > v_bmax) then'],
    array['''Salesmen can give at most % percent discount (line: %)'', trim_scale(v_max)',
          '''You can give at most % percent discount (line: %)'', trim_scale(case when v_role = ''billing'' then v_bmax else v_max end)']
  ];
  i int;
begin
  for i in 1 .. array_length(r, 1) loop
    if position(r[i][1] in v_src) = 0 then raise exception 'save_quotation body changed near: %', r[i][1]; end if;
    v_src := replace(v_src, r[i][1], r[i][2]);
  end loop;
  execute v_src;
end $$;

-- 3. Stock override on confirm_order ---------------------------------------------
do $$
declare
  v_src text := pg_get_functiondef('public.confirm_order(uuid, boolean)'::regprocedure);
  v_head text := 'public.confirm_order(p_order_id uuid, p_override_credit boolean DEFAULT false)';
  v_check text := 'if v_short is not null then';
begin
  if position(v_head in v_src) = 0 or position(v_check in v_src) = 0 then
    raise exception 'confirm_order body changed; update migration 0016';
  end if;
  v_src := replace(v_src, v_head, 'public.confirm_order(p_order_id uuid, p_override_credit boolean DEFAULT false, p_override_stock boolean DEFAULT false)');
  v_src := replace(v_src, v_check, 'if v_short is not null and not (p_override_stock and public.has_role(''super_admin'', ''manager'')) then');
  drop function public.confirm_order(uuid, boolean);
  execute v_src;
end $$;
revoke all on function public.confirm_order(uuid, boolean, boolean) from public, anon;
grant execute on function public.confirm_order(uuid, boolean, boolean) to authenticated;

-- 4. Legally required buyer details on a GST invoice (CGST Rules, rule 46) --------
--    registered buyer: name, address, GSTIN, state
--    unregistered buyer: name and state; plus address when the invoice is ₹50,000 or more
create or replace function public.invoice_tax_details()
returns trigger language plpgsql security definer set search_path = public as $$
declare r jsonb := new.retailer_snapshot; v_missing text[] := '{}';
begin
  if coalesce(trim(r ->> 'shop_name'), '') = '' then v_missing := array_append(v_missing, 'shop name'); end if;
  if coalesce(trim(r ->> 'state_code'), '') = '' then v_missing := array_append(v_missing, 'state'); end if;
  if (coalesce(trim(r ->> 'gstin'), '') <> '' or new.grand_total >= 50000)
     and coalesce(trim(r ->> 'billing_address'), '') = '' then
    v_missing := array_append(v_missing, 'billing address');
  end if;
  if coalesce(trim(r ->> 'gstin'), '') <> '' and coalesce(trim(r ->> 'billing_pincode'), '') = '' then
    v_missing := array_append(v_missing, 'PIN code');
  end if;
  if cardinality(v_missing) > 0 then
    raise exception 'Complete the retailer''s % before invoicing (required on a GST invoice)', array_to_string(v_missing, ', ')
      using errcode = 'P0001', hint = 'RETAILER_DETAILS';
  end if;
  return new;
end $$;
revoke all on function public.invoice_tax_details() from public, anon, authenticated;
drop trigger if exists invoices_tax_details on public.invoices;
create trigger invoices_tax_details before insert on public.invoices
  for each row execute function public.invoice_tax_details();

-- 5. Change payment terms of an issued invoice ------------------------------------
create or replace function public.guard_invoice_update()
returns trigger language plpgsql as $$
declare v_free text[] := array['status','cancelled_at','cancelled_by','cancel_reason'];
begin
  -- change_invoice_terms() may also move the credit period and due date.
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
end $$;

create or replace function public.change_invoice_terms(p_invoice_id uuid, p_credit_days integer, p_reason text)
returns date
language plpgsql security definer set search_path = public as $$
declare v_inv public.invoices%rowtype;
begin
  if not public.has_role('super_admin', 'manager') then
    raise exception 'Only a Manager or Super Admin can change payment terms' using errcode = '42501';
  end if;
  if p_credit_days is null or p_credit_days < 0 or p_credit_days > 365 then
    raise exception 'Credit period must be 0–365 days' using errcode = 'P0001';
  end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Enter the reason' using errcode = 'P0001'; end if;
  select * into v_inv from public.invoices where id = p_invoice_id for update;
  if not found or v_inv.status <> 'issued' then raise exception 'Invoice not found or cancelled' using errcode = 'P0001'; end if;
  if not public.can_access_brand(v_inv.brand_id) then raise exception 'You do not have access to this brand' using errcode = '42501'; end if;
  perform set_config('apex.invoice_terms_change', 'on', true);
  update public.invoices set credit_days = p_credit_days, due_date = invoice_date + p_credit_days where id = p_invoice_id;
  perform set_config('apex.invoice_terms_change', 'off', true);
  insert into public.audit_log (table_name, record_id, action, old_data, new_data, changed_by, brand_id)
  values ('invoice_terms', p_invoice_id::text, 'UPDATE', jsonb_build_object('credit_days', v_inv.credit_days, 'due_date', v_inv.due_date),
          jsonb_build_object('credit_days', p_credit_days, 'due_date', v_inv.invoice_date + p_credit_days, 'reason', trim(p_reason)),
          auth.uid(), v_inv.brand_id);
  return v_inv.invoice_date + p_credit_days;
end $$;
revoke all on function public.change_invoice_terms(uuid, integer, text) from public, anon;
grant execute on function public.change_invoice_terms(uuid, integer, text) to authenticated;
