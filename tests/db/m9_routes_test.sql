-- =============================================================================
-- Routes, territories & visits (0018): the 20 mandatory scenarios of the route spec.
-- =============================================================================
\set ON_ERROR_STOP 1
select set_config('request.jwt.claim.sub', '', false);

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000031', 'sa@apex.test', '{"role":"salesman"}', '{"full_name":"Salesman A"}'),
  ('00000000-0000-0000-0000-000000000032', 'sb@apex.test', '{"role":"salesman"}', '{"full_name":"Salesman B"}'),
  ('00000000-0000-0000-0000-000000000033', 'sc@apex.test', '{"role":"salesman"}', '{"full_name":"Salesman C"}');
insert into public.profile_brands (user_id, brand_id)
select u, b.id from unnest(array['00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000032', '00000000-0000-0000-0000-000000000033']::uuid[]) u
cross join public.brands b;

create schema rt;
grant usage on schema rt to authenticated;
create table rt.x (k text primary key, val uuid);
grant all on rt.x to authenticated;
create function rt.v(p_k text) returns uuid language sql stable as $$ select val from rt.x where k = p_k $$;
create function rt.loc(p_name text) returns uuid language sql stable security definer as $$ select id from public.locations where name = p_name $$;
create function rt.shop(p_name text) returns uuid language sql stable security definer as $$ select id from public.retailers where shop_name = p_name $$;
create function rt.fails(p_sql text, p_like text) returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then
    if sqlerrm ilike p_like then return; end if;
    raise exception 'wrong error for [%]: %', p_sql, sqlerrm using errcode = 'ZZ999';
  end;
  raise exception 'expected failure: %', p_sql using errcode = 'ZZ999';
end $$;
-- next date (after today) that falls on ISO weekday p_dow
create function rt.next_dow(p_dow int) returns date language sql stable as $$
  select d::date from generate_series(current_date + 1, current_date + 7, interval '1 day') d where extract(isodow from d) = p_dow $$;
grant execute on all functions in schema rt to authenticated;

-- ---------- master data (office) ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$ declare t uuid; begin
  insert into public.territories (name, code) values ('Junnar Belt', 'JNR') returning id into t;
  insert into rt.x values ('territory', t);
  insert into public.locations (name, territory_id) values ('Ghargaon', t), ('Bota', t), ('Alephata', t), ('Otur', t), ('Belapur', t);
  begin insert into public.locations (name, territory_id) values ('ghargaon ', t); raise exception 'dup town' using errcode = 'ZZ999';
  exception when unique_violation then null; end;
end $$;
reset role;

-- 20 shops (as the office would enter them); their town is picked from the city name
insert into public.retailers (shop_name, mobile, billing_city)
select 'Shop ' || lpad(n::text, 2, '0'), '91000000' || lpad(n::text, 2, '0'),
       (array['Ghargaon', 'Bota', 'Alephata', 'Otur'])[1 + (n - 1) / 5]
  from generate_series(1, 20) n;
do $$ begin
  assert (select count(*) from public.retailers where shop_name like 'Shop %' and location_id is not null) = 20, 'town taken from city';
end $$;

