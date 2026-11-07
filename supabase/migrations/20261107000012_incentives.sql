-- =============================================================================
-- APEX DMS — Salesman monthly incentive
--
-- Four criteria, each paid in full or not at all (amounts editable by the
-- Super Administrator; a change applies from a chosen month):
--   1. Sales:      net sales before GST in the month ≥ target (₹3,00,000)
--   2. Coverage:   number of his shops billed in the month ≥ 60
--   3. Smart:      shops that bought ≥ ₹5,000 (before GST) in the month AND paid
--                  every one of that month's bills within 21 days ≥ 30
--   4. Recovery:   money collected in the month against THAT month's bills,
--                  ÷ that month's billing (incl. GST) ≥ 70%.
--                  Old dues collected do not count.
--
-- "His shops" = shops assigned to him (retailer.salesman_id) or on a route he
-- runs (route.default_salesman_id). Payments count only when received (cheques
-- once cleared). Payments are applied oldest bill first, so money that clears
-- old dues does not count towards this month's recovery.
--
-- During the month and the 21 days after it, figures are PROVISIONAL. After
-- that the manager approves and locks the month (incentive_payouts), which
-- keeps a permanent copy of the figures, then marks it paid.
-- =============================================================================

create table public.incentive_schemes (
  id                     uuid primary key default gen_random_uuid(),
  effective_from         date not null unique check (extract(day from effective_from) = 1),
  sales_target           numeric(14,2) not null check (sales_target > 0),
  sales_amount           numeric(10,2) not null check (sales_amount >= 0),
  billed_target          integer not null check (billed_target > 0),
  billed_amount          numeric(10,2) not null check (billed_amount >= 0),
  smart_target           integer not null check (smart_target > 0),
  smart_min_purchase     numeric(14,2) not null check (smart_min_purchase > 0),
  smart_pay_days         integer not null check (smart_pay_days between 1 and 90),
  smart_amount           numeric(10,2) not null check (smart_amount >= 0),
  recovery_pct           numeric(5,2) not null check (recovery_pct > 0 and recovery_pct <= 100),
  recovery_amount        numeric(10,2) not null check (recovery_amount >= 0),
  notes                  text,
  created_by             uuid references public.profiles (id) default auth.uid(),
  created_at             timestamptz not null default now()
);

insert into public.incentive_schemes
  (effective_from, sales_target, sales_amount, billed_target, billed_amount, smart_target, smart_min_purchase, smart_pay_days, smart_amount, recovery_pct, recovery_amount, notes)
values ('2026-04-01', 300000, 2000, 60, 2000, 30, 5000, 21, 2000, 70, 2000, 'Initial scheme');

create table public.incentive_payouts (
  id               uuid primary key default gen_random_uuid(),
  salesman_id      uuid not null references public.profiles (id),
  month            date not null check (extract(day from month) = 1),
  scheme_id        uuid not null references public.incentive_schemes (id),
  net_sales        numeric(14,2) not null,
  billed_shops     integer not null,
  smart_shops      integer not null,
  month_billing    numeric(14,2) not null,
  month_collected  numeric(14,2) not null,
  recovery_pct     numeric(6,2) not null,
  sales_earned     numeric(10,2) not null,
  billed_earned    numeric(10,2) not null,
  smart_earned     numeric(10,2) not null,
  recovery_earned  numeric(10,2) not null,
  total            numeric(10,2) not null,
  detail           jsonb not null,            -- full calculation at approval time
  status           text not null default 'approved' check (status in ('approved', 'paid')),
  approved_by      uuid references public.profiles (id) default auth.uid(),
  approved_at      timestamptz not null default now(),
  paid_at          timestamptz,
  paid_method      public.payment_method,
  paid_reference   text,
  paid_by          uuid references public.profiles (id),
  unique (salesman_id, month)
);
create index incentive_payouts_month_idx on public.incentive_payouts (month);

alter table public.incentive_schemes enable row level security;
alter table public.incentive_payouts enable row level security;
revoke all on public.incentive_schemes, public.incentive_payouts from anon, authenticated;
grant select on public.incentive_schemes, public.incentive_payouts to authenticated;
grant insert, delete on public.incentive_schemes to authenticated;

create policy incentive_schemes_select on public.incentive_schemes for select to authenticated
  using ((select public.is_active_user()));
