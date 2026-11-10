-- =============================================================================
-- 0025 tests: error log and health summary.
-- Runs after t1-t3 (Apex fixtures, the ISO business and its owner).
--   * a signed-in user's errors land in their business; anonymous ones nowhere
--   * at most 20 per person per 10 minutes
--   * the server can report for a user only in a business they belong to
--   * each Super Admin sees only their own business's errors; others see none
--   * health figures are per business; platform totals for platform admins only
--   * the ops schema is not reachable from the API
-- =============================================================================
\set ON_ERROR_STOP 1

-- ---------- Apex salesman reports errors ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000005', false);
select set_config('request.headers', '{}', false);
select set_config('request.jwt.claims', '{"role":"authenticated"}', false);
set role authenticated;
do $$
begin
  perform public.report_app_error('browser', 'TypeError: x is undefined', 'd1', '/m/order', 'stack…');
  begin
    perform 1 from ops.app_errors;
    raise exception 'ops schema readable from the API';
  exception when insufficient_privilege then null;
  end;
  -- a browser cannot pretend to be the server or name another business
  perform public.report_app_error('server', 'claims server', null, null, null,
          'c1000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-00000000000c');
  -- flood: only 20 in 10 minutes
  for i in 1..40 loop perform public.report_app_error('browser', 'flood ' || i); end loop;
  begin
    perform public.recent_app_errors();
    raise exception 'salesman read the error log';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.system_health();
    raise exception 'salesman read system health';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
do $$ begin
  assert (select count(*) from ops.app_errors where user_id = '00000000-0000-0000-0000-000000000005') = 20, 'rate limit: 20 per 10 minutes';
  assert (select count(*) from ops.app_errors where message = 'claims server' and source = 'browser'
            and tenant_id = 'a9e70000-0000-4000-8000-000000000001'
            and user_id = '00000000-0000-0000-0000-000000000005') = 1, 'browser cannot claim server / another user / another business';
  assert not exists (select 1 from ops.app_errors where tenant_id <> 'a9e70000-0000-4000-8000-000000000001'), 'all in Apex';
end $$;

-- ---------- anonymous: nothing ----------
select set_config('request.jwt.claim.sub', '', false);
select set_config('request.jwt.claims', '{"role":"anon"}', false);
set role anon;
do $$ begin
  begin
    perform public.report_app_error('browser', 'anon');
    raise exception 'anonymous caller wrote the error log';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- ---------- the server reports for users ----------
select set_config('request.jwt.claims', '{"role":"service_role"}', false);
set role service_role;
do $$ begin
  -- ISO owner in ISO: kept in ISO
  perform public.report_app_error('server', 'iso server error', 'd9', '/sales', null,
          'c1000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-00000000000c');
  -- an Apex-only user claimed for ISO: no business recorded
  perform public.report_app_error('server', 'forged business', null, null, null,
          '00000000-0000-0000-0000-000000000005', 'c0000000-0000-4000-8000-00000000000c');
end $$;
reset role;
do $$ begin
  assert (select tenant_id from ops.app_errors where message = 'iso server error') = 'c0000000-0000-4000-8000-00000000000c', 'server error kept in ISO';
  assert (select tenant_id from ops.app_errors where message = 'forged business') is null, 'server cannot file into a business the user is not in';
end $$;
select set_config('request.jwt.claims', '{"role":"authenticated"}', false);

-- ---------- Apex Super Admin ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
select set_config('request.headers', '{}', false);
set role authenticated;
do $$
declare h jsonb;
begin
  assert (select count(*) from public.recent_app_errors(500)) = 20, 'Apex sees its 20 errors';
  assert not exists (select 1 from public.recent_app_errors(500) where message like 'iso%'), 'Apex never sees ISO errors';
  assert (select user_name from public.recent_app_errors(1)) is not null, 'name of the person';
  h := public.system_health();
  assert (h ->> 'errors_24h')::int = 20, 'health counts Apex errors';
  assert (h -> 'rows' ->> 'invoices')::int = (select count(*) from public.invoices), 'Apex invoice count';
  assert not h ? 'platform', 'platform totals only for platform admins';
end $$;
reset role;

-- ---------- ISO owner ----------
select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000001', false);
select set_config('request.headers', '{"x-tenant-id":"c0000000-0000-4000-8000-00000000000c"}', false);
set role authenticated;
do $$
declare h jsonb;
begin
  assert (select count(*) from public.recent_app_errors()) = 1, 'ISO sees only its own error';
  h := public.system_health();
  assert (h -> 'rows' ->> 'invoices')::int = (select count(*) from public.invoices), 'ISO counts only ISO (RLS view equals function)';
end $$;
reset role;

-- ---------- platform admin sees platform totals ----------
insert into public.platform_admins (user_id) values ('00000000-0000-0000-0000-000000000001') on conflict do nothing;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
select set_config('request.headers', '{}', false);
set role authenticated;
do $$ begin
  assert (public.system_health() -> 'platform' ->> 'database_bytes')::bigint > 0, 'platform admin sees database size';
end $$;
reset role;
delete from public.platform_admins where user_id = '00000000-0000-0000-0000-000000000001';

select set_config('request.jwt.claim.sub', '', false);
select set_config('request.headers', '', false);
select set_config('request.jwt.claims', '', false);
select 'ALL OPS HEALTH DATABASE TESTS PASSED' as result;
