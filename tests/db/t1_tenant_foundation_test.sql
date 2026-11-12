-- =============================================================================
-- M-T1 tests: multi-tenant foundation (0019-0021).
--   * tenant context comes only from membership; forged or foreign headers
--     give no tenant
--   * rows are stamped with the request's tenant; naming or moving to another
--     tenant is refused
--   * composite keys make cross-tenant references impossible, even for code
--     that bypasses row-level security
--   * business keys and document numbers are per tenant
-- Read isolation through row-level security is M-T2 and tested there.
-- =============================================================================
\set ON_ERROR_STOP 1

-- ---------- Apex is tenant 1 and every active user is a member ----------
do $$ begin
  assert (select count(*) from public.tenants) = 1, 'only Apex before this test';
  assert (select slug from public.tenants) = 'apex', 'Apex slug';
  assert not exists (select 1 from public.profiles p
                      where p.is_active
                        and not exists (select 1 from public.tenant_members m
                                         where m.user_id = p.id and m.tenant_id = 'a9e70000-0000-4000-8000-000000000001')),
    'every active user is an Apex member';
  assert not exists (select 1 from public.profiles p join public.tenant_members m on m.user_id = p.id
                      where m.role <> p.role or m.is_active <> p.is_active),
    'membership role and active flag equal the profile';
end $$;

-- ---------- Guard rails over the catalogue ----------
do $$
declare v text;
begin
  select string_agg(t, ', ') into v from public.tenant_scoped_tables() t
   where not exists (select 1 from pg_attribute a where a.attrelid = ('public.' || t)::regclass
                       and a.attname = 'tenant_id' and (a.attnotnull or t = 'audit_log'));
  assert v is null, 'tables without NOT NULL tenant_id: ' || coalesce(v, '');

  select string_agg(t, ', ') into v from public.tenant_scoped_tables() t
   where t <> 'audit_log'
     and not exists (select 1 from pg_trigger g where g.tgrelid = ('public.' || t)::regclass and g.tgname = 'aa_tenant_stamp');
  assert v is null, 'tables without the stamp trigger: ' || coalesce(v, '');

  select string_agg(t, ', ') into v from public.tenant_scoped_tables() t
   where not exists (select 1 from pg_constraint c where c.conrelid = ('public.' || t)::regclass
                       and c.contype = 'f' and c.confrelid = 'public.tenants'::regclass);
  assert v is null, 'tables without a tenant foreign key: ' || coalesce(v, '');

  -- no single-column reference between tenant tables or to profiles is left
  select string_agg(c.conrelid::regclass || '.' || c.conname, ', ') into v
    from pg_constraint c
   where c.contype = 'f' and c.connamespace = 'public'::regnamespace
     and array_length(c.conkey, 1) = 1
     and c.conrelid::regclass::text in (select 'public.' || t from public.tenant_scoped_tables() t
                                        union select t from public.tenant_scoped_tables() t)
     and c.confrelid <> 'public.tenants'::regclass;
  assert v is null, 'single-column foreign keys left: ' || coalesce(v, '');
end $$;

-- ---------- Tenant B and its users ----------
insert into public.tenants (id, slug, display_name, legal_name)
values ('b0000000-0000-4000-8000-00000000000b', 'conqrete-test', 'CONQRETE TEST', 'CONQRETE TEST PVT LTD');

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('b1000000-0000-4000-8000-000000000001', 'owner@b.test',
   '{"role":"super_admin","tenant_id":"b0000000-0000-4000-8000-00000000000b"}', '{"full_name":"Bela Owner"}'),
  ('b1000000-0000-4000-8000-000000000002', 'both@b.test',
   '{"role":"manager","tenant_id":"b0000000-0000-4000-8000-00000000000b"}', '{"full_name":"Bharat Both"}'),
  -- the old way (role only): with two tenants nobody can tell which one
  ('b1000000-0000-4000-8000-000000000003', 'orphan@x.test', '{"role":"salesman"}', '{}');

-- "both" also works for Apex, as billing staff
insert into public.tenant_members (tenant_id, user_id, role)
values ('a9e70000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000002', 'billing');

do $$ begin
  assert (select tenant_id from public.tenant_members where user_id = 'b1000000-0000-4000-8000-000000000001')
         = 'b0000000-0000-4000-8000-00000000000b', 'owner joined tenant B';
  assert (select default_tenant_id from public.profiles where id = 'b1000000-0000-4000-8000-000000000002')
         = 'b0000000-0000-4000-8000-00000000000b', 'default tenant = the one created in';
  assert not exists (select 1 from public.tenant_members where user_id = 'b1000000-0000-4000-8000-000000000003'),
    'role-only user gets no membership once two tenants exist';
  assert (select not is_active from public.profiles where id = 'b1000000-0000-4000-8000-000000000003'),
    'role-only user without a tenant is inactive';
