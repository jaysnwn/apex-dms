-- =============================================================================
-- M-T2 tests: complete isolation between tenants.
--
-- A second distributor ("ISO") is set up and runs real business through the
-- same functions Apex uses (quotation, invoice, payment, dispatch, purchase,
-- receipt, classification). Then, signed in as Apex users of every role:
--   1. every table holds no visible ISO row
--   2. every view shows no ISO id
--   3. EVERY function a signed-in user may call (found from the catalogue, so
--      new functions are covered without editing this test) is called twice:
--      with ISO's ids and with ids that exist nowhere ("ghosts"). ISO's
--      records must be indistinguishable from records that do not exist:
--      same result, same error. No ISO id or name may come back, and no ISO
--      row may change.
--   4. a forged tenant header gives nothing
--   5. storage files of one tenant are invisible / unwritable for the other
-- and the same from ISO towards Apex for tables, people and the catalogue.
-- Runs after the m* suites and t1.
-- =============================================================================
\set ON_ERROR_STOP 1

create schema iso;
grant usage on schema iso to authenticated;
create table iso.ref (k text primary key, v uuid not null);
create table iso.ghost (k text primary key, v uuid not null);
create table iso.attack_log (attacker text, fn text, nargs int, sent text, outcome text, result text,
                             ghost_outcome text, ghost_result text, iso_changed boolean);
create table iso.tables as select t as name from public.tenant_scoped_tables() t;
-- answers that legitimately differ between two identical calls (a counter moves on)
create table iso.nondeterministic (fn text primary key, why text);
insert into iso.nondeterministic values
  ('next_retailer_code', 'takes the next number of the caller''s own series on every call');
grant select on iso.ref, iso.ghost, iso.tables, iso.nondeterministic to authenticated;
grant all on iso.attack_log to authenticated;

-- ---------- ISO tenant: settings and master data (as the server, in ISO) ----------
insert into public.tenants (id, slug, display_name, legal_name)
values ('c0000000-0000-4000-8000-00000000000c', 'iso-dist', 'ISO DISTRIBUTORS', 'ISO DISTRIBUTORS LLP');
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('c1000000-0000-4000-8000-000000000001', 'owner@iso.test', '{"role":"super_admin","tenant_id":"c0000000-0000-4000-8000-00000000000c"}', '{"full_name":"ISO Owner"}'),
  ('c1000000-0000-4000-8000-000000000002', 'sales@iso.test', '{"role":"salesman","tenant_id":"c0000000-0000-4000-8000-00000000000c"}', '{"full_name":"ISO Salesman"}');

select set_config('app.tenant_id', 'c0000000-0000-4000-8000-00000000000c', false);
insert into public.company_settings (legal_name, state_code, doc_prefix) values ('ISO DISTRIBUTORS LLP', '27', 'ISO');
insert into public.units (code, name) values ('PCS', 'Pieces');
insert into public.brands (id, name, code) values ('c2000000-0000-4000-8000-000000000001', 'ISOBRAND', 'IB');
insert into public.profile_brands (user_id, brand_id) values
  ('c1000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001'),
  ('c1000000-0000-4000-8000-000000000002', 'c2000000-0000-4000-8000-000000000001');
insert into public.warehouses (id, name, brand_id) values ('c3000000-0000-4000-8000-000000000001', 'ISO Godown', 'c2000000-0000-4000-8000-000000000001');
insert into public.categories (id, name, brand_id) values ('c4000000-0000-4000-8000-000000000001', 'ISO Secret Category', 'c2000000-0000-4000-8000-000000000001');
insert into public.products (id, name, brand_id, sku, category_id, purchase_cost, retailer_price, mrp, gst_rate)
values ('c5000000-0000-4000-8000-000000000001', 'ISO Secret Powerbank', 'c2000000-0000-4000-8000-000000000001', 'ISO-1',
        'c4000000-0000-4000-8000-000000000001', 500, 800, 1200, 18);
