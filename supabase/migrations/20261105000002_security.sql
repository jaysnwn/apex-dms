-- =============================================================================
-- APEX DMS — Roles, permission helpers and row-level security (M0)
-- Roles: super_admin, manager, billing (office / billing staff), warehouse, salesman
-- The database itself refuses rows a role should not see or change.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Role helpers (security definer so they can read profiles under RLS)
-- -----------------------------------------------------------------------------
create or replace function public.current_app_role()
returns public.app_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and is_active
$$;

create or replace function public.has_role(variadic p_roles public.app_role[])
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.current_app_role() = any (p_roles), false)
$$;

create or replace function public.is_active_user()
returns boolean
language sql stable security definer set search_path = public as $$
  select public.current_app_role() is not null
$$;

-- Salesmen see retailers assigned to them directly or through their route.
create or replace function public.can_see_retailer(p_retailer_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when public.has_role('super_admin', 'manager', 'billing', 'warehouse') then true
    when public.has_role('salesman') then exists (
      select 1
        from public.retailers r
        left join public.routes rt on rt.id = r.route_id
       where r.id = p_retailer_id
         and (r.salesman_id = auth.uid() or rt.default_salesman_id = auth.uid())
    )
    else false
  end
$$;

grant execute on function public.current_app_role(), public.is_active_user(),
  public.can_see_retailer(uuid) to authenticated;
grant execute on function public.has_role(public.app_role[]) to authenticated;

-- -----------------------------------------------------------------------------
-- Profile creation for new auth users.
-- Users are created by the Super Administrator through the app (service role),
-- which sets app_metadata.role. Any other sign-up gets an INACTIVE profile.
-- -----------------------------------------------------------------------------
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

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep at least one active Super Administrator.
create or replace function public.guard_last_super_admin()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.role = 'super_admin' and old.is_active
     and (new.role <> 'super_admin' or not new.is_active)
     and not exists (
       select 1 from public.profiles
        where role = 'super_admin' and is_active and id <> old.id
     ) then
    raise exception 'At least one active Super Administrator is required' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger profiles_guard_last_super_admin
  before update on public.profiles
  for each row execute function public.guard_last_super_admin();

-- -----------------------------------------------------------------------------
-- Lock down anon; enable RLS everywhere
-- -----------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Users & company
-- -----------------------------------------------------------------------------
create policy profiles_select on public.profiles for select to authenticated
  using ((select public.is_active_user()) or id = (select auth.uid()));
create policy profiles_update on public.profiles for update to authenticated
  using ((select public.has_role('super_admin')))
  with check ((select public.has_role('super_admin')));

create policy company_settings_select on public.company_settings for select to authenticated
  using ((select public.is_active_user()));
create policy company_settings_update on public.company_settings for update to authenticated
  using ((select public.has_role('super_admin')))
  with check ((select public.has_role('super_admin')));

-- number_series: no policies -> only security-definer functions touch it.

-- -----------------------------------------------------------------------------
-- Masters: brands, categories, units, warehouses, locations, routes
-- Everyone active reads; Super Admin & Manager write.
-- -----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['brands', 'categories', 'units', 'warehouses', 'warehouse_locations', 'routes'] loop
    execute format($f$
      create policy %1$s_select on public.%1$I for select to authenticated
        using ((select public.is_active_user()));
      create policy %1$s_insert on public.%1$I for insert to authenticated
        with check ((select public.has_role('super_admin', 'manager')));
      create policy %1$s_update on public.%1$I for update to authenticated
        using ((select public.has_role('super_admin', 'manager')))
        with check ((select public.has_role('super_admin', 'manager')));
    $f$, t);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Products: full rows (incl. purchase cost) for Admin, Manager, Billing.
-- Warehouse & Salesman read the cost-free `catalog` view (0004).
-- -----------------------------------------------------------------------------
create policy products_select on public.products for select to authenticated
  using ((select public.has_role('super_admin', 'manager', 'billing')));
create policy products_insert on public.products for insert to authenticated
  with check ((select public.has_role('super_admin', 'manager')));
create policy products_update on public.products for update to authenticated
  using ((select public.has_role('super_admin', 'manager')))
  with check ((select public.has_role('super_admin', 'manager')));

create policy product_images_select on public.product_images for select to authenticated
  using ((select public.is_active_user()));
create policy product_images_insert on public.product_images for insert to authenticated
  with check ((select public.has_role('super_admin', 'manager')));
create policy product_images_update on public.product_images for update to authenticated
  using ((select public.has_role('super_admin', 'manager')));
create policy product_images_delete on public.product_images for delete to authenticated
  using ((select public.has_role('super_admin', 'manager')));

-- -----------------------------------------------------------------------------
-- Stock
-- -----------------------------------------------------------------------------
create policy stock_movements_select on public.stock_movements for select to authenticated
  using ((select public.has_role('super_admin', 'manager', 'billing', 'warehouse')));
-- Dispatch / returns movements are written only by security-definer functions.
create policy stock_movements_insert on public.stock_movements for insert to authenticated
  with check (
    (select public.has_role('super_admin', 'manager', 'warehouse'))
    and movement_type not in ('dispatch', 'dispatch_reversal', 'credit_note_return', 'reconciliation')
    and created_by = (select auth.uid())
  );

create policy stock_counts_select on public.stock_counts for select to authenticated
  using ((select public.has_role('super_admin', 'manager', 'billing', 'warehouse')));
create policy stock_counts_insert on public.stock_counts for insert to authenticated
  with check ((select public.has_role('super_admin', 'manager', 'warehouse')) and status in ('draft', 'submitted'));
create policy stock_counts_update on public.stock_counts for update to authenticated
  using ((select public.has_role('super_admin', 'manager', 'warehouse')) and status in ('draft', 'submitted'))
  with check (
    (select public.has_role('super_admin', 'manager', 'warehouse'))
    and (status <> 'approved' or (select public.has_role('super_admin', 'manager')))
  );

create policy stock_count_lines_select on public.stock_count_lines for select to authenticated
  using ((select public.has_role('super_admin', 'manager', 'billing', 'warehouse')));
create policy stock_count_lines_write on public.stock_count_lines for all to authenticated
  using (
    (select public.has_role('super_admin', 'manager', 'warehouse'))
    and exists (select 1 from public.stock_counts c where c.id = count_id and c.status = 'draft')
  )
  with check (
    (select public.has_role('super_admin', 'manager', 'warehouse'))
    and exists (select 1 from public.stock_counts c where c.id = count_id and c.status = 'draft')
  );

-- -----------------------------------------------------------------------------
-- Retailers
-- -----------------------------------------------------------------------------
create policy retailers_select on public.retailers for select to authenticated
  using ((select public.has_role('super_admin', 'manager', 'billing', 'warehouse'))
         or (public.has_role('salesman') and public.can_see_retailer(id)));
create policy retailers_insert on public.retailers for insert to authenticated
  with check (
    (select public.has_role('super_admin', 'manager', 'billing'))
    or ((select public.has_role('salesman')) and salesman_id = (select auth.uid()))
  );
create policy retailers_update on public.retailers for update to authenticated
  using ((select public.has_role('super_admin', 'manager', 'billing')))
  with check ((select public.has_role('super_admin', 'manager', 'billing')));

-- -----------------------------------------------------------------------------
-- Orders (quotations editable; confirmation into an invoice happens in a
-- security-definer function in M2)
-- -----------------------------------------------------------------------------
create policy orders_select on public.orders for select to authenticated
  using (
    (select public.has_role('super_admin', 'manager', 'billing', 'warehouse'))
    or ((select public.has_role('salesman'))
        and (salesman_id = (select auth.uid()) or created_by = (select auth.uid())))
  );
create policy orders_insert on public.orders for insert to authenticated
  with check (
    status = 'quotation'
    and public.can_see_retailer(retailer_id)
    and (
      (select public.has_role('super_admin', 'manager', 'billing'))
      or ((select public.has_role('salesman')) and salesman_id = (select auth.uid()))
    )
  );
create policy orders_update on public.orders for update to authenticated
  using (
    status = 'quotation'
    and (
      (select public.has_role('super_admin', 'manager', 'billing'))
      or ((select public.has_role('salesman')) and created_by = (select auth.uid()))
    )
  )
  with check (status in ('quotation', 'cancelled'));

create policy order_lines_select on public.order_lines for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id));
create policy order_lines_write on public.order_lines for all to authenticated
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

