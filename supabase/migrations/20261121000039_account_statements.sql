-- =============================================================================
-- 0039: account statements — retailer, town, route and territory.
--
-- Read-only. No table, view, trigger or existing function changes: the
-- statements read the same invoices, credit notes, payments and allocations
-- that the Outstanding screen reads, with the same rules:
--
--   * an invoice counts while it is 'issued'        (cancelled ones never)
--   * a credit note counts while it is 'issued'
--   * a payment counts once it is recorded as 'received' (cash or UPI;
--     a payment the office rejected is 'cancelled' and never counts)
--
-- Two balances are kept apart, so neither hides the other:
--   bills_due  what is still unpaid on the shop's bills
--   advance    money received that is not applied to any bill yet
-- and closing = opening + invoices − credit notes − collections
--             = (signed bill balances) − advance, to the paisa.
--
-- "As of the end date" means exactly that: an allocation counts on a date only
-- once both its payment and its bill existed (the later of the two dates), so
-- a November statement printed in December shows November's advance and
-- November's overdue bills, and an October bill still unpaid on 30 November
-- is in November's closing balance.
--
-- Hierarchy: territory → route → town → retailer.
--   route of a shop:     its active route_outlets row (retailers.route_id is
--                        kept in step with it by 0018)
--   town of a shop:      retailers.location_id, else the route outlet's town
--   territory of a shop: its route's territory, else its town's territory
--
-- All three functions are SECURITY INVOKER: row level security decides what a
-- login can see (its own business only; a salesman only his own shops).
-- Town, route and territory statements are for office staff.
--
-- Rollback: supabase/rollback/20261121000039_to_0038_down.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. The shops a statement covers, in print order
-- -----------------------------------------------------------------------------
create or replace function public.statement_retailers(p_scope text, p_id uuid)
returns table (
  shop_position  integer,
  retailer_id    uuid,
  territory_id   uuid,
  territory_name text,
  route_id       uuid,
  route_name     text,
  route_code     text,
  town_id        uuid,
  town_name      text
)
language plpgsql stable security invoker set search_path = public as $$
#variable_conflict use_column
begin
  if p_scope is null or p_scope not in ('retailer', 'town', 'route', 'territory') then
    raise exception 'Unknown statement type: %', coalesce(p_scope, 'none') using errcode = '22023';
  end if;
  if p_id is null then
    raise exception 'Choose what the statement is for' using errcode = '22023';
  end if;
  if p_scope <> 'retailer' and not public.has_role('super_admin', 'manager', 'billing') then
    raise exception 'Only office staff can print town, route and territory statements' using errcode = '42501';
  end if;

  return query
  with outlet as (
    -- one active route per shop (the newest, should a shop ever be on two)
    select distinct on (ro.retailer_id) ro.retailer_id, ro.route_id, ro.location_id, ro.sequence
      from public.route_outlets ro
      join public.routes rt on rt.id = ro.route_id and rt.archived_at is null
     where ro.is_active
     order by ro.retailer_id, ro.added_at desc, ro.id
  ), base as (
    select r.id, r.shop_name, r.code, o.route_id, coalesce(r.location_id, o.location_id) as town_id, o.sequence
      from public.retailers r
      left join outlet o on o.retailer_id = r.id
  ), picked as (
    select b.* from base b
     where case p_scope
             when 'retailer' then b.id = p_id
             when 'town'     then b.town_id = p_id
             when 'route'    then b.route_id = p_id
             else exists (select 1 from public.routes x where x.id = b.route_id and x.territory_id = p_id)
                  or (b.route_id is null
                      and exists (select 1 from public.locations l where l.id = b.town_id and l.territory_id = p_id))
           end
  )
  select (row_number() over (order by rt.sort_order nulls last, rt.name nulls last, rt.id nulls last,
                                      rl.sequence nulls last, l.name nulls last, l.id nulls last,
                                      p.sequence nulls last, p.shop_name, p.code, p.id))::integer,
         p.id,
         coalesce(rt.territory_id, l.territory_id),
         t.name,
         p.route_id, rt.name, rt.code,
         p.town_id, l.name
    from picked p
    left join public.routes rt on rt.id = p.route_id
    left join public.locations l on l.id = p.town_id
    left join public.route_locations rl on rl.route_id = p.route_id and rl.location_id = p.town_id
    left join public.territories t on t.id = coalesce(rt.territory_id, l.territory_id)
   order by 1;