-- =============================================================================
-- 1, 2, 3. Create the route, add four towns in order, assign 15 retailers
-- =============================================================================
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$ declare r uuid; v jsonb; begin
  r := public.route_save(null, 'Ghargaon – Bota – Alephata – Otur', null, rt.v('territory'), 'Junnar belt', 'weekly', '{1,4}', null, 10, true);
  insert into rt.x values ('route', r);
  assert (select code from public.routes where id = r) = 'GBAO-001', 'code generated from the towns';
  perform public.route_set_locations(r, array[rt.loc('Ghargaon'), rt.loc('Bota'), rt.loc('Alephata'), rt.loc('Otur')]);
  assert (select array_agg(l.name order by rl.sequence) from public.route_locations rl join public.locations l on l.id = rl.location_id where rl.route_id = r)
         = array['Ghargaon', 'Bota', 'Alephata', 'Otur'], 'towns in order';
  -- 15 existing retailers: 01-05 Ghargaon, 06-10 Bota, 11-15 Alephata
  perform public.route_outlets_add(r, rt.loc('Ghargaon'), array(select rt.shop('Shop ' || lpad(n::text, 2, '0')) from generate_series(1, 5) n));
  perform public.route_outlets_add(r, rt.loc('Bota'), array(select rt.shop('Shop ' || lpad(n::text, 2, '0')) from generate_series(6, 10) n));
  v := public.route_outlets_add(r, rt.loc('Alephata'), array(select rt.shop('Shop ' || lpad(n::text, 2, '0')) from generate_series(11, 15) n));
  assert (v ->> 'added')::int = 5, 'added';
  assert (select count(*) from public.route_outlets where route_id = r and is_active) = 15, '15 outlets';
  -- adding the same shops again creates no duplicates
  v := public.route_outlets_add(r, rt.loc('Alephata'), array[rt.shop('Shop 11'), rt.shop('Shop 12')]);
  assert (v ->> 'already')::int = 2 and (select count(*) from public.route_outlets where route_id = r) = 15, 'no duplicate rows';
  assert (select count(*) from public.retailers where route_id = r) = 15, 'retailer.route_id in step';
  assert (select count(*) from public.retailers where shop_name like 'Shop %') = 20, 'no new retailer records';
  perform rt.fails(format($q$select public.route_outlets_add(%L, %L, array[%L]::uuid[])$q$, r, rt.loc('Belapur'), rt.shop('Shop 16')), '%town to the route first%');
end $$;
reset role;

-- =============================================================================
-- 4, 5. Change the town order; insert Belapur between Bota and Alephata
-- =============================================================================
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$ declare r uuid := rt.v('route'); begin
  perform public.route_set_locations(r, array[rt.loc('Bota'), rt.loc('Ghargaon'), rt.loc('Alephata'), rt.loc('Otur')]);
  assert (select route_sequence from public.retailers where id = rt.shop('Shop 06')) = 1, 'Bota outlets now first';
  perform public.route_set_locations(r, array[rt.loc('Ghargaon'), rt.loc('Bota'), rt.loc('Belapur'), rt.loc('Alephata'), rt.loc('Otur')]);
  assert (select array_agg(l.name order by rl.sequence) from public.route_locations rl join public.locations l on l.id = rl.location_id where rl.route_id = r)
         = array['Ghargaon', 'Bota', 'Belapur', 'Alephata', 'Otur'], 'Belapur inserted';
  assert (select route_sequence from public.retailers where id = rt.shop('Shop 01')) = 1, 'Ghargaon first again';
end $$;
reset role;

