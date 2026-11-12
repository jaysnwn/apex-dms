-- =============================================================================
-- ROLLBACK of 0030 (audit hardening) back to 0029. Run as ONE transaction.
-- Puts back the wider permissions 0030 removed and drops its indexes.
-- =============================================================================
drop index if exists public.credit_notes_brand_id_fkey_idx;
drop index if exists public.journal_entries_brand_id_fkey_idx;
drop index if exists public.orders_brand_id_fkey_idx;
drop index if exists public.products_default_location_id_fkey_idx;
drop index if exists public.products_default_warehouse_id_fkey_idx;
drop index if exists public.products_unit_code_fkey_idx;
drop index if exists public.profile_brands_brand_id_fkey_idx;
drop index if exists public.profiles_default_tenant_id_fkey_idx;
drop index if exists public.purchase_return_lines_product_id_fkey_idx;
drop index if exists public.purchase_return_lines_purchase_line_id_fkey_idx;
drop index if exists public.purchase_returns_brand_id_fkey_idx;
drop index if exists public.purchase_returns_supplier_id_fkey_idx;
drop index if exists public.purchase_returns_warehouse_id_fkey_idx;
drop index if exists public.salesman_locations_visit_id_fkey_idx;
drop index if exists public.stock_count_lines_location_id_fkey_idx;
drop index if exists public.stock_counts_brand_id_fkey_idx;
drop index if exists public.stock_movements_location_id_fkey_idx;
drop index if exists public.suppliers_brand_id_fkey_idx;

-- views: back to Supabase's default permissions (tenant_people was read-only before)
grant all on
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
  public.supplier_ledger
to authenticated;

grant execute on function public.invoice_open_amount(uuid) to authenticated;
grant execute on function public.product_available(uuid)   to authenticated;

do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    begin
      grant execute on function public.rls_auto_enable() to anon, authenticated;
    exception when insufficient_privilege then
      raise notice 'rollback 0030: rls_auto_enable() belongs to another role; left as it is';
    end;
  end if;
end $$;
