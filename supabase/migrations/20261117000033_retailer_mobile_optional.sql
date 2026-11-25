-- A retailer carried over from older books may have no phone number on record.
-- Apex's own migration from Odoo brought 46 shops across with 2 numbers between
-- them; the rest are being collected shop by shop.
--
-- The number stays required in the app's own forms, where a person is creating a
-- retailer and can be asked for it. It is only the table that now tolerates a
-- blank, so legacy rows load and are filled in later.
--
-- The unique index on (tenant_id, mobile) is unaffected: Postgres does not treat
-- two nulls as equal, so any number of rows may sit without one.
alter table public.retailers alter column mobile drop not null;

alter table public.retailers drop constraint retailers_mobile_check;
alter table public.retailers add constraint retailers_mobile_check
  check (mobile is null or mobile ~ '^[6-9][0-9]{9}$');