-- =============================================================================
-- 6, 7, 8. Five more retailers; remove two; move one from Bota to Alephata
-- =============================================================================
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$ declare r uuid := rt.v('route'); begin
  perform public.route_outlets_add(r, rt.loc('Otur'), array(select rt.shop('Shop ' || lpad(n::text, 2, '0')) from generate_series(16, 20) n));
  assert (select count(*) from public.route_outlets where route_id = r and is_active) = 20, '20 outlets';
  perform public.route_outlet_remove(r, rt.shop('Shop 03'), 'Shop closed down');
  perform public.route_outlet_remove(r, rt.shop('Shop 17'), null);
  assert (select count(*) from public.route_outlets where route_id = r and is_active) = 18, '18 active';
  assert exists (select 1 from public.retailers where id = rt.shop('Shop 03') and route_id is null), 'retailer kept, only unassigned';
  assert (select count(*) from public.route_outlets where retailer_id = rt.shop('Shop 03')) = 1, 'history row kept';
  perform rt.fails(format($q$select public.route_outlet_remove(%L, %L, null)$q$, r, rt.shop('Shop 03')), '%not on the route%');
  -- move Shop 07 from Bota to Alephata (last in Alephata)
  perform public.route_outlet_update(r, rt.shop('Shop 07'), rt.loc('Alephata'), 'every_visit', null);
  assert (select l.name from public.route_outlets ro join public.locations l on l.id = ro.location_id where ro.retailer_id = rt.shop('Shop 07') and ro.is_active) = 'Alephata', 'moved';
  -- outlet order inside Ghargaon: 05, 04, 02, 01
  perform public.route_outlets_reorder(r, rt.loc('Ghargaon'), array[rt.shop('Shop 05'), rt.shop('Shop 04'), rt.shop('Shop 02'), rt.shop('Shop 01')]);
  assert (select route_sequence from public.retailers where id = rt.shop('Shop 05')) = 1, 'reordered';
  perform rt.fails(format($q$select public.route_outlets_reorder(%L, %L, array[%L]::uuid[])$q$, r, rt.loc('Ghargaon'), rt.shop('Shop 05')), '%reload%');
  -- removing a town that still has outlets needs a decision
  perform rt.fails(format($q$select public.route_set_locations(%L, array[%L, %L, %L, %L]::uuid[])$q$, r, rt.loc('Ghargaon'), rt.loc('Bota'), rt.loc('Belapur'), rt.loc('Alephata')),
                   '%outlet(s) are on the town%');
  -- with "move the outlets to Alephata" it works (tried, then rolled back)
  begin
    perform public.route_set_locations(r, array[rt.loc('Ghargaon'), rt.loc('Bota'), rt.loc('Belapur'), rt.loc('Alephata')], rt.loc('Alephata'));
    assert (select count(*) from public.route_outlets where route_id = r and is_active and location_id = rt.loc('Otur')) = 0, 'Otur outlets moved';
    assert exists (select 1 from public.locations where id = rt.loc('Otur')), 'town record kept';
    raise exception 'undo' using errcode = 'ZZ998';
  exception when sqlstate 'ZZ998' then null;
  end;
  -- Belapur has no outlets: removing it needs no decision, the town record stays; then it is put back
  perform public.route_set_locations(r, array[rt.loc('Ghargaon'), rt.loc('Bota'), rt.loc('Alephata'), rt.loc('Otur')]);
  assert exists (select 1 from public.locations where id = rt.loc('Belapur')), 'Belapur record kept';
  perform public.route_set_locations(r, array[rt.loc('Ghargaon'), rt.loc('Bota'), rt.loc('Belapur'), rt.loc('Alephata'), rt.loc('Otur')]);
end $$;
reset role;

-- Another route: a shop on route 1 cannot silently join it
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$ declare r2 uuid; begin
  perform rt.fails($q$select public.route_save(null, 'sangamner city', null, null, null, 'weekly', '{1}', null, 0, true)$q$, '%already exists%');
  r2 := public.route_save(null, 'Sangamner Rural', null, null, null, 'fortnightly', '{2}', rt.next_dow(2), 20, true);
  insert into rt.x values ('route2', r2);
  perform public.route_set_locations(r2, array[rt.loc('Otur')]);
  perform rt.fails(format($q$select public.route_outlets_add(%L, %L, array[%L]::uuid[])$q$, r2, rt.loc('Otur'), rt.shop('Shop 20')), '%Already on another route: Shop 20%');
  perform public.route_outlets_add(r2, rt.loc('Otur'), array[rt.shop('Shop 20'), rt.shop('Shop 03')], true);
  assert (select route_id from public.retailers where id = rt.shop('Shop 20')) = r2, 'moved to route 2 on request';
  assert (select count(*) from public.route_outlets where retailer_id = rt.shop('Shop 20') and is_active) = 1, 'one active route';
  perform rt.fails(format($q$select public.route_assign(%L, %L, current_date - 1)$q$, r2, '00000000-0000-0000-0000-000000000032'), '%past%');
  perform public.route_assign(r2, '00000000-0000-0000-0000-000000000032', current_date);
end $$;
reset role;

