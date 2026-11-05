# APEX DMS

Cloud Distribution Management System for **APEX TRADING CO.** — inventory, sales, GST billing, dispatch,
payments and credit, retailer accounts, salesman routes, expenses and analytics.

Stack: **Next.js 15 (App Router) · TypeScript · Tailwind CSS 4 · Supabase (Postgres, Auth, Storage, RLS)**, deployed on Vercel.

## Milestones

| Milestone | Scope | Status |
| --- | --- | --- |
| M0 Foundation | Schema v1, 5 roles, RLS, audit log, login, users, company settings | ✅ Built |
| M1 Inventory and retailers | Products, stock ledger, reconciliation, retailers, duplicate detection | Next |
| M2 Orders and invoices | New order, quotations, GST invoices, PDF, WhatsApp | — |
| M3 Dispatch | Picking, full dispatch, delivery confirmation | — |
| M4 Payments and accounts | Collections, FIFO, ageing, statements, classification | — |
| M5 Field app and expenses | Routes, visits, offline PWA, expense approvals | — |
| M6 Dashboards and reports | KPIs, 12 reports, Excel export | — |
| M7 UAT and go-live | Migration, training, cut-over | — |

## First-time setup

### 1. Supabase project settings

In the Supabase dashboard for this project:

1. **Authentication → Sign In / Providers → Email**: keep Email enabled, **turn off "Allow new users to sign up"**.
   Users are created only by the Super Administrator inside the app.
2. **Authentication → Sign In / Providers → Email**: turn off "Confirm email" (admins create confirmed users).
3. **Database → Backups**: daily backups are on by default on paid plans; enable **Point-in-Time Recovery** on the
   production project.

### 2. Run the database migrations

> **Already done for the `apex-dms` project (uiczjglzsnjxxqvxlheh)** — all six migrations were applied on
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
| `SUPABASE_SERVICE_ROLE_KEY` | service_role / secret key | **server only — never commit** |

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
- **No partial dispatch.** One dispatch per invoice; confirming an invoice will be blocked if stock is short (M2).
- **Audit log** on every financial, inventory and access table: old value, new value, user, time.

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
src/app/(app)/         signed-in area (dashboard, admin/users, admin/audit, admin/settings, account)
src/lib/supabase/      browser, server, admin (service role) and middleware clients
src/lib/roles.ts       roles and module/menu map
src/lib/auth.ts        getSession / requireRole
src/components/        shell and UI primitives
```