insert into public.stock_movements (product_id, warehouse_id, movement_type, qty, reason)
values ('c5000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001', 'opening', 100, 'opening');
insert into public.suppliers (id, name) values ('c6000000-0000-4000-8000-000000000001', 'ISO Secret Supplier');
insert into public.expense_categories (id, code, name) values ('c7000000-0000-4000-8000-000000000001', 'iso_fuel', 'ISO Secret Fuel');
insert into public.routes (id, name, default_salesman_id) values ('c8000000-0000-4000-8000-000000000001', 'ISO Secret Route', 'c1000000-0000-4000-8000-000000000002');
-- ISO's shop: its own mobile number, so a leaking lookup would find it
insert into public.retailers (id, shop_name, mobile, salesman_id, route_id)
values ('c9000000-0000-4000-8000-000000000001', 'ISO Secret Shop', '9822000099',
        'c1000000-0000-4000-8000-000000000002', 'c8000000-0000-4000-8000-000000000001');
-- and the same mobile as an Apex shop is allowed in another business
insert into public.retailers (id, shop_name, mobile)
values ('c9000000-0000-4000-8000-000000000002', 'ISO Twin Shop', '9822000001');
select set_config('app.tenant_id', 'a9e70000-0000-4000-8000-000000000001', false);

do $$ begin
  assert (select code from public.retailers where id = 'c9000000-0000-4000-8000-000000000001') = 'ISO-R-0001',
    'ISO retailer codes start at ISO-R-0001: ' || (select code from public.retailers where id = 'c9000000-0000-4000-8000-000000000001');
  assert (select billing_state_code from public.retailers where id = 'c9000000-0000-4000-8000-000000000001') = '27',
    'default state = the tenant''s state';
end $$;

-- Apex shops' classification and updated_at, before ISO runs classify_retailers()
create table iso.apex_class as
  select id, classification, updated_at from public.retailers where tenant_id = 'a9e70000-0000-4000-8000-000000000001';

-- ---------- ISO runs real business through the shared functions ----------
select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000001', false);
select set_config('request.headers', '{}', false);
set role authenticated;
do $$
declare v_o uuid; v_inv uuid; v_pay uuid; v_d uuid; v_po uuid;
begin
  assert public.current_tenant_id() = 'c0000000-0000-4000-8000-00000000000c', 'ISO owner works in ISO';
  assert (select count(*) from public.retailers) = 2, 'ISO owner sees exactly ISO''s two shops';
  v_o := public.save_quotation(null, 'c9000000-0000-4000-8000-000000000001', 15, null,
    '[{"product_id":"c5000000-0000-4000-8000-000000000001","qty":10}]'::jsonb);
  v_inv := public.confirm_order(v_o);
  assert (select invoice_no from public.invoices where id = v_inv) = 'IB/' || public.fy_label(current_date) || '/00001',
    'ISO invoice numbering starts at 1: ' || (select invoice_no from public.invoices where id = v_inv);
  v_pay := public.record_payment('c9000000-0000-4000-8000-000000000001', 500, 'cash');
  v_d := public.dispatch_invoice(v_inv, 'c3000000-0000-4000-8000-000000000001', 'MH17 ISO 1', null);
  v_po := public.save_purchase(null, 'c6000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001',
    null, null, 30, 0, null, '[{"product_id":"c5000000-0000-4000-8000-000000000001","qty":5,"unit_cost":500}]'::jsonb);
  perform public.receive_purchase(v_po, 'ISO-BILL-1', current_date);
  assert (select sum(qty) from public.stock_movements) = 95, 'ISO stock 100 - 10 dispatched + 5 received';
  assert (select balance from public.invoice_balances where invoice_id = v_inv) > 0, 'ISO invoice part-paid';
  perform public.classify_retailers();
  perform set_config('iso.inv', v_inv::text, false);
  perform set_config('iso.ord', v_o::text, false);
  perform set_config('iso.pay', v_pay::text, false);
  perform set_config('iso.dsp', v_d::text, false);
  perform set_config('iso.pur', v_po::text, false);
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);

