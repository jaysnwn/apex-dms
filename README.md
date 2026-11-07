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

> **Already done for the `apex-dms` project (uiczjglzsnjxxqvxlheh)** — all migrations up to 0012 were applied on
> 2026-11-05 through the Supabase connector, so skip this step. The applied versions are timestamped by Supabase,
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
| Invoice cancellation | Billing: same day only. Manager: any day, if not dispatched and no payments allocated |
| Retailer on hold | can get quotations, cannot be invoiced; blocked/inactive cannot get orders |
| Cheques | count against the balance as "pending" until marked cleared; a bounce re-opens the invoices |
| Payment allocation | FIFO by due date unless invoices are picked by hand |
| Classification | High credit risk: >45 days overdue, a bounce in 90 days, or over limit. Needs attention: >15 days overdue, no order in 60 days, or <60% paid on time. Star: 4+ invoices in 90 days, nothing overdue, ≥90% on time. Otherwise Average |
| Gross profit | invoice taxable value minus weighted average purchase cost at invoice time; credit notes not deducted |
| Purchases | A PO is editable until received. Receiving needs the supplier's bill no. + date and adds all its stock at the net cost (after discount, before GST); it also updates the product's purchase cost unless unticked. Due date = bill date + supplier credit days. The same bill number can't be entered twice for one supplier. Only a Manager can cancel a received purchase (stock comes back out; no payments applied). Warehouse staff can receive but never see costs |
| Incentive | Sales = before GST, net of returns · shops billed = his shops with an invoice in the month · smart = bought ≥ ₹5,000 (before GST) in the month and paid every bill of that month within 21 days · collection = money received in the month against every bill due by month end (old overdue included, at what was owed on the 1st) ÷ that amount; slabs <75% ₹0 · 75% ₹2,000 · 85% ₹2,500 · 95% ₹3,000, highest slab only; payments go to the oldest bill first; cheques count once cleared · his shops = assigned to him or on his route · figures are final 21 days after month end, then the manager approves and locks them |
| Field app | caches today's route and catalogue; orders, payments and visits made offline are sent when back online |

## Tests

Database tests (roles, RLS, audit, numbering, invoice immutability) run on plain Postgres with Supabase stubs:

```bash
PGHOST=localhost PGPORT=5432 PGUSER=postgres tests/db/run.sh
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
