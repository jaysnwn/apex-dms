-- =============================================================================
-- ROLLBACK of the multi-tenant foundation (0019, 0020, 0021) back to the 0018
-- schema. Run as ONE transaction (psql -1, or the SQL editor's single run).
--
-- Refuses to run if any tenant other than APEX TRADING CO. holds data: going
-- back to a single-business schema would otherwise merge businesses.
-- Data is untouched: only tenant columns, constraints and platform tables go.
-- Tested locally: data fingerprint and pg_dump schema equal the 0018 state.
-- =============================================================================

-- 0. Preconditions
do $$
declare t text; n bigint;
begin
  if exists (select 1 from public.tenants where id <> 'a9e70000-0000-4000-8000-000000000001') then
    for t in select * from public.tenant_scoped_tables() loop
      execute format('select count(*) from public.%I where tenant_id is distinct from %L', t,
                     'a9e70000-0000-4000-8000-000000000001') into n;
      if n > 0 and t <> 'audit_log' then
        raise exception 'Rollback refused: % has % rows of another organization', t, n;
      end if;
    end loop;
  end if;
end $$;
-- Audit rows written about the platform tables stay: the audit log is append-only.

-- ---------------------------------------------------------------------------
-- Undo 0021
-- ---------------------------------------------------------------------------
-- Document numbering: original bodies (0001, 0015)
create or replace function public.next_document_number(p_doc_type text, p_date date default current_date)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fy     text := public.fy_label(p_date);
  v_value  integer;
  v_prefix text;
begin
  insert into public.number_series (doc_type, fy) values (p_doc_type, v_fy)
  on conflict (doc_type, fy) do nothing;

  update public.number_series
     set next_value = next_value + 1
   where doc_type = p_doc_type and fy = v_fy
  returning next_value - 1 into v_value;

  select doc_prefix into v_prefix from public.company_settings where id = 1;
  return coalesce(v_prefix, 'APX') || '/' || p_doc_type || '/' || v_fy || '/' || lpad(v_value::text, 5, '0');
end $$;
revoke all on function public.next_document_number(text, date) from public, anon, authenticated;

create or replace function public.brand_document_number(p_brand uuid, p_kind text, p_date date default current_date)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_code  text := (select code from public.brands where id = p_brand);
  v_fy    text := public.fy_label(p_date);
  v_type  text;
  v_value integer;
begin
  if v_code is null then raise exception 'Brand missing on the document' using errcode = 'P0001'; end if;
  v_type := p_kind || '-' || v_code;
  insert into public.number_series (doc_type, fy) values (v_type, v_fy) on conflict (doc_type, fy) do nothing;
  update public.number_series set next_value = next_value + 1
   where doc_type = v_type and fy = v_fy
  returning next_value - 1 into v_value;
  if p_kind = 'INV' then
    return v_code || '/' || v_fy || '/' || lpad(v_value::text, 5, '0');
  end if;
  return v_code || p_kind || '/' || v_fy || '/' || lpad(v_value::text, 5, '0');
end $$;
revoke all on function public.brand_document_number(uuid, text, date) from public, anon, authenticated;

-- Composite foreign keys -> the original single-column ones (same names, same actions)
do $$
declare f record;
begin
  for f in
    select c.conname, cl.relname as child, a.attname as col, pl.relname as parent, pa.attname as refcol,
           case c.confdeltype when 'c' then 'cascade' when 'r' then 'restrict' else 'no action' end as on_delete
      from pg_constraint c
      join pg_class cl on cl.oid = c.conrelid
      join pg_class pl on pl.oid = c.confrelid
      join pg_attribute a  on a.attrelid = c.conrelid  and a.attnum = c.conkey[2]
      join pg_attribute pa on pa.attrelid = c.confrelid and pa.attnum = c.confkey[2]
     where c.contype = 'f' and c.connamespace = 'public'::regnamespace
       and array_length(c.conkey, 1) = 2
       and (select attname from pg_attribute where attrelid = c.conrelid and attnum = c.conkey[1]) = 'tenant_id'
  loop
    execute format('alter table public.%I drop constraint %I', f.child, f.conname);
    if f.parent = 'tenant_members' then
      execute format('alter table public.%I add constraint %I foreign key (%I) references public.profiles (id) on delete %s',
                     f.child, f.conname, f.col, f.on_delete);
    else
      -- units: the parent key goes back to (code) below, so remember these
      if f.parent = 'units' then
        create temporary table if not exists _rb_unit_fks (child text, conname text, col text, on_delete text);
        insert into _rb_unit_fks values (f.child, f.conname, f.col, f.on_delete);
      else
        execute format('alter table public.%I add constraint %I foreign key (%I) references public.%I (%I) on delete %s',
                       f.child, f.conname, f.col, f.parent, f.refcol, f.on_delete);
      end if;
    end if;
  end loop;
end $$;

-- the (tenant_id, key) uniques added on parents
do $$
declare r record;
begin
  for r in select c.conname, c.conrelid::regclass as tbl from pg_constraint c
            where c.contype = 'u' and c.connamespace = 'public'::regnamespace
              and c.conname ~ '_tenant_[a-z_]+_key$'
              and (select attname from pg_attribute where attrelid = c.conrelid and attnum = c.conkey[1]) = 'tenant_id'
              and array_length(c.conkey, 1) = 2
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end $$;

-- per-tenant keys -> global keys
alter table public.units drop constraint units_pkey;
alter table public.units add constraint units_pkey primary key (code);
alter table public.number_series drop constraint number_series_pkey;
alter table public.number_series add constraint number_series_pkey primary key (doc_type, fy);
alter table public.company_settings drop constraint company_settings_pkey;
alter table public.company_settings add constraint company_settings_pkey primary key (id);
alter table public.company_settings add constraint company_settings_id_check check (id = 1);

do $$
declare f record;
begin
  if to_regclass('pg_temp._rb_unit_fks') is not null then
    for f in execute 'select * from _rb_unit_fks' loop
      execute format('alter table public.%I add constraint %I foreign key (%I) references public.units (code) on delete %s',
                     f.child, f.conname, f.col, f.on_delete);
    end loop;
    execute 'drop table _rb_unit_fks';
  end if;
end $$;

-- business keys: unique across the database again
do $$
declare
  v_name text; v_tbl text; v_def text; v_con boolean;
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
    select c.relname into v_tbl from pg_class ix join pg_index i on i.indexrelid = ix.oid join pg_class c on c.oid = i.indrelid
     where ix.relname = v_name and ix.relnamespace = 'public'::regnamespace;
    select exists (select 1 from pg_constraint where conname = v_name and contype = 'u'
                     and conrelid = ('public.' || v_tbl)::regclass) into v_con;
    if v_con then
      select pg_get_constraintdef(oid) into v_def from pg_constraint
       where conname = v_name and conrelid = ('public.' || v_tbl)::regclass;
      execute format('alter table public.%I drop constraint %I', v_tbl, v_name);
      execute format('alter table public.%I add constraint %I %s', v_tbl, v_name,
                     regexp_replace(v_def, '^UNIQUE \(tenant_id, ', 'UNIQUE ('));
    else
      select pg_get_indexdef(ix.oid) into v_def from pg_class ix where ix.relname = v_name and ix.relnamespace = 'public'::regnamespace;
      execute format('drop index public.%I', v_name);
      execute regexp_replace(v_def, 'USING btree \(tenant_id, ', 'USING btree (');
    end if;
  end loop;
end $$;

-- tenant_id -> tenants
do $$
declare t text;
begin
  for t in select * from public.tenant_scoped_tables() loop
    execute format('alter table public.%I drop constraint %I', t, left(t || '_tenant_fk', 63));
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Undo 0020
-- ---------------------------------------------------------------------------
create or replace function public.audit_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_id  text;
  v_brand uuid;
begin
  -- Skip no-op updates (only updated_at changed)
  if tg_op = 'UPDATE' and (v_old - 'updated_at') = (v_new - 'updated_at') then
    return new;
  end if;

  v_id := coalesce(v_new ->> 'id', v_old ->> 'id');
  v_brand := nullif(coalesce(v_new ->> 'brand_id', v_old ->> 'brand_id'), '')::uuid;
  if v_brand is null and tg_table_name = 'brands' then v_brand := v_id::uuid; end if;

  insert into public.audit_log (table_name, record_id, action, old_data, new_data, changed_by, brand_id)
  values (tg_table_name, v_id, tg_op, v_old, v_new, auth.uid(), v_brand);

  return coalesce(new, old);
end $$;
revoke all on function public.audit_row() from public, anon, authenticated;

do $$
declare t text;
begin
  for t in select * from public.tenant_scoped_tables() loop
    execute format('drop trigger if exists aa_tenant_stamp on public.%I', t);
    execute format('alter table public.%I drop column tenant_id', t);   -- its index goes with it
  end loop;
end $$;
drop function public.tenant_stamp();
drop function public.tenant_scoped_tables();

-- ---------------------------------------------------------------------------
-- Undo 0019
-- ---------------------------------------------------------------------------
drop trigger profiles_sync_membership on public.profiles;
drop function public.profile_sync_membership();

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_role text := new.raw_app_meta_data ->> 'role';
begin
  insert into public.profiles (id, email, full_name, phone, role, is_active)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.raw_user_meta_data ->> 'phone',
    coalesce(v_role, 'salesman')::public.app_role,
    v_role is not null
  )
  on conflict (id) do nothing;
  return new;
end $$;

alter table public.profiles drop column default_tenant_id;
-- one statement: the platform tables' policies refer to each other
drop table public.tenant_members, public.platform_admins, public.tenants;
drop function public.my_tenants();
drop function public.is_platform_admin();
drop function public.current_tenant_id();
drop type public.tenant_status;
