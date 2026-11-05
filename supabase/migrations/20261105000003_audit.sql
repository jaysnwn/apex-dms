-- =============================================================================
-- APEX DMS — Audit trail (M0)
-- Every insert / update / delete on financial, inventory and access tables
-- writes old value, new value, user and time to public.audit_log.
-- =============================================================================

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
begin
  -- Skip no-op updates (only updated_at changed)
  if tg_op = 'UPDATE' and (v_old - 'updated_at') = (v_new - 'updated_at') then
    return new;
  end if;

  v_id := coalesce(v_new ->> 'id', v_old ->> 'id');

  insert into public.audit_log (table_name, record_id, action, old_data, new_data, changed_by)
  values (tg_table_name, v_id, tg_op, v_old, v_new, auth.uid());

  return coalesce(new, old);
end $$;

revoke all on function public.audit_row() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'company_settings',
    'brands', 'categories', 'warehouses', 'warehouse_locations',
    'products', 'product_images',
    'stock_movements', 'stock_counts', 'stock_count_lines',
    'routes', 'retailers',
    'orders', 'order_lines',
    'invoices', 'invoice_lines', 'credit_notes', 'credit_note_lines',
    'dispatches',
    'payments', 'payment_allocations', 'payment_promises',
    'route_plans', 'visits', 'targets',
    'expenses', 'reimbursements'
  ] loop
    execute format(
      'create trigger %1$s_audit after insert or update or delete on public.%1$I
         for each row execute function public.audit_row()', t);
  end loop;
end $$;
