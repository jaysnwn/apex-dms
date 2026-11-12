-- =============================================================================
-- 0030: security and speed items from the November 2026 architecture audit.
--
--  1. invoice_open_amount / product_available (audit finding 11): both run with
--     owner rights and were callable by every signed-in user, so any login could
--     ask for the open amount of any invoice id. The app never calls them
--     directly; only other database functions do (confirm_order, record_payment,
--     reallocate_payment, fifo_allocate, classify_retailers), and those run as
--     app_definer. Signed-in users lose the direct call; nothing else changes.
--  2. rls_auto_enable (finding 20): Supabase's helper behind the ensure_rls
--     event trigger was callable through the API, even without signing in.
--     The event trigger does not need that permission.
--  3. Indexes on foreign keys used in joins and filters (finding 14).
--     Left out on purpose: the "who did it" columns (created_by, approved_by,
--     ...). They are only searched when a user row is deleted, which the app
--     never does, and every extra index slows each save a little.
--  4. Views are for reading (finding 7). Supabase gives signed-in users every
--     permission on new views by default. None of the views can be written
--     through today, so this closes a door before a later change opens it.
--  5. stock_reserved is a helper for product_stock and is never read by the
--     app. Read directly it showed reserved quantities for every brand, also
--     to a login limited to one brand. product_stock (brand-checked) still
--     uses it; signed-in users no longer read it directly.
--
-- Rollback: supabase/rollback/20261112000030_to_0029_down.sql
-- =============================================================================

-- 1. reader functions: database functions only
revoke execute on function public.invoice_open_amount(uuid) from public, anon, authenticated;
revoke execute on function public.product_available(uuid)   from public, anon, authenticated;

-- 2. Supabase's helper is not an API function. It does not exist on a plain
--    Postgres (CI), and on Supabase it may belong to a role this migration
--    cannot act for: then say so and carry on, the dashboard can do it.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    begin
      revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
    exception when insufficient_privilege then
      raise notice '0030: rls_auto_enable() belongs to another role; revoke its API access in the Supabase dashboard';
    end;
  end if;
end $$;

-- 3. foreign-key indexes
create index if not exists credit_notes_brand_id_fkey_idx on public.credit_notes (brand_id);
create index if not exists journal_entries_brand_id_fkey_idx on public.journal_entries (brand_id);
create index if not exists orders_brand_id_fkey_idx on public.orders (brand_id);
create index if not exists products_default_location_id_fkey_idx on public.products (default_location_id);
create index if not exists products_default_warehouse_id_fkey_idx on public.products (default_warehouse_id);
create index if not exists products_unit_code_fkey_idx on public.products (unit_code);
create index if not exists profile_brands_brand_id_fkey_idx on public.profile_brands (brand_id);
create index if not exists profiles_default_tenant_id_fkey_idx on public.profiles (default_tenant_id);
create index if not exists purchase_return_lines_product_id_fkey_idx on public.purchase_return_lines (product_id);
create index if not exists purchase_return_lines_purchase_line_id_fkey_idx on public.purchase_return_lines (purchase_line_id);
create index if not exists purchase_returns_brand_id_fkey_idx on public.purchase_returns (brand_id);
create index if not exists purchase_returns_supplier_id_fkey_idx on public.purchase_returns (supplier_id);
create index if not exists purchase_returns_warehouse_id_fkey_idx on public.purchase_returns (warehouse_id);
create index if not exists salesman_locations_visit_id_fkey_idx on public.salesman_locations (visit_id);
create index if not exists stock_count_lines_location_id_fkey_idx on public.stock_count_lines (location_id);
create index if not exists stock_counts_brand_id_fkey_idx on public.stock_counts (brand_id);
create index if not exists stock_movements_location_id_fkey_idx on public.stock_movements (location_id);
create index if not exists suppliers_brand_id_fkey_idx on public.suppliers (brand_id);

-- 4. views are read-only for API logins
revoke insert, update, delete, truncate, references, trigger on
  public.catalog,
  public.expense_list,
  public.inventory_valuation,
  public.invoice_balances,
  public.product_stock,
  public.purchase_balances,
  public.purchase_receipts,
  public.purchase_register,
  public.retailer_balances,
  public.retailer_directory,
  public.retailer_ledger,
  public.sales_costs,
  public.sales_register,
  public.stock_ledger,
  public.stock_on_hand,
  public.stock_reserved,
  public.supplier_ledger,
  public.tenant_people
from public, anon, authenticated;

-- 5. stock_reserved: internal helper of product_stock
revoke all on public.stock_reserved from public, anon, authenticated;

-- Check
do $$
begin
  if has_function_privilege('authenticated', 'public.invoice_open_amount(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.product_available(uuid)', 'execute')
     or has_function_privilege('anon', 'public.invoice_open_amount(uuid)', 'execute')
     or has_function_privilege('anon', 'public.product_available(uuid)', 'execute') then
    raise exception '0030: the reader functions are still callable through the API';
  end if;
  if not has_function_privilege('app_definer', 'public.invoice_open_amount(uuid)', 'execute')
     or not has_function_privilege('app_definer', 'public.product_available(uuid)', 'execute') then
    raise exception '0030: app_definer must keep the reader functions';
  end if;
  if exists (select 1 from pg_class c, unnest(array['anon', 'authenticated']) r(role)
              where c.relnamespace = 'public'::regnamespace and c.relkind = 'v'
                and (has_table_privilege(r.role, c.oid, 'insert') or has_table_privilege(r.role, c.oid, 'update')
                     or has_table_privilege(r.role, c.oid, 'delete') or has_table_privilege(r.role, c.oid, 'truncate'))) then
    raise exception '0030: a view is still writable by an API login';
  end if;
  if has_table_privilege('authenticated', 'public.stock_reserved', 'select')
     or not has_table_privilege('app_definer', 'public.stock_reserved', 'select') then
    raise exception '0030: stock_reserved must be readable by app_definer only';
  end if;
end $$;
