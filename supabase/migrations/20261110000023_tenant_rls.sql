-- =============================================================================
-- Multi-tenant platform (M-T2, part 2 of 2): row-level security per tenant.
--
--   * every existing policy on a business table keeps its role / brand /
--     salesman logic and gains "tenant_id = current_tenant_id()"
--   * profiles: a person sees their own profile and the people of their
--     current tenant (no longer every user on the platform)
--   * storage: objects live under <tenant_id>/...; files uploaded before
--     multi-tenancy (no tenant folder) belong to APEX TRADING CO.
--   * advisor fixes: rls_auto_enable not callable from the API,
--     guard_invoice_update gets a fixed search path
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tenant predicate on every policy of every business table
-- -----------------------------------------------------------------------------
do $$
declare
  p      record;
  v_pred constant text := '(tenant_id = ( SELECT public.current_tenant_id() AS current_tenant_id))';
  v_sql  text;
begin
  for p in
    select pol.polname, c.relname,
           pg_get_expr(pol.polqual, pol.polrelid) as qual,
           pg_get_expr(pol.polwithcheck, pol.polrelid) as chk
      from pg_policy pol
      join pg_class c on c.oid = pol.polrelid
     where c.relnamespace = 'public'::regnamespace
       and c.relname in (select * from public.tenant_scoped_tables())
       and pol.polname <> 'definer_tenant_fence'
  loop
    v_sql := format('alter policy %I on public.%I', p.polname, p.relname);
    if p.qual is not null then
      v_sql := v_sql || format(' using (%s and (%s))', v_pred, p.qual);
    end if;
    if p.chk is not null then
      v_sql := v_sql || format(' with check (%s and (%s))', v_pred, p.chk);
    end if;
    if p.qual is null and p.chk is null then
      raise exception 'M-T2: policy % on % has no expression', p.polname, p.relname;
    end if;
    execute v_sql;
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 2. People
-- -----------------------------------------------------------------------------
drop policy profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or ((select public.is_active_user()) and public.is_tenant_member(id))
  );
drop policy profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using ((select public.has_role('super_admin')) and public.is_tenant_member(id))
  with check ((select public.has_role('super_admin')) and public.is_tenant_member(id));

-- -----------------------------------------------------------------------------
-- 3. Storage: which tenant and which user folder a file belongs to
-- -----------------------------------------------------------------------------
-- '<tenant_id>/...' -> that tenant; anything else is a file from before
-- multi-tenancy and belongs to APEX TRADING CO.
create or replace function public.storage_object_tenant(p_name text)
returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select t.id from public.tenants t where t.id::text = split_part(p_name, '/', 1)),
    'a9e70000-0000-4000-8000-000000000001'::uuid)
$$;
-- the user folder: '<tenant_id>/<user_id>/file' or, before, '<user_id>/file'
create or replace function public.storage_user_folder(p_name text)
returns text
language sql stable security definer set search_path = public as $$
  select case when exists (select 1 from public.tenants t where t.id::text = split_part(p_name, '/', 1))
              then split_part(p_name, '/', 2) else split_part(p_name, '/', 1) end
$$;
revoke all on function public.storage_object_tenant(text), public.storage_user_folder(text) from public, anon;
grant execute on function public.storage_object_tenant(text), public.storage_user_folder(text) to authenticated;

drop policy if exists "product images read" on storage.objects;
drop policy if exists "product images write" on storage.objects;
drop policy if exists "product images update" on storage.objects;
drop policy if exists "product images delete" on storage.objects;
drop policy if exists "receipts write own" on storage.objects;
drop policy if exists "receipts read" on storage.objects;
drop policy if exists "delivery proofs read" on storage.objects;
drop policy if exists "delivery proofs write" on storage.objects;
drop policy if exists "documents read" on storage.objects;
drop policy if exists "visit photos read" on storage.objects;
drop policy if exists "visit photos write own" on storage.objects;

create policy "product images read" on storage.objects for select to authenticated
  using (bucket_id = 'product-images'
         and public.storage_object_tenant(name) = (select public.current_tenant_id())
         and (select public.is_active_user()));
