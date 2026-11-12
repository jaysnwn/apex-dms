-- =============================================================================
-- Fast search and lists at volume (no business data changes).
--
-- Measured at planning volume (100k products, 50k retailers, 200k invoices in
-- one business; tests/perf): product search took 205-381 ms and invoice search
-- up to 266 ms of database time, because each search ORs five columns across
-- a join, so no index can be used and every row is read.
--
--   * one search column per table holding everything the search box matches,
--     with a trigram index (finds "65w" or "ganesh" anywhere in the text):
--       products.search_text   name, SKU, barcode, description, category name
--                              (kept up to date by triggers, also on a
--                              category rename)
--       retailers.search_text  shop, owner, mobile, code, city, GSTIN (computed
--                              by the database)
--       invoices.search_text   invoice number, shop name: written once when the
--                              invoice is created. Both never change on an
--                              issued invoice, so the issued-invoice guard sees
--                              no change. (A computed column would: in a
--                              before-update check it is not yet worked out.)
--     An index on the expression alone was measured too: the planner does not
--     use it and recomputes the text for every row (157-187 ms).
--   * catalog and retailer_directory views expose the column (added at the end)
--   * list order indexes per business: invoices by date, products and
--     retailers by name
--   * indexes for foreign keys on busy lookup paths
--   * search functions that use the search index first (see section 5)
-- Rollback: supabase/rollback/20261110000026_to_0025_down.sql (views restored
-- exactly from the copies kept in mt_rollback.views_0026).
-- =============================================================================

-- keep the views as they are now, for the rollback
create table mt_rollback.views_0026 (name text primary key, def text not null, owner text not null,
                                     options text[], acl aclitem[]);
insert into mt_rollback.views_0026
select c.relname, pg_get_viewdef(c.oid), pg_get_userbyid(c.relowner), c.reloptions, c.relacl
  from pg_class c
 where c.relnamespace = 'public'::regnamespace
   and c.relname in ('catalog', 'retailer_directory', 'product_stock', 'purchase_receipts', 'stock_ledger', 'stock_on_hand');

-- -----------------------------------------------------------------------------
-- 1. Products: search text with the category name, kept by triggers
-- -----------------------------------------------------------------------------
alter table public.products add column search_text text;

create or replace function public.products_search_text_set()
returns trigger language plpgsql set search_path = public as $$
begin
  -- trigger functions cannot be called through the API: nothing extra is exposed
  new.search_text := lower(new.name || ' ' || coalesce(new.sku, '') || ' ' || coalesce(new.barcode, '') || ' '
                           || coalesce(new.description, '') || ' '
                           || coalesce((select c.name from public.categories c where c.id = new.category_id), ''));
  return new;
end $$;
create trigger products_search_text before insert or update of name, sku, barcode, description, category_id
  on public.products for each row execute function public.products_search_text_set();

-- a category renamed: its products are found by the new name
create or replace function public.categories_search_text_sync()
returns trigger language plpgsql set search_path = public as $$
begin
  update public.products p
     set search_text = lower(p.name || ' ' || coalesce(p.sku, '') || ' ' || coalesce(p.barcode, '') || ' '
                             || coalesce(p.description, '') || ' ' || new.name)
   where p.category_id = new.id and p.tenant_id = new.tenant_id;
  return null;
end $$;
create trigger categories_search_text after update of name on public.categories
  for each row when (old.name is distinct from new.name) execute function public.categories_search_text_sync();

-- existing products (no audit rows: nothing a person changed)
alter table public.products disable trigger user;
update public.products p
   set search_text = lower(p.name || ' ' || coalesce(p.sku, '') || ' ' || coalesce(p.barcode, '') || ' '
                           || coalesce(p.description, '') || ' '
                           || coalesce((select c.name from public.categories c where c.id = p.category_id), ''));
alter table public.products enable trigger user;
alter table public.products alter column search_text set not null;


