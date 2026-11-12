-- Read-only fingerprint of the public schema, per kind of object, to detect
-- drift between production and the migrations in this repository.
-- Supabase-managed objects (rls_auto_enable) are left out.
with cols as (
  select c.relname || '.' || a.attname as name,
         format_type(a.atttypid, a.atttypmod) || ' ' || a.attnotnull || ' ' || coalesce(pg_get_expr(d.adbin, d.adrelid), '') as def
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid and c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
    left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
   where a.attnum > 0 and not a.attisdropped
), cons as (
  select conrelid::regclass || '.' || conname as name, pg_get_constraintdef(oid) as def
    from pg_constraint where connamespace = 'public'::regnamespace
), idx as (
  select indexname as name, indexdef as def from pg_indexes where schemaname = 'public'
), funcs as (
  select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as name,
         md5(p.prosrc) || ' ' || p.prosecdef || ' ' || coalesce(array_to_string(p.proconfig, ','), '') as def
    from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname <> 'rls_auto_enable'
), pols as (
  select tablename || '.' || policyname as name, cmd || ' ' || coalesce(qual, '') || ' ' || coalesce(with_check, '') as def
    from pg_policies where schemaname in ('public', 'storage')
), trg as (
  select c.relname || '.' || t.tgname as name, pg_get_triggerdef(t.oid) as def
    from pg_trigger t join pg_class c on c.oid = t.tgrelid
   where c.relnamespace = 'public'::regnamespace and not t.tgisinternal
), vws as (
  select viewname as name, md5(definition) as def from pg_views where schemaname = 'public'
), allx as (
  select 'columns' k, * from cols union all select 'constraints', * from cons union all select 'indexes', * from idx
  union all select 'functions', * from funcs union all select 'policies', * from pols
  union all select 'triggers', * from trg union all select 'views', * from vws
)
select k as kind, count(*) as n, md5(string_agg(name || '=' || def, '|' order by name)) as fingerprint
  from allx group by k order by k;