end $$;

-- -----------------------------------------------------------------------------
-- 2. One row per shop: opening, period activity, closing, dues, advance
--    p_from null = all transactions (opening is then zero)
--    p_to   null = today (India)
-- -----------------------------------------------------------------------------
create or replace function public.account_statement(p_scope text, p_id uuid, p_from date default null, p_to date default null)
returns table (
  shop_position   integer,
  retailer_id     uuid,
  code            text,
  shop_name       text,
  owner_name      text,
  mobile          text,
  gstin           text,
  billing_address text,
  billing_city    text,
  credit_days     integer,
  credit_limit    numeric,
  retailer_status text,
  territory_id    uuid,
  territory_name  text,
  route_id        uuid,
  route_name      text,
  route_code      text,
  town_id         uuid,
  town_name       text,
  opening         numeric,
  invoiced        numeric,
  carried_over    numeric,
  credit_notes    numeric,
  collected       numeric,
  closing         numeric,
  bills_due       numeric,
  advance         numeric,
  overdue         numeric,
  entries         integer,
  unverified      numeric
)
language plpgsql stable security invoker set search_path = public as $$
#variable_conflict use_column
declare
  v_to date := coalesce(p_to, (now() at time zone 'Asia/Kolkata')::date);
begin
  if p_from is not null and p_from > v_to then
    raise exception 'The start date is after the end date' using errcode = '22023';
  end if;

  return query
  with s as (
    select * from public.statement_retailers(p_scope, p_id)
  ), inv as (
    select i.id, i.retailer_id, i.invoice_date, i.due_date, i.grand_total, i.is_opening
      from public.invoices i join s on s.retailer_id = i.retailer_id
     where i.status = 'issued' and i.invoice_date <= v_to
  ), cn as (
    select c.invoice_id, c.retailer_id, c.note_date, c.grand_total
      from public.credit_notes c join s on s.retailer_id = c.retailer_id
     where c.status = 'issued' and c.note_date <= v_to
  ), pay as (
    select p.id, p.retailer_id, p.payment_date, p.amount, p.verified_at
      from public.payments p join s on s.retailer_id = p.retailer_id
     where p.status = 'received' and p.payment_date <= v_to
  ), alloc as (
    -- both the payment and the bill exist by the end date
    select a.invoice_id, a.payment_id, a.amount
      from public.payment_allocations a
      join pay on pay.id = a.payment_id
      join inv on inv.id = a.invoice_id
  ), cn_inv as (
    select invoice_id, sum(grand_total) as amount from cn group by invoice_id
  ), al_inv as (
    select invoice_id, sum(amount) as amount from alloc group by invoice_id
  ), al_pay as (
    select payment_id, sum(amount) as amount from alloc group by payment_id
  ), bills as (
    select b.retailer_id,
           sum(greatest(b.balance, 0)) as due,
           sum(greatest(b.balance, 0)) filter (where b.due_date < v_to) as overdue
      from (select inv.retailer_id, inv.due_date,
                   inv.grand_total - coalesce(c.amount, 0) - coalesce(a.amount, 0) as balance
              from inv
              left join cn_inv c on c.invoice_id = inv.id
              left join al_inv a on a.invoice_id = inv.id) b
     group by b.retailer_id
  ), i_agg as (
    select retailer_id,
           sum(grand_total) filter (where invoice_date < p_from) as before,
           sum(grand_total) filter (where p_from is null or invoice_date >= p_from) as period,
           sum(grand_total) filter (where is_opening and (p_from is null or invoice_date >= p_from)) as carried,
           count(*) filter (where p_from is null or invoice_date >= p_from) as n
      from inv group by retailer_id
  ), c_agg as (
    select retailer_id,
           sum(grand_total) filter (where note_date < p_from) as before,
           sum(grand_total) filter (where p_from is null or note_date >= p_from) as period,
           count(*) filter (where p_from is null or note_date >= p_from) as n
      from cn group by retailer_id
  ), p_agg as (
    select pay.retailer_id,
           sum(pay.amount) filter (where pay.payment_date < p_from) as before,
           sum(pay.amount) filter (where p_from is null or pay.payment_date >= p_from) as period,
           count(*) filter (where p_from is null or pay.payment_date >= p_from) as n,
           sum(pay.amount - coalesce(ap.amount, 0)) as advance,
           sum(pay.amount) filter (where pay.verified_at is null) as unverified
      from pay left join al_pay ap on ap.payment_id = pay.id
     group by pay.retailer_id
  ), agg as (
    select s.retailer_id,
           coalesce(i.before, 0) - coalesce(c.before, 0) - coalesce(p.before, 0) as opening,
           coalesce(i.period, 0) as invoiced,
           coalesce(i.carried, 0) as carried_over,
           coalesce(c.period, 0) as credit_notes,
           coalesce(p.period, 0) as collected,
           coalesce(b.due, 0) as bills_due,
           coalesce(b.overdue, 0) as overdue,
           coalesce(p.advance, 0) as advance,
           (coalesce(i.n, 0) + coalesce(c.n, 0) + coalesce(p.n, 0))::integer as entries,
           coalesce(p.unverified, 0) as unverified
      from s
      left join i_agg i on i.retailer_id = s.retailer_id
      left join c_agg c on c.retailer_id = s.retailer_id
      left join p_agg p on p.retailer_id = s.retailer_id
      left join bills b on b.retailer_id = s.retailer_id
  )
  select s.shop_position, s.retailer_id, r.code, r.shop_name, r.owner_name, r.mobile, r.gstin, r.billing_address, r.billing_city,
         r.credit_days, r.credit_limit, r.status::text,
         s.territory_id, s.territory_name, s.route_id, s.route_name, s.route_code, s.town_id, s.town_name,
         a.opening, a.invoiced, a.carried_over, a.credit_notes, a.collected,
         a.opening + a.invoiced - a.credit_notes - a.collected,
         a.bills_due, a.advance, a.overdue, a.entries, a.unverified
    from s
    join public.retailers r on r.id = s.retailer_id
    join agg a on a.retailer_id = s.retailer_id
   order by s.shop_position;