-- ISO's classification run did not touch a single Apex shop
do $$ begin
  assert not exists (select 1 from iso.apex_class a join public.retailers r on r.id = a.id
                      where (r.classification, r.updated_at) is distinct from (a.classification, a.updated_at)),
    'ISO classify_retailers changed Apex shops';
end $$;

insert into iso.ref values
  ('tenant',   'c0000000-0000-4000-8000-00000000000c'),
  ('owner',    'c1000000-0000-4000-8000-000000000001'),
  ('salesman', 'c1000000-0000-4000-8000-000000000002'),
  ('brand',    'c2000000-0000-4000-8000-000000000001'),
  ('warehouse','c3000000-0000-4000-8000-000000000001'),
  ('category', 'c4000000-0000-4000-8000-000000000001'),
  ('product',  'c5000000-0000-4000-8000-000000000001'),
  ('supplier', 'c6000000-0000-4000-8000-000000000001'),
  ('expcat',   'c7000000-0000-4000-8000-000000000001'),
  ('route',    'c8000000-0000-4000-8000-000000000001'),
  ('retailer', 'c9000000-0000-4000-8000-000000000001'),
  ('invoice',  current_setting('iso.inv')::uuid),
  ('order',    current_setting('iso.ord')::uuid),
  ('payment',  current_setting('iso.pay')::uuid),
  ('dispatch', current_setting('iso.dsp')::uuid),
  ('purchase', current_setting('iso.pur')::uuid),
  ('expense',  'c7000000-0000-4000-8000-0000000000ee');   -- ISO has no expense row: any id behaves as a ghost
insert into iso.ref select 'invoice_line', id from public.invoice_lines where invoice_id = current_setting('iso.inv')::uuid;
insert into iso.ref select 'purchase_line', id from public.purchase_lines where purchase_id = current_setting('iso.pur')::uuid;
insert into iso.ghost select k, gen_random_uuid() from iso.ref;

-- Fingerprint of every ISO row (as the server; audit rows excluded, they only grow)
create function iso.fp() returns text language plpgsql security definer as $$
declare t text; v text; acc text := '';
begin
  for t in select * from public.tenant_scoped_tables() loop
    continue when t = 'audit_log';
    execute format('select md5(coalesce(string_agg(to_jsonb(x)::text, %L order by to_jsonb(x)::text), %L)) from public.%I x where tenant_id = %L',
                   '|', '', t, 'c0000000-0000-4000-8000-00000000000c') into v;
    acc := acc || t || ':' || v || ';';
  end loop;
  return md5(acc);
end $$;
select set_config('iso.fp_before', iso.fp(), false);

-- ---------- Checks run as the signed-in user ----------
-- 1. tables: no row of the other tenant visible
create function iso.check_tables(p_other uuid, p_who text) returns void language plpgsql as $$
declare t text; n bigint;
begin
  for t in select name from iso.tables loop
    begin
      execute format('select count(*) from public.%I where tenant_id = %L', t, p_other) into n;
    exception when insufficient_privilege then n := 0;   -- table not readable at all
    end;
    if n > 0 then raise exception '% sees % rows of the other tenant in %', p_who, n, t; end if;
  end loop;
end $$;

-- 2. views: no id of ISO in any uuid column of any readable view
create function iso.check_views(p_who text) returns void language plpgsql as $$
declare r record; n bigint;
begin
  for r in select c.relname as v, a.attname as col
             from pg_class c join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
            where c.relnamespace = 'public'::regnamespace and c.relkind = 'v' and a.atttypid = 'uuid'::regtype
              and has_table_privilege(c.oid, 'select')
  loop
    execute format('select count(*) from public.%I where %I in (select v from iso.ref)', r.v, r.col) into n;
    if n > 0 then raise exception '% sees ISO ids in view %.% (% rows)', p_who, r.v, r.col, n; end if;
  end loop;
