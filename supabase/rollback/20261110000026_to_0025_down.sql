-- =============================================================================
-- ROLLBACK of 0026 (search columns and indexes) back to 0025. One transaction.
-- No business data changes: only the added search columns and indexes go.
-- The five views are restored exactly as they were (definition, owner,
-- options, grants) from mt_rollback.views_0026.
-- Run before 20261110000025_to_0024_down.sql if going further back.
-- =============================================================================
drop function public.search_catalog(text[], integer, boolean, uuid), public.search_products(text[]), public.search_retailers(text[]),
              public.search_retailer_directory(text[]), public.search_invoices(text[]), public.search_condition(text[]);

do $$
declare
  r record;
  a record;
begin
  for r in select * from mt_rollback.views_0026 loop
    if r.name not in ('catalog', 'retailer_directory') then
      -- same columns as before: replaced in place (other views depend on them)
      execute format('create or replace view public.%I%s as %s', r.name,
                     case when r.options is null then '' else ' with (' || array_to_string(r.options, ', ') || ')' end, r.def);
      continue;
    end if;
    -- catalog and retailer_directory lose a column: rebuilt (nothing depends on them)
    execute format('drop view public.%I', r.name);
    execute format('create view public.%I%s as %s', r.name,
                   case when r.options is null then '' else ' with (' || array_to_string(r.options, ', ') || ')' end, r.def);
    if r.owner <> current_user then
      execute 'grant create on schema public to ' || quote_ident(r.owner);
      execute format('alter view public.%I owner to %I', r.name, r.owner);
      execute 'revoke create on schema public from ' || quote_ident(r.owner);
    end if;
    execute format('revoke all on public.%I from public, anon, authenticated, service_role', r.name);
    for a in select (aclexplode(r.acl)).* loop
      if pg_get_userbyid(a.grantee) <> r.owner then
        execute format('grant %s on public.%I to %I', a.privilege_type, r.name, pg_get_userbyid(a.grantee));
      end if;
    end loop;
  end loop;
end $$;
drop table mt_rollback.views_0026;

drop index public.products_search_trgm, public.retailers_search_trgm, public.invoices_search_trgm,
           public.invoices_tenant_date_idx, public.products_tenant_name_idx, public.retailers_tenant_shop_idx,
           public.journal_lines_employee_idx, public.journal_entries_reverses_idx, public.purchase_return_lines_return_idx,
           public.incentive_payouts_scheme_idx, public.visits_rescheduled_from_idx, public.route_outlets_location_idx;

drop trigger categories_search_text on public.categories;
drop trigger products_search_text on public.products;
drop function public.categories_search_text_sync();
drop function public.products_search_text_set();
alter table public.products drop column search_text;
alter table public.retailers drop column search_text;
drop trigger invoices_search_text on public.invoices;
drop function public.invoices_search_text_set();
alter table public.invoices drop column search_text;