end $$;

-- ---------- Context without a signed-in user ----------
do $$ begin
  assert public.current_tenant_id() = 'a9e70000-0000-4000-8000-000000000001', 'server session names Apex (app.tenant_id)';
  perform set_config('request.jwt.claim.role', 'anon', true);
  assert public.current_tenant_id() is null, 'anonymous API call never gets a tenant';
  perform set_config('request.jwt.claim.role', 'service_role', true);
  assert public.current_tenant_id() = 'a9e70000-0000-4000-8000-000000000001', 'service key with a named tenant';
  perform set_config('app.tenant_id', 'not-a-uuid', true);
  assert public.current_tenant_id() is null, 'malformed tenant setting gives no tenant';
  perform set_config('app.tenant_id', '00000000-0000-4000-8000-0000000000ff', true);
  assert public.current_tenant_id() is null, 'unknown tenant id gives no tenant';
end $$;

-- ---------- Signed-in context, headers ----------
select set_config('request.jwt.claim.sub', 'b1000000-0000-4000-8000-000000000001', false);
select set_config('request.headers', '{}', false);
set role authenticated;
do $$ begin
  assert public.current_tenant_id() = 'b0000000-0000-4000-8000-00000000000b', 'B owner, no header: own tenant';
  perform set_config('request.headers', '{"x-tenant-id":"a9e70000-0000-4000-8000-000000000001"}', true);
  assert public.current_tenant_id() is null, 'forged header naming Apex: no tenant at all';
  perform set_config('request.headers', '{"x-tenant-id":"not-a-uuid"}', true);
  assert public.current_tenant_id() is null, 'malformed header: no tenant';
  perform set_config('request.headers', 'garbage', true);
  assert public.current_tenant_id() is null, 'unreadable headers: no tenant';
  assert (select count(*) from public.my_tenants()) = 1, 'B owner belongs to one tenant';
end $$;
-- a forged header cannot be used to write into Apex either
select set_config('request.headers', '{"x-tenant-id":"a9e70000-0000-4000-8000-000000000001"}', false);
do $$ begin
  begin
    insert into public.units (code, name) values ('ZZZ', 'Forged');
    raise exception 'insert with a forged tenant header succeeded';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'b1000000-0000-4000-8000-000000000002', false);
select set_config('request.headers', '{}', false);
set role authenticated;
do $$ begin
  assert public.current_tenant_id() = 'b0000000-0000-4000-8000-00000000000b', 'two tenants, no header: default tenant';
  perform set_config('request.headers', '{"x-tenant-id":"a9e70000-0000-4000-8000-000000000001"}', true);
  assert public.current_tenant_id() = 'a9e70000-0000-4000-8000-000000000001', 'member of Apex may pick Apex';
  assert (select count(*) from public.my_tenants()) = 2, 'tenant picker lists both';
end $$;
reset role;

-- membership switched off, tenant suspended: no context
update public.tenant_members set is_active = false
 where user_id = 'b1000000-0000-4000-8000-000000000002' and tenant_id = 'a9e70000-0000-4000-8000-000000000001';
update public.tenants set status = 'suspended' where id = 'b0000000-0000-4000-8000-00000000000b';
select set_config('request.headers', '{"x-tenant-id":"a9e70000-0000-4000-8000-000000000001"}', false);
set role authenticated;
do $$ begin
  assert public.current_tenant_id() is null, 'inactive membership: no Apex context';
  perform set_config('request.headers', '{}', true);
  assert public.current_tenant_id() is null, 'default tenant suspended: no context';
end $$;
reset role;
update public.tenants set status = 'active' where id = 'b0000000-0000-4000-8000-00000000000b';
update public.tenant_members set is_active = true
 where user_id = 'b1000000-0000-4000-8000-000000000002' and tenant_id = 'a9e70000-0000-4000-8000-000000000001';