create policy "product images write" on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images'
              and public.storage_object_tenant(name) = (select public.current_tenant_id())
              and (select public.has_role('super_admin', 'manager')));
create policy "product images update" on storage.objects for update to authenticated
  using (bucket_id = 'product-images'
         and public.storage_object_tenant(name) = (select public.current_tenant_id())
         and (select public.has_role('super_admin', 'manager')));
create policy "product images delete" on storage.objects for delete to authenticated
  using (bucket_id = 'product-images'
         and public.storage_object_tenant(name) = (select public.current_tenant_id())
         and (select public.has_role('super_admin', 'manager')));

create policy "receipts write own" on storage.objects for insert to authenticated
  with check (bucket_id = 'expense-receipts'
              and public.storage_object_tenant(name) = (select public.current_tenant_id())
              and (select public.is_active_user())
              and public.storage_user_folder(name) = (select auth.uid())::text);
create policy "receipts read" on storage.objects for select to authenticated
  using (bucket_id = 'expense-receipts'
         and public.storage_object_tenant(name) = (select public.current_tenant_id())
         and ((select public.has_role('super_admin', 'manager', 'billing'))
              or public.storage_user_folder(name) = (select auth.uid())::text
              or exists (select 1 from public.expenses e where e.receipt_path = objects.name and e.employee_id = (select auth.uid()))
              or exists (select 1 from public.reimbursements r where r.proof_path = objects.name and r.employee_id = (select auth.uid()))));

create policy "delivery proofs read" on storage.objects for select to authenticated
  using (bucket_id = 'delivery-proofs'
         and public.storage_object_tenant(name) = (select public.current_tenant_id())
         and (select public.has_role('super_admin', 'manager', 'billing', 'warehouse')));
create policy "delivery proofs write" on storage.objects for insert to authenticated
  with check (bucket_id = 'delivery-proofs'
              and public.storage_object_tenant(name) = (select public.current_tenant_id())
              and (select public.has_role('super_admin', 'manager', 'warehouse')));

create policy "documents read" on storage.objects for select to authenticated
  using (bucket_id = 'documents'
         and public.storage_object_tenant(name) = (select public.current_tenant_id())
         and (select public.has_role('super_admin', 'manager', 'billing', 'warehouse', 'salesman')));

create policy "visit photos read" on storage.objects for select to authenticated
  using (bucket_id = 'visit-photos'
         and public.storage_object_tenant(name) = (select public.current_tenant_id())
         and ((select public.has_role('super_admin', 'manager'))
              or public.storage_user_folder(name) = (select auth.uid())::text));
create policy "visit photos write own" on storage.objects for insert to authenticated
  with check (bucket_id = 'visit-photos'
              and public.storage_object_tenant(name) = (select public.current_tenant_id())
              and (select public.is_active_user())
              and public.storage_user_folder(name) = (select auth.uid())::text);

-- -----------------------------------------------------------------------------
-- 4. Advisor fixes
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_proc where proname = 'rls_auto_enable' and pronamespace = 'public'::regnamespace) then
    execute 'revoke all on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end $$;
alter function public.guard_invoice_update() set search_path = public;

-- -----------------------------------------------------------------------------
-- 5. Check: every policy on a business table, and every storage policy,
--    is bound to the current tenant
-- -----------------------------------------------------------------------------
do $$
declare v text;
begin
  select string_agg(c.relname || '.' || pol.polname, ', ') into v
    from pg_policy pol
    join pg_class c on c.oid = pol.polrelid
   where ((c.relnamespace = 'public'::regnamespace
           and c.relname in (select * from public.tenant_scoped_tables() union all select 'profiles'))
          or (c.relnamespace = 'storage'::regnamespace and c.relname = 'objects'))
     and coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') || coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '')
         !~ '(current_tenant_id|is_tenant_member)\(';
  if v is not null then raise exception 'M-T2 check failed: policies without the tenant check: %', v; end if;
end $$;