end $$;

-- 3. functions: ISO ids vs ghost ids
create function iso.id(p_set text, p_k text) returns uuid language sql stable as $$
  select case p_set when 'iso' then (select v from iso.ref where k = p_k) else (select v from iso.ghost where k = p_k) end
$$;

create function iso.build_args(p_oid oid, p_set text) returns text language plpgsql stable as $$
declare
  f record; a record; v_val text; v_args text := ''; v_ref text;
begin
  select p.pronargs, p.proargtypes::oid[] as types, p.proargnames as names into f from pg_proc p where p.oid = p_oid;
  for a in select i, coalesce(f.names[i], 'arg' || i) as n, f.types[i - 1 + array_lower(f.types, 1)] as t
             from generate_series(1, f.pronargs) i
  loop
    v_ref := case
      when a.n ~ 'retailer|outlet|shop' then 'retailer'
      when a.n ~ 'invoice' then 'invoice'
      when a.n ~ 'order' then 'order'
      when a.n ~ 'payment|payout' then 'payment'
      when a.n ~ 'product' then 'product'
      when a.n ~ 'warehouse|wh' then 'warehouse'
      when a.n ~ 'brand' then 'brand'
      when a.n ~ 'purchase|po' then 'purchase'
      when a.n ~ 'supplier' then 'supplier'
      when a.n ~ 'route' then 'route'
      when a.n ~ 'dispatch' then 'dispatch'
      when a.n ~ 'categor' then 'expcat'
      when a.n ~ 'salesman|user|employee|emp' then 'salesman'
      else 'invoice' end;
    v_val := case
      when a.t = 'uuid'::regtype then quote_literal(iso.id(p_set, v_ref)) || '::uuid'
      when a.t = 'uuid[]'::regtype then format('array[%L, %L, %L]::uuid[]',
             iso.id(p_set, 'retailer'), iso.id(p_set, 'product'), iso.id(p_set, 'payment'))
      when a.t = 'jsonb'::regtype then quote_literal(format(
             '[{"product_id":"%s","qty":1,"unit_cost":1,"invoice_id":"%s","amount":1,"invoice_line_id":"%s","purchase_line_id":"%s","purchase_id":"%s","retailer_id":"%s","expense_id":"%s"}]',
             iso.id(p_set, 'product'), iso.id(p_set, 'invoice'), iso.id(p_set, 'invoice_line'),
             iso.id(p_set, 'purchase_line'), iso.id(p_set, 'purchase'), iso.id(p_set, 'retailer'), iso.id(p_set, 'expense'))) || '::jsonb'
      -- text: ISO's real values where the name suggests a lookup; ghosts get values nobody has
      when a.t in ('text'::regtype, 'character varying'::regtype) then quote_nullable(case
             when a.n ~ 'mobile|phone' then case p_set when 'iso' then '9822000099' else '9822000098' end
             when a.n ~ 'shop|name' then case p_set when 'iso' then 'ISO Secret Shop' else 'Nobody Here Store' end
             when a.n ~ 'sku|code' then case p_set when 'iso' then 'ISO-1' else 'NONE-1' end
             when a.n ~ 'bill' then case p_set when 'iso' then 'ISO-BILL-1' else 'NONE-BILL-1' end
             when a.n ~ 'city' then null
             else 'x' end)
      when a.t in ('numeric'::regtype, 'integer'::regtype, 'smallint'::regtype, 'bigint'::regtype) then '1'
      when a.t = 'smallint[]'::regtype then quote_literal('{1}') || '::smallint[]'
      when a.t = 'date'::regtype then 'current_date'
      when a.t = 'timestamp with time zone'::regtype then quote_literal('2026-11-09 10:00+05:30') || '::timestamptz'
      when a.t = 'boolean'::regtype then 'true'
      when exists (select 1 from pg_enum e where e.enumtypid = a.t) then
           quote_literal((select e.enumlabel from pg_enum e where e.enumtypid = a.t order by e.enumsortorder limit 1)) || '::' || a.t::regtype::text
      else 'null' end;
    v_args := v_args || case when v_args = '' then '' else ', ' end || coalesce(v_val, 'null');
  end loop;
  return v_args;