-- =============================================================================
-- 9. Assign Salesman A, then change to Salesman B; history kept
-- =============================================================================
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$ declare r uuid := rt.v('route'); n int; begin
  perform public.route_assign(r, '00000000-0000-0000-0000-000000000031', current_date, 'First salesman');
  assert (select default_salesman_id from public.routes where id = r) = '00000000-0000-0000-0000-000000000031', 'A runs it';
  -- planned visits for today (A), whatever weekday it is
  perform public.plan_route(r, '00000000-0000-0000-0000-000000000031', current_date, 'Test day');
  n := (select count(*) from public.visits where route_id = r and planned_date = current_date);
  assert n = 17, format('17 visits planned today (20 added, 2 removed, 1 moved to route 2), got %s', n);
  -- an office user sets one shop's GPS location (for the geofence test)
  perform public.set_retailer_location(rt.shop('Shop 01'), 19.300000, 74.000000, null);
  insert into rt.x values ('dummy', null);
end $$;
reset role;

-- =============================================================================
-- 10, 11, 12. Salesman A sees the route, the outlets in order, completes a visit (GPS verified)
-- =============================================================================
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000031', false);
set role authenticated;
do $$ declare r uuid := rt.v('route'); v jsonb; vid uuid; begin
  assert (select count(*) from public.routes where id = r) = 1, 'A sees his route';
  assert (select count(*) from public.routes where id = rt.v('route2')) = 0, 'A does not see route 2';
  assert (select array_agg(rtl.shop_name order by coalesce(rl.sequence, 999999), ro.sequence)
            from public.route_outlets ro join public.retailers rtl on rtl.id = ro.retailer_id
            left join public.route_locations rl on rl.route_id = ro.route_id and rl.location_id = ro.location_id
           where ro.route_id = r and ro.is_active)
         = array['Shop 05', 'Shop 04', 'Shop 02', 'Shop 01', 'Shop 06', 'Shop 08', 'Shop 09', 'Shop 10',
                 'Shop 11', 'Shop 12', 'Shop 13', 'Shop 14', 'Shop 15', 'Shop 07', 'Shop 16', 'Shop 18', 'Shop 19'], 'same order as the office set';
  -- completing without a check-in is refused
  vid := (select id from public.visits where retailer_id = rt.shop('Shop 01') and planned_date = current_date);
  perform rt.fails(format($q$select public.visit_check_out(%L, null, null, null, null, 'x', null, now(), null)$q$, vid), '%Check in at the outlet first%');
  v := public.visit_check_in(vid, null, 19.300500, 74.000500, 12, now(), 'c0000000-0000-0000-0000-000000000001');
  assert v ->> 'geo_status' = 'verified' and (v ->> 'distance_m')::numeric between 50 and 90, 'within 200 m: ' || v::text;
  -- 19. the same check-in sent again (offline queue) changes nothing
  v := public.visit_check_in(vid, null, 19.300500, 74.000500, 12, now(), 'c0000000-0000-0000-0000-000000000001');
  assert (v ->> 'duplicate')::boolean, 'duplicate recognised';
  assert (select count(*) from public.visit_events where visit_id = vid and action = 'check_in') = 1, 'one check-in event';
  v := public.visit_check_out(vid, null, 19.300400, 74.000400, 10, 'Ordered 20 cables', null, now(), 'c0000000-0000-0000-0000-000000000002');
  perform public.visit_check_out(vid, null, 19.300400, 74.000400, 10, 'Ordered 20 cables', null, now(), 'c0000000-0000-0000-0000-000000000002');
  assert (select status from public.visits where id = vid) = 'completed', 'completed';
  -- other geo results are reported honestly
  v := public.visit_check_in(null, rt.shop('Shop 02'), null, null, null, now(), null);
  assert v ->> 'geo_status' = 'no_outlet_location' or v ->> 'geo_status' = 'no_gps', 'no GPS';
  assert v ->> 'geo_status' = 'no_gps', 'no GPS given';
  v := public.visit_check_in(null, rt.shop('Shop 04'), 19.3, 74.0, 450, now(), null);
  assert v ->> 'geo_status' = 'low_accuracy', 'low accuracy';
  v := public.visit_check_in(null, rt.shop('Shop 05'), 19.3, 74.0, 10, now(), null);
  assert v ->> 'geo_status' = 'no_outlet_location', 'shop has no location';
  -- salesman sets a missing outlet location (only with a good fix), cannot overwrite one
  perform rt.fails(format($q$select public.set_retailer_location(%L, 19.4, 74.1, 300)$q$, rt.shop('Shop 05')), '%not accurate enough%');
  perform public.set_retailer_location(rt.shop('Shop 05'), 19.31, 74.01, 15);
  perform rt.fails(format($q$select public.set_retailer_location(%L, 19.4, 74.1, 5)$q$, rt.shop('Shop 01')), '%already has a location%');
  -- 19. an unplanned visit checked in twice from two queued updates stays one visit
  perform public.visit_check_in(null, rt.shop('Shop 06'), null, null, null, now(), 'c0000000-0000-0000-0000-000000000010');
  perform public.visit_check_in(null, rt.shop('Shop 06'), null, null, null, now(), 'c0000000-0000-0000-0000-000000000011');
  assert (select count(*) from public.visits where retailer_id = rt.shop('Shop 06') and planned_date = current_date) = 1, 'no duplicate visit';
  -- direct edits are not possible
  perform rt.fails(format($q$update public.visits set status = 'completed' where id = %L$q$, vid), '%permission denied%');
  -- 14. a missed visit with a reason; rescheduling another
  perform rt.fails(format($q$select public.visit_mark_missed(null, %L, '', null, now(), null)$q$, rt.shop('Shop 08')), '%reason%');
  perform public.visit_mark_missed(null, rt.shop('Shop 08'), 'Shop closed', 'Shutter down at 11 am', now(), null);
  v := public.visit_reschedule(null, rt.shop('Shop 09'), current_date + 2, 'Owner away', now(), null);
  assert exists (select 1 from public.visits where id = (v ->> 'new_visit_id')::uuid and planned_date = current_date + 2 and status = 'planned'), 'moved to a later day';
