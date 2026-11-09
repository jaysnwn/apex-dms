# APEX DMS

Cloud Distribution Management System for **APEX TRADING CO.** — inventory, sales, GST billing, dispatch,
payments and credit, retailer accounts, salesman routes, expenses and analytics.

Stack: **Next.js 15 (App Router) · TypeScript · Tailwind CSS 4 · Supabase (Postgres, Auth, Storage, RLS)**, deployed on Vercel.

## Milestones

| Milestone | Scope | Status |
| --- | --- | --- |
| M0 Foundation | Schema v1, 5 roles, RLS, audit log, login, users, company settings | ✅ Built |
| M1 Inventory and retailers | Products, stock ledger, reconciliation, retailers, duplicate detection, Excel import | ✅ Built |
| M2 Orders and invoices | New order, quotations, GST invoices, PDF, WhatsApp | ✅ Built |
| M3 Dispatch | Picking list, full dispatch, delivery confirmation | ✅ Built |
| M4 Payments and accounts | Collections, FIFO, ageing, statements, promises, credit notes, classification | ✅ Built |
| M5 Field app and expenses | Route plans, targets, visits, offline field app, expense approvals, reimbursement | ✅ Built |
| M6 Dashboards and reports | Role dashboards, 12 reports, Excel export | ✅ Built |
| Purchases | Suppliers, purchase orders, goods receipt into stock, supplier bills, payments, payables | ✅ Built |
| Salesman app | Phone app at /m: monthly target, today's route, order from live stock, outlets, add outlet with GPS, collect payment, expenses, offline | ✅ Built |
| Multi-brand inventory | CONQRETE and BLUEI as two independent inventories: own catalogue, categories, warehouses, stock, counts, purchases, invoices (own number series), reports and audit trail; brand switcher; user brand access; enforced in the database | ✅ Built |
| Inventory module | Inventory dashboard, product table with filters / sort / archive, distributor price, Excel import with column matching + preview + fixes, stock inward / outward / adjustment (confirm) / damage, movement history with before / after stock, brand PDF stock report, 6-column verification Excel | ✅ Built |
| Purchase returns & reorder | Return goods to supplier (debit note, stock and payable down); daily reorder list (8-day delivery, 30 days cover) that creates purchase orders | ✅ Built |
| Collection verification | Salesman enters money collected + mode in the app; office verifies after hand-over (or rejects with a reason); only verified money counts for incentives | ✅ Built |
| Routes & territories | Territories → routes → towns in order → outlets in order; salesman assignment history; weekly / fortnightly schedules with per-outlet frequency; daily visit lists made automatically; GPS-verified check-in/out, missed reasons, reschedule; live monitoring, map, 5 route reports | ✅ Built |
| Unified expenses | One expense record for office and salesman entries: central categories, approval (bulk), returns for correction, partial reimbursements, double-entry journal, 7 reports + journal export | ✅ Built |
| Salesman incentive | Monthly incentive (3 targets + collection slabs): live progress + to-do lists in the app, manager approval/lock/pay, scheme editable by Super Admin | ✅ Built |
| M7 UAT and go-live | Your corrections, data migration, training, cut-over | Next |

## First-time setup

### 1. Supabase project settings

In the Supabase dashboard for this project:

1. **Authentication → Sign In / Providers → Email**: keep Email enabled, **turn off "Allow new users to sign up"**.
   Users are created only by the Super Administrator inside the app.
2. **Authentication → Sign In / Providers → Email**: turn off "Confirm email" (admins create confirmed users).
3. **Database → Backups**: daily backups are on by default on paid plans; enable **Point-in-Time Recovery** on the
   production project.

### 2. Run the database migrations

> **Already done for the `apex-dms` project (uiczjglzsnjxxqvxlheh)** — all migrations up to 0018 were applied
> (0018 on 2026-11-09) through the Supabase connector, so skip this step. The applied versions are timestamped by Supabase,
> not by these file names; if you later switch to `supabase db push`, run `supabase migration list` first and use
> `supabase migration repair` so files that are already applied are not run again.

For a new project, either use the Supabase CLI:

```bash
npx supabase login
npx supabase link --project-ref uiczjglzsnjxxqvxlheh
npx supabase db push
```

Or paste each file in `supabase/migrations/` **in order** into the Supabase SQL Editor and run it:

1. `20261105000001_schema_v1.sql` — all tables for every module
2. `20261105000002_security.sql` — roles, permission helpers, row-level security
3. `20261105000003_audit.sql` — audit-log triggers
4. `20261105000004_views.sql` — stock and receivables views
5. `20261105000005_storage.sql` — storage buckets and policies
6. `20261105000006_hardening.sql` — fixes from the Supabase security / performance advisor
7. `20261105000007_m1_inventory_retailers.sql` — stock guard, transfers, stock counts, valuation, retailer checks
8. `20261105000008_sales_payments_field.sql` — quotations, invoice confirmation (stock + credit checks), dispatch,
   payments with FIFO, credit notes, ledger, sales register, classification, route plans, reimbursements
9. `20261105000009_purchases.sql` — suppliers (CONQRETE, BLUEI seeded), purchase orders, receiving into stock,
   supplier payments (FIFO, advances), payables views
10. `20261107000010_field_app.sql` — outlet GPS location (latitude/longitude)
11. `20261107000011_share_links.sql` — short links for PDFs shared on WhatsApp
12. `20261107000012_incentives.sql` — salesman incentive scheme, live calculation, approved payouts
13. `20261107000013_payment_verification.sql` — office verification of salesman collections
14. `20261107000014_stock_movement_types.sql` — new movement types (stock out, purchase return); must run before 0015
15. `20261107000015_multi_brand.sql` — brand separation, brand access, purchase returns, stock ledger, reorder list
16. `20261107000016_fast_billing.sql` — category order/delete, billing discount cap, manager stock override, GST details check before invoicing, payment-terms change
17. `20261109000017_unified_expenses.sql` — expense categories, employee vs creator, draft/returned/cancelled, reimbursement lines (partial), expense history, journal entries
18. `20261109000018_route_territory.sql` — territories, towns, route towns & outlets in order, salesman assignments with history, visit schedules, GPS check-in/out with geofence, visit events, live location (consent)

Supabase's advisor will still list a few items on purpose: the `catalog` and stock views run with owner rights
so salesmen and warehouse staff can see stock without seeing purchase costs (each view filters to active users
itself), and the role helper functions must be callable by signed-in users because RLS policies use them.

### 3. Environment variables

```bash
cp .env.example .env.local
```

Fill in from **Project Settings → API Keys**:

| Variable | Where | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL | already filled |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon / publishable key | safe in the browser |
| `NEXT_PUBLIC_APP_URL` | the app's public address, e.g. `https://apex.yourdomain.in` | optional; used for short WhatsApp links `…/d/k3Xa9QpL` |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role / secret key | **server only — never commit**. Needed for creating users and WhatsApp document links |

Add the same three variables in **Vercel → Project → Settings → Environment Variables**.

### 4. Create the first Super Administrator

```bash
npm install
node --env-file=.env.local scripts/create-super-admin.mjs you@example.com "Your Name" "AStrongPassword"
```

### 5. Run

```bash
npm run dev       # http://localhost:3000
```

Sign in, open **Users**, and create logins for the Manager, Office/Billing, Warehouse and Salesman staff.

## How access control works

- Every user has one role: `super_admin`, `manager`, `billing`, `warehouse`, `salesman` (stored in `profiles`).
- **Row-level security in Postgres is the real gatekeeper.** Even with a direct API call, a salesman can only read
  retailers on his route, cannot see purchase costs, and cannot write invoices.
- The menu (`src/lib/roles.ts`) only hides what a role can't use.
- A disabled user is blocked at sign-in and sees no data.
- At least one active Super Administrator must always exist (enforced in the database).

## Design rules baked into the schema

- **Ledgers, not edits.** Stock is the sum of `stock_movements` (append-only). Outstanding is computed from
  invoices, credit notes and payment allocations (`invoice_balances`, `retailer_balances` views).
- **Issued invoices are frozen.** Only cancellation fields can change; corrections are credit notes.
- **Due date = invoice date + credit days**, checked by the database and never changed by payments.
- **Gapless numbering** per document type per financial year: `APX/INV/26-27/00001`.
- **No partial dispatch.** One dispatch per invoice; confirming an invoice is blocked, with the short products listed, if stock is not available.
- **Audit log** on every financial, inventory and access table: old value, new value, user, time.

## Business rules chosen as defaults (tell us what to change)