end $$;

-- every known id / value replaced by its key, so ISO and ghost compare equal
-- whenever the function treats them alike
create function iso.norm(p_text text) returns text language plpgsql stable as $$
declare r record; v_out text := p_text;
begin
  if v_out is null then return null; end if;
  for r in select x.k, x.v as id from iso.ref x union all select g.k, g.v from iso.ghost g loop
    v_out := replace(v_out, r.id::text, '<' || r.k || '>');
  end loop;
  v_out := replace(replace(v_out, '9822000099', '<mobile>'), '9822000098', '<mobile>');
  v_out := replace(replace(v_out, 'ISO Secret Shop', '<name>'), 'Nobody Here Store', '<name>');
  v_out := replace(replace(v_out, 'ISO-BILL-1', '<bill>'), 'NONE-BILL-1', '<bill>');
  v_out := replace(replace(v_out, 'ISO-1', '<sku>'), 'NONE-1', '<sku>');
  return v_out;
end $$;

-- One call, its side effects rolled back afterwards (so the ghost call and the
-- ISO call see the same state), but ISO's fingerprint taken BEFORE the rollback
-- so a write into ISO is still caught.
create function iso.call(p_oid oid, p_set text, out sent text, out outcome text, out result text, out iso_changed boolean)
language plpgsql as $$
declare f record;
begin
  select p.proname, p.proretset into f from pg_proc p where p.oid = p_oid;
  if f.proretset then
    sent := format('select string_agg(x::text, %L) from public.%I(%s) x', ' | ', f.proname, iso.build_args(p_oid, p_set));
  else
    sent := format('select (public.%I(%s))::text', f.proname, iso.build_args(p_oid, p_set));
  end if;
  iso_changed := false;
  begin
    begin
      execute sent into result;
      outcome := 'ok';
      iso_changed := iso.fp() <> current_setting('iso.fp_before');
      raise exception using errcode = 'ZZ999', message = 'rollback';   -- undo the call's side effects
    exception when sqlstate 'ZZ999' then null;
    end;
  exception when others then
    outcome := sqlstate; result := sqlerrm;
  end;
end $$;

create function iso.attack(p_who text) returns integer language plpgsql as $$
declare f record; g record; i record; v_n integer := 0;
begin
  for f in
    select p.oid, p.proname, p.pronargs
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
       and p.prorettype <> 'trigger'::regtype
       and has_function_privilege(p.oid, 'execute')
       and p.proname not in ('has_role')          -- variadic role list, no ids
       and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')   -- extension functions (pgcrypto, pg_trgm)
     order by p.proname
  loop
    g := iso.call(f.oid, 'ghost');
    i := iso.call(f.oid, 'iso');
    insert into iso.attack_log values (p_who, f.proname, f.pronargs, i.sent, i.outcome, i.result, g.outcome, g.result,
                                       i.iso_changed or g.iso_changed);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
grant execute on all functions in schema iso to authenticated;

-- ---------- Apex users of every role against ISO ----------
do $$
declare u record; v_n integer;
begin
  for u in select * from (values
    ('00000000-0000-0000-0000-000000000001', 'apex super_admin'),
    ('00000000-0000-0000-0000-000000000002', 'apex manager'),
    ('00000000-0000-0000-0000-000000000003', 'apex billing'),
    ('00000000-0000-0000-0000-000000000004', 'apex warehouse'),
    ('00000000-0000-0000-0000-000000000005', 'apex salesman')) x(id, who)
  loop
    perform set_config('request.jwt.claim.sub', u.id, false);
    perform set_config('request.headers', '{}', false);
    set local role authenticated;
    assert public.current_tenant_id() = 'a9e70000-0000-4000-8000-000000000001', u.who || ' works in Apex';
    perform iso.check_tables('c0000000-0000-4000-8000-00000000000c', u.who);
    perform iso.check_views(u.who);
    v_n := iso.attack(u.who);
    assert v_n >= 80, u.who || ' attacked only ' || v_n || ' functions';
    reset role;
  end loop;