end $$;
reset role;

-- =============================================================================
-- 13, 15. Office sees completed, in progress, missed and the GPS result
-- =============================================================================
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$ declare r uuid := rt.v('route'); begin
  assert (select status from public.visits where retailer_id = rt.shop('Shop 01') and planned_date = current_date) = 'completed', 'office sees completed';
  assert (select geo_status from public.visits where retailer_id = rt.shop('Shop 01') and planned_date = current_date) = 'verified', 'office sees verified';
  assert (select missed_reason from public.visits where retailer_id = rt.shop('Shop 08') and planned_date = current_date) = 'Shop closed', 'office sees the reason';
  assert (select count(*) from public.visits where route_id = r and planned_date = current_date and status = 'in_progress') >= 3, 'in progress';
  assert exists (select 1 from public.salesman_locations where salesman_id = '00000000-0000-0000-0000-000000000031' and source = 'check_in'), 'last known location from check-in';
  assert (select count(*) from public.route_events where route_id = r) >= 8, 'route changes logged';
end $$;
reset role;

-- =============================================================================
-- 17, 18. Change the salesman: history stays with A, money untouched
-- =============================================================================
-- shop with invoices from the sales tests joins the route; its balances must not change
create temp table before_bal as select retailer_id, outstanding, overdue from public.retailer_balances where retailer_id = '20000000-0000-0000-0000-000000000001';
create temp table before_inv as select count(*) n, sum(grand_total) t from public.invoices where retailer_id = '20000000-0000-0000-0000-000000000001';
grant select on before_bal, before_inv to authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$ declare r uuid := rt.v('route'); begin
  perform public.route_outlets_add(r, rt.loc('Otur'), array['20000000-0000-0000-0000-000000000001'::uuid], true);
  perform public.route_assign(r, '00000000-0000-0000-0000-000000000032', current_date + 1, 'A moves to another area');
  assert (select count(*) from public.route_assignments where route_id = r) = 2, 'two assignment rows';
  assert (select end_date from public.route_assignments where route_id = r and salesman_id = '00000000-0000-0000-0000-000000000031') = current_date, 'A ends today';
  assert (select salesman_id from public.visits where retailer_id = rt.shop('Shop 01') and planned_date = current_date) = '00000000-0000-0000-0000-000000000031', 'done visit stays with A';
  assert (select salesman_id from public.visits where rescheduled_from is not null and retailer_id = rt.shop('Shop 09')) = '00000000-0000-0000-0000-000000000032', 'future untouched visit moves to B';
  perform rt.fails(format($q$select public.route_assign(%L, %L, current_date)$q$, r, '00000000-0000-0000-0000-000000000004'), '%active salesman%');
  -- removing an outlet keeps its visits
  perform public.route_outlet_remove(r, rt.shop('Shop 01'), 'test');
  assert (select status from public.visits where retailer_id = rt.shop('Shop 01') and planned_date = current_date) = 'completed', 'history intact';
  perform public.route_outlets_add(r, rt.loc('Ghargaon'), array[rt.shop('Shop 01')]);
