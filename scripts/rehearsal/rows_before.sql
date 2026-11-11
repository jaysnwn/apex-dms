-- Records every row of every public table (as a checksum) and each table's
-- columns, before the upgrade. Kept in schema rh, which nothing else touches.
create schema rh;
create table rh.cols as
  select c.relname::text tbl, array_agg(a.attname::text order by a.attnum) cols
    from pg_class c join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
   where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
   group by c.relname;
create table rh.rows (tbl text, h text);
do $$
declare t text;
begin
  for t in select tbl from rh.cols loop
    execute format('insert into rh.rows select %L, md5(to_jsonb(x)::text) from public.%I x', t, t);
  end loop;
end $$;
create table rh.visible (phase text, who int, obj text, n bigint);