end $$;
select set_config('request.jwt.claim.sub', '', false);

do $$
declare v text; n_ok integer; n_total integer;
begin
  -- a. no ISO id or name in any answer
  select string_agg(distinct l.attacker || ' -> ' || l.fn, '; ') into v
    from iso.attack_log l
   where l.fn <> 'storage_user_folder'   -- only splits the path text it is given (echoes the input)
     and (l.result ~* 'ISO Secret|ISO Twin|ISO-R-|IB/'
          or exists (select 1 from iso.ref r where r.k <> 'expense' and l.result like '%' || r.v || '%'));
  assert v is null, 'ISO data came back from: ' || coalesce(v, '');

  -- b. ISO's records behave exactly like records that do not exist
  select string_agg(distinct l.fn || ' [' || l.attacker || ']: ghost ' || l.ghost_outcome || ' "'
                    || left(coalesce(iso.norm(l.ghost_result), ''), 70) || '" vs ISO ' || l.outcome || ' "'
                    || left(coalesce(iso.norm(l.result), ''), 70) || '"', E'\n') into v
    from iso.attack_log l
   where l.fn not in (select fn from iso.nondeterministic)
     and (l.outcome is distinct from l.ghost_outcome or iso.norm(l.result) is distinct from iso.norm(l.ghost_result));
  assert v is null, E'ISO records are distinguishable from non-existent ones:\n' || coalesce(v, '');

  -- c. no ISO row changed, not even inside a call that was rolled back afterwards
  select string_agg(distinct attacker || ' -> ' || fn, '; ') into v from iso.attack_log where iso_changed;
  assert v is null, 'calls that changed ISO rows: ' || coalesce(v, '');
  assert iso.fp() = current_setting('iso.fp_before'), 'an ISO row changed during the attacks';

  -- d. every call really carried its arguments (a NULL must never swallow the list)
  select string_agg(distinct fn, ', ') into v from iso.attack_log
   where nargs > 0 and sent ~ ('public\.' || fn || '\(\)');
  assert v is null, 'functions called without their arguments: ' || coalesce(v, '');

  select count(*) filter (where outcome = 'ok'), count(*) into n_ok, n_total from iso.attack_log;
  raise notice 'function calls with ISO ids: % (each repeated with non-existent ids; % returned without error; ISO indistinguishable from nothing in every case)',
    n_total, n_ok;
end $$;

-- ---------- Forged header: Apex admin naming ISO ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
select set_config('request.headers', '{"x-tenant-id":"c0000000-0000-4000-8000-00000000000c"}', false);
set role authenticated;
do $$ begin
  assert public.current_tenant_id() is null, 'forged header gives no tenant';
  assert (select count(*) from public.retailers) = 0, 'forged header: no retailers at all';
  assert (select count(*) from public.invoices) = 0, 'forged header: no invoices';
  assert (select count(*) from public.catalog) = 0, 'forged header: empty catalogue view';
  assert (select count(*) from public.retailer_balances) = 0, 'forged header: no balances';
  assert (select count(*) from public.profiles) = 1, 'forged header: only own profile';
  begin
    perform public.confirm_order((select v from iso.ref where k = 'order'));
    raise exception 'forged header confirmed an ISO order';
  exception when others then
    if sqlerrm like 'forged header confirmed%' then raise; end if;
  end;
end $$;
reset role;
select set_config('request.headers', '{}', false);