-- ---------- Stamping (signed in as B's owner) ----------
select set_config('request.jwt.claim.sub', 'b1000000-0000-4000-8000-000000000001', false);
select set_config('request.headers', '{}', false);
set role authenticated;
do $$ begin
  insert into public.units (code, name) values ('PCS', 'Pieces');   -- Apex has PCS too
  assert (select tenant_id from public.units where code = 'PCS' and name = 'Pieces'
            and tenant_id = 'b0000000-0000-4000-8000-00000000000b') is not null, 'row stamped with B';
  begin
    insert into public.units (tenant_id, code, name) values ('a9e70000-0000-4000-8000-000000000001', 'XYZ', 'Into Apex');
    raise exception 'wrote a row into another tenant';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.units set tenant_id = 'a9e70000-0000-4000-8000-000000000001'
     where code = 'PCS' and tenant_id = 'b0000000-0000-4000-8000-00000000000b';
    raise exception 'moved a row to another tenant';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- a signed-in user with no tenant (the orphan) cannot write anything
select set_config('request.jwt.claim.sub', 'b1000000-0000-4000-8000-000000000003', false);
set role authenticated;
do $$ begin
  assert public.current_tenant_id() is null, 'orphan has no tenant';
  begin
    insert into public.units (code, name) values ('ORP', 'Orphan');
    raise exception 'user without a tenant wrote a row';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);
select set_config('request.headers', '', false);

-- ---------- Composite keys (as the server, working in tenant B) ----------
select set_config('app.tenant_id', 'b0000000-0000-4000-8000-00000000000b', false);
insert into public.company_settings (legal_name, state_code, doc_prefix)
values ('CONQRETE TEST PVT LTD', '27', 'CQT');
insert into public.brands (id, name, code) values ('b2000000-0000-4000-8000-000000000001', 'CONQRETE', 'CQ');
insert into public.warehouses (id, name, brand_id) values ('b3000000-0000-4000-8000-000000000001', 'Main', 'b2000000-0000-4000-8000-000000000001');
-- same mobile and same brand name/code as in Apex: allowed, keys are per tenant
insert into public.retailers (id, shop_name, mobile)
values ('b4000000-0000-4000-8000-000000000001', 'B Mobile Point', '9822000001');

do $$ begin
  begin
    insert into public.retailers (shop_name, mobile) values ('B Duplicate', '9822000001');
    raise exception 'duplicate mobile inside one tenant was accepted';
  exception when unique_violation then null;
  end;
  begin
    -- Apex's retailer, referenced from a tenant B order
    insert into public.orders (order_no, retailer_id, credit_days)
    values ('B-ORD-1', '20000000-0000-0000-0000-000000000001', 0);
    raise exception 'tenant B order points at an Apex retailer';
  exception when foreign_key_violation then null;
  end;
  begin
    -- an Apex-only salesman assigned to a tenant B shop
    update public.retailers set salesman_id = '00000000-0000-0000-0000-000000000005'
     where id = 'b4000000-0000-4000-8000-000000000001';
    raise exception 'tenant B shop assigned to an Apex-only salesman';
  exception when foreign_key_violation then null;
  end;
  begin
    -- an Apex product on a tenant B warehouse movement
    insert into public.stock_movements (tenant_id, product_id, warehouse_id, movement_type, qty)
    values ('b0000000-0000-4000-8000-00000000000b', '30000000-0000-0000-0000-000000000001',
            'b3000000-0000-4000-8000-000000000001', 'opening', 1);
    raise exception 'Apex product booked into a tenant B warehouse';
  exception when foreign_key_violation or raise_exception then null;
  end;
end $$;

-- ---------- Numbering per tenant ----------
do $$
declare
  v_apex_before integer := (select next_value from public.number_series
                             where tenant_id = 'a9e70000-0000-4000-8000-000000000001' and doc_type = 'ORD'
                               and fy = public.fy_label(current_date));
  v_no text;
begin
  v_no := public.next_document_number('ORD');
  assert v_no = 'CQT/ORD/' || public.fy_label(current_date) || '/00001', 'tenant B numbering starts at 1: ' || v_no;
  assert public.next_document_number('ORD') like 'CQT/ORD/%/00002', 'tenant B numbering continues';
  assert (select next_value from public.number_series
           where tenant_id = 'a9e70000-0000-4000-8000-000000000001' and doc_type = 'ORD'
             and fy = public.fy_label(current_date)) is not distinct from v_apex_before,
    'Apex counter untouched by tenant B';
  assert public.brand_document_number('b2000000-0000-4000-8000-000000000001', 'INV') like 'CQ/%/00001',
    'tenant B brand invoice series starts at 1';
  begin
    perform public.brand_document_number((select id from public.brands
                                           where tenant_id = 'a9e70000-0000-4000-8000-000000000001' and code = 'CQ'), 'INV');
    raise exception 'tenant B numbered a document on an Apex brand';
  exception when raise_exception then
    if sqlerrm not like 'Brand missing%' then raise; end if;
  end;
end $$;
select set_config('app.tenant_id', 'a9e70000-0000-4000-8000-000000000001', false);

do $$ begin
  assert public.next_document_number('ZZT') like 'APX/ZZT/%/00001', 'Apex prefix still APX';
end $$;

select 'ALL TENANT FOUNDATION DATABASE TESTS PASSED' as result;