create policy incentive_schemes_insert on public.incentive_schemes for insert to authenticated
  with check ((select public.has_role('super_admin')));
-- A scheme can be replaced (same start month) only while no approved payout uses it (FK blocks that).
create policy incentive_schemes_delete on public.incentive_schemes for delete to authenticated
  using ((select public.has_role('super_admin')));
create policy incentive_payouts_select on public.incentive_payouts for select to authenticated
  using ((select public.has_role('super_admin', 'manager')) or salesman_id = (select auth.uid()));

create trigger incentive_schemes_audit after insert or update or delete on public.incentive_schemes
  for each row execute function public.audit_row();
create trigger incentive_payouts_audit after insert or update or delete on public.incentive_payouts
  for each row execute function public.audit_row();

-- Scheme in force for a month.
create or replace function public.incentive_scheme_for(p_month date)
returns public.incentive_schemes
language sql stable security definer set search_path = public as $$
  select * from public.incentive_schemes
   where effective_from <= date_trunc('month', p_month)::date
   order by effective_from desc limit 1
$$;

-- -----------------------------------------------------------------------------
-- Per-shop picture for one salesman and month. Status per shop:
--   not_billed · below_min (billed < minimum) · smart · on_track (bills not yet
--   paid, still within the days allowed) · missed (a bill paid late / unpaid after
--   the days allowed)
-- -----------------------------------------------------------------------------
create or replace function public.incentive_shops(p_salesman uuid, p_month date)
returns table (
  retailer_id uuid, code text, shop_name text, city text, mobile text,
  invoices integer, billed_taxable numeric, billed_total numeric,
  collected_in_month numeric, unpaid numeric, next_deadline date, status text
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_from date := date_trunc('month', p_month)::date;
  v_to   date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
  v_s    public.incentive_schemes;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if not (public.has_role('super_admin', 'manager') or (public.has_role('salesman') and p_salesman = auth.uid())) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  v_s := public.incentive_scheme_for(v_from);

  return query
  with shops as (
    select r.id, r.code, r.shop_name, r.billing_city, r.mobile
      from public.retailers r
      left join public.routes rt on rt.id = r.route_id
     where r.salesman_id = p_salesman or rt.default_salesman_id = p_salesman
  ), inv as (
    select i.id, i.retailer_id, i.invoice_date, i.grand_total, i.taxable_total,
           coalesce((select sum(c.taxable_total) from public.credit_notes c where c.invoice_id = i.id and c.status = 'issued'), 0) as cn_taxable,
           coalesce((select sum(c.grand_total) from public.credit_notes c where c.invoice_id = i.id and c.status = 'issued'), 0) as cn_total,
           -- paid on time = received payments dated within the allowed days
           coalesce((select sum(a.amount) from public.payment_allocations a join public.payments p on p.id = a.payment_id
                      where a.invoice_id = i.id and p.status = 'received' and p.payment_date <= i.invoice_date + v_s.smart_pay_days), 0) as paid_on_time,
           coalesce((select sum(a.amount) from public.payment_allocations a join public.payments p on p.id = a.payment_id
                      where a.invoice_id = i.id and p.status = 'received' and p.payment_date between v_from and v_to), 0) as paid_in_month
      from public.invoices i
     where i.status = 'issued' and i.invoice_date between v_from and v_to
       and i.retailer_id in (select id from shops)
  ), agg as (
    select inv.retailer_id,
           count(*)::int as n,
           sum(inv.taxable_total - inv.cn_taxable) as taxable,
           sum(inv.grand_total - inv.cn_total) as total,
           sum(least(inv.paid_in_month, greatest(inv.grand_total - inv.cn_total, 0))) as collected,  -- a return after payment cannot inflate it
           sum(greatest(inv.grand_total - inv.cn_total - inv.paid_on_time, 0)) as unpaid_on_time,
           bool_or(inv.grand_total - inv.cn_total - inv.paid_on_time > 0.99 and inv.invoice_date + v_s.smart_pay_days < v_today) as late,
           min(inv.invoice_date + v_s.smart_pay_days) filter (where inv.grand_total - inv.cn_total - inv.paid_on_time > 0.99) as deadline
      from inv group by inv.retailer_id
  )
  select s.id, s.code, s.shop_name, s.billing_city, s.mobile,
         coalesce(a.n, 0), round(coalesce(a.taxable, 0), 2), round(coalesce(a.total, 0), 2),
         round(coalesce(a.collected, 0), 2), round(coalesce(a.unpaid_on_time, 0), 2), a.deadline,
         case
           when a.retailer_id is null or coalesce(a.taxable, 0) <= 0 then 'not_billed'
           when a.taxable < v_s.smart_min_purchase then 'below_min'
           when a.late then 'missed'
           when a.unpaid_on_time > 0.99 then 'on_track'
           else 'smart'
         end
    from shops s left join agg a on a.retailer_id = s.id
   order by s.shop_name;
end $$;

-- -----------------------------------------------------------------------------
-- Summary for one salesman and month (live calculation).
-- -----------------------------------------------------------------------------
create or replace function public.salesman_incentive(p_salesman uuid, p_month date)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_from date := date_trunc('month', p_month)::date;
  v_to   date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
  v_s    public.incentive_schemes;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_sales numeric; v_billed int; v_smart int; v_on_track int; v_bill numeric; v_coll numeric; v_rec numeric;
  v_returns_other numeric;
begin
  if not (public.has_role('super_admin', 'manager') or (public.has_role('salesman') and p_salesman = auth.uid())) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  v_s := public.incentive_scheme_for(v_from);
  if v_s.id is null then return null; end if;

  select coalesce(sum(billed_taxable), 0), count(*) filter (where billed_taxable > 0),
         count(*) filter (where status = 'smart'), count(*) filter (where status = 'on_track'),
         coalesce(sum(billed_total), 0), coalesce(sum(collected_in_month), 0)
    into v_sales, v_billed, v_smart, v_on_track, v_bill, v_coll
    from public.incentive_shops(p_salesman, v_from);

  -- Returns this month against EARLIER months' bills also reduce this month's sales.
  select coalesce(sum(c.taxable_total), 0) into v_returns_other
    from public.credit_notes c
    join public.invoices i on i.id = c.invoice_id
    join public.retailers r on r.id = c.retailer_id
    left join public.routes rt on rt.id = r.route_id
   where c.status = 'issued' and c.note_date between v_from and v_to and i.invoice_date < v_from
     and (r.salesman_id = p_salesman or rt.default_salesman_id = p_salesman);
  v_sales := v_sales - v_returns_other;
  v_rec := case when v_bill > 0 then round(v_coll / v_bill * 100, 2) else 0 end;

  return jsonb_build_object(
    'month', v_from,
    'final_on', v_to + v_s.smart_pay_days + 1,
    'is_final', v_today > v_to + v_s.smart_pay_days,
    'scheme', to_jsonb(v_s),
    'net_sales', round(v_sales, 2),
    'returns_earlier_bills', round(v_returns_other, 2),
    'billed_shops', v_billed,
    'smart_shops', v_smart,
    'on_track_shops', v_on_track,
    'month_billing', round(v_bill, 2),
    'month_collected', round(v_coll, 2),
    'recovery_pct', v_rec,
    'sales_earned', case when v_sales >= v_s.sales_target then v_s.sales_amount else 0 end,
    'billed_earned', case when v_billed >= v_s.billed_target then v_s.billed_amount else 0 end,
    'smart_earned', case when v_smart >= v_s.smart_target then v_s.smart_amount else 0 end,
    'recovery_earned', case when v_bill > 0 and v_rec >= v_s.recovery_pct then v_s.recovery_amount else 0 end,
    'max_total', v_s.sales_amount + v_s.billed_amount + v_s.smart_amount + v_s.recovery_amount
  ) || jsonb_build_object('total',
         (case when v_sales >= v_s.sales_target then v_s.sales_amount else 0 end)
       + (case when v_billed >= v_s.billed_target then v_s.billed_amount else 0 end)
       + (case when v_smart >= v_s.smart_target then v_s.smart_amount else 0 end)
       + (case when v_bill > 0 and v_rec >= v_s.recovery_pct then v_s.recovery_amount else 0 end));
end $$;

-- -----------------------------------------------------------------------------
-- Approve & lock a month for every active salesman (manager / super admin).
-- Only after the payment window has closed, unless the Super Admin overrides.
-- -----------------------------------------------------------------------------
create or replace function public.approve_incentives(p_month date, p_override boolean default false)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_from date := date_trunc('month', p_month)::date;
  v_s public.incentive_schemes;
  v_sm record; v_j jsonb; v_n int := 0;
begin
  if not public.has_role('super_admin', 'manager') then
    raise exception 'Only a Manager can approve incentives' using errcode = '42501';
  end if;
  v_s := public.incentive_scheme_for(v_from);
  if v_s.id is null then raise exception 'No incentive scheme for this month' using errcode = 'P0001'; end if;
  if (now() at time zone 'Asia/Kolkata')::date <= (v_from + interval '1 month - 1 day')::date + v_s.smart_pay_days
     and not (p_override and public.has_role('super_admin')) then
    raise exception 'Figures for % are final only after %', to_char(v_from, 'Mon YYYY'),
      to_char((v_from + interval '1 month - 1 day')::date + v_s.smart_pay_days + 1, 'DD Mon YYYY') using errcode = 'P0001';
  end if;
  for v_sm in select id from public.profiles where role = 'salesman' and is_active order by full_name loop
    continue when exists (select 1 from public.incentive_payouts where salesman_id = v_sm.id and month = v_from);
    v_j := public.salesman_incentive(v_sm.id, v_from);
    insert into public.incentive_payouts (salesman_id, month, scheme_id, net_sales, billed_shops, smart_shops, month_billing,
      month_collected, recovery_pct, sales_earned, billed_earned, smart_earned, recovery_earned, total, detail)
    values (v_sm.id, v_from, v_s.id, (v_j->>'net_sales')::numeric, (v_j->>'billed_shops')::int, (v_j->>'smart_shops')::int,
      (v_j->>'month_billing')::numeric, (v_j->>'month_collected')::numeric, (v_j->>'recovery_pct')::numeric,
      (v_j->>'sales_earned')::numeric, (v_j->>'billed_earned')::numeric, (v_j->>'smart_earned')::numeric,
      (v_j->>'recovery_earned')::numeric, (v_j->>'total')::numeric,
      v_j || jsonb_build_object('shops', (select jsonb_agg(to_jsonb(s)) from public.incentive_shops(v_sm.id, v_from) s where s.status <> 'not_billed')));
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

create or replace function public.mark_incentive_paid(p_payout_id uuid, p_method public.payment_method, p_reference text default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role('super_admin', 'manager') then
    raise exception 'Only a Manager can record incentive payments' using errcode = '42501';
  end if;
  if p_method in ('upi', 'bank_transfer', 'cheque') and coalesce(trim(p_reference), '') = '' then
    raise exception 'Enter the payment reference' using errcode = 'P0001';
  end if;
  update public.incentive_payouts
     set status = 'paid', paid_at = now(), paid_method = p_method, paid_reference = nullif(trim(p_reference), ''), paid_by = auth.uid()
   where id = p_payout_id and status = 'approved';
  if not found then raise exception 'Not found or already paid' using errcode = 'P0001'; end if;
end $$;

-- Undo an approval that was not paid yet (e.g. a late correction), Super Admin only.
create or replace function public.reopen_incentive(p_payout_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role('super_admin') then
    raise exception 'Only the Super Administrator can reopen an approved incentive' using errcode = '42501';
  end if;
  delete from public.incentive_payouts where id = p_payout_id and status = 'approved';
  if not found then raise exception 'Not found or already paid' using errcode = 'P0001'; end if;
end $$;

revoke all on function public.incentive_scheme_for(date) from public, anon;
revoke all on function public.incentive_shops(uuid, date) from public, anon;
revoke all on function public.salesman_incentive(uuid, date) from public, anon;
revoke all on function public.approve_incentives(date, boolean) from public, anon;
revoke all on function public.mark_incentive_paid(uuid, public.payment_method, text) from public, anon;
revoke all on function public.reopen_incentive(uuid) from public, anon;
grant execute on function
  public.incentive_scheme_for(date),
  public.incentive_shops(uuid, date),
  public.salesman_incentive(uuid, date),
  public.approve_incentives(date, boolean),
  public.mark_incentive_paid(uuid, public.payment_method, text),
  public.reopen_incentive(uuid)
to authenticated;
