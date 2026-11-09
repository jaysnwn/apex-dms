-- =============================================================================
-- ROLLBACK of M-T2 (0022, 0023) back to the M-T1 schema (0021).
-- Run as ONE transaction, BEFORE 20261110000021_to_0018_down.sql if going
-- all the way back. Data is untouched.
--
-- Everything 0022 / 0023 replaced was saved by 0022 in schema mt_rollback
-- (policies, function bodies, column defaults, a trigger) and is restored
-- from there exactly. Tested locally: after this and the M-T1 rollback the
-- schema equals 0018 (pg_dump difference 0) and the data fingerprint equals.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Undo 0023
-- ---------------------------------------------------------------------------
alter function public.guard_invoice_update() reset search_path;
do $$
begin
  if exists (select 1 from pg_proc where proname = 'rls_auto_enable' and pronamespace = 'public'::regnamespace) then
    execute 'grant execute on function public.rls_auto_enable() to public';
  end if;
end $$;

-- every policy on business tables, profiles and storage back to its saved text
do $$
declare r record;
begin
  for r in select pol.polname, n.nspname, c.relname
             from pg_policy pol join pg_class c on c.oid = pol.polrelid join pg_namespace n on n.oid = c.relnamespace
            where ((n.nspname = 'public' and c.relname in (select * from public.tenant_scoped_tables() union all select 'profiles'))
                   or (n.nspname = 'storage' and c.relname = 'objects'))
              and pol.polname <> 'definer_tenant_fence'
  loop
    execute format('drop policy %I on %I.%I', r.polname, r.nspname, r.relname);
  end loop;
  for r in select * from mt_rollback.policies order by schema_name, tbl, name loop
    execute r.create_sql;
  end loop;
end $$;
drop function public.storage_object_tenant(text);
drop function public.storage_user_folder(text);

-- ---------------------------------------------------------------------------
-- Undo 0022
-- ---------------------------------------------------------------------------
-- functions and views back to postgres
do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p
            where p.pronamespace = 'public'::regnamespace and pg_get_userbyid(p.proowner) = 'app_definer' loop
    execute format('alter function %s owner to postgres', r.sig);
  end loop;
  for r in select c.oid::regclass as v from pg_class c
            where c.relnamespace = 'public'::regnamespace and c.relkind = 'v' and pg_get_userbyid(c.relowner) = 'app_definer' loop
    execute format('alter view %s owner to postgres', r.v);
  end loop;
end $$;

-- the fence
do $$
declare r record;
begin
  for r in select c.relname from pg_policy pol join pg_class c on c.oid = pol.polrelid
            where c.relnamespace = 'public'::regnamespace and pol.polname = 'definer_tenant_fence' loop
    execute format('drop policy definer_tenant_fence on public.%I', r.relname);
  end loop;
end $$;

-- function bodies, column defaults and the trigger as they were
do $$
declare r record;
begin
  for r in select * from mt_rollback.function_src loop
    execute r.src;
  end loop;
  for r in select * from mt_rollback.defaults loop
    if r.expr is null then
      execute format('alter table public.%I alter column %I drop default', r.tbl, r.col);
    else
      execute format('alter table public.%I alter column %I set default %s', r.tbl, r.col, r.expr);
    end if;
  end loop;
  for r in select * from mt_rollback.triggers loop
    execute r.def;
  end loop;
end $$;

-- the old retailer code sequence continues where the per-tenant series is
select setval('public.retailer_code_seq',
              greatest((select next_value - 1 from public.number_series
                         where tenant_id = 'a9e70000-0000-4000-8000-000000000001' and doc_type = 'RETAILER' and fy = 'ALL'), 1),
              exists (select 1 from public.number_series
                       where tenant_id = 'a9e70000-0000-4000-8000-000000000001' and doc_type = 'RETAILER' and fy = 'ALL'
                         and next_value > 1));
delete from public.number_series where doc_type = 'RETAILER' and fy = 'ALL';

drop trigger tenant_members_guard_last_owner on public.tenant_members;
drop function public.guard_last_owner();
drop view public.tenant_people;
drop function public.next_retailer_code();
drop function public.tenant_state_code();
drop function public.platform_definer_allowlist();
drop function public.is_tenant_member(uuid);

-- the role
revoke all on all tables in schema public from app_definer;
revoke all on all sequences in schema public from app_definer;
revoke all on all functions in schema public from app_definer;
revoke usage on schema public from app_definer;
alter default privileges for role postgres in schema public revoke all on tables from app_definer;
alter default privileges for role postgres in schema public revoke all on sequences from app_definer;
alter default privileges for role postgres in schema public revoke execute on functions from app_definer;
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'extensions') then
    execute 'revoke usage on schema extensions from app_definer';
  end if;
end $$;
drop schema mt_rollback cascade;
drop role app_definer;