-- ---------- ISO owner and salesman towards Apex ----------
do $$
declare u record;
begin
  for u in select * from (values
    ('c1000000-0000-4000-8000-000000000001', 'iso owner'),
    ('c1000000-0000-4000-8000-000000000002', 'iso salesman')) x(id, who)
  loop
    perform set_config('request.jwt.claim.sub', u.id, false);
    set local role authenticated;
    perform iso.check_tables('a9e70000-0000-4000-8000-000000000001', u.who);
    assert (select count(*) from public.profiles) = 2, u.who || ' sees only ISO''s 2 people, not Apex staff';
    assert not exists (select 1 from public.catalog where brand_id <> 'c2000000-0000-4000-8000-000000000001'), u.who || ' catalogue';
    reset role;
  end loop;
end $$;
select set_config('request.jwt.claim.sub', '', false);

-- ---------- Storage ----------
insert into storage.objects (bucket_id, name) values
  ('product-images', 'products/apex-legacy.png'),                                     -- before multi-tenancy = Apex
  ('product-images', 'c0000000-0000-4000-8000-00000000000c/products/iso.png'),
  ('expense-receipts', 'c0000000-0000-4000-8000-00000000000c/c1000000-0000-4000-8000-000000000002/r.jpg');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$ begin
  assert (select count(*) from storage.objects where name like 'c0000000%') = 0, 'Apex admin sees ISO files';
  assert (select count(*) from storage.objects where name = 'products/apex-legacy.png') = 1, 'Apex admin sees Apex legacy file';
  begin
    insert into storage.objects (bucket_id, name) values ('product-images', 'c0000000-0000-4000-8000-00000000000c/products/evil.png');
    raise exception 'Apex admin wrote into ISO''s folder';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000001', false);
set role authenticated;
do $$ begin
  assert (select count(*) from storage.objects where name = 'products/apex-legacy.png') = 0, 'ISO sees Apex legacy file';
  assert (select count(*) from storage.objects where name like 'c0000000%') = 2, 'ISO owner sees ISO files';
  begin
    insert into storage.objects (bucket_id, name) values ('product-images', 'products/evil.png');  -- legacy path = Apex
    raise exception 'ISO wrote a file that counts as Apex''s';
  exception when insufficient_privilege then null;
  end;
  insert into storage.objects (bucket_id, name) values ('product-images', 'c0000000-0000-4000-8000-00000000000c/products/ok.png');
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000002', false);
set role authenticated;
do $$ begin
  assert (select count(*) from storage.objects where bucket_id = 'expense-receipts') = 1, 'salesman sees own receipt in own tenant folder';
  begin
    insert into storage.objects (bucket_id, name) values ('expense-receipts', 'c0000000-0000-4000-8000-00000000000c/c1000000-0000-4000-8000-000000000001/x.jpg');
    raise exception 'salesman wrote into another user''s receipt folder';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);

-- ---------- Guard rails ----------
do $$
declare v text;
begin
  select string_agg(p.proname, ', ') into v from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.prosecdef and pg_get_userbyid(p.proowner) <> 'app_definer'
     and p.proname not in (select * from public.platform_definer_allowlist());
  assert v is null, 'owner-rights functions outside the fence: ' || coalesce(v, '');

  select string_agg(c.relname, ', ') into v from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind = 'v'
     and not coalesce(c.reloptions::text ~ 'security_invoker=(true|on)', false)
     and pg_get_userbyid(c.relowner) <> 'app_definer';
  assert v is null, 'owner-rights views outside the fence: ' || coalesce(v, '');

  select string_agg(t, ', ') into v from public.tenant_scoped_tables() t
   where not exists (select 1 from pg_policy pol where pol.polrelid = ('public.' || t)::regclass
                       and pol.polname = 'definer_tenant_fence');
  assert v is null, 'tables without the definer fence: ' || coalesce(v, '');
end $$;

select 'ALL TENANT ISOLATION DATABASE TESTS PASSED' as result;
