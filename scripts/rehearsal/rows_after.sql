-- After the upgrade: every row recorded before must still exist unchanged
-- (columns the upgrade added are left out of the comparison). Prints one
-- line per table: name | rows before | rows after | missing or changed | added.
-- Counts only, never data.
create table rh.after (tbl text, h text);
do $$
declare r record; added text[];
begin
  for r in select * from rh.cols loop
    select coalesce(array_agg(a.attname::text), '{}') into added
      from pg_attribute a
     where a.attrelid = format('public.%I', r.tbl)::regclass and a.attnum > 0 and not a.attisdropped
       and a.attname::text <> all (r.cols);
    execute format('insert into rh.after select %L, md5((to_jsonb(x) - %L::text[])::text) from public.%I x', r.tbl, added, r.tbl);
  end loop;
end $$;
with b as (select tbl, h, count(*) n from rh.rows group by 1, 2),
     a as (select tbl, h, count(*) n from rh.after group by 1, 2),
     j as (select coalesce(b.tbl, a.tbl) tbl, coalesce(b.n, 0) bn, coalesce(a.n, 0) an from b full join a on a.tbl = b.tbl and a.h = b.h)
select tbl, sum(bn) before_rows, sum(an) after_rows,
       sum(greatest(bn - an, 0)) missing_or_changed, sum(greatest(an - bn, 0)) added
  from j group by tbl order by tbl;
