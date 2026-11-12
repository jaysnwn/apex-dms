-- =============================================================================
-- 0033: a fixed search path on the last two functions without one
--       (audit finding 12, the same hygiene item as guard_invoice_update)
--
-- Supabase's linter reports these two after the upgrade:
--   search_condition(text[])      added in 0026. Builds the WHERE clause that
--                                 the search functions run. It is invoker
--                                 rights, so it cannot hand out privileges,
--                                 but its result is concatenated into SQL that
--                                 owner-rights functions then execute, which
--                                 is close enough to the line to stay on the
--                                 right side of it.
--   platform_definer_allowlist()  added in 0022. Names the owner-rights
--                                 functions allowed to run outside a business.
--                                 Only the database itself calls it.
--
-- Neither function's body changes: they only gain the search path their
-- callers already run with, so that it cannot depend on who calls them.
-- =============================================================================

alter function public.search_condition(text[]) set search_path = public;
alter function public.platform_definer_allowlist() set search_path = public;

-- verification ---------------------------------------------------------------
do $$
declare v_missing text;
begin
  select string_agg(p.proname, ', ') into v_missing
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('search_condition', 'platform_definer_allowlist')
     and not (coalesce(p.proconfig, '{}') @> array['search_path=public']);
  if v_missing is not null then
    raise exception '0033: still without a fixed search path: %', v_missing;
  end if;

  -- the search box must still work
  if public.search_condition(array['test']) is null then
    raise exception '0033: search_condition returned nothing';
  end if;
end $$;
