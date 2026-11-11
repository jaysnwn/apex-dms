-- Rows whose business is not Apex, per table that has a business column.
-- Prints "table:count" lines only for tables with such rows (none = all good),
-- then a final line "tables:<number of tables checked>".
create temp table own (tbl text, n bigint);
do $$
declare t text; n bigint;
begin
  for t in select c.relname from pg_class c
            where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.relname <> 'tenants'
              and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'tenant_id' and not a.attisdropped)
  loop
    execute format('select count(*) from public.%I where tenant_id is distinct from %L', t, 'a9e70000-0000-4000-8000-000000000001') into n;
    insert into own values (t, n);
  end loop;
end $$;
select tbl || ':' || n from own where n > 0 order by tbl;
select 'tables:' || count(*) from own;
