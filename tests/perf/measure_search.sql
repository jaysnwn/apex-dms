-- Times the screens' real queries (search functions + indexes of migration 0026) at planning volume, as real signed-in users
-- (row security on). Median of 5 runs of EXPLAIN ANALYZE, database time only
-- (no network). Usage: psql -d <scratch db with seed_volume.sql> -f measure.sql
\set ON_ERROR_STOP 1
\pset format aligned
create temp table _init (x int);
create or replace function pg_temp.ms(q text, runs int default 5) returns numeric language plpgsql as $$
declare t numeric[] := '{}'; j json;
begin
  for i in 1..runs loop
    execute 'explain (analyze, format json) ' || q into j;
    t := t || (j -> 0 ->> 'Execution Time')::numeric;
  end loop;
  return (select percentile_cont(0.5) within group (order by x) from unnest(t) x)::numeric(10,1);
end $$;
create temp table results (who text, what text, ms numeric);
do $$ begin execute format('grant usage on schema %s to authenticated', pg_my_temp_schema()::regnamespace); end $$;
grant insert on results to authenticated;

create or replace function pg_temp.run_as(p_who text, p_user text, p_header text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_user, false);
  perform set_config('request.headers', p_header, false);
  perform set_config('request.jwt.claims', '{"role":"authenticated"}', false);
  set role authenticated;
  insert into results values
   (p_who, 'product search "cable" (billing picker)', pg_temp.ms($q$select id, name, sku, brand_name, retailer_price from public.search_catalog(array['cable'], 15)$q$)),
   (p_who, 'product search "type 65w" (two words)', pg_temp.ms($q$select id, name from public.search_catalog(array['type','65w'], 15)$q$)),
   (p_who, 'product search by SKU', pg_temp.ms($q$select id, name from public.search_catalog(array['CQ-012345'], 15)$q$)),
   (p_who, 'product list page', pg_temp.ms($q$select id, name, sku, retailer_price from public.products order by name limit 100$q$)),
   (p_who, 'retailer search "ganesh"', pg_temp.ms($q$select * from public.search_retailer_directory(array['ganesh']) where status <> 'inactive' order by shop_name limit 15$q$)),
   (p_who, 'retailer search by mobile', pg_temp.ms($q$select * from public.search_retailer_directory(array['9000012345']) where status <> 'inactive' order by shop_name limit 15$q$)),
   (p_who, 'invoice list (latest 300)', pg_temp.ms($q$select id, invoice_no, invoice_date, grand_total, status, retailer_snapshot from public.invoices order by invoice_date desc, invoice_no desc limit 300$q$)),
   (p_who, 'invoice search by number', pg_temp.ms($q$select id, invoice_no from public.search_invoices(array['0123456']) order by invoice_date desc, invoice_no desc limit 300$q$)),
   (p_who, 'invoice search by shop', pg_temp.ms($q$select id, invoice_no from public.search_invoices(array['krishna']) order by invoice_date desc, invoice_no desc limit 300$q$));
  reset role;
end $$;

select pg_temp.run_as('Apex admin (large)', '00000000-0000-0000-0000-0000000000a1', '{}');
select pg_temp.run_as('ISO owner (small)', '00000000-0000-0000-0000-0000000000c1', '{"x-tenant-id":"c0000000-0000-4000-8000-00000000000c"}');
select what, max(ms) filter (where who like 'Apex%') as apex_ms, max(ms) filter (where who like 'ISO%') as iso_ms
  from results group by what order by min(ctid::text);