-- -----------------------------------------------------------------------------
-- 2. Retailers (computed) and invoices (written once, at creation)
-- -----------------------------------------------------------------------------
alter table public.retailers add column search_text text generated always as (
  lower(shop_name || ' ' || coalesce(owner_name, '') || ' ' || coalesce(mobile, '') || ' ' || coalesce(code, '') || ' ' || coalesce(billing_city, '') || ' ' || coalesce(gstin, ''))) stored;

alter table public.invoices add column search_text text;
create or replace function public.invoices_search_text_set()
returns trigger language plpgsql set search_path = public as $$
begin
  new.search_text := lower(new.invoice_no || ' ' || coalesce(new.retailer_snapshot ->> 'shop_name', ''));
  return new;
end $$;
create trigger invoices_search_text before insert on public.invoices
  for each row execute function public.invoices_search_text_set();
alter table public.invoices disable trigger user;          -- the issued-invoice guard and audit stay out of the backfill
update public.invoices set search_text = lower(invoice_no || ' ' || coalesce(retailer_snapshot ->> 'shop_name', ''));
alter table public.invoices enable trigger user;
alter table public.invoices alter column search_text set not null;

-- -----------------------------------------------------------------------------
-- 3. Indexes
-- -----------------------------------------------------------------------------
create index products_search_trgm on public.products using gin (search_text extensions.gin_trgm_ops);
create index retailers_search_trgm on public.retailers using gin (search_text extensions.gin_trgm_ops);
create index invoices_search_trgm on public.invoices using gin (search_text extensions.gin_trgm_ops);

create index invoices_tenant_date_idx on public.invoices (tenant_id, invoice_date desc, invoice_no desc);
create index products_tenant_name_idx on public.products (tenant_id, name);
create index retailers_tenant_shop_idx on public.retailers (tenant_id, shop_name);

create index journal_lines_employee_idx on public.journal_lines (tenant_id, employee_id) where employee_id is not null;
create index journal_entries_reverses_idx on public.journal_entries (tenant_id, reverses_id) where reverses_id is not null;
create index purchase_return_lines_return_idx on public.purchase_return_lines (tenant_id, return_id);
create index incentive_payouts_scheme_idx on public.incentive_payouts (tenant_id, scheme_id);
create index visits_rescheduled_from_idx on public.visits (tenant_id, rescheduled_from) where rescheduled_from is not null;
create index route_outlets_location_idx on public.route_outlets (tenant_id, location_id);

