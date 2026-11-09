-- =============================================================================
-- Multi-tenant platform (M-T1, part 3 of 3): constraints that make
-- cross-tenant data impossible, whatever code runs.
--
--   * tenant_id references tenants on every table
--   * composite foreign keys: every reference between business tables now
--     includes tenant_id, so a row can only point at a row of its own tenant
--     (an Apex invoice line can never point at a CONQRETE product, even from
--     a function that bypasses row-level security)
--   * references to people (created_by, salesman_id, ...) point at the
--     person's membership in the same tenant, not just at the person
--   * business keys are unique per tenant (retailer mobile, GSTIN, codes,
--     names, document numbers, offline idempotency keys)
--   * units, company settings and number series become per tenant;
--     document numbering reads the tenant from the request
--
-- Apex behaviour is unchanged: its next numbers continue exactly where they
-- are (number_series rows keep their values).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. tenant_id -> tenants
-- -----------------------------------------------------------------------------
do $$
declare t text;
begin
  for t in select * from public.tenant_scoped_tables() loop
    execute format('alter table public.%I add constraint %I foreign key (tenant_id) references public.tenants (id)',
                   t, left(t || '_tenant_fk', 63));
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 2. Remember and drop every single-column foreign key between tenant tables
--    (and from tenant tables to profiles)
-- -----------------------------------------------------------------------------
create temporary table _mt_fks (
  conname text, child text, col text, parent text, refcol text, on_delete text
);

insert into _mt_fks
select c.conname, cl.relname, a.attname, pl.relname, pa.attname,
       case c.confdeltype when 'c' then 'cascade' when 'r' then 'restrict' when 'n' then 'set null'
                          when 'd' then 'set default' else 'no action' end
  from pg_constraint c
  join pg_class cl on cl.oid = c.conrelid
  join pg_class pl on pl.oid = c.confrelid
  join pg_attribute a  on a.attrelid = c.conrelid  and a.attnum = c.conkey[1]
  join pg_attribute pa on pa.attrelid = c.confrelid and pa.attnum = c.confkey[1]
 where c.contype = 'f'
   and cl.relnamespace = 'public'::regnamespace
   and pl.relnamespace = 'public'::regnamespace
   and array_length(c.conkey, 1) = 1
   and cl.relname in (select * from public.tenant_scoped_tables())
   and (pl.relname in (select * from public.tenant_scoped_tables()) or pl.relname = 'profiles')
   and a.attname <> 'tenant_id';

do $$
declare f record;
begin
  if exists (select 1 from _mt_fks where on_delete in ('set null', 'set default')) then
    raise exception 'M-T1: a SET NULL / SET DEFAULT foreign key needs a column list; handle it explicitly';
  end if;
  for f in select * from _mt_fks loop
    execute format('alter table public.%I drop constraint %I', f.child, f.conname);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 3. Per-tenant keys for the three tables whose key was global
-- -----------------------------------------------------------------------------
-- Units: the same code (PCS, BOX) can exist in every tenant.
alter table public.units drop constraint units_pkey;
alter table public.units add constraint units_pkey primary key (tenant_id, code);

-- Number series: one counter per tenant, document type and financial year.
alter table public.number_series drop constraint number_series_pkey;
alter table public.number_series add constraint number_series_pkey primary key (tenant_id, doc_type, fy);

-- Company settings: one row per tenant. The id column stays (always 1) so
-- existing screens that ask for id = 1 keep working under row-level security.
alter table public.company_settings drop constraint if exists company_settings_id_check;
alter table public.company_settings drop constraint company_settings_pkey;
alter table public.company_settings add constraint company_settings_pkey primary key (tenant_id);
alter table public.company_settings alter column id set default 1;

-- -----------------------------------------------------------------------------
-- 4. Composite foreign keys
-- -----------------------------------------------------------------------------
do $$
declare
  f      record;
  v_idx  text;
  v_has  boolean;
begin
  -- every referenced parent gets unique (tenant_id, key)
  for f in select distinct parent, refcol from _mt_fks where parent <> 'profiles' loop
    select exists (
      select 1 from pg_index i
       where i.indrelid = ('public.' || f.parent)::regclass and i.indisunique and i.indpred is null
         and i.indnkeyatts = 2
         and (select array_agg(a.attname::text order by k.ord)
                from unnest(i.indkey) with ordinality k(attnum, ord)
                join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum)
             = array['tenant_id', f.refcol]
    ) into v_has;
    if not v_has then
      v_idx := left(f.parent || '_tenant_' || f.refcol || '_key', 63);
      execute format('alter table public.%I add constraint %I unique (tenant_id, %I)', f.parent, v_idx, f.refcol);
    end if;
  end loop;

  for f in select * from _mt_fks order by child, col loop
    if f.parent = 'profiles' then
      execute format(
        'alter table public.%I add constraint %I foreign key (tenant_id, %I)
           references public.tenant_members (tenant_id, user_id) on delete %s',
        f.child, f.conname, f.col, f.on_delete);
    else
      execute format(
        'alter table public.%I add constraint %I foreign key (tenant_id, %I)
           references public.%I (tenant_id, %I) on delete %s',
        f.child, f.conname, f.col, f.parent, f.refcol, f.on_delete);
    end if;
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 5. Business keys unique per tenant (were unique across the whole database)
-- -----------------------------------------------------------------------------
do $$
declare
  v_name text;
  v_tbl  text;
  v_def  text;
