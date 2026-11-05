-- =============================================================================
-- APEX DMS — Ledger views (M0)
-- Balances are never stored: they are sums over the documents behind them.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Catalogue without purchase cost, for every active user (incl. Warehouse,
-- Salesman). Runs with owner rights, so it filters on is_active_user() itself.
-- -----------------------------------------------------------------------------
create or replace view public.catalog as
select p.id, p.name, p.sku, p.barcode, p.hsn_code, p.description,
       p.brand_id, b.name as brand_name,
       p.category_id, c.name as category_name,
       p.unit_code, p.retailer_price, p.retailer_price_mode, p.mrp, p.mrp_mode,
       p.gst_rate, p.min_stock_qty, p.default_warehouse_id, p.default_location_id,
       p.is_active,
       (select pi.storage_path from public.product_images pi
         where pi.product_id = p.id order by pi.is_primary desc, pi.sort_order limit 1) as image_path
  from public.products p
  join public.brands b on b.id = p.brand_id
  left join public.categories c on c.id = p.category_id
 where public.is_active_user();

-- -----------------------------------------------------------------------------
-- Stock
-- -----------------------------------------------------------------------------
-- On-hand per product per warehouse = sum of movements.
create or replace view public.stock_on_hand as
select sm.product_id, sm.warehouse_id, sum(sm.qty) as on_hand
  from public.stock_movements sm
 where public.is_active_user()
 group by sm.product_id, sm.warehouse_id;

-- Reserved = quantity on issued invoices that have not been dispatched yet.
create or replace view public.stock_reserved as
select il.product_id, sum(il.qty) as reserved
  from public.invoice_lines il
  join public.invoices i on i.id = il.invoice_id
  left join public.dispatches d on d.invoice_id = i.id
 where public.is_active_user()
   and i.status = 'issued'
   and (d.id is null or d.status = 'picking')
 group by il.product_id;

-- Availability shown when creating orders (all roles, no cost).
create or replace view public.product_stock as
select p.id as product_id,
       coalesce(oh.on_hand, 0)                              as on_hand,
       coalesce(r.reserved, 0)                              as reserved,
       coalesce(oh.on_hand, 0) - coalesce(r.reserved, 0)    as available,
       p.min_stock_qty,
       (coalesce(oh.on_hand, 0) - coalesce(r.reserved, 0)) <= p.min_stock_qty as is_low
  from public.products p
  left join (select product_id, sum(on_hand) as on_hand from public.stock_on_hand group by product_id) oh
         on oh.product_id = p.id
  left join public.stock_reserved r on r.product_id = p.id
 where public.is_active_user();

-- -----------------------------------------------------------------------------
-- Receivables. security_invoker = true: callers see only rows RLS allows.
-- Due dates come from the invoice and are never changed by payments.
-- Only cleared payments (status 'received') reduce outstanding.
-- -----------------------------------------------------------------------------
create or replace view public.invoice_balances
with (security_invoker = true) as
select i.id as invoice_id, i.invoice_no, i.retailer_id, i.invoice_date, i.credit_days, i.due_date,
       i.grand_total,
       coalesce(cn.credited, 0)                                           as credited,
       coalesce(pa.paid, 0)                                               as paid,
       coalesce(pa.pending, 0)                                            as cheque_pending,
       i.grand_total - coalesce(cn.credited, 0) - coalesce(pa.paid, 0)    as balance,
       current_date - i.due_date                                          as days_past_due,
       case
         when i.grand_total - coalesce(cn.credited, 0) - coalesce(pa.paid, 0) <= 0 then 'paid'
         when current_date < i.due_date then 'not_yet_due'
         when current_date = i.due_date then 'due'
         else 'overdue'
       end as due_status,
       case
         when i.grand_total - coalesce(cn.credited, 0) - coalesce(pa.paid, 0) <= 0 then null
         when current_date < i.due_date then null
         when current_date - i.due_date <= 15 then '0-15'
         when current_date - i.due_date <= 30 then '16-30'
         when current_date - i.due_date <= 45 then '31-45'
         else '45+'
       end as ageing_bucket
  from public.invoices i
  left join (
    select invoice_id, sum(grand_total) as credited
      from public.credit_notes where status = 'issued' group by invoice_id
  ) cn on cn.invoice_id = i.id
  left join (
    select a.invoice_id,
           sum(a.amount) filter (where p.status = 'received')       as paid,
           sum(a.amount) filter (where p.status = 'cheque_pending') as pending
      from public.payment_allocations a
      join public.payments p on p.id = a.payment_id
     group by a.invoice_id
  ) pa on pa.invoice_id = i.id
 where i.status = 'issued';

create or replace view public.retailer_balances
with (security_invoker = true) as
select r.id as retailer_id, r.code, r.shop_name, r.credit_limit,
       coalesce(sum(ib.grand_total), 0)                                              as total_invoiced,
       coalesce(sum(ib.credited), 0)                                                 as total_credited,
       coalesce(sum(ib.balance) filter (where ib.balance > 0), 0)                    as outstanding,
       coalesce(sum(ib.balance) filter (where ib.due_status = 'not_yet_due'), 0)    as not_yet_due,
       coalesce(sum(ib.balance) filter (where ib.due_status = 'due'), 0)            as due_today,
       coalesce(sum(ib.balance) filter (where ib.due_status = 'overdue'), 0)        as overdue,
       coalesce(sum(ib.balance) filter (where ib.ageing_bucket = '0-15'), 0)        as overdue_0_15,
       coalesce(sum(ib.balance) filter (where ib.ageing_bucket = '16-30'), 0)       as overdue_16_30,
       coalesce(sum(ib.balance) filter (where ib.ageing_bucket = '31-45'), 0)       as overdue_31_45,
       coalesce(sum(ib.balance) filter (where ib.ageing_bucket = '45+'), 0)         as overdue_45_plus,
       (select coalesce(sum(p.amount), 0) from public.payments p
         where p.retailer_id = r.id and p.status = 'received')                       as total_received,
       (select coalesce(sum(p.amount), 0) from public.payments p
         where p.retailer_id = r.id and p.status = 'received')
       - (select coalesce(sum(a.amount), 0) from public.payment_allocations a
            join public.payments p on p.id = a.payment_id
           where p.retailer_id = r.id and p.status = 'received')                     as unallocated
  from public.retailers r
  left join public.invoice_balances ib on ib.retailer_id = r.id
 group by r.id;

grant select on public.catalog, public.stock_on_hand, public.stock_reserved, public.product_stock,
  public.invoice_balances, public.retailer_balances to authenticated;
revoke all on public.catalog, public.stock_on_hand, public.stock_reserved, public.product_stock,
  public.invoice_balances, public.retailer_balances from anon;