-- -----------------------------------------------------------------------------
-- 4. Views.
--    a) catalog and retailer_directory get the search column (added at the end).
--    b) The brand filter `brand_id = ANY (my_brand_ids())` was evaluated once
--       PER ROW in five views: 100,000 calls (1.8 s) for one product search at
--       planning volume. Written as a sub-select it runs once per query; the
--       result is the same. (The tables' own policies were already written so.)
--    CREATE OR REPLACE VIEW drops options it is not given: retailer_directory
--    must stay security_invoker (else it reads retailers with its owner's
--    rights and skips row security) and stock_ledger security_barrier, so each
--    view's own options are passed back. Owners do not change.
-- -----------------------------------------------------------------------------
do $$
declare
  r record;
  v_new text;
  v_n int;
begin
  for r in select * from mt_rollback.views_0026 order by name loop
    v_new := r.def;
    if r.name <> 'retailer_directory' then
      select count(*) into v_n from regexp_matches(v_new, 'ANY \(my_brand_ids\(\)\)', 'g');
      if v_n = 0 then raise exception '0026: % has no brand filter to rewrite; update this migration', r.name; end if;
      v_new := regexp_replace(v_new, 'ANY \(my_brand_ids\(\)\)', 'ANY ((( SELECT my_brand_ids() AS my_brand_ids))::uuid[])', 'g');
    end if;
    if r.name = 'catalog' then
      v_new := regexp_replace(v_new, '(\s+FROM\s+\(\(products p\s)', ', p.search_text\1');
      if position('p.search_text' in v_new) = 0 then raise exception '0026: catalog view is not as expected'; end if;
    elsif r.name = 'retailer_directory' then
      v_new := regexp_replace(v_new, '(s\.full_name AS salesman_name)(\s+FROM\s)', '\1, r.search_text\2');
      if position('r.search_text' in v_new) = 0 then raise exception '0026: retailer_directory view is not as expected'; end if;
    end if;
    execute format('create or replace view public.%I%s as %s', r.name,
                   case when r.options is null then '' else ' with (' || array_to_string(r.options, ', ') || ')' end, v_new);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 5. Search functions: find the matches through the search index FIRST, then
--    sort and cut. Asked as one query ("matching, by name, first 15"), the
--    planner walks the name order hoping to meet 15 matches early, and for a
--    rare word (an SKU, an invoice number) reads the whole table (measured:
--    190-290 ms). PL/pgSQL is never inlined, so the index is always used.
--    They run with the caller's rights: row security applies as for any read.
--    Each word must appear (AND), anywhere in the search text.
-- -----------------------------------------------------------------------------
create or replace function public.search_condition(p_words text[])
returns text language sql immutable as $$
  select coalesce(string_agg(format('search_text like %L', '%' || replace(replace(replace(lower(w), '\', '\\'), '%', '\%'), '_', '\_') || '%'), ' and '), 'true')
    from (select left(trim(w), 60) as w from unnest(p_words[1:5]) w where trim(w) <> '') x
$$;

-- The catalog view works out each product's photo; a common word ("cable")
-- matches thousands of products, so the matches are found and cut to the
-- first p_limit by name on ids alone, and only those rows are built in full.
create or replace function public.search_catalog(p_words text[], p_limit integer default 50,
                                                 p_active boolean default true, p_brand uuid default null)
returns setof public.catalog language plpgsql stable set search_path = public as $$
begin
  return query execute format(
    'with m as materialized (select id, name from public.catalog where %s and ($1 is null or is_active = $1) and ($2 is null or brand_id = $2))
     select c.* from public.catalog c join (select id from m order by name limit $3) t on t.id = c.id order by c.name',
    public.search_condition(p_words))
  using p_active, p_brand, least(greatest(coalesce(p_limit, 50), 1), 1000);
end $$;

create or replace function public.search_products(p_words text[])
returns setof public.products language plpgsql stable set search_path = public as $$
begin
  return query execute 'select * from public.products where ' || public.search_condition(p_words);
end $$;

create or replace function public.search_retailers(p_words text[])
returns setof public.retailers language plpgsql stable set search_path = public as $$
begin
  return query execute 'select * from public.retailers where ' || public.search_condition(p_words);
end $$;

create or replace function public.search_retailer_directory(p_words text[])
returns setof public.retailer_directory language plpgsql stable set search_path = public as $$
begin
  return query execute 'select * from public.retailer_directory where ' || public.search_condition(p_words);
end $$;

create or replace function public.search_invoices(p_words text[])
returns setof public.invoices language plpgsql stable set search_path = public as $$
begin
  return query execute 'select * from public.invoices where ' || public.search_condition(p_words);
end $$;

revoke all on function public.search_condition(text[]), public.search_catalog(text[], integer, boolean, uuid), public.search_products(text[]),
                       public.search_retailers(text[]), public.search_retailer_directory(text[]), public.search_invoices(text[])
  from public, anon;
grant execute on function public.search_condition(text[]), public.search_catalog(text[], integer, boolean, uuid), public.search_products(text[]),
                          public.search_retailers(text[]), public.search_retailer_directory(text[]), public.search_invoices(text[])
  to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 6. Check
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from public.products where search_text is null)
     or exists (select 1 from public.invoices where search_text is null) then
    raise exception '0026 check failed: rows without search text';
  end if;
  if exists (select 1 from mt_rollback.views_0026 v join pg_class c on c.relname = v.name and c.relnamespace = 'public'::regnamespace
              where pg_get_userbyid(c.relowner) <> v.owner or c.reloptions is distinct from v.options) then
    raise exception '0026 check failed: a view''s owner or options changed';
  end if;
  if exists (select 1 from pg_class c where c.relkind = 'v' and c.relnamespace = 'public'::regnamespace
              and pg_get_viewdef(c.oid) ~ 'ANY \(my_brand_ids\(\)\)') then
    raise exception '0026 check failed: a view still evaluates the brand filter per row';
  end if;
end $$;
