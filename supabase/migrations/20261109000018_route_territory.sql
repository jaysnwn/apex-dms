-- =============================================================================
-- 0018 Route, territory & outlet management
--   territories -> routes -> route_locations (towns in order) -> route_outlets
--   route_assignments: who runs a route, with start/end history
--   schedule on the route (visit days, weekly / fortnightly) + per-outlet frequency
--   generate_route_visits(): daily planned visits, idempotent
--   visits: in progress / rescheduled / cancelled, GPS check-in & check-out with
--   geofence result, visit_events (one row per action, offline-safe client ids)
--   salesman_locations: last known / live location (only with the salesman's consent)
--   Every change to routes, towns, outlets and assignments goes through the
--   functions below and is written to route_events.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Territories and locations (towns / villages)
-- -----------------------------------------------------------------------------
create table public.territories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) between 1 and 80),
  code        text,
  description text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index territories_name_key on public.territories (lower(trim(name)));
create trigger territories_updated_at before update on public.territories for each row execute function public.set_updated_at();
create trigger territories_audit after insert or update or delete on public.territories for each row execute function public.audit_row();

create table public.locations (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (length(trim(name)) between 1 and 80),
  territory_id  uuid references public.territories (id),
  district      text,
  pincode       text check (pincode is null or pincode ~ '^[1-9][0-9]{5}$'),
  latitude      numeric(9,6) check (latitude between -90 and 90),
  longitude     numeric(9,6) check (longitude between -180 and 180),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index locations_name_key on public.locations (lower(trim(name)), coalesce(territory_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index locations_territory_idx on public.locations (territory_id);
create trigger locations_updated_at before update on public.locations for each row execute function public.set_updated_at();
create trigger locations_audit after insert or update or delete on public.locations for each row execute function public.audit_row();

alter table public.territories enable row level security;
alter table public.locations enable row level security;
create policy territories_select on public.territories for select to authenticated using ((select public.is_active_user()));
create policy territories_insert on public.territories for insert to authenticated with check ((select public.has_role('super_admin', 'manager')));
create policy territories_update on public.territories for update to authenticated
  using ((select public.has_role('super_admin', 'manager'))) with check ((select public.has_role('super_admin', 'manager')));
create policy locations_select on public.locations for select to authenticated using ((select public.is_active_user()));
create policy locations_insert on public.locations for insert to authenticated with check ((select public.has_role('super_admin', 'manager')));
create policy locations_update on public.locations for update to authenticated
  using ((select public.has_role('super_admin', 'manager'))) with check ((select public.has_role('super_admin', 'manager')));

alter table public.retailers add column if not exists location_id uuid references public.locations (id);
create index if not exists retailers_location_idx on public.retailers (location_id);

-- -----------------------------------------------------------------------------
-- 2. Routes: code, territory, schedule, archive
-- -----------------------------------------------------------------------------
alter table public.routes
  add column code              text,
  add column territory_id      uuid references public.territories (id),
  add column visit_frequency   text not null default 'weekly' check (visit_frequency in ('weekly', 'fortnightly', 'on_demand')),
  add column visit_days        smallint[] not null default '{}' check (visit_days <@ array[1,2,3,4,5,6,7]::smallint[]),
  add column fortnight_anchor  date,
  add column sort_order        integer not null default 0,
  add column archived_at       timestamptz;
comment on column public.routes.visit_days is 'ISO weekdays the route is run: 1 = Monday … 7 = Sunday';
comment on column public.routes.fortnight_anchor is 'Fortnightly routes run in the weeks of this date, every second week';
comment on column public.routes.default_salesman_id is 'Kept in step with the current route_assignments row (read by older code)';
create unique index routes_code_key on public.routes (upper(code)) where code is not null;
create index routes_territory_idx on public.routes (territory_id);

-- Code from the initials of the route's towns: "Ghargaon – Bota – Alephata – Otur" -> GBAO-001
create or replace function public.route_code_for(p_name text)
returns text language plpgsql security definer set search_path = public as $$
declare v_prefix text; v_n integer;
begin
  select upper(string_agg(left(w, 1), '')) into v_prefix
    from regexp_split_to_table(regexp_replace(coalesce(p_name, ''), '[^A-Za-z0-9 –-]', '', 'g'), '\s*[–-]\s*|\s+') w
   where w <> '';
  v_prefix := left(coalesce(nullif(v_prefix, ''), 'RT'), 6);
  select coalesce(max(substring(code from '-(\d+)$')::int), 0) + 1 into v_n
    from public.routes where code ~* ('^' || v_prefix || '-\d+$');
  return v_prefix || '-' || lpad(v_n::text, 3, '0');
end $$;
revoke all on function public.route_code_for(text) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. Towns on a route, outlets on a route, salesman assignments
-- -----------------------------------------------------------------------------
create table public.route_locations (
  id           uuid primary key default gen_random_uuid(),
  route_id     uuid not null references public.routes (id),
  location_id  uuid not null references public.locations (id),
  sequence     integer not null,
  created_at   timestamptz not null default now(),
  unique (route_id, location_id)
);
create index route_locations_location_idx on public.route_locations (location_id);

create table public.route_outlets (
  id               uuid primary key default gen_random_uuid(),
  route_id         uuid not null references public.routes (id),
  retailer_id      uuid not null references public.retailers (id),
  location_id      uuid references public.locations (id),
  sequence         integer not null default 0,
  visit_frequency  text not null default 'every_visit' check (visit_frequency in ('every_visit', 'weekly', 'fortnightly', 'monthly')),
  visit_days       smallint[] check (visit_days is null or visit_days <@ array[1,2,3,4,5,6,7]::smallint[]),
  is_active        boolean not null default true,
  added_at         timestamptz not null default now(),
  added_by         uuid references public.profiles (id) default auth.uid(),
  removed_at       timestamptz,
  removed_by       uuid references public.profiles (id),
  remove_reason    text,
  constraint route_outlets_removed check (is_active or removed_at is not null)
);
comment on column public.route_outlets.visit_frequency is
  'every_visit = each day the route runs; weekly = first route day of the week; fortnightly = every second week; monthly = first route day of the month';
comment on column public.route_outlets.visit_days is 'Optional subset of the route''s days for this outlet (null = all route days)';
-- A retailer is on at most one route at a time (moving it is explicit); history rows stay.
create unique index route_outlets_one_active on public.route_outlets (retailer_id) where is_active;
create index route_outlets_route_idx on public.route_outlets (route_id, location_id, sequence) where is_active;
create index route_outlets_history_idx on public.route_outlets (route_id, retailer_id);

create table public.route_assignments (
  id           uuid primary key default gen_random_uuid(),
  route_id     uuid not null references public.routes (id),
  salesman_id  uuid not null references public.profiles (id),
  start_date   date not null,
  end_date     date,
  status       text not null default 'active' check (status in ('active', 'paused')),
  notes        text,
  created_by   uuid references public.profiles (id) default auth.uid(),
  created_at   timestamptz not null default now(),
  ended_by     uuid references public.profiles (id),
  constraint route_assignments_dates check (end_date is null or end_date >= start_date - 1)
);
-- one open assignment per route (no overlapping salesmen on a route)
create unique index route_assignments_one_open on public.route_assignments (route_id) where end_date is null;
create index route_assignments_salesman_idx on public.route_assignments (salesman_id, start_date);

create table public.route_events (
  id           bigint generated always as identity primary key,
  route_id     uuid not null references public.routes (id),
  action       text not null,
  details      jsonb,
  performed_by uuid default auth.uid(),
  created_at   timestamptz not null default now()
);
create index route_events_route_idx on public.route_events (route_id, id desc);
create trigger route_events_immutable before update or delete on public.route_events for each row execute function public.prevent_mutation();

create trigger route_locations_audit after insert or update or delete on public.route_locations for each row execute function public.audit_row();
create trigger route_outlets_audit after insert or update or delete on public.route_outlets for each row execute function public.audit_row();
create trigger route_assignments_audit after insert or update or delete on public.route_assignments for each row execute function public.audit_row();

create or replace function public.route_log(p_route uuid, p_action text, p_details jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.route_events (route_id, action, details, performed_by) values (p_route, p_action, p_details, auth.uid())
$$;
revoke all on function public.route_log(uuid, text, jsonb) from public, anon, authenticated;

-- Routes a salesman has ever been assigned to (for reading history); office sees all.
create or replace function public.my_route_ids()
returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct route_id), '{}') from public.route_assignments where salesman_id = auth.uid()
$$;
-- Routes the salesman runs right now.
create or replace function public.my_current_route_ids()
returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(route_id), '{}') from public.route_assignments
   where salesman_id = auth.uid() and start_date <= (now() at time zone 'Asia/Kolkata')::date
     and (end_date is null or end_date >= (now() at time zone 'Asia/Kolkata')::date)
$$;
revoke all on function public.my_route_ids(), public.my_current_route_ids() from public, anon;
grant execute on function public.my_route_ids(), public.my_current_route_ids() to authenticated;

alter table public.route_locations enable row level security;
alter table public.route_outlets enable row level security;
alter table public.route_assignments enable row level security;
alter table public.route_events enable row level security;

drop policy if exists routes_select on public.routes;
drop policy if exists routes_insert on public.routes;
drop policy if exists routes_update on public.routes;
create policy routes_select on public.routes for select to authenticated
  using ((select public.has_role('super_admin', 'manager', 'billing', 'warehouse')) or id = any ((select public.my_route_ids())::uuid[]));
create policy route_locations_select on public.route_locations for select to authenticated
  using ((select public.has_role('super_admin', 'manager', 'billing', 'warehouse')) or route_id = any ((select public.my_route_ids())::uuid[]));
create policy route_outlets_select on public.route_outlets for select to authenticated
  using ((select public.has_role('super_admin', 'manager', 'billing', 'warehouse')) or route_id = any ((select public.my_current_route_ids())::uuid[]));
create policy route_assignments_select on public.route_assignments for select to authenticated
  using ((select public.has_role('super_admin', 'manager', 'billing')) or salesman_id = (select auth.uid()));
create policy route_events_select on public.route_events for select to authenticated
  using ((select public.has_role('super_admin', 'manager')));
revoke insert, update, delete on public.routes, public.route_locations, public.route_outlets,
  public.route_assignments, public.route_events from authenticated;
revoke all on public.territories, public.locations, public.route_locations, public.route_outlets,
  public.route_assignments, public.route_events from anon;

-- -----------------------------------------------------------------------------
-- 4. Visits: richer statuses, route, check-out GPS, geofence result, events
-- -----------------------------------------------------------------------------
alter table public.visits alter column status drop default;
alter table public.visits alter column status type text using status::text;
drop type if exists public.visit_status;
alter table public.visits
  alter column status set default 'planned',
  add constraint visits_status_check check (status in ('planned', 'in_progress', 'completed', 'missed', 'rescheduled', 'cancelled')),
  add column route_id             uuid references public.routes (id),
  add column planned_sequence     integer,
  add column checkout_latitude    numeric(9,6) check (checkout_latitude between -90 and 90),
  add column checkout_longitude   numeric(9,6) check (checkout_longitude between -180 and 180),
  add column checkout_accuracy_m  numeric(8,1),
  add column distance_m           numeric(10,1),
  add column geo_status           text check (geo_status in ('verified', 'outside', 'no_gps', 'low_accuracy', 'no_outlet_location')),
  add column photo_path           text,
  add column rescheduled_to       date,
  add column rescheduled_from     uuid references public.visits (id),
  add column source               text not null default 'schedule' check (source in ('schedule', 'manual', 'unplanned', 'rescheduled'));
alter table public.visits add constraint visits_missed_reason check (status <> 'missed' or coalesce(trim(missed_reason), '') <> '');
alter table public.visits add constraint visits_completed_checkin check (status <> 'completed' or checkin_at is not null);
comment on column public.visits.latitude is 'Check-in latitude (only when the phone gave a location)';
comment on column public.visits.geo_status is 'verified = checked in within the geofence radius of the outlet''s saved location';

update public.visits v set route_id = p.route_id from public.route_plans p where p.id = v.route_plan_id and v.route_id is null;
create index visits_route_date_idx on public.visits (route_id, planned_date);
create index visits_date_status_idx on public.visits (planned_date, status);
-- one live visit per salesman, outlet and day; a plan never lists an outlet twice
create unique index visits_one_per_day on public.visits (salesman_id, retailer_id, planned_date) where status not in ('rescheduled', 'cancelled');
create unique index visits_plan_retailer on public.visits (route_plan_id, retailer_id) where route_plan_id is not null and status not in ('rescheduled', 'cancelled');

drop policy if exists visits_insert on public.visits;
drop policy if exists visits_update on public.visits;
revoke insert, update, delete on public.visits from authenticated;

create table public.visit_events (
  id           bigint generated always as identity primary key,
  visit_id     uuid not null references public.visits (id),
  action       text not null,
  client_uuid  uuid unique,
  happened_at  timestamptz not null,
  latitude     numeric(9,6),
  longitude    numeric(9,6),
  accuracy_m   numeric(8,1),
  result       jsonb,
  performed_by uuid default auth.uid(),
  created_at   timestamptz not null default now()
);
create index visit_events_visit_idx on public.visit_events (visit_id, id);
alter table public.visit_events enable row level security;
create trigger visit_events_immutable before update or delete on public.visit_events for each row execute function public.prevent_mutation();
create policy visit_events_select on public.visit_events for select to authenticated
  using (exists (select 1 from public.visits v where v.id = visit_id));
revoke insert, update, delete on public.visit_events from authenticated;
revoke all on public.visit_events from anon;

alter table public.route_plans
  add column source        text not null default 'manual' check (source in ('schedule', 'manual')),
  add column status        text not null default 'planned' check (status in ('planned', 'cancelled')),
  add column cancel_reason text;
create unique index route_plans_one_per_day on public.route_plans (route_id, plan_date) where status = 'planned';

-- -----------------------------------------------------------------------------
-- 5. Locations of salesmen (consent) and GPS settings
-- -----------------------------------------------------------------------------
alter table public.company_settings
  add column if not exists geofence_radius_m  integer not null default 200 check (geofence_radius_m between 20 and 5000),
  add column if not exists gps_min_accuracy_m integer not null default 100 check (gps_min_accuracy_m between 5 and 2000),
  add column if not exists live_location_minutes integer not null default 10 check (live_location_minutes between 2 and 120);
alter table public.profiles add column if not exists share_location boolean not null default false;

create table public.salesman_locations (
  id           bigint generated always as identity primary key,
  salesman_id  uuid not null references public.profiles (id),
  recorded_at  timestamptz not null,
  latitude     numeric(9,6) not null check (latitude between -90 and 90),
  longitude    numeric(9,6) not null check (longitude between -180 and 180),
  accuracy_m   numeric(8,1),
  source       text not null check (source in ('ping', 'check_in', 'check_out')),
  visit_id     uuid references public.visits (id),
  created_at   timestamptz not null default now()
);
create index salesman_locations_latest_idx on public.salesman_locations (salesman_id, recorded_at desc);
alter table public.salesman_locations enable row level security;
create policy salesman_locations_select on public.salesman_locations for select to authenticated
  using ((select public.has_role('super_admin', 'manager')) or salesman_id = (select auth.uid()));
revoke insert, update, delete on public.salesman_locations from authenticated;
revoke all on public.salesman_locations from anon;

create or replace function public.distance_m(lat1 numeric, lon1 numeric, lat2 numeric, lon2 numeric)
returns numeric language sql immutable set search_path = public as $$
  select round((6371000 * 2 * asin(sqrt(
    power(sin(radians((lat2 - lat1)::float8) / 2), 2)
    + cos(radians(lat1::float8)) * cos(radians(lat2::float8)) * power(sin(radians((lon2 - lon1)::float8) / 2), 2))))::numeric, 1)
$$;

-- -----------------------------------------------------------------------------
-- 6. Keep the older columns (retailers.route_id / route_sequence, routes.default_salesman_id) in step
-- -----------------------------------------------------------------------------
-- Overall visit order on a route = town order, then outlet order inside the town.
create or replace function public.route_resequence(p_route uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform set_config('apex.route_sync', 'on', true);
  update public.retailers r set route_sequence = o.n
    from (select ro.retailer_id, row_number() over (order by coalesce(rl.sequence, 1000000), ro.sequence, ro.added_at) as n
            from public.route_outlets ro
            left join public.route_locations rl on rl.route_id = ro.route_id and rl.location_id = ro.location_id
           where ro.route_id = p_route and ro.is_active) o
   where r.id = o.retailer_id and r.route_sequence is distinct from o.n;
  perform set_config('apex.route_sync', 'off', true);
end $$;
revoke all on function public.route_resequence(uuid) from public, anon, authenticated;

create or replace function public.sync_route_salesmen()
returns void language plpgsql security definer set search_path = public as $$
declare v_today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  update public.routes r set default_salesman_id = a.salesman_id
    from (select rt.id, (select ra.salesman_id from public.route_assignments ra
                          where ra.route_id = rt.id and ra.start_date <= v_today and (ra.end_date is null or ra.end_date >= v_today)
                          order by ra.start_date desc limit 1) as salesman_id
            from public.routes rt
           where exists (select 1 from public.route_assignments x where x.route_id = rt.id)) a
   where r.id = a.id and r.default_salesman_id is distinct from a.salesman_id;
end $$;
revoke all on function public.sync_route_salesmen() from public, anon, authenticated;

-- A retailer's route set from the retailer form, the import or the salesman app
-- (retailers.route_id) becomes a route_outlets row too.
create or replace function public.retailer_route_sync()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_seq integer;
begin
  if current_setting('apex.route_sync', true) = 'on' then return null; end if;
  if tg_op = 'UPDATE' and new.route_id is not distinct from old.route_id then return null; end if;
  update public.route_outlets set is_active = false, removed_at = now(), removed_by = auth.uid(),
         remove_reason = 'Route changed on the retailer'
   where retailer_id = new.id and is_active and route_id is distinct from new.route_id;
  if new.route_id is not null and not exists (select 1 from public.route_outlets where retailer_id = new.id and is_active) then
    select coalesce(max(sequence), 0) + 10 into v_seq from public.route_outlets
     where route_id = new.route_id and is_active and location_id is not distinct from new.location_id;
    insert into public.route_outlets (route_id, retailer_id, location_id, sequence)
    values (new.route_id, new.id, new.location_id, v_seq);
    perform public.route_log(new.route_id, 'outlet_added', jsonb_build_object('retailer_id', new.id, 'shop', new.shop_name, 'via', 'retailer record'));
    perform public.route_resequence(new.route_id);
  end if;
  if tg_op = 'UPDATE' and old.route_id is not null and old.route_id is distinct from new.route_id then
    perform public.route_log(old.route_id, 'outlet_removed', jsonb_build_object('retailer_id', new.id, 'shop', new.shop_name, 'via', 'retailer record'));
    perform public.route_resequence(old.route_id);
  end if;
  return null;
end $$;
revoke all on function public.retailer_route_sync() from public, anon, authenticated;
create trigger retailers_route_sync after insert or update of route_id on public.retailers
  for each row execute function public.retailer_route_sync();

-- New retailers pick up their town from the city name when it matches a location.
create or replace function public.retailer_location_default()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.location_id is null and coalesce(trim(new.billing_city), '') <> '' then
    select id into new.location_id from public.locations
     where lower(trim(name)) = lower(trim(new.billing_city)) and is_active order by created_at limit 1;
  end if;
  return new;
end $$;
revoke all on function public.retailer_location_default() from public, anon, authenticated;
create trigger retailers_location_default before insert or update of billing_city on public.retailers
  for each row execute function public.retailer_location_default();

-- -----------------------------------------------------------------------------
-- 7. Carry over existing routes and retailers
-- -----------------------------------------------------------------------------
insert into public.locations (name)
select distinct initcap(trim(billing_city)) from public.retailers
 where coalesce(trim(billing_city), '') <> ''
on conflict do nothing;
update public.retailers r set location_id = l.id
  from public.locations l where r.location_id is null and lower(trim(l.name)) = lower(trim(r.billing_city));

do $$
declare r record;
begin
  for r in select id, name from public.routes order by created_at, id loop
    update public.routes set code = public.route_code_for(r.name) where id = r.id;
  end loop;
end $$;

insert into public.route_assignments (route_id, salesman_id, start_date, notes, created_by)
select id, default_salesman_id, (created_at at time zone 'Asia/Kolkata')::date, 'Carried over', null
  from public.routes where default_salesman_id is not null;

insert into public.route_locations (route_id, location_id, sequence)
select route_id, location_id, (row_number() over (partition by route_id order by min_seq, name)) * 10
  from (select r.route_id, r.location_id, min(coalesce(r.route_sequence, 100000)) as min_seq, l.name
          from public.retailers r join public.locations l on l.id = r.location_id
         where r.route_id is not null group by r.route_id, r.location_id, l.name) x;

insert into public.route_outlets (route_id, retailer_id, location_id, sequence, added_by)
select route_id, id, location_id,
       (row_number() over (partition by route_id, location_id order by coalesce(route_sequence, 100000), shop_name)) * 10, created_by
  from public.retailers where route_id is not null;

do $$ declare r record; begin
  for r in select id from public.routes loop perform public.route_resequence(r.id); end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 8. Route management functions (Super Admin / Manager)
-- -----------------------------------------------------------------------------
create or replace function public.require_route_admin()
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_role('super_admin', 'manager') then
    raise exception 'Only a Manager or Super Admin can change routes' using errcode = '42501';
  end if;
end $$;
revoke all on function public.require_route_admin() from public, anon, authenticated;

create or replace function public.route_save(p_id uuid, p_name text, p_code text, p_territory_id uuid, p_description text,
                                             p_visit_frequency text, p_visit_days smallint[], p_fortnight_anchor date,
                                             p_sort_order integer, p_is_active boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_old public.routes%rowtype; v_id uuid; v_code text := upper(nullif(trim(p_code), ''));
begin
  perform public.require_route_admin();
  if coalesce(length(trim(p_name)), 0) < 2 then raise exception 'Enter the route name' using errcode = 'P0001'; end if;
  if p_visit_frequency not in ('weekly', 'fortnightly', 'on_demand') then raise exception 'Choose the visit frequency' using errcode = 'P0001'; end if;
  if p_visit_frequency <> 'on_demand' and coalesce(cardinality(p_visit_days), 0) = 0 then
    raise exception 'Choose at least one visit day' using errcode = 'P0001';
  end if;
  if v_code is not null and v_code !~ '^[A-Z0-9][A-Z0-9-]{1,19}$' then
    raise exception 'Route code: letters, numbers and dashes only' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.routes where lower(name) = lower(trim(p_name)) and id is distinct from p_id) then
    raise exception 'A route with this name already exists' using errcode = 'P0001';
  end if;
  if v_code is not null and exists (select 1 from public.routes where upper(code) = v_code and id is distinct from p_id) then
    raise exception 'Route code % is already used', v_code using errcode = 'P0001';
  end if;
  if p_id is null then
    insert into public.routes (name, code, territory_id, description, visit_frequency, visit_days, fortnight_anchor, sort_order, is_active)
    values (trim(p_name), coalesce(v_code, public.route_code_for(p_name)), p_territory_id, nullif(trim(p_description), ''),
            p_visit_frequency, coalesce(p_visit_days, '{}'), case when p_visit_frequency = 'fortnightly' then coalesce(p_fortnight_anchor, public.ist_today()) end,
            coalesce(p_sort_order, 0), coalesce(p_is_active, true))
    returning id into v_id;
    perform public.route_log(v_id, 'created', jsonb_build_object('name', trim(p_name)));
    return v_id;
  end if;
  select * into v_old from public.routes where id = p_id for update;
  if not found then raise exception 'Route not found' using errcode = 'P0001'; end if;
  if v_old.archived_at is not null then raise exception 'This route is archived; restore it first' using errcode = 'P0001'; end if;
  if v_code is not null and v_code is distinct from v_old.code and not public.has_role('super_admin') then
    raise exception 'Only the Super Admin can change a route code' using errcode = '42501';
  end if;
  update public.routes set
    name = trim(p_name), code = coalesce(v_code, v_old.code), territory_id = p_territory_id,
    description = nullif(trim(p_description), ''), visit_frequency = p_visit_frequency, visit_days = coalesce(p_visit_days, '{}'),
    fortnight_anchor = case when p_visit_frequency = 'fortnightly' then coalesce(p_fortnight_anchor, v_old.fortnight_anchor, public.ist_today()) end,
    sort_order = coalesce(p_sort_order, v_old.sort_order), is_active = coalesce(p_is_active, v_old.is_active)
  where id = p_id;
  perform public.route_log(p_id, 'edited', jsonb_strip_nulls(jsonb_build_object(
    'name', case when trim(p_name) <> v_old.name then jsonb_build_array(v_old.name, trim(p_name)) end,
    'code', case when coalesce(v_code, v_old.code) is distinct from v_old.code then jsonb_build_array(v_old.code, v_code) end,
    'territory', case when p_territory_id is distinct from v_old.territory_id then 'changed' end,
    'days', case when coalesce(p_visit_days, '{}') <> v_old.visit_days then jsonb_build_array(v_old.visit_days, p_visit_days) end,
    'frequency', case when p_visit_frequency <> v_old.visit_frequency then jsonb_build_array(v_old.visit_frequency, p_visit_frequency) end,
    'active', case when coalesce(p_is_active, v_old.is_active) <> v_old.is_active then p_is_active end)));
  -- schedule changed: drop untouched future visits that no longer fit; they regenerate
  if coalesce(p_visit_days, '{}') <> v_old.visit_days or p_visit_frequency <> v_old.visit_frequency
     or coalesce(p_is_active, v_old.is_active) <> v_old.is_active then
    perform public.route_drop_future_visits(p_id, null, public.ist_today() + 1);
  end if;
  return p_id;
end $$;

-- Removes planned, untouched visits from a date on (they are plans, not history).
create or replace function public.route_drop_future_visits(p_route uuid, p_retailer uuid, p_from date)
returns integer language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  with gone as (
    delete from public.visits v
     where v.route_id = p_route and v.planned_date >= p_from and v.status = 'planned' and v.checkin_at is null
       and (p_retailer is null or v.retailer_id = p_retailer)
       and not exists (select 1 from public.payments p where p.visit_id = v.id)
       and not exists (select 1 from public.visit_events e where e.visit_id = v.id)
    returning 1)
  select count(*) into v_n from gone;
  delete from public.route_plans rp
   where rp.route_id = p_route and rp.plan_date >= p_from and rp.source = 'schedule' and rp.status = 'planned' and p_retailer is null
     and not exists (select 1 from public.visits v where v.route_plan_id = rp.id);
  return v_n;
end $$;
revoke all on function public.route_drop_future_visits(uuid, uuid, date) from public, anon, authenticated;

create or replace function public.route_archive(p_id uuid, p_archive boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_route_admin();
  if p_archive then
    update public.routes set archived_at = now(), is_active = false where id = p_id and archived_at is null;
    if not found then raise exception 'Route not found or already archived' using errcode = 'P0001'; end if;
    update public.route_assignments set end_date = greatest(start_date - 1, public.ist_today()), ended_by = auth.uid()
     where route_id = p_id and end_date is null;
    perform public.route_drop_future_visits(p_id, null, public.ist_today() + 1);
    perform public.sync_route_salesmen();
    perform public.route_log(p_id, 'archived', jsonb_build_object('reason', p_reason));
  else
    update public.routes set archived_at = null, is_active = true where id = p_id and archived_at is not null;
    if not found then raise exception 'Route not found or not archived' using errcode = 'P0001'; end if;
    perform public.route_log(p_id, 'restored', null);
  end if;
end $$;

-- Towns of a route in order. A town left out is removed from the route (the town itself stays).
-- Outlets on a removed town must be moved (p_move_to) or taken off the route (p_remove_outlets).
create or replace function public.route_set_locations(p_route uuid, p_location_ids uuid[], p_move_to uuid default null, p_remove_outlets boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_removed uuid[]; v_n integer; v_added uuid[]; r record; i integer;
begin
  perform public.require_route_admin();
  perform 1 from public.routes where id = p_route and archived_at is null for update;
  if not found then raise exception 'Route not found' using errcode = 'P0001'; end if;
  p_location_ids := coalesce(p_location_ids, '{}');
  if cardinality(p_location_ids) <> (select count(distinct x) from unnest(p_location_ids) x) then
    raise exception 'A town is listed twice' using errcode = 'P0001';
  end if;
  if exists (select 1 from unnest(p_location_ids) x where not exists (select 1 from public.locations l where l.id = x)) then
    raise exception 'Unknown town' using errcode = 'P0001';
  end if;
  select array_agg(location_id) into v_removed from public.route_locations
   where route_id = p_route and not (location_id = any (p_location_ids));
  select array_agg(x) into v_added from unnest(p_location_ids) x
   where not exists (select 1 from public.route_locations where route_id = p_route and location_id = x);
  select count(*) into v_n from public.route_outlets where route_id = p_route and is_active and location_id = any (coalesce(v_removed, '{}'));
  if v_n > 0 then
    if p_move_to is not null then
      if not (p_move_to = any (p_location_ids)) then raise exception 'Move the outlets to a town that stays on the route' using errcode = 'P0001'; end if;
      update public.route_outlets set location_id = p_move_to,
             sequence = sequence + coalesce((select max(sequence) from public.route_outlets where route_id = p_route and is_active and location_id = p_move_to), 0)
       where route_id = p_route and is_active and location_id = any (v_removed);
    elsif p_remove_outlets then
      for r in select retailer_id from public.route_outlets where route_id = p_route and is_active and location_id = any (v_removed) loop
        perform public.route_outlet_remove_internal(p_route, r.retailer_id, 'Town removed from the route');
      end loop;
    else
      raise exception '% outlet(s) are on the town(s) being removed. Move them to another town or remove them from the route.', v_n
        using errcode = 'P0001', hint = 'OUTLETS_ON_LOCATION';
    end if;
  end if;
  delete from public.route_locations where route_id = p_route and location_id = any (coalesce(v_removed, '{}'));
  for i in 1 .. cardinality(p_location_ids) loop
    insert into public.route_locations (route_id, location_id, sequence) values (p_route, p_location_ids[i], i * 10)
    on conflict (route_id, location_id) do update set sequence = excluded.sequence
      where public.route_locations.sequence is distinct from excluded.sequence;
  end loop;
  perform public.route_resequence(p_route);
  perform public.route_log(p_route, 'towns_changed', jsonb_build_object(
    'order', (select jsonb_agg(l.name order by x.n) from unnest(p_location_ids) with ordinality x(id, n) join public.locations l on l.id = x.id),
    'added', (select jsonb_agg(name) from public.locations where id = any (coalesce(v_added, '{}'))),
    'removed', (select jsonb_agg(name) from public.locations where id = any (coalesce(v_removed, '{}'))),
    'outlets_moved', case when v_n > 0 and p_move_to is not null then v_n end,
    'outlets_removed', case when v_n > 0 and p_remove_outlets then v_n end));
  return jsonb_build_object('added', coalesce(cardinality(v_added), 0), 'removed', coalesce(cardinality(v_removed), 0), 'outlets_affected', v_n);
end $$;

create or replace function public.route_outlet_remove_internal(p_route uuid, p_retailer uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_shop text;
begin
  update public.route_outlets set is_active = false, removed_at = now(), removed_by = auth.uid(), remove_reason = nullif(trim(p_reason), '')
   where route_id = p_route and retailer_id = p_retailer and is_active;
  if not found then raise exception 'This outlet is not on the route' using errcode = 'P0001'; end if;
  perform set_config('apex.route_sync', 'on', true);
  update public.retailers set route_id = null, route_sequence = null where id = p_retailer and route_id = p_route returning shop_name into v_shop;
  perform set_config('apex.route_sync', 'off', true);
  perform public.route_drop_future_visits(p_route, p_retailer, public.ist_today());
  perform public.route_log(p_route, 'outlet_removed', jsonb_build_object('retailer_id', p_retailer, 'shop', v_shop, 'reason', p_reason));
end $$;
revoke all on function public.route_outlet_remove_internal(uuid, uuid, text) from public, anon, authenticated;

create or replace function public.route_outlet_remove(p_route uuid, p_retailer uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_route_admin();
  perform public.route_outlet_remove_internal(p_route, p_retailer, p_reason);
  perform public.route_resequence(p_route);
end $$;

-- Add retailers to a town on the route. A retailer already on ANOTHER route is only moved when p_move = true.
create or replace function public.route_outlets_add(p_route uuid, p_location uuid, p_retailer_ids uuid[], p_move boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_added integer := 0; v_moved integer := 0; v_same integer := 0; v_seq integer;
  r record; v_conflicts jsonb;
begin
  perform public.require_route_admin();
  perform 1 from public.routes where id = p_route and archived_at is null for update;
  if not found then raise exception 'Route not found' using errcode = 'P0001'; end if;
  if p_location is not null and not exists (select 1 from public.route_locations where route_id = p_route and location_id = p_location) then
    raise exception 'Add the town to the route first' using errcode = 'P0001';
  end if;
  if coalesce(cardinality(p_retailer_ids), 0) = 0 then raise exception 'Choose retailers' using errcode = 'P0001'; end if;
  if cardinality(p_retailer_ids) <> (select count(distinct x) from unnest(p_retailer_ids) x) then
    raise exception 'A retailer is listed twice' using errcode = 'P0001';
  end if;
  if exists (select 1 from unnest(p_retailer_ids) x where not exists (select 1 from public.retailers where id = x)) then
    raise exception 'Unknown retailer' using errcode = 'P0001';
  end if;

  select jsonb_agg(jsonb_build_object('shop', rt.shop_name, 'route', ro2.name, 'code', ro2.code)) into v_conflicts
    from public.route_outlets ro join public.retailers rt on rt.id = ro.retailer_id join public.routes ro2 on ro2.id = ro.route_id
   where ro.is_active and ro.retailer_id = any (p_retailer_ids) and ro.route_id <> p_route;
  if v_conflicts is not null and not p_move then
    raise exception 'Already on another route: %', (select string_agg((c ->> 'shop') || ' (' || (c ->> 'route') || ')', ', ') from jsonb_array_elements(v_conflicts) c)
      using errcode = 'P0001', hint = 'ON_OTHER_ROUTE', detail = v_conflicts::text;
  end if;

  select coalesce(max(sequence), 0) into v_seq from public.route_outlets
   where route_id = p_route and is_active and location_id is not distinct from p_location;

  for r in select x.id, x.n, ro.route_id as cur_route, ro.location_id as cur_loc, rt.shop_name
             from unnest(p_retailer_ids) with ordinality x(id, n)
             join public.retailers rt on rt.id = x.id
             left join public.route_outlets ro on ro.retailer_id = x.id and ro.is_active
            order by x.n loop
    if r.cur_route = p_route then
      if r.cur_loc is distinct from p_location then
        v_seq := v_seq + 10;
        update public.route_outlets set location_id = p_location, sequence = v_seq where retailer_id = r.id and is_active;
        v_moved := v_moved + 1;
      else
        v_same := v_same + 1;
      end if;
      continue;
    end if;
    if r.cur_route is not null then
      perform public.route_outlet_remove_internal(r.cur_route, r.id, 'Moved to another route');
      perform public.route_resequence(r.cur_route);
      v_moved := v_moved + 1;
    else
      v_added := v_added + 1;
    end if;
    v_seq := v_seq + 10;
    insert into public.route_outlets (route_id, retailer_id, location_id, sequence) values (p_route, r.id, p_location, v_seq);
    perform set_config('apex.route_sync', 'on', true);
    update public.retailers set route_id = p_route, location_id = coalesce(location_id, p_location) where id = r.id;
    perform set_config('apex.route_sync', 'off', true);
    perform public.route_log(p_route, 'outlet_added', jsonb_build_object('retailer_id', r.id, 'shop', r.shop_name,
      'location', (select name from public.locations where id = p_location), 'from_route', r.cur_route));
  end loop;
  perform public.route_resequence(p_route);
  return jsonb_build_object('added', v_added, 'moved', v_moved, 'already', v_same);
end $$;

-- Outlet order inside one town (p_retailer_ids = every active outlet of that town, in the new order).
create or replace function public.route_outlets_reorder(p_route uuid, p_location uuid, p_retailer_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare i integer;
begin
  perform public.require_route_admin();
  if (select array_agg(retailer_id order by retailer_id) from public.route_outlets
       where route_id = p_route and is_active and location_id is not distinct from p_location)
     is distinct from (select array_agg(x order by x) from unnest(p_retailer_ids) x) then
    raise exception 'The outlet list changed; reload and try again' using errcode = 'P0001';
  end if;
  for i in 1 .. cardinality(p_retailer_ids) loop
    update public.route_outlets set sequence = i * 10 where route_id = p_route and retailer_id = p_retailer_ids[i] and is_active and sequence <> i * 10;
  end loop;
  perform public.route_resequence(p_route);
  perform public.route_log(p_route, 'outlets_reordered', jsonb_build_object('location', (select name from public.locations where id = p_location),
    'order', (select jsonb_agg(r.shop_name order by x.n) from unnest(p_retailer_ids) with ordinality x(id, n) join public.retailers r on r.id = x.id)));
end $$;

-- Move an outlet to another town of the route and/or set how often it is visited.
create or replace function public.route_outlet_update(p_route uuid, p_retailer uuid, p_location uuid, p_visit_frequency text, p_visit_days smallint[])
returns void language plpgsql security definer set search_path = public as $$
declare v_old public.route_outlets%rowtype; v_seq integer;
begin
  perform public.require_route_admin();
  select * into v_old from public.route_outlets where route_id = p_route and retailer_id = p_retailer and is_active for update;
  if not found then raise exception 'This outlet is not on the route' using errcode = 'P0001'; end if;
  if p_location is not null and not exists (select 1 from public.route_locations where route_id = p_route and location_id = p_location) then
    raise exception 'That town is not on this route' using errcode = 'P0001';
  end if;
  if p_visit_frequency not in ('every_visit', 'weekly', 'fortnightly', 'monthly') then raise exception 'Choose how often' using errcode = 'P0001'; end if;
  if p_location is distinct from v_old.location_id then
    select coalesce(max(sequence), 0) + 10 into v_seq from public.route_outlets where route_id = p_route and is_active and location_id is not distinct from p_location;
  end if;
  update public.route_outlets set location_id = p_location, sequence = coalesce(v_seq, sequence), visit_frequency = p_visit_frequency,
         visit_days = nullif(p_visit_days, '{}')
   where id = v_old.id;
  if p_location is distinct from v_old.location_id then
    perform set_config('apex.route_sync', 'on', true);
    update public.retailers set location_id = p_location where id = p_retailer;
    perform set_config('apex.route_sync', 'off', true);
  end if;
  perform public.route_resequence(p_route);
  perform public.route_drop_future_visits(p_route, p_retailer, public.ist_today() + 1);
  perform public.route_log(p_route, 'outlet_changed', jsonb_strip_nulls(jsonb_build_object('retailer_id', p_retailer,
    'shop', (select shop_name from public.retailers where id = p_retailer),
    'location', case when p_location is distinct from v_old.location_id then
      jsonb_build_array((select name from public.locations where id = v_old.location_id), (select name from public.locations where id = p_location)) end,
    'frequency', case when p_visit_frequency <> v_old.visit_frequency then jsonb_build_array(v_old.visit_frequency, p_visit_frequency) end)));
end $$;

-- Assign (or reassign) a route from a date. The previous assignment ends the day before;
-- visits already done stay with whoever made them; untouched future visits move to the new salesman.
create or replace function public.route_assign(p_route uuid, p_salesman uuid, p_start date, p_notes text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_cur public.route_assignments%rowtype; v_id uuid;
begin
  perform public.require_route_admin();
  perform 1 from public.routes where id = p_route and archived_at is null for update;
  if not found then raise exception 'Route not found' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.profiles where id = p_salesman and role = 'salesman' and is_active) then
    raise exception 'Choose an active salesman' using errcode = 'P0001';
  end if;
  if p_start is null or p_start < public.ist_today() then
    raise exception 'The start date cannot be in the past (past visits keep their salesman)' using errcode = 'P0001';
  end if;
  select * into v_cur from public.route_assignments where route_id = p_route and end_date is null for update;
  if found then
    if v_cur.salesman_id = p_salesman then
      if v_cur.status = 'paused' then
        update public.route_assignments set status = 'active' where id = v_cur.id;
        perform public.route_log(p_route, 'assignment_resumed', jsonb_build_object('salesman_id', p_salesman));
      end if;
      return v_cur.id;
    end if;
    -- ends the day before; an assignment that had not started yet ends before it began (kept as history)
    update public.route_assignments set end_date = greatest(p_start - 1, v_cur.start_date - 1), ended_by = auth.uid() where id = v_cur.id;
  end if;
  insert into public.route_assignments (route_id, salesman_id, start_date, notes) values (p_route, p_salesman, p_start, nullif(trim(p_notes), ''))
  returning id into v_id;
  update public.visits set salesman_id = p_salesman
   where route_id = p_route and planned_date >= p_start and status = 'planned' and checkin_at is null
     and not exists (select 1 from public.visit_events e where e.visit_id = visits.id);
  update public.route_plans set salesman_id = p_salesman where route_id = p_route and plan_date >= p_start and status = 'planned';
  perform public.sync_route_salesmen();
  perform public.route_log(p_route, 'assigned', jsonb_build_object('salesman_id', p_salesman,
    'salesman', (select full_name from public.profiles where id = p_salesman), 'from', p_start,
    'previous', (select full_name from public.profiles where id = v_cur.salesman_id)));
  return v_id;
end $$;

create or replace function public.route_unassign(p_route uuid, p_last_day date)
returns void language plpgsql security definer set search_path = public as $$
declare v_cur public.route_assignments%rowtype;
begin
  perform public.require_route_admin();
  select * into v_cur from public.route_assignments where route_id = p_route and end_date is null for update;
  if not found then raise exception 'The route has no salesman' using errcode = 'P0001'; end if;
  if p_last_day < public.ist_today() - 1 then raise exception 'The last day cannot be in the past' using errcode = 'P0001'; end if;
  update public.route_assignments set end_date = greatest(p_last_day, v_cur.start_date - 1), ended_by = auth.uid() where id = v_cur.id;
  perform public.route_drop_future_visits(p_route, null, p_last_day + 1);
  perform public.sync_route_salesmen();
  perform public.route_log(p_route, 'unassigned', jsonb_build_object('salesman', (select full_name from public.profiles where id = v_cur.salesman_id), 'last_day', p_last_day));
end $$;

-- Pause: the salesman keeps the route but no visits are planned until resumed.
create or replace function public.route_assignment_pause(p_route uuid, p_paused boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_route_admin();
  update public.route_assignments set status = case when p_paused then 'paused' else 'active' end
   where route_id = p_route and end_date is null and status <> case when p_paused then 'paused' else 'active' end;
  if not found then raise exception 'Nothing to change' using errcode = 'P0001'; end if;
  if p_paused then perform public.route_drop_future_visits(p_route, null, public.ist_today() + 1); end if;
  perform public.route_log(p_route, case when p_paused then 'assignment_paused' else 'assignment_resumed' end, null);
end $$;

-- Skip a scheduled day (holiday, salesman on leave) or undo the skip.
create or replace function public.route_skip_day(p_route uuid, p_date date, p_reason text, p_skip boolean default true)
returns void language plpgsql security definer set search_path = public as $$
declare v_plan uuid; v_sm uuid;
begin
  perform public.require_route_admin();
  if p_date < public.ist_today() then raise exception 'Choose today or a later date' using errcode = 'P0001'; end if;
  if p_skip then
    if coalesce(trim(p_reason), '') = '' then raise exception 'Enter the reason' using errcode = 'P0001'; end if;
    perform public.route_drop_future_visits(p_route, null, p_date);
    -- dropped visits after p_date regenerate on demand; only p_date is marked skipped
    select salesman_id into v_sm from public.route_assignments where route_id = p_route and start_date <= p_date and (end_date is null or end_date >= p_date) limit 1;
    update public.route_plans set status = 'cancelled', cancel_reason = trim(p_reason) where route_id = p_route and plan_date = p_date and status = 'planned'
    returning id into v_plan;
    if v_plan is null then
      insert into public.route_plans (route_id, salesman_id, plan_date, source, status, cancel_reason, created_by)
      values (p_route, coalesce(v_sm, auth.uid()), p_date, 'schedule', 'cancelled', trim(p_reason), auth.uid());
    end if;
    perform public.route_log(p_route, 'day_skipped', jsonb_build_object('date', p_date, 'reason', trim(p_reason)));
  else
    delete from public.route_plans rp where route_id = p_route and plan_date = p_date and status = 'cancelled'
      and not exists (select 1 from public.visits v where v.route_plan_id = rp.id);
    perform public.route_log(p_route, 'day_restored', jsonb_build_object('date', p_date));
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 9. Daily planned visits from the schedules (idempotent)
-- -----------------------------------------------------------------------------
-- Is outlet ro due on day p_date of route rt?
create or replace function public.outlet_due(p_route_days smallint[], p_route_freq text, p_anchor date,
                                             p_outlet_freq text, p_outlet_days smallint[], p_date date)
returns boolean language plpgsql immutable set search_path = public as $$
declare
  v_dow smallint := extract(isodow from p_date)::smallint;
  v_days smallint[];
  v_first smallint;
  v_anchor date := coalesce(p_anchor, date '2026-01-05');
  v_week_on boolean;
begin
  if p_route_freq = 'on_demand' or not (v_dow = any (p_route_days)) then return false; end if;
  -- route runs fortnightly: only in the anchor's weeks
  if p_route_freq = 'fortnightly' and mod(((p_date - extract(isodow from p_date)::int) - (v_anchor - extract(isodow from v_anchor)::int)) / 7, 2) <> 0 then
    return false;
  end if;
  v_days := case when p_outlet_days is null then p_route_days
                 else array(select unnest(p_route_days) intersect select unnest(p_outlet_days)) end;
  if not (v_dow = any (v_days)) then return false; end if;
  if p_outlet_freq = 'every_visit' then return true; end if;
  select min(d) into v_first from unnest(v_days) d;
  if v_dow <> v_first then return false; end if;           -- once a week: the first matching day
  if p_outlet_freq = 'weekly' then return true; end if;
  v_week_on := mod(((p_date - extract(isodow from p_date)::int) - (v_anchor - extract(isodow from v_anchor)::int)) / 7, 2) = 0;
  if p_outlet_freq = 'fortnightly' then return v_week_on; end if;
  if p_outlet_freq = 'monthly' then return extract(day from p_date) <= 7; end if;
  return false;
end $$;

create or replace function public.generate_route_visits(p_date date, p_route uuid default null)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_today date := public.ist_today();
  v_office boolean := public.has_role('super_admin', 'manager', 'billing');
  v_n integer := 0; v_add integer;
  rt record; v_plan uuid; v_sm uuid;
begin
  if not public.is_active_user() then raise exception 'Not signed in' using errcode = '42501'; end if;
  if p_date < v_today - 1 or p_date > v_today + 31 then
    raise exception 'Visits are planned from today up to 31 days ahead' using errcode = 'P0001';
  end if;
  perform public.sync_route_salesmen();

  -- yesterday's untouched visits become "missed (not visited)"
  if p_date >= v_today then
    with m as (
      update public.visits set status = 'missed', missed_reason = 'Not visited'
       where planned_date < v_today and planned_date >= v_today - 31 and status in ('planned', 'in_progress') and checkin_at is null
         and (v_office or salesman_id = auth.uid())
      returning id)
    insert into public.visit_events (visit_id, action, happened_at, performed_by, result)
    select id, 'auto_missed', now(), null, '{"reason":"Not visited"}' from m;
  end if;

  for rt in
    select r.id, r.visit_days, r.visit_frequency, r.fortnight_anchor, a.salesman_id
      from public.routes r
      join public.route_assignments a on a.route_id = r.id and a.status = 'active'
                                     and a.start_date <= p_date and (a.end_date is null or a.end_date >= p_date)
     where r.is_active and r.archived_at is null
       and (p_route is null or r.id = p_route)
       and (v_office or a.salesman_id = auth.uid())
       and extract(isodow from p_date)::smallint = any (r.visit_days)
       and r.visit_frequency <> 'on_demand'
  loop
    -- a skipped day (cancelled plan) or a manual plan for this day is respected
    if exists (select 1 from public.route_plans where route_id = rt.id and plan_date = p_date and status = 'cancelled') then continue; end if;
    select id, salesman_id into v_plan, v_sm from public.route_plans where route_id = rt.id and plan_date = p_date and status = 'planned';
    if v_plan is null then
      if not exists (select 1 from public.route_outlets ro where ro.route_id = rt.id and ro.is_active
                      and public.outlet_due(rt.visit_days, rt.visit_frequency, rt.fortnight_anchor, ro.visit_frequency, ro.visit_days, p_date)) then
        continue;
      end if;
      insert into public.route_plans (route_id, salesman_id, plan_date, source, created_by)
      values (rt.id, rt.salesman_id, p_date, 'schedule', null)
      on conflict do nothing
      returning id, salesman_id into v_plan, v_sm;
      if v_plan is null then
        select id, salesman_id into v_plan, v_sm from public.route_plans where route_id = rt.id and plan_date = p_date and status = 'planned';
      end if;
    end if;
    with ins as (
      insert into public.visits (route_plan_id, route_id, retailer_id, salesman_id, planned_date, planned_sequence, source)
      select v_plan, rt.id, ro.retailer_id, v_sm, p_date, r.route_sequence, 'schedule'
        from public.route_outlets ro join public.retailers r on r.id = ro.retailer_id
       where ro.route_id = rt.id and ro.is_active and r.status in ('active', 'on_hold')
         and public.outlet_due(rt.visit_days, rt.visit_frequency, rt.fortnight_anchor, ro.visit_frequency, ro.visit_days, p_date)
         and not exists (select 1 from public.visits v where v.retailer_id = ro.retailer_id and v.planned_date = p_date
                          and v.status not in ('rescheduled', 'cancelled'))
      on conflict do nothing
      returning 1)
    select count(*) into v_add from ins;
    v_n := v_n + v_add;
  end loop;
  return v_n;
end $$;
revoke all on function public.generate_route_visits(date, uuid) from public, anon;
grant execute on function public.generate_route_visits(date, uuid) to authenticated;

-- One-time / extra visit day for a route (all its outlets), by any salesman, e.g. a cover.
create or replace function public.plan_route(p_route_id uuid, p_salesman_id uuid, p_date date, p_notes text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_plan uuid;
begin
  perform public.require_route_admin();
  if not exists (select 1 from public.profiles where id = p_salesman_id and role = 'salesman' and is_active) then
    raise exception 'Choose an active salesman' using errcode = 'P0001';
  end if;
  if p_date < public.ist_today() then raise exception 'Choose today or a later date' using errcode = 'P0001'; end if;
  select id into v_plan from public.route_plans where route_id = p_route_id and plan_date = p_date and status = 'planned';
  if v_plan is null then
    delete from public.route_plans rp where route_id = p_route_id and plan_date = p_date and status = 'cancelled'
      and not exists (select 1 from public.visits v where v.route_plan_id = rp.id);
    insert into public.route_plans (route_id, salesman_id, plan_date, notes, source, created_by)
    values (p_route_id, p_salesman_id, p_date, nullif(trim(p_notes), ''), 'manual', auth.uid())
    returning id into v_plan;
  else
    update public.route_plans set salesman_id = p_salesman_id, notes = coalesce(nullif(trim(p_notes), ''), notes), source = 'manual' where id = v_plan;
    update public.visits set salesman_id = p_salesman_id
     where route_plan_id = v_plan and status = 'planned' and checkin_at is null;
  end if;
  insert into public.visits (route_plan_id, route_id, retailer_id, salesman_id, planned_date, planned_sequence, source)
  select v_plan, p_route_id, r.id, p_salesman_id, p_date, r.route_sequence, 'manual'
    from public.route_outlets ro join public.retailers r on r.id = ro.retailer_id
   where ro.route_id = p_route_id and ro.is_active and r.status in ('active', 'on_hold')
     and not exists (select 1 from public.visits v where v.retailer_id = r.id and v.planned_date = p_date and v.status not in ('rescheduled', 'cancelled'))
  on conflict do nothing;
  perform public.route_log(p_route_id, 'extra_day', jsonb_build_object('date', p_date, 'salesman', (select full_name from public.profiles where id = p_salesman_id)));
  return v_plan;
end $$;

-- What the schedule will produce for the coming days (read-only preview for the office).
-- status: scheduled | extra (manual day) | skipped | paused | no_salesman | off (route does not run)
create or replace function public.route_schedule(p_from date, p_days integer, p_route uuid default null)
returns table (plan_date date, route_id uuid, outlets integer, status text, salesman_id uuid, reason text)
language sql stable security invoker set search_path = public as $$
  select d::date, r.id,
         (select count(*)::int from public.route_outlets ro join public.retailers x on x.id = ro.retailer_id
           where ro.route_id = r.id and ro.is_active and x.status in ('active', 'on_hold')
             and (mp.id is not null
                  or public.outlet_due(r.visit_days, r.visit_frequency, r.fortnight_anchor, ro.visit_frequency, ro.visit_days, d::date))),
         case when cp.id is not null then 'skipped'
              when mp.id is not null then 'extra'
              when not (extract(isodow from d)::smallint = any (r.visit_days)) or r.visit_frequency = 'on_demand'
                   or not exists (select 1 from public.route_outlets ro where ro.route_id = r.id and ro.is_active
                                   and public.outlet_due(r.visit_days, r.visit_frequency, r.fortnight_anchor, ro.visit_frequency, ro.visit_days, d::date))
                then 'off'
              when a.id is null then 'no_salesman'
              when a.status = 'paused' then 'paused'
              else 'scheduled' end,
         coalesce(mp.salesman_id, a.salesman_id),
         cp.cancel_reason
    from generate_series(p_from, p_from + greatest(least(p_days, 62), 1) - 1, interval '1 day') d
    cross join public.routes r
    left join lateral (select * from public.route_assignments ra where ra.route_id = r.id and ra.start_date <= d::date
                        and (ra.end_date is null or ra.end_date >= d::date) order by ra.start_date desc limit 1) a on true
    left join lateral (select * from public.route_plans rp where rp.route_id = r.id and rp.plan_date = d::date and rp.status = 'cancelled' limit 1) cp on true
    left join lateral (select * from public.route_plans rp where rp.route_id = r.id and rp.plan_date = d::date and rp.status = 'planned' and rp.source = 'manual' limit 1) mp on true
   where r.archived_at is null and r.is_active and (p_route is null or r.id = p_route)
   order by 1, r.sort_order, r.name
$$;
revoke all on function public.route_schedule(date, integer, uuid) from public, anon;
grant execute on function public.route_schedule(date, integer, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 10. Field actions: check-in, check-out, missed, reschedule (offline-safe)
-- -----------------------------------------------------------------------------
-- Finds (or for a check-in, creates) the salesman's visit for an outlet on a day.
create or replace function public.visit_for(p_visit uuid, p_retailer uuid, p_at timestamptz, p_create boolean)
returns public.visits language plpgsql security definer set search_path = public as $$
declare v public.visits%rowtype; v_day date := (p_at at time zone 'Asia/Kolkata')::date; v_route uuid;
begin
  if p_visit is not null then
    select * into v from public.visits where id = p_visit for update;
  end if;
  if v.id is null and p_retailer is not null then
    select * into v from public.visits where retailer_id = p_retailer and salesman_id = auth.uid() and planned_date = v_day
       and status not in ('rescheduled', 'cancelled') for update;
  end if;
  if v.id is null then
    if not p_create then raise exception 'Visit not found' using errcode = 'P0001'; end if;
    if not public.can_see_retailer(p_retailer) then raise exception 'This outlet is not yours' using errcode = '42501'; end if;
    select route_id into v_route from public.retailers where id = p_retailer;
    insert into public.visits (retailer_id, salesman_id, planned_date, route_id, source)
    values (p_retailer, auth.uid(), v_day, v_route, 'unplanned')
    on conflict do nothing
    returning * into v;
    if v.id is null then
      select * into v from public.visits where retailer_id = p_retailer and salesman_id = auth.uid() and planned_date = v_day
         and status not in ('rescheduled', 'cancelled') for update;
    end if;
  end if;
  if v.salesman_id <> auth.uid() and not public.has_role('super_admin', 'manager') then
    raise exception 'This visit belongs to another salesman' using errcode = '42501';
  end if;
  return v;
end $$;
revoke all on function public.visit_for(uuid, uuid, timestamptz, boolean) from public, anon, authenticated;

-- The phone's clock is used for offline actions, within limits.
create or replace function public.field_time(p_at timestamptz)
returns timestamptz language plpgsql stable set search_path = public as $$
begin
  if p_at is null or p_at > now() + interval '5 minutes' then return now(); end if;
  if p_at < now() - interval '7 days' then raise exception 'This update is more than 7 days old; ask the office to record it' using errcode = 'P0001'; end if;
  return p_at;
end $$;

create or replace function public.visit_check_in(p_visit uuid, p_retailer uuid, p_lat numeric, p_lng numeric, p_accuracy numeric,
                                                 p_at timestamptz, p_client_uuid uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v public.visits%rowtype; r public.retailers%rowtype; s public.company_settings%rowtype;
  v_at timestamptz; v_dist numeric; v_geo text; v_res jsonb; v_prev jsonb;
begin
  if not public.is_active_user() then raise exception 'Not signed in' using errcode = '42501'; end if;
  if p_client_uuid is not null then
    select result into v_prev from public.visit_events where client_uuid = p_client_uuid;
    if found then return v_prev || '{"duplicate": true}'; end if;
  end if;
  v_at := public.field_time(p_at);
  v := public.visit_for(p_visit, p_retailer, v_at, true);
  if v.status in ('completed', 'missed', 'rescheduled', 'cancelled') then
    raise exception 'This visit is already %', replace(v.status, '_', ' ') using errcode = 'P0001';
  end if;
  select * into r from public.retailers where id = v.retailer_id;
  select * into s from public.company_settings where id = 1;
  if p_lat is null or p_lng is null then v_geo := 'no_gps';
  elsif p_accuracy is null or p_accuracy > s.gps_min_accuracy_m then v_geo := 'low_accuracy';
  elsif r.latitude is null or r.longitude is null then v_geo := 'no_outlet_location';
  else
    v_dist := public.distance_m(p_lat, p_lng, r.latitude, r.longitude);
    v_geo := case when v_dist <= s.geofence_radius_m then 'verified' else 'outside' end;
  end if;
  if v_dist is null and p_lat is not null and r.latitude is not null then
    v_dist := public.distance_m(p_lat, p_lng, r.latitude, r.longitude);
  end if;
  update public.visits set status = 'in_progress', checkin_at = coalesce(checkin_at, v_at),
         latitude = p_lat, longitude = p_lng, gps_accuracy_m = p_accuracy, distance_m = v_dist, geo_status = v_geo
   where id = v.id;
  v_res := jsonb_build_object('visit_id', v.id, 'status', 'in_progress', 'geo_status', v_geo, 'distance_m', v_dist,
                              'radius_m', s.geofence_radius_m, 'checkin_at', coalesce(v.checkin_at, v_at));
  insert into public.visit_events (visit_id, action, client_uuid, happened_at, latitude, longitude, accuracy_m, result)
  values (v.id, 'check_in', p_client_uuid, v_at, p_lat, p_lng, p_accuracy, v_res);
  if p_lat is not null and p_lng is not null then
    insert into public.salesman_locations (salesman_id, recorded_at, latitude, longitude, accuracy_m, source, visit_id)
    values (auth.uid(), v_at, p_lat, p_lng, p_accuracy, 'check_in', v.id);
  end if;
  return v_res;
end $$;

create or replace function public.visit_check_out(p_visit uuid, p_retailer uuid, p_lat numeric, p_lng numeric, p_accuracy numeric,
                                                  p_remarks text, p_photo_path text, p_at timestamptz, p_client_uuid uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v public.visits%rowtype; v_at timestamptz; v_res jsonb; v_prev jsonb;
begin
  if not public.is_active_user() then raise exception 'Not signed in' using errcode = '42501'; end if;
  if p_client_uuid is not null then
    select result into v_prev from public.visit_events where client_uuid = p_client_uuid;
    if found then return v_prev || '{"duplicate": true}'; end if;
  end if;
  v_at := public.field_time(p_at);
  v := public.visit_for(p_visit, p_retailer, v_at, false);
  if v.status = 'completed' then raise exception 'This visit is already completed' using errcode = 'P0001'; end if;
  if v.checkin_at is null or v.status <> 'in_progress' then
    raise exception 'Check in at the outlet first' using errcode = 'P0001', hint = 'CHECK_IN_FIRST';
  end if;
  if p_photo_path is not null and split_part(p_photo_path, '/', 1) <> auth.uid()::text then
    raise exception 'Upload the photo again' using errcode = '42501';
  end if;
  update public.visits set status = 'completed', checkout_at = greatest(v_at, checkin_at),
         checkout_latitude = p_lat, checkout_longitude = p_lng, checkout_accuracy_m = p_accuracy,
         remarks = coalesce(nullif(trim(p_remarks), ''), remarks), photo_path = coalesce(p_photo_path, photo_path)
   where id = v.id;
  v_res := jsonb_build_object('visit_id', v.id, 'status', 'completed', 'checkout_at', greatest(v_at, v.checkin_at));
  insert into public.visit_events (visit_id, action, client_uuid, happened_at, latitude, longitude, accuracy_m, result)
  values (v.id, 'check_out', p_client_uuid, v_at, p_lat, p_lng, p_accuracy, v_res);
  if p_lat is not null and p_lng is not null then
    insert into public.salesman_locations (salesman_id, recorded_at, latitude, longitude, accuracy_m, source, visit_id)
    values (auth.uid(), v_at, p_lat, p_lng, p_accuracy, 'check_out', v.id);
  end if;
  return v_res;
end $$;

create or replace function public.visit_mark_missed(p_visit uuid, p_retailer uuid, p_reason text, p_remarks text, p_at timestamptz, p_client_uuid uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v public.visits%rowtype; v_at timestamptz; v_res jsonb; v_prev jsonb;
begin
  if not public.is_active_user() then raise exception 'Not signed in' using errcode = '42501'; end if;
  if p_client_uuid is not null then
    select result into v_prev from public.visit_events where client_uuid = p_client_uuid;
    if found then return v_prev || '{"duplicate": true}'; end if;
  end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Choose the reason' using errcode = 'P0001'; end if;
  v_at := public.field_time(p_at);
  v := public.visit_for(p_visit, p_retailer, v_at, false);
  if v.status not in ('planned', 'in_progress') then raise exception 'This visit is already %', replace(v.status, '_', ' ') using errcode = 'P0001'; end if;
  update public.visits set status = 'missed', missed_reason = trim(p_reason), remarks = coalesce(nullif(trim(p_remarks), ''), remarks) where id = v.id;
  v_res := jsonb_build_object('visit_id', v.id, 'status', 'missed');
  insert into public.visit_events (visit_id, action, client_uuid, happened_at, result)
  values (v.id, 'missed', p_client_uuid, v_at, v_res || jsonb_build_object('reason', trim(p_reason)));
  return v_res;
end $$;

create or replace function public.visit_reschedule(p_visit uuid, p_retailer uuid, p_new_date date, p_reason text, p_at timestamptz, p_client_uuid uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v public.visits%rowtype; v_at timestamptz; v_new uuid; v_res jsonb; v_prev jsonb;
begin
  if not public.is_active_user() then raise exception 'Not signed in' using errcode = '42501'; end if;
  if p_client_uuid is not null then
    select result into v_prev from public.visit_events where client_uuid = p_client_uuid;
    if found then return v_prev || '{"duplicate": true}'; end if;
  end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Enter the reason' using errcode = 'P0001'; end if;
  v_at := public.field_time(p_at);
  v := public.visit_for(p_visit, p_retailer, v_at, false);
  if v.status not in ('planned', 'in_progress') then raise exception 'This visit is already %', replace(v.status, '_', ' ') using errcode = 'P0001'; end if;
  if p_new_date is null or p_new_date <= v.planned_date or p_new_date > v.planned_date + 31 then
    raise exception 'Choose a later date within a month' using errcode = 'P0001';
  end if;
  update public.visits set status = 'rescheduled', rescheduled_to = p_new_date, remarks = trim(p_reason) where id = v.id;
  select id into v_new from public.visits where retailer_id = v.retailer_id and salesman_id = v.salesman_id and planned_date = p_new_date
     and status not in ('rescheduled', 'cancelled');
  if v_new is null then
    insert into public.visits (retailer_id, salesman_id, planned_date, route_id, planned_sequence, source, rescheduled_from)
    values (v.retailer_id, v.salesman_id, p_new_date, v.route_id, v.planned_sequence, 'rescheduled', v.id)
    returning id into v_new;
  end if;
  v_res := jsonb_build_object('visit_id', v.id, 'status', 'rescheduled', 'new_visit_id', v_new, 'new_date', p_new_date);
  insert into public.visit_events (visit_id, action, client_uuid, happened_at, result)
  values (v.id, 'rescheduled', p_client_uuid, v_at, v_res || jsonb_build_object('reason', trim(p_reason)));
  return v_res;
end $$;

-- Save an outlet's GPS location. Office: any time. Salesman: only for his outlet and only if
-- no location is saved yet (changing it later needs the office), with a usable GPS fix.
create or replace function public.set_retailer_location(p_retailer uuid, p_lat numeric, p_lng numeric, p_accuracy numeric)
returns void language plpgsql security definer set search_path = public as $$
declare r public.retailers%rowtype; v_min integer;
begin
  select * into r from public.retailers where id = p_retailer for update;
  if not found then raise exception 'Retailer not found' using errcode = 'P0001'; end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'No usable location' using errcode = 'P0001';
  end if;
  if not public.has_role('super_admin', 'manager') then
    if not public.has_role('salesman') or not public.can_see_retailer(p_retailer) then
      raise exception 'You cannot change this outlet''s location' using errcode = '42501';
    end if;
    if r.latitude is not null then
      raise exception 'This outlet already has a location; ask the office to change it' using errcode = '42501';
    end if;
    select gps_min_accuracy_m into v_min from public.company_settings where id = 1;
    if p_accuracy is null or p_accuracy > v_min then
      raise exception 'GPS is not accurate enough (±% m). Step outside and try again.', round(coalesce(p_accuracy, 9999)) using errcode = 'P0001';
    end if;
  end if;
  update public.retailers set latitude = round(p_lat, 6), longitude = round(p_lng, 6) where id = p_retailer;
end $$;

create or replace function public.set_location_sharing(p_on boolean)
returns void language sql security definer set search_path = public as $$
  update public.profiles set share_location = coalesce(p_on, false) where id = auth.uid()
$$;

-- Live location ping from the app; stored only while the salesman has sharing switched on.
create or replace function public.record_location(p_lat numeric, p_lng numeric, p_accuracy numeric, p_at timestamptz)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_active and share_location and role = 'salesman') then
    return false;
  end if;
  if p_lat is null or p_lng is null then return false; end if;
  insert into public.salesman_locations (salesman_id, recorded_at, latitude, longitude, accuracy_m, source)
  values (auth.uid(), least(coalesce(p_at, now()), now()), p_lat, p_lng, p_accuracy, 'ping');
  return true;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'route_save(uuid, text, text, uuid, text, text, smallint[], date, integer, boolean)',
    'route_archive(uuid, boolean, text)',
    'route_set_locations(uuid, uuid[], uuid, boolean)',
    'route_outlet_remove(uuid, uuid, text)',
    'route_outlets_add(uuid, uuid, uuid[], boolean)',
    'route_outlets_reorder(uuid, uuid, uuid[])',
    'route_outlet_update(uuid, uuid, uuid, text, smallint[])',
    'route_assign(uuid, uuid, date, text)',
    'route_unassign(uuid, date)',
    'route_assignment_pause(uuid, boolean)',
    'route_skip_day(uuid, date, text, boolean)',
    'plan_route(uuid, uuid, date, text)',
    'visit_check_in(uuid, uuid, numeric, numeric, numeric, timestamptz, uuid)',
    'visit_check_out(uuid, uuid, numeric, numeric, numeric, text, text, timestamptz, uuid)',
    'visit_mark_missed(uuid, uuid, text, text, timestamptz, uuid)',
    'visit_reschedule(uuid, uuid, date, text, timestamptz, uuid)',
    'set_retailer_location(uuid, numeric, numeric, numeric)',
    'set_location_sharing(boolean)',
    'record_location(numeric, numeric, numeric, timestamptz)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
revoke all on function public.route_drop_future_visits(uuid, uuid, date) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 11. Visit photos
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('visit-photos', 'visit-photos', false) on conflict (id) do nothing;
create policy "visit photos read" on storage.objects for select to authenticated
  using (bucket_id = 'visit-photos' and (public.has_role('super_admin', 'manager') or (storage.foldername(name))[1] = auth.uid()::text));
create policy "visit photos write own" on storage.objects for insert to authenticated
  with check (bucket_id = 'visit-photos' and public.is_active_user() and (storage.foldername(name))[1] = auth.uid()::text);
