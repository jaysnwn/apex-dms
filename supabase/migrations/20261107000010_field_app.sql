-- =============================================================================
-- APEX DMS — Salesman mobile app support
-- * Outlet GPS location (captured when a salesman adds an outlet) for navigation.
-- =============================================================================
alter table public.retailers
  add column if not exists latitude  numeric(9,6) check (latitude between -90 and 90),
  add column if not exists longitude numeric(9,6) check (longitude between -180 and 180);