end $$;

-- -----------------------------------------------------------------------------
-- 3. The ledger lines of the period, with the running balance
--    Order: date, then the moment it was recorded, then the document id —
--    the same order the retailer's Statement tab uses.
-- -----------------------------------------------------------------------------
create or replace function public.account_statement_entries(p_scope text, p_id uuid, p_from date default null, p_to date default null)
returns table (
  line_no       bigint,
  shop_position integer,
  retailer_id   uuid,
  entry_date    date,
  kind          text,
  doc_id        uuid,
  doc_no        text,
  method        text,
  reference_no  text,
  reason        text,
  is_opening    boolean,
  due_date      date,
  against       text,
  on_account    numeric,
  debit         numeric,
  credit        numeric,
  balance       numeric
)
language plpgsql stable security invoker set search_path = public as $$
#variable_conflict use_column
declare
  v_to date := coalesce(p_to, (now() at time zone 'Asia/Kolkata')::date);
begin
  if p_from is not null and p_from > v_to then
    raise exception 'The start date is after the end date' using errcode = '22023';
  end if;

  return query
  with s as (
    select * from public.statement_retailers(p_scope, p_id)
  ), inv as (
    select i.* from public.invoices i join s on s.retailer_id = i.retailer_id
     where i.status = 'issued' and i.invoice_date <= v_to
  ), cn as (
    select c.* from public.credit_notes c join s on s.retailer_id = c.retailer_id
     where c.status = 'issued' and c.note_date <= v_to
  ), pay as (
    select p.* from public.payments p join s on s.retailer_id = p.retailer_id
     where p.status = 'received' and p.payment_date <= v_to
  ), alloc as (
    select a.payment_id, a.amount, inv.invoice_no, inv.invoice_date
      from public.payment_allocations a
      join pay on pay.id = a.payment_id
      join inv on inv.id = a.invoice_id
  ), al_pay as (
    select payment_id, sum(amount) as amount,
           string_agg(invoice_no, ', ' order by invoice_date, invoice_no) as against
      from alloc group by payment_id
  ), opening as (
    select s.retailer_id, coalesce(sum(x.amount), 0) as amount
      from s
      left join (select retailer_id, grand_total as amount from inv where invoice_date < p_from
                 union all select retailer_id, -grand_total from cn where note_date < p_from
                 union all select retailer_id, -amount from pay where payment_date < p_from) x on x.retailer_id = s.retailer_id
     group by s.retailer_id
  ), e as (
    select inv.retailer_id, inv.invoice_date as entry_date, inv.created_at, 'invoice'::text as kind, inv.id as doc_id,
           inv.invoice_no as doc_no, null::text as method, null::text as reference_no, null::text as reason,
           inv.is_opening, inv.due_date, null::text as against, null::numeric as on_account,
           inv.grand_total as debit, 0::numeric as credit
      from inv where p_from is null or inv.invoice_date >= p_from
    union all
    select cn.retailer_id, cn.note_date, cn.created_at, 'credit_note', cn.id, cn.credit_note_no, null, null, cn.reason,
           false, null::date, i.invoice_no, null::numeric,
           0::numeric, cn.grand_total
      from cn left join inv i on i.id = cn.invoice_id
     where p_from is null or cn.note_date >= p_from
    union all
    select pay.retailer_id, pay.payment_date, pay.created_at, 'payment', pay.id, pay.receipt_no, pay.method::text, pay.reference_no, null,
           false, null::date,
           ap.against, pay.amount - coalesce(ap.amount, 0),
           0::numeric, pay.amount
      from pay left join al_pay ap on ap.payment_id = pay.id
     where p_from is null or pay.payment_date >= p_from
  )
  select row_number() over (order by s.shop_position, e.entry_date, e.created_at, e.doc_id),
         s.shop_position, e.retailer_id, e.entry_date, e.kind, e.doc_id, e.doc_no, e.method, e.reference_no, e.reason,
         e.is_opening, e.due_date, e.against, e.on_account, e.debit, e.credit,
         o.amount + sum(e.debit - e.credit) over (partition by e.retailer_id order by e.entry_date, e.created_at, e.doc_id
                                                  rows between unbounded preceding and current row)
    from e
    join s on s.retailer_id = e.retailer_id
    join opening o on o.retailer_id = e.retailer_id
   order by 1;
end $$;

revoke all on function public.statement_retailers(text, uuid) from public, anon;
revoke all on function public.account_statement(text, uuid, date, date) from public, anon;
revoke all on function public.account_statement_entries(text, uuid, date, date) from public, anon;
grant execute on function public.statement_retailers(text, uuid) to authenticated;
grant execute on function public.account_statement(text, uuid, date, date) to authenticated;
grant execute on function public.account_statement_entries(text, uuid, date, date) to authenticated;

do $$
begin
  if (select count(*) from pg_proc
       where pronamespace = 'public'::regnamespace
         and proname in ('statement_retailers', 'account_statement', 'account_statement_entries')
         and not prosecdef and provolatile = 's') <> 3 then
    raise exception '0039: the three statement functions must exist, read-only and security invoker';
  end if;
end $$;
