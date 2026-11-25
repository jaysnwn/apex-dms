-- Delete a retailer that has no history (for example a duplicate entered by mistake).
--
-- Retailers have no delete policy on purpose: a shop with quotations, invoices,
-- payments, visits or a place on a route must keep its row so those records stay
-- whole. This function deletes only a shop with none of those, and refuses
-- otherwise with what is attached (mark such a shop Inactive instead).
-- Super Admin and Manager only. The delete is recorded by the audit trigger.

create or replace function public.delete_retailer(p_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_name   text;
  v_used   text[] := '{}';
begin
  if not public.has_role('super_admin', 'manager') then
    raise exception 'Only a Super Admin or Manager can delete a retailer' using errcode = '42501';
  end if;
  select shop_name into v_name from public.retailers where id = p_id and tenant_id = v_tenant for update;
  if not found then
    raise exception 'Retailer not found' using errcode = 'P0002';
  end if;

  if exists (select 1 from public.orders           where retailer_id = p_id) then v_used := array_append(v_used, 'quotations or orders'); end if;
  if exists (select 1 from public.invoices         where retailer_id = p_id) then v_used := array_append(v_used, 'invoices'); end if;
  if exists (select 1 from public.credit_notes     where retailer_id = p_id) then v_used := array_append(v_used, 'credit notes'); end if;
  if exists (select 1 from public.payments         where retailer_id = p_id) then v_used := array_append(v_used, 'payments'); end if;
  if exists (select 1 from public.payment_promises where retailer_id = p_id) then v_used := array_append(v_used, 'payment promises'); end if;
  if exists (select 1 from public.visits           where retailer_id = p_id) then v_used := array_append(v_used, 'visits'); end if;
  if exists (select 1 from public.route_outlets    where retailer_id = p_id) then v_used := array_append(v_used, 'a route'); end if;
  if cardinality(v_used) > 0 then
    raise exception '% has % and cannot be deleted. Set its status to Inactive instead.', v_name, array_to_string(v_used, ', ')
      using errcode = 'P0001', hint = 'RETAILER_IN_USE';
  end if;

  delete from public.retailers where id = p_id and tenant_id = v_tenant;
  return v_name;
end $$;
revoke all on function public.delete_retailer(uuid) from public, anon;
grant execute on function public.delete_retailer(uuid) to authenticated;

grant create on schema public to app_definer;
alter function public.delete_retailer(uuid) owner to app_definer;
revoke create on schema public from app_definer;

do $$
begin
  if exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prosecdef
               and pg_get_userbyid(p.proowner) <> 'app_definer'
               and p.proname not in (select * from public.platform_definer_allowlist())) then
    raise exception '0038 check failed: owner-rights function outside the fence';
  end if;
  if pg_get_userbyid((select proowner from pg_proc where oid = 'public.delete_retailer(uuid)'::regprocedure)) <> 'app_definer' then
    raise exception '0038 check failed: delete_retailer must run as app_definer';
  end if;
end $$;
