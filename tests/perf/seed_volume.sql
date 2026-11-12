-- Planning-volume data for performance measurements. NEVER run on production.
-- Two businesses on one database, as in production:
--   APEX (large):  100,000 products, 50,000 retailers, 200,000 invoices (3 years)
--   ISO  (small):   20,000 products, 10,000 retailers,  20,000 invoices
-- Signed-in users for the measurements: Apex Super Admin, Apex salesman, ISO owner.
-- Rows are written with triggers off (replica mode) for speed; every row
-- carries its business id explicitly. Usage: psql -d <scratch db> -f seed_volume.sql
\set ON_ERROR_STOP 1
select setseed(0.42);

-- businesses and people (normal mode: membership triggers run)
insert into public.tenants (id, slug, legal_name, display_name)
values ('c0000000-0000-4000-8000-00000000000c', 'iso-dist', 'ISO Distributors', 'ISO Distributors')
on conflict do nothing;
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@apex.perf', '{"role":"super_admin","tenant_id":"a9e70000-0000-4000-8000-000000000001"}', '{"full_name":"Apex Admin"}'),
  ('00000000-0000-0000-0000-0000000000a5', 'sales@apex.perf', '{"role":"salesman","tenant_id":"a9e70000-0000-4000-8000-000000000001"}', '{"full_name":"Apex Sales"}'),
  ('00000000-0000-0000-0000-0000000000c1', 'owner@iso.perf', '{"role":"super_admin","tenant_id":"c0000000-0000-4000-8000-00000000000c"}', '{"full_name":"ISO Owner"}')
on conflict do nothing;

set session_replication_role = replica;

create temp table words (w text);
insert into words values ('Type-C'),('Cable'),('Charger'),('65W'),('20W'),('Power'),('Bank'),('10000mAh'),('Earphone'),
  ('Wireless'),('Neckband'),('Adapter'),('Fast'),('USB'),('Lightning'),('Braided'),('1m'),('2m'),('Car'),('Holder'),
  ('Speaker'),('Smart'),('Watch'),('Band'),('Tempered'),('Glass'),('Cover'),('Pro'),('Max'),('Mini'),('Dual'),('Port');
create temp table shopw (w text);
insert into shopw values ('Shree'),('Ganesh'),('Mobile'),('Point'),('Sai'),('Krishna'),('Electronics'),('Gallery'),('Om'),
  ('Balaji'),('Telecom'),('World'),('Mahalaxmi'),('Communication'),('Hub'),('Smart'),('Zone'),('Royal'),('New'),('Star');
create temp table cities (c text);
insert into cities values ('Sangamner'),('Akole'),('Rahuri'),('Shirdi'),('Kopargaon'),('Nashik'),('Ahmednagar'),('Pune'),('Sinnar'),('Loni');

-- brands and categories
insert into public.brands (id, tenant_id, code, name)
values ('c0000000-0000-4000-8000-0000000000b1', 'c0000000-0000-4000-8000-00000000000c', 'IS', 'ISO Brand')
on conflict do nothing;
insert into public.categories (tenant_id, brand_id, name)
select b.tenant_id, b.id, 'Category ' || g from public.brands b, generate_series(1, 25) g;

create temp table plan (tenant uuid, products int, retailers int, invoices int);
insert into plan values ('a9e70000-0000-4000-8000-000000000001', 100000, 50000, 200000),
                        ('c0000000-0000-4000-8000-00000000000c', 20000, 10000, 20000);

-- products
insert into public.products (tenant_id, brand_id, category_id, name, sku, barcode, description, unit_code, retailer_price, mrp, gst_rate, is_active)
select pl.tenant, b.id,
       (select c.id from public.categories c where c.brand_id = b.id order by c.name offset (g % 25) limit 1),
       (select string_agg(w, ' ') from (select w from words order by random() + g * 0 limit 3 + (g % 3)) x) || ' ' || g,
       b.code || '-' || lpad(g::text, 6, '0'),
       (890000000000 + g)::text,
       'Model ' || g || ' for retail',
       'PCS', 99 + (g % 900), 199 + (g % 1500), 18, g % 20 <> 0
  from plan pl
  cross join lateral generate_series(1, pl.products) g
  cross join lateral (select id, code from public.brands where tenant_id = pl.tenant order by code offset (g % (select count(*) from public.brands where tenant_id = pl.tenant)) limit 1) b;

-- retailers
insert into public.retailers (tenant_id, code, shop_name, owner_name, mobile, billing_city, billing_state_code, gstin, status)
select pl.tenant, 'R-' || lpad(g::text, 6, '0'),
       (select string_agg(w, ' ') from (select w from shopw order by random() + g * 0 limit 3) x) || ' ' || g,
       'Owner ' || g, (9000000000 + g)::text,
       (select c from cities offset (g % 10) limit 1), '27',
       case when g % 3 = 0 then '27' || chr(65 + (g / 10000) % 26) || 'BCDE' || lpad((g % 10000)::text, 4, '0') || 'F1Z' || chr(65 + (g / 260000) % 26) end,
       case when g % 25 = 0 then 'inactive' else 'active' end::public.retailer_status
  from plan pl cross join lateral generate_series(1, pl.retailers) g;

-- invoices over three years (order ids are placeholders: FK checks are off)
insert into public.invoices (tenant_id, brand_id, invoice_no, invoice_date, due_date, fy, retailer_id, order_id, retailer_snapshot,
                             place_of_supply, is_igst, credit_days, subtotal, discount_total, taxable_total, cgst_total, sgst_total,
                             igst_total, round_off, grand_total)
select pl.tenant, b.id,
       b.code || '/' || lpad(g::text, 7, '0'),
       d, d + 15, case when extract(month from d) >= 4 then extract(year from d)::int else extract(year from d)::int - 1 end || '-xx',
       r.id, gen_random_uuid(), jsonb_build_object('shop_name', r.shop_name, 'city', r.billing_city),
       '27', false, 15, amt, 0, amt, amt * 0.09, amt * 0.09, 0, 0, round(amt * 1.18)
  from plan pl
  cross join lateral generate_series(1, pl.invoices) g
  cross join lateral (select current_date - (g % 1095) as d, (500 + (g * 37) % 25000)::numeric as amt) v
  cross join lateral (select id, code from public.brands where tenant_id = pl.tenant order by code offset (g % (select count(*) from public.brands where tenant_id = pl.tenant)) limit 1) b
  cross join lateral (select id, shop_name, billing_city from public.retailers where tenant_id = pl.tenant
                       and code = 'R-' || lpad((1 + g % pl.retailers)::text, 6, '0')) r;

set session_replication_role = origin;
analyze;
select t.slug, (select count(*) from public.products p where p.tenant_id = t.id) products,
       (select count(*) from public.retailers r where r.tenant_id = t.id) retailers,
       (select count(*) from public.invoices i where i.tenant_id = t.id) invoices
  from public.tenants t order by 1;
