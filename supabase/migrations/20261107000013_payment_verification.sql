-- =============================================================================
-- APEX DMS — Verification of payments collected by salesmen
--
-- A salesman records the money he collected (cash / UPI / cheque / bank) in the
-- app. The office checks that he handed it over (cash counted, UPI seen in the
-- bank, cheque received) and VERIFIES it — or REJECTS it with a reason, which
-- cancels the payment and makes those bills due again.
--
-- * Payments recorded by office staff (Super Admin, Manager, Billing) are
--   verified automatically.
-- * Until verified, the payment still reduces the shop's balance (the shop has
--   paid), but it shows as "with salesman" and does NOT count for incentives.
-- * Cheques: verified = cheque handed over; it counts for incentives only once
--   it is also cleared (status 'received').
-- =============================================================================

alter table public.payments
  add column if not exists verified_at timestamptz,
  add column if not exists verified_by uuid references public.profiles (id);

-- Everything recorded before this feature counts as verified.
update public.payments set verified_at = coalesce(verified_at, created_at) where verified_at is null;

create index if not exists payments_unverified_idx on public.payments (collected_by) where verified_at is null;

create or replace function public.payment_auto_verify()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.has_role('super_admin', 'manager', 'billing') then
    new.verified_at := now();
    new.verified_by := auth.uid();
  else
    new.verified_at := null;
    new.verified_by := null;
  end if;
  return new;
end $$;
revoke all on function public.payment_auto_verify() from public, anon, authenticated;
create trigger payments_auto_verify before insert on public.payments
  for each row execute function public.payment_auto_verify();

-- Verify payments handed over by a salesman (office staff).
create or replace function public.verify_payments(p_ids uuid[])
returns integer
language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  if not public.has_role('super_admin', 'manager', 'billing') then
    raise exception 'Only office staff can verify collections' using errcode = '42501';
  end if;
  update public.payments
     set verified_at = now(), verified_by = auth.uid()
   where id = any (p_ids) and verified_at is null and status in ('received', 'cheque_pending');
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- Reject a collection that was not handed over / entered wrongly: the payment
-- is cancelled and the bills it paid become due again.
create or replace function public.reject_payment(p_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role('super_admin', 'manager', 'billing') then
    raise exception 'Only office staff can reject collections' using errcode = '42501';
  end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Enter the reason' using errcode = 'P0001'; end if;
  update public.payments
     set status = 'cancelled',
         notes = concat_ws(' | ', notes, 'Rejected at verification: ' || trim(p_reason))
   where id = p_id and verified_at is null and status in ('received', 'cheque_pending');
  if not found then raise exception 'Payment not found or already verified' using errcode = 'P0001'; end if;
  delete from public.payment_allocations where payment_id = p_id;
end $$;

revoke all on function public.verify_payments(uuid[]) from public, anon;
revoke all on function public.reject_payment(uuid, text) from public, anon;
grant execute on function public.verify_payments(uuid[]), public.reject_payment(uuid, text) to authenticated;

-- Incentive: only VERIFIED payments count as collected / paid on time.
create or replace function public.incentive_shops(p_salesman uuid, p_month date)
returns table (
  retailer_id uuid, code text, shop_name text, city text, mobile text,
  invoices integer, billed_taxable numeric, billed_total numeric,
  due_amount numeric, due_collected numeric, unpaid numeric, next_deadline date, status text
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
                      where a.invoice_id = i.id and p.status = 'received' and p.verified_at is not null and p.payment_date <= i.invoice_date + v_s.smart_pay_days), 0) as paid_on_time
      from public.invoices i
     where i.status = 'issued' and i.invoice_date between v_from and v_to
       and i.retailer_id in (select id from shops)
  ), due as (
    -- every bill due on or before month end, at what was still owed on the 1st
    select d.retailer_id, sum(d.owed) as owed, sum(least(d.owed, d.paid)) as collected
      from (
        select i.retailer_id,
               greatest(i.grand_total
                 - coalesce((select sum(c.grand_total) from public.credit_notes c where c.invoice_id = i.id and c.status = 'issued' and c.note_date <= v_to), 0)
                 - coalesce((select sum(a.amount) from public.payment_allocations a join public.payments p on p.id = a.payment_id
                              where a.invoice_id = i.id and p.status = 'received' and p.payment_date < v_from), 0), 0) as owed,
               coalesce((select sum(a.amount) from public.payment_allocations a join public.payments p on p.id = a.payment_id
                          where a.invoice_id = i.id and p.status = 'received' and p.verified_at is not null and p.payment_date between v_from and v_to), 0) as paid
          from public.invoices i
         where i.status = 'issued' and i.due_date <= v_to and i.invoice_date <= v_to
           and i.retailer_id in (select id from shops)
      ) d
     where d.owed > 0
     group by d.retailer_id
  ), agg as (
    select inv.retailer_id,
           count(*)::int as n,
           sum(inv.taxable_total - inv.cn_taxable) as taxable,
           sum(inv.grand_total - inv.cn_total) as total,
           sum(greatest(inv.grand_total - inv.cn_total - inv.paid_on_time, 0)) as unpaid_on_time,
           bool_or(inv.grand_total - inv.cn_total - inv.paid_on_time > 0.99 and inv.invoice_date + v_s.smart_pay_days < v_today) as late,
           min(inv.invoice_date + v_s.smart_pay_days) filter (where inv.grand_total - inv.cn_total - inv.paid_on_time > 0.99) as deadline
      from inv group by inv.retailer_id
  )
  select s.id, s.code, s.shop_name, s.billing_city, s.mobile,
         coalesce(a.n, 0), round(coalesce(a.taxable, 0), 2), round(coalesce(a.total, 0), 2),
         round(coalesce(du.owed, 0), 2), round(coalesce(du.collected, 0), 2),
         round(coalesce(a.unpaid_on_time, 0), 2), a.deadline,
         case
           when a.retailer_id is null or coalesce(a.taxable, 0) <= 0 then 'not_billed'
           when a.taxable < v_s.smart_min_purchase then 'below_min'
           when a.late then 'missed'
           when a.unpaid_on_time > 0.99 then 'on_track'
           else 'smart'
         end
    from shops s left join agg a on a.retailer_id = s.id left join due du on du.retailer_id = s.id
   order by s.shop_name;
end $$;
