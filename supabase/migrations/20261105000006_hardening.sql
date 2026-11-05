-- =============================================================================
-- APEX DMS — Hardening after Supabase advisor review (M0)
-- =============================================================================

-- 1. Fixed search_path on every function
alter function public.set_updated_at() set search_path = public;
alter function public.prevent_mutation() set search_path = public;
alter function public.fy_label(date) set search_path = public;
alter function public.guard_invoice_update() set search_path = public;

-- 2. Trigger-only functions: nobody calls them through the API
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.guard_last_super_admin() from public, anon, authenticated;
revoke all on function public.audit_row() from public, anon, authenticated;

-- Role helpers are needed by signed-in users (RLS policies run them as the
-- caller) but never by anonymous visitors.
revoke all on function public.current_app_role() from public, anon;
revoke all on function public.has_role(public.app_role[]) from public, anon;
revoke all on function public.is_active_user() from public, anon;
revoke all on function public.can_see_retailer(uuid) from public, anon;
grant execute on function public.current_app_role(), public.is_active_user(),
  public.can_see_retailer(uuid), public.has_role(public.app_role[]) to authenticated;

-- 3. Keep extensions out of the API schema
create schema if not exists extensions;
alter extension pg_trgm set schema extensions;

-- 4. One permissive policy per action (split the FOR ALL policies)
drop policy stock_count_lines_write on public.stock_count_lines;
create policy stock_count_lines_insert on public.stock_count_lines for insert to authenticated
  with check (
    (select public.has_role('super_admin', 'manager', 'warehouse'))
    and exists (select 1 from public.stock_counts c where c.id = count_id and c.status = 'draft')
  );
create policy stock_count_lines_update on public.stock_count_lines for update to authenticated
  using (
    (select public.has_role('super_admin', 'manager', 'warehouse'))
    and exists (select 1 from public.stock_counts c where c.id = count_id and c.status = 'draft')
  )
  with check (
    (select public.has_role('super_admin', 'manager', 'warehouse'))
    and exists (select 1 from public.stock_counts c where c.id = count_id and c.status = 'draft')
  );
create policy stock_count_lines_delete on public.stock_count_lines for delete to authenticated
  using (
    (select public.has_role('super_admin', 'manager', 'warehouse'))
    and exists (select 1 from public.stock_counts c where c.id = count_id and c.status = 'draft')
  );

drop policy order_lines_write on public.order_lines;
create policy order_lines_insert on public.order_lines for insert to authenticated
  with check (exists (
    select 1 from public.orders o
     where o.id = order_id and o.status = 'quotation'
       and ((select public.has_role('super_admin', 'manager', 'billing')) or o.created_by = (select auth.uid()))
  ));
create policy order_lines_update on public.order_lines for update to authenticated
  using (exists (
    select 1 from public.orders o
     where o.id = order_id and o.status = 'quotation'
       and ((select public.has_role('super_admin', 'manager', 'billing')) or o.created_by = (select auth.uid()))
  ))
  with check (exists (
    select 1 from public.orders o
     where o.id = order_id and o.status = 'quotation'
       and ((select public.has_role('super_admin', 'manager', 'billing')) or o.created_by = (select auth.uid()))
  ));
create policy order_lines_delete on public.order_lines for delete to authenticated
  using (exists (
    select 1 from public.orders o
     where o.id = order_id and o.status = 'quotation'
       and ((select public.has_role('super_admin', 'manager', 'billing')) or o.created_by = (select auth.uid()))
  ));

drop policy route_plans_write on public.route_plans;
create policy route_plans_insert on public.route_plans for insert to authenticated
  with check ((select public.has_role('super_admin', 'manager')));
create policy route_plans_update on public.route_plans for update to authenticated
  using ((select public.has_role('super_admin', 'manager')))
  with check ((select public.has_role('super_admin', 'manager')));
create policy route_plans_delete on public.route_plans for delete to authenticated
  using ((select public.has_role('super_admin', 'manager')));

drop policy targets_write on public.targets;
create policy targets_insert on public.targets for insert to authenticated
  with check ((select public.has_role('super_admin', 'manager')));
create policy targets_update on public.targets for update to authenticated
  using ((select public.has_role('super_admin', 'manager')))
  with check ((select public.has_role('super_admin', 'manager')));
create policy targets_delete on public.targets for delete to authenticated
  using ((select public.has_role('super_admin', 'manager')));

drop policy expenses_update_own on public.expenses;
drop policy expenses_review on public.expenses;
create policy expenses_update on public.expenses for update to authenticated
  using (
    (select public.has_role('super_admin', 'manager'))
    or (salesman_id = (select auth.uid()) and status = 'submitted')
  )
  with check (
    (select public.has_role('super_admin', 'manager'))
    or (salesman_id = (select auth.uid()) and status = 'submitted')
  );

-- 5. Indexes on foreign keys used for lookups and joins
create index if not exists credit_note_lines_note_idx on public.credit_note_lines (credit_note_id);
create index if not exists credit_note_lines_invoice_line_idx on public.credit_note_lines (invoice_line_id);
create index if not exists credit_notes_retailer_idx on public.credit_notes (retailer_id);
create index if not exists dispatches_warehouse_idx on public.dispatches (warehouse_id);
create index if not exists expenses_route_idx on public.expenses (route_id);
create index if not exists expenses_reimbursement_idx on public.expenses (reimbursement_id);
create index if not exists invoice_lines_product_idx on public.invoice_lines (product_id);
create index if not exists order_lines_product_idx on public.order_lines (product_id);
create index if not exists orders_salesman_idx on public.orders (salesman_id);
create index if not exists orders_created_by_idx on public.orders (created_by);
create index if not exists payment_promises_retailer_idx on public.payment_promises (retailer_id);
create index if not exists payment_promises_invoice_idx on public.payment_promises (invoice_id);
create index if not exists payments_collected_by_idx on public.payments (collected_by);
create index if not exists payments_visit_idx on public.payments (visit_id);
create index if not exists products_category_idx on public.products (category_id);
create index if not exists reimbursements_salesman_idx on public.reimbursements (salesman_id);
create index if not exists route_plans_route_idx on public.route_plans (route_id);
create index if not exists routes_salesman_idx on public.routes (default_salesman_id);
create index if not exists stock_count_lines_product_idx on public.stock_count_lines (product_id);
create index if not exists stock_counts_warehouse_idx on public.stock_counts (warehouse_id);
create index if not exists stock_movements_warehouse_idx on public.stock_movements (warehouse_id);
create index if not exists targets_salesman_idx on public.targets (salesman_id);
create index if not exists visits_route_plan_idx on public.visits (route_plan_id);
