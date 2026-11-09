-- Read-only fingerprint of the business data, for before/after comparison of
-- a migration. One SELECT, no side effects, so it can run on production
-- through the SQL editor or the connector as well as locally.
-- Columns added by the multi-tenant migrations (tenant_id) are left out of
-- every fingerprint, so a correct migration gives an identical result.
select jsonb_build_object(
  'row_counts', (
    select jsonb_object_agg(c.relname,
             (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from public.%I', c.relname), false, true, '')))[1]::text::bigint)
      from pg_class c
     where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
       and c.relname not in ('tenants', 'tenant_members', 'platform_admins')),
  'invoices_by_status', (select jsonb_object_agg(status, s) from (select status, sum(grand_total) s from public.invoices group by status) x),
  'credit_notes_by_status', (select jsonb_object_agg(status, s) from (select status, sum(grand_total) s from public.credit_notes group by status) x),
  'payments_by_status', (select jsonb_object_agg(status, s) from (select status, sum(amount) s from public.payments group by status) x),
  'payment_allocations_total', (select sum(amount) from public.payment_allocations),
  'purchases_by_status', (select jsonb_object_agg(status, s) from (select status, sum(grand_total) s from public.purchases group by status) x),
  'supplier_payments_by_status', (select jsonb_object_agg(status, s) from (select status, sum(amount) s from public.supplier_payments group by status) x),
  'supplier_allocations_total', (select sum(amount) from public.supplier_payment_allocations),
  'purchase_returns_total', (select sum(grand_total) from public.purchase_returns),
  'expenses_by_status', (select jsonb_object_agg(status, s) from (select status, sum(amount) s from public.expenses group by status) x),
  'reimbursements_total', (select sum(amount) from public.reimbursements where cancelled_at is null),
  'journal', (select jsonb_build_object('debit', sum(debit), 'credit', sum(credit)) from public.journal_lines),
  'incentive_payouts_total', (select sum(total) from public.incentive_payouts),
  'stock_on_hand_md5', (select md5(coalesce(string_agg(product_id || ':' || warehouse_id || ':' || q, '|' order by product_id, warehouse_id), ''))
                          from (select product_id, warehouse_id, sum(qty) q from public.stock_movements group by 1, 2) x),
  'stock_total', (select sum(qty) from public.stock_movements),
  'retailer_balances_md5', (select md5(coalesce(string_agg(retailer_id || ':' || outstanding || ':' || overdue || ':' || unallocated, '|' order by retailer_id), ''))
                              from public.retailer_balances),
  'invoice_balances_md5', (select md5(coalesce(string_agg(invoice_id || ':' || balance, '|' order by invoice_id), '')) from public.invoice_balances),
  'purchase_balances_md5', (select md5(coalesce(string_agg(purchase_id || ':' || balance, '|' order by purchase_id), '')) from public.purchase_balances),
  'number_series_md5', (select md5(coalesce(string_agg(doc_type || ':' || fy || ':' || next_value, '|' order by doc_type, fy), '')) from public.number_series),
  'audit_log_md5', (select md5(coalesce(string_agg(id || ':' || table_name || ':' || coalesce(record_id, '') || ':' || action || ':'
                                                   || coalesce(old_data::text, '') || ':' || coalesce(new_data::text, ''), '|' order by id), ''))
                      from public.audit_log),
  'company_settings_md5', (select md5(coalesce(string_agg((to_jsonb(s) - 'tenant_id' - 'updated_at')::text, '|'), '')) from public.company_settings s),
  'profiles_md5', (select md5(coalesce(string_agg(id || ':' || role || ':' || is_active || ':' || coalesce(can_reimburse, false), '|' order by id), '')) from public.profiles)
) as snapshot;