| Rule | Default |
| --- | --- |
| Credit limit | `0` means no limit. Above the limit, only a Manager can override when confirming |
| Salesman discount | at most 5% per line (Company settings → `salesman_max_discount`) |
| Billing discount & prices | Billing staff: at most 10% discount per line, item + overall combined (Company settings → `billing_max_discount`). Only a Manager / Super Admin can change a selling price or give a bigger discount |
| Stock at billing | Cart and drafts never reduce stock. If a line is short, only a Manager / Super Admin can tick "invoice anyway"; stock still goes out at dispatch |
| GST details | No invoice without shop name and state. GSTIN shops also need billing address + PIN; any bill of ₹50,000 or more needs the address |
| Payment terms | Immediate (cash) or N days; due date = invoice date + days, saved on the invoice. Changing a shop's default never touches old invoices. A Manager / Super Admin can change an issued invoice's terms with a reason (logged in the audit) |
| Categories | Every product needs one, per brand. Ordered with ↑/↓ on Product settings; a category can be deleted only when no product uses it (move its products first) |
| Invoice cancellation | Billing: same day only. Manager: any day, if not dispatched and no payments allocated |
| Retailer on hold | can get quotations, cannot be invoiced; blocked/inactive cannot get orders |
| Cheques | count against the balance as "pending" until marked cleared; a bounce re-opens the invoices |
| Payment allocation | FIFO by due date unless invoices are picked by hand |
| Classification | High credit risk: >45 days overdue, a bounce in 90 days, or over limit. Needs attention: >15 days overdue, no order in 60 days, or <60% paid on time. Star: 4+ invoices in 90 days, nothing overdue, ≥90% on time. Otherwise Average |
| Gross profit | invoice taxable value minus weighted average purchase cost at invoice time; credit notes not deducted |
| Brands | Every product, category, warehouse, stock movement, count, purchase, order, invoice and credit note belongs to one brand. Stock of one brand can never enter another brand's warehouse, so transfers between brands are impossible (move goods between the businesses with a purchase/sale instead). SKU is unique within a brand. One invoice = one brand; a salesman's mixed cart becomes one quotation per brand. Invoice numbers per brand: CQ/26-27/00001, credit notes CQCN/26-27/00001, purchase returns CQDN/26-27/00001 (all within GST's 16 characters). Users see only their brands (Super Admin: all); "All brands" is a consolidated view for Super Admin / Manager |
| Stock changes | Stock is never typed over: every change is a movement with a reason and the user's name. Adjustments (Manager / Super Admin) set the system to the physical count after a confirmation; warehouse staff use stock counts. Each manual entry carries a one-time key, so a double click saves once |
| Reorder list | A product is listed when available + on order will not last the supplier's delivery time (8 days default) at the last 30 days' sales, or is at / below its minimum. Suggested qty = max(2 × minimum, daily sales × (delivery + 30 days)) − available − on order. Settings: company reorder_lead_days / reorder_cover_days, supplier lead_days |
| Verification Excel | Exactly six columns: Sr. No., Product Name, Qty (system), Physical Qty (blank), Difference = Physical − Qty (blank until counted), Notes (blank). Red = shortage, green = extra |
| Purchases | A PO is editable until received. Receiving needs the supplier's bill no. + date and adds all its stock at the net cost (after discount, before GST); it also updates the product's purchase cost unless unticked. Due date = bill date + supplier credit days. The same bill number can't be entered twice for one supplier. Only a Manager can cancel a received purchase (stock comes back out; no payments applied). Warehouse staff can receive but never see costs |
| Collection verification | Payments entered by office staff are verified automatically · payments a salesman enters in the app reduce the shop's balance at once but show as **With salesman** until the office verifies them in *Payments → Verify collections* (grouped by salesman, with cash / UPI / cheque / bank totals to match the hand-over) · **Reject** needs a reason: the payment is cancelled, the bills become due again and the salesman sees the reason in *My collections* · a verified cheque still has to clear before it counts |
| Routes | A route has towns in order and outlets in order inside each town (drag to reorder in *Routes → Routes*); the salesman sees exactly that order. **One route per outlet:** adding a shop that is on another route asks first and then moves it. **Removing** a town or an outlet only removes it from the route — the town, the retailer, its invoices, payments, balance and visit history stay; untouched future planned visits are dropped. **Salesman:** one at a time per route, from a start date (never in the past); the previous assignment ends the day before; visits already made stay with whoever made them; untouched future visits move to the new salesman; pause stops planning. **Schedule:** visit days (Mon–Sun) weekly or every 2 weeks; each outlet: every route day, once a week (first route day of the week), every 2 weeks, or once a month; skip a day (reason) or add a one-time day. Visit lists are made from the schedule when the salesman opens his route or the office opens *Live progress* (idempotent — never twice); yesterday's untouched visits become *missed (not visited)*. **Visits:** check in (GPS if allowed) → visit done; “visited” is impossible without a check-in; missed needs a reason; reschedule up to 31 days. **GPS:** within the shop radius (200 m default) = *GPS verified*; no GPS, weak GPS (over 100 m accuracy) and shops without a saved location are shown as such, never as verified. A salesman can save a shop's location once (good GPS fix); changing it needs the office. **Live location:** only while the salesman switches sharing on (7 am–9 pm, every 5 min, app open); positions older than 10 min show as *last known*. Settings in *Company settings*. **Offline:** check-ins, visit done, missed, reschedule and payments are queued on the phone with one-time ids; replays never duplicate |
| Expenses | One `expenses` table for both the office and the salesman app; every change goes through database functions (nobody can update the table directly). **Who:** anyone enters their own; Super Admin / Manager / Billing can enter for another employee (the employee and the person who entered it are stored separately; the office's internal notes are hidden from the employee). **Flow:** Draft → Submitted → Approved / Rejected / Returned for correction; a returned expense is corrected and resent; after submitting it is locked (a Manager may still correct it before approving). **Approval:** Super Admin / Manager, never their own expense (Super Admin excepted); may approve less than claimed with a reason; bulk approval writes one history row per expense. **Categories:** managed in *Expenses → Categories*: receipt required, route required, needs approval, auto-approve up to ₹X, disable. **Limits:** amount ₹0.01–₹10,00,000, no future dates, salesmen can claim up to 60 days back (`expense_claim_days`); the same form sent twice is saved once. **Reimbursement:** only approved, employee-paid expenses; part payments allowed; never more than what is still due (row locks + a database check, tested with simultaneous payments); one payment = one employee; Super Admin always, Manager / Billing only with *Can reimburse* ticked in *Users* (existing managers kept it). **No deletes:** only drafts are deleted; a returned expense is withdrawn (cancelled); a Manager cancels a submitted/approved expense with a reason; a payment made by mistake is reversed by the Super Admin. **Accounting:** approval posts Dr *Expense: category* / Cr *Employee payable* (or Cr the company account for company-paid); a reimbursement posts Dr *Employee payable* / Cr Cash/Bank; cancellations post reversals; each event is posted once (unique per source + event) — see the *Expense journal* report |
| Incentive | Sales = before GST, net of returns · shops billed = his shops with an invoice in the month · smart = bought ≥ ₹5,000 (before GST) in the month and paid every bill of that month within 21 days · collection = money received in the month against every bill due by month end (old overdue included, at what was owed on the 1st) ÷ that amount; slabs <75% ₹0 · 75% ₹2,000 · 85% ₹2,500 · 95% ₹3,000, highest slab only; payments go to the oldest bill first; only payments verified by the office count; cheques count once cleared · his shops = assigned to him or on his route · figures are final 21 days after month end, then the manager approves and locks them |
| Field app | caches today's route and catalogue; orders, payments and visits made offline are sent when back online |

## Tests

Database tests (roles, RLS, audit, numbering, invoice immutability, expenses) run on plain Postgres with Supabase stubs:

```bash
PGHOST=localhost PGPORT=5432 PGUSER=postgres tests/db/run.sh
# two people paying the same expense at the same moment (real parallel sessions):
PGHOST=localhost PGPORT=5432 PGUSER=postgres tests/db/concurrency_expenses.sh
```

## Project layout

```
supabase/migrations/   SQL migrations (source of truth for the database)
tests/db/              database tests + Supabase stubs
scripts/               one-off admin scripts
src/app/login          sign-in
src/app/(app)/         signed-in area: dashboard, products, stock, retailers, import, sales, dispatch,
                       payments, routes (+ routes/today field app), expenses, reports, admin, account
src/app/api/pdf/       PDF downloads (invoice, credit note, receipt, statement, picking list)
src/pdf/               PDF layouts and embedded font
src/lib/supabase/      browser, server, admin (service role) and middleware clients
src/lib/roles.ts       roles and module/menu map
src/lib/auth.ts        getSession / requireRole
src/lib/gst.ts         GST line maths, amount in words
src/lib/reports.ts     the 12 report definitions
src/lib/status.ts      status labels and colours
src/components/        shell and UI primitives
```