-- -----------------------------------------------------------------------------
-- Invoices & credit notes: read-only through RLS; written by functions only.
-- -----------------------------------------------------------------------------
create policy invoices_select on public.invoices for select to authenticated
  using ((select public.has_role('super_admin', 'manager', 'billing', 'warehouse'))
         or (public.has_role('salesman') and public.can_see_retailer(retailer_id)));
create policy invoice_lines_select on public.invoice_lines for select to authenticated
  using (exists (select 1 from public.invoices i where i.id = invoice_id));

create policy credit_notes_select on public.credit_notes for select to authenticated
  using ((select public.has_role('super_admin', 'manager', 'billing'))
         or (public.has_role('salesman') and public.can_see_retailer(retailer_id)));
create policy credit_note_lines_select on public.credit_note_lines for select to authenticated
  using (exists (select 1 from public.credit_notes c where c.id = credit_note_id));

-- -----------------------------------------------------------------------------
-- Dispatch
-- -----------------------------------------------------------------------------
create policy dispatches_select on public.dispatches for select to authenticated
  using (exists (select 1 from public.invoices i where i.id = invoice_id));
create policy dispatches_insert on public.dispatches for insert to authenticated
  with check ((select public.has_role('super_admin', 'manager', 'warehouse')));
create policy dispatches_update on public.dispatches for update to authenticated
  using ((select public.has_role('super_admin', 'manager', 'warehouse')))
  with check ((select public.has_role('super_admin', 'manager', 'warehouse')));

