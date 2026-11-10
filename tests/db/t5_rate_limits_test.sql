-- =============================================================================
-- 0027 tests: rate limits.
--   * the server can count; signed-in and anonymous callers cannot call it
--   * p_max hits allowed per window, the next refused, a new window allowed
--   * keys are independent
-- =============================================================================
\set ON_ERROR_STOP 1
set role service_role;
do $$
declare ok boolean;
begin
  for i in 1..3 loop
    assert public.rate_limit_hit('t5:a', 3, 60), 'hit ' || i || ' of 3 allowed';
  end loop;
  assert not public.rate_limit_hit('t5:a', 3, 60), '4th hit refused';
  assert public.rate_limit_hit('t5:b', 3, 60), 'another key is independent';
end $$;
reset role;
-- the window has passed
update ops.rate_limits set window_start = now() - interval '2 minutes' where key = 't5:a';
set role service_role;
do $$ begin
  assert public.rate_limit_hit('t5:a', 3, 60), 'new window allowed';
end $$;
reset role;
set role authenticated;
do $$ begin
  begin
    perform public.rate_limit_hit('x', 1, 1);
    raise exception 'signed-in user called rate_limit_hit';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from ops.rate_limits;
    raise exception 'ops.rate_limits readable from the API';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
set role anon;
do $$ begin
  begin
    perform public.rate_limit_hit('x', 1, 1);
    raise exception 'anonymous caller called rate_limit_hit';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
delete from ops.rate_limits where key like 't5:%';
select 'ALL RATE LIMIT DATABASE TESTS PASSED' as result;