end $$;
reset role;
do $$ begin
  assert (select row(outstanding, overdue) from public.retailer_balances where retailer_id = '20000000-0000-0000-0000-000000000001')
         = (select row(outstanding, overdue) from before_bal), 'outstanding unchanged';
  assert (select row(count(*), sum(grand_total)) from public.invoices where retailer_id = '20000000-0000-0000-0000-000000000001')
         = (select row(n, t) from before_inv), 'invoices unchanged';
end $$;

-- =============================================================================
-- 16. Weekly and fortnightly schedules produce the right daily lists (no duplicates)
-- =============================================================================
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
declare r uuid := rt.v('route'); r2 uuid := rt.v('route2');
  mon date := rt.next_dow(1); thu date; tue date := rt.next_dow(2);
  wk boolean; n int;
begin
  if mon <= current_date + 1 then mon := mon + 7; end if;   -- B's assignment starts tomorrow
  thu := mon + 3;
  -- Shop 10 weekly (Monday only), Shop 11 fortnightly, Shop 12 only on Thursdays
  perform public.route_outlet_update(r, rt.shop('Shop 10'), rt.loc('Bota'), 'weekly', null);
  perform public.route_outlet_update(r, rt.shop('Shop 11'), rt.loc('Alephata'), 'fortnightly', null);
  perform public.route_outlet_update(r, rt.shop('Shop 12'), rt.loc('Alephata'), 'every_visit', '{4}');
  n := public.generate_route_visits(mon);
  assert public.generate_route_visits(mon) = 0, 'second run adds nothing';
  wk := mod((mon - date '2026-01-05') / 7, 2) = 0;
  assert exists (select 1 from public.visits where planned_date = mon and retailer_id = rt.shop('Shop 10')), 'weekly outlet on Monday';
  assert not exists (select 1 from public.visits where planned_date = mon and retailer_id = rt.shop('Shop 12')), 'Thursday-only outlet not on Monday';
  assert exists (select 1 from public.visits where planned_date = mon and retailer_id = rt.shop('Shop 11')) = wk, 'fortnightly outlet follows the fortnight';
  assert (select salesman_id from public.route_plans where route_id = r and plan_date = mon and status = 'planned') = '00000000-0000-0000-0000-000000000032', 'planned for B';
  perform public.generate_route_visits(thu);
  assert not exists (select 1 from public.visits where planned_date = thu and retailer_id = rt.shop('Shop 10')), 'weekly outlet only once a week';
  assert exists (select 1 from public.visits where planned_date = thu and retailer_id = rt.shop('Shop 12')), 'Thursday-only outlet on Thursday';
  assert (select count(*) from public.visits where planned_date = thu and route_id = r) =
         (select count(*) from public.route_outlets ro join public.retailers x on x.id = ro.retailer_id
           where ro.route_id = r and ro.is_active and ro.visit_frequency = 'every_visit' and x.status in ('active', 'on_hold')), 'Thursday list = every-visit outlets';
  perform public.generate_route_visits(mon + 7);
  assert exists (select 1 from public.visits where planned_date = mon + 7 and retailer_id = rt.shop('Shop 11')) = not wk, 'fortnightly flips next week';
  -- no visits on a day the route does not run
  perform public.generate_route_visits(mon + 1);
  assert not exists (select 1 from public.visits where planned_date = mon + 1 and route_id = r), 'route does not run on Tuesday';
  -- fortnightly route 2 runs on its anchor Tuesday and every second Tuesday only
  perform public.generate_route_visits(tue);
  perform public.generate_route_visits(tue + 7);
  perform public.generate_route_visits(tue + 14);
  assert exists (select 1 from public.visits where route_id = r2 and planned_date = tue), 'anchor week';
  assert not exists (select 1 from public.visits where route_id = r2 and planned_date = tue + 7), 'off week';
  assert exists (select 1 from public.visits where route_id = r2 and planned_date = tue + 14), 'two weeks later';
  -- skip a day and restore it
  perform public.route_skip_day(r, thu + 7, 'Diwali');
  assert public.generate_route_visits(thu + 7) = 0 and not exists (select 1 from public.visits where route_id = r and planned_date = thu + 7), 'skipped day stays empty';
  perform public.route_skip_day(r, thu + 7, null, false);
  assert public.generate_route_visits(thu + 7) > 0, 'restored day plans again';
  -- pausing stops new plans
  perform public.route_assignment_pause(r, true);
  assert public.generate_route_visits(mon + 14) = 0, 'paused route plans nothing';
  perform public.route_assignment_pause(r, false);