-- -----------------------------------------------------------------------------
-- Payments
-- -----------------------------------------------------------------------------
create policy payments_select on public.payments for select to authenticated
  using ((select public.has_role('super_admin', 'manager', 'billing'))
         or (public.has_role('salesman')
             and (collected_by = (select auth.uid()) or public.can_see_retailer(retailer_id))));
create policy payments_insert on public.payments for insert to authenticated
  with check (
    (select public.has_role('super_admin', 'manager', 'billing'))
    or ((select public.has_role('salesman'))
        and collected_by = (select auth.uid())
        and public.can_see_retailer(retailer_id))
  );
create policy payments_update on public.payments for update to authenticated
  using ((select public.has_role('super_admin', 'manager', 'billing')))
  with check ((select public.has_role('super_admin', 'manager', 'billing')));

create policy payment_allocations_select on public.payment_allocations for select to authenticated
  using (exists (select 1 from public.payments p where p.id = payment_id));
create policy payment_allocations_insert on public.payment_allocations for insert to authenticated
  with check ((select public.has_role('super_admin', 'manager', 'billing')));
create policy payment_allocations_delete on public.payment_allocations for delete to authenticated
  using ((select public.has_role('super_admin', 'manager')));

create policy payment_promises_select on public.payment_promises for select to authenticated
  using ((select public.has_role('super_admin', 'manager', 'billing'))
         or (public.has_role('salesman') and public.can_see_retailer(retailer_id)));
create policy payment_promises_insert on public.payment_promises for insert to authenticated
  with check ((select public.has_role('super_admin', 'manager', 'billing'))
              or ((select public.has_role('salesman')) and public.can_see_retailer(retailer_id)));
create policy payment_promises_update on public.payment_promises for update to authenticated
  using ((select public.has_role('super_admin', 'manager', 'billing')) or created_by = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- Field: route plans, visits, targets
-- -----------------------------------------------------------------------------
create policy route_plans_select on public.route_plans for select to authenticated
  using ((select public.has_role('super_admin', 'manager', 'billing')) or salesman_id = (select auth.uid()));
create policy route_plans_write on public.route_plans for all to authenticated
  using ((select public.has_role('super_admin', 'manager')))
  with check ((select public.has_role('super_admin', 'manager')));

create policy visits_select on public.visits for select to authenticated
  using ((select public.has_role('super_admin', 'manager', 'billing')) or salesman_id = (select auth.uid()));
create policy visits_insert on public.visits for insert to authenticated
  with check ((select public.has_role('super_admin', 'manager'))
              or ((select public.has_role('salesman')) and salesman_id = (select auth.uid())));
create policy visits_update on public.visits for update to authenticated
  using ((select public.has_role('super_admin', 'manager')) or salesman_id = (select auth.uid()))
  with check ((select public.has_role('super_admin', 'manager')) or salesman_id = (select auth.uid()));

create policy targets_select on public.targets for select to authenticated
  using ((select public.has_role('super_admin', 'manager')) or salesman_id = (select auth.uid()));
create policy targets_write on public.targets for all to authenticated
  using ((select public.has_role('super_admin', 'manager')))
  with check ((select public.has_role('super_admin', 'manager')));

-- -----------------------------------------------------------------------------
-- Expenses: own entries while submitted; Manager / Admin approve or reject.
-- -----------------------------------------------------------------------------
create policy expenses_select on public.expenses for select to authenticated
  using ((select public.has_role('super_admin', 'manager', 'billing')) or salesman_id = (select auth.uid()));
create policy expenses_insert on public.expenses for insert to authenticated
  with check ((select public.is_active_user()) and salesman_id = (select auth.uid()) and status = 'submitted');
create policy expenses_update_own on public.expenses for update to authenticated
  using (salesman_id = (select auth.uid()) and status = 'submitted')
  with check (salesman_id = (select auth.uid()) and status = 'submitted');
create policy expenses_review on public.expenses for update to authenticated
  using ((select public.has_role('super_admin', 'manager')))
  with check ((select public.has_role('super_admin', 'manager')));

create policy reimbursements_select on public.reimbursements for select to authenticated
  using ((select public.has_role('super_admin', 'manager', 'billing')) or salesman_id = (select auth.uid()));
create policy reimbursements_insert on public.reimbursements for insert to authenticated
  with check ((select public.has_role('super_admin', 'manager')));

-- -----------------------------------------------------------------------------
-- Audit log: read by Super Admin & Manager; written only by triggers.
-- -----------------------------------------------------------------------------
create policy audit_log_select on public.audit_log for select to authenticated
  using ((select public.has_role('super_admin', 'manager')));
