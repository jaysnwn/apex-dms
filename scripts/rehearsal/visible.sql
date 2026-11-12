-- What every existing login can see, through the same row-level security the
-- app uses (role authenticated + that user's token). Run before and after the
-- upgrade with -v phase=before|after. No x-tenant-id header, as for a user
-- who has never chosen a business: they must land in Apex and see the same.
select set_config('rh.phase', :'phase', false) \g /dev/null
do $$
declare
  u record; o text; n bigint; i int := 0;
  objs text[] := array['retailers','products','invoices','invoice_lines','orders','order_lines','payments',
                       'payment_allocations','stock_movements','expenses','warehouses','brands','categories',
                       'suppliers','profiles','profile_brands','company_settings','number_series','audit_log',
                       'catalog','retailer_directory','stock_on_hand','product_stock','invoice_balances','retailer_balances'];
begin
  for u in select p.id from public.profiles p join auth.users a on a.id = p.id order by p.created_at, p.id loop
    i := i + 1;
    foreach o in array objs loop
      begin
        perform set_config('request.jwt.claims', json_build_object('sub', u.id, 'role', 'authenticated')::text, true);
        execute 'set local role authenticated';
        execute format('select count(*) from public.%I', o) into n;
        execute 'reset role';
      exception when others then
        execute 'reset role';
        n := -1;   -- refused (permission or error)
      end;
      insert into rh.visible values (current_setting('rh.phase'), i, o, n);
    end loop;
  end loop;
  perform set_config('request.jwt.claims', '', true);
end $$;