begin
  foreach v_name in array array[
    'brands_name_key', 'brands_code_key',
    'credit_notes_credit_note_no_key', 'dispatches_dispatch_no_key',
    'expense_categories_code_key', 'expense_categories_name_key',
    'expenses_client_uuid_key', 'expenses_expense_no_key',
    'incentive_payouts_salesman_id_month_key', 'incentive_schemes_effective_from_key',
    'invoices_invoice_no_key', 'locations_name_key',
    'orders_order_no_key', 'orders_client_uuid_key',
    'payments_receipt_no_key', 'payments_client_uuid_key',
    'purchase_returns_return_no_key', 'purchase_returns_client_uuid_key',
    'purchases_purchase_no_key',
    'reimbursements_reimbursement_no_key', 'reimbursements_client_uuid_key',
    'retailers_code_key', 'retailers_mobile_key', 'retailers_gstin_key',
    'routes_name_key', 'routes_code_key',
    'stock_movements_client_uuid_key', 'supplier_payments_payment_no_key',
    'suppliers_code_key', 'suppliers_name_key', 'suppliers_gstin_key',
    'territories_name_key', 'visit_events_client_uuid_key', 'visits_client_uuid_key',
    'warehouses_name_key'
  ] loop
    select c.relname, pg_get_indexdef(i.indexrelid) into v_tbl, v_def
      from pg_index i
      join pg_class ix on ix.oid = i.indexrelid
      join pg_class c on c.oid = i.indrelid
     where ix.relname = v_name and ix.relnamespace = 'public'::regnamespace;
    if v_def is null then
      raise exception 'M-T1: unique index % not found', v_name;
    end if;
    if position('USING btree (' in v_def) = 0 then
      raise exception 'M-T1: unexpected definition for %: %', v_name, v_def;
    end if;
    if exists (select 1 from pg_constraint where conname = v_name and contype = 'u'
                 and conrelid = ('public.' || v_tbl)::regclass) then
      -- a UNIQUE constraint stays a UNIQUE constraint
      select pg_get_constraintdef(oid) into v_def from pg_constraint
       where conname = v_name and conrelid = ('public.' || v_tbl)::regclass;
      execute format('alter table public.%I drop constraint %I', v_tbl, v_name);
      execute format('alter table public.%I add constraint %I %s', v_tbl, v_name,
                     regexp_replace(v_def, '^UNIQUE \(', 'UNIQUE (tenant_id, '));
    else
      execute format('drop index public.%I', v_name);
      execute regexp_replace(v_def, 'USING btree \(', 'USING btree (tenant_id, ');
    end if;
    v_def := null;
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 6. Document numbering per tenant
-- -----------------------------------------------------------------------------
-- Returns e.g. 'APX/INV/26-27/00001' for the request's tenant. The row lock
-- keeps numbers gapless and unique under concurrency; a rolled-back
-- transaction also rolls back the number.
create or replace function public.next_document_number(p_doc_type text, p_date date default current_date)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_fy     text := public.fy_label(p_date);
  v_value  integer;
  v_prefix text;
begin
  if v_tenant is null then
    raise exception 'No organization selected' using errcode = '42501';
  end if;
  insert into public.number_series (tenant_id, doc_type, fy) values (v_tenant, p_doc_type, v_fy)
  on conflict (tenant_id, doc_type, fy) do nothing;

  update public.number_series
     set next_value = next_value + 1
   where tenant_id = v_tenant and doc_type = p_doc_type and fy = v_fy
  returning next_value - 1 into v_value;

  select doc_prefix into v_prefix from public.company_settings where tenant_id = v_tenant;
  return coalesce(v_prefix, 'DOC') || '/' || p_doc_type || '/' || v_fy || '/' || lpad(v_value::text, 5, '0');
end $$;
revoke all on function public.next_document_number(text, date) from public, anon, authenticated;

-- Brand-wise document numbers. INV: CQ/26-27/00001 · others: CQCN/26-27/00001
create or replace function public.brand_document_number(p_brand uuid, p_kind text, p_date date default current_date)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_code  text;
  v_fy    text := public.fy_label(p_date);
  v_type  text;
  v_value integer;
begin
  if v_tenant is null then
    raise exception 'No organization selected' using errcode = '42501';
  end if;
  select code into v_code from public.brands where id = p_brand and tenant_id = v_tenant;
  if v_code is null then raise exception 'Brand missing on the document' using errcode = 'P0001'; end if;
  v_type := p_kind || '-' || v_code;
  insert into public.number_series (tenant_id, doc_type, fy) values (v_tenant, v_type, v_fy)
  on conflict (tenant_id, doc_type, fy) do nothing;
  update public.number_series set next_value = next_value + 1
   where tenant_id = v_tenant and doc_type = v_type and fy = v_fy
  returning next_value - 1 into v_value;
  if p_kind = 'INV' then
    return v_code || '/' || v_fy || '/' || lpad(v_value::text, 5, '0');
  end if;
  return v_code || p_kind || '/' || v_fy || '/' || lpad(v_value::text, 5, '0');
end $$;
revoke all on function public.brand_document_number(uuid, text, date) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 7. Verify: every reference was recreated
-- -----------------------------------------------------------------------------
do $$
declare v_missing text;
begin
  select string_agg(f.child || '.' || f.conname, ', ') into v_missing
    from _mt_fks f
   where not exists (
     select 1 from pg_constraint c
      where c.conname = f.conname and c.contype = 'f'
        and c.conrelid = ('public.' || f.child)::regclass
        and array_length(c.conkey, 1) = 2);
  if v_missing is not null then
    raise exception 'M-T1 check failed: foreign keys not recreated as composite: %', v_missing;
  end if;
end $$;

drop table _mt_fks;