end $$;
reset role;

-- =============================================================================
-- 20. Salesman C sees nothing of these routes and cannot act on them
-- =============================================================================
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000033', false);
set role authenticated;
do $$ begin
  assert (select count(*) from public.routes where id in (rt.v('route'), rt.v('route2'))) = 0, 'no routes';
  assert (select count(*) from public.route_outlets) = 0, 'no outlets';
  assert (select count(*) from public.visits) = 0, 'no visits';
  assert (select count(*) from public.route_assignments) = 0, 'no assignments';
  perform rt.fails(format($q$select public.visit_check_in(null, %L, null, null, null, now(), null)$q$, rt.shop('Shop 13')), '%not yours%');
  perform rt.fails(format($q$select public.route_save(null, 'Mine', null, null, null, 'weekly', '{1}', null, 0, true)$q$), '%Only a Manager%');
  perform rt.fails(format($q$select public.route_outlets_add(%L, null, array[%L]::uuid[])$q$, rt.v('route'), rt.shop('Shop 13')), '%Only a Manager%');
  assert public.generate_route_visits(current_date) = 0, 'generates nothing for routes that are not his';
end $$;
reset role;
-- C cannot touch A's visit even with its id
do $$ begin perform set_config('apex.vid', (select id::text from public.visits where retailer_id = rt.shop('Shop 13') and planned_date = current_date), false); end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000033', false);
set role authenticated;
do $$ begin
  perform rt.fails(format($q$select public.visit_check_in(%L, null, null, null, null, now(), null)$q$, current_setting('apex.vid')), '%another salesman%');
  perform rt.fails(format($q$select public.visit_mark_missed(%L, null, 'x', null, now(), null)$q$, current_setting('apex.vid')), '%another salesman%');
end $$;
reset role;

-- B (new owner from tomorrow) sees the route; yesterday's unvisited plans become "missed (not visited)"
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000032', false);
set role authenticated;
do $$ begin
  assert (select count(*) from public.routes where id = rt.v('route')) = 1, 'B sees the route';
  perform rt.fails($q$select public.generate_route_visits(current_date - 5)$q$, '%from today%');
end $$;
reset role;

select set_config('request.jwt.claim.sub', '', false);
drop schema rt cascade;
select 'ALL ROUTE DATABASE TESTS PASSED' as result;
