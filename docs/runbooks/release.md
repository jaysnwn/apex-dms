# Releasing a change to the live app

Every change follows the same path: **branch → automatic checks → staging → your OK → main**.
`main` is the live app: Vercel deploys every commit on `main` to production.

## 1. Everyday changes (code only, no database change)

1. Work on a branch (`multi-tenant`, or `hotfix/<name>` for an urgent fix).
2. Push it. GitHub runs **Checks** (typecheck, lint, app checks, all migrations and every
   database test suite on a fresh Postgres). Vercel builds a **preview** that uses the
   **staging** database, never production.
3. Click through the change on the preview. The System health page lists any error it caused.
4. When Checks are green and the preview is right, move the tested commit to `main`.
   Branch protection refuses a commit on `main` whose Checks did not pass.
5. After the production deploy, open the changed screen once on the live app.
6. **Undo:** Vercel → apex-dms → Deployments → the previous production deployment →
   *Promote*. This brings back the previous code in seconds; the database is not touched.

## 2. Changes with a database migration

A migration changes the live database, so it needs more than a code release.

1. Write the migration **and its rollback** (`supabase/rollback/<n>_to_<m>_down.sql`).
   Both must pass locally: `tests/db/run.sh`, plus applying the rollback and comparing
   `tests/db/schema_fingerprint.sql` and `tests/db/snapshot.sql` before and after.
2. Apply it on **staging** first (Supabase project `dms-staging`) and click through the preview.
3. **Rehearse on a copy of production:** push a branch named `rehearsal/<anything>`.
   The *Upgrade rehearsal* job reads production once (like the backup), restores it into a
   throwaway database, applies the migrations, and checks that every row, every business
   total and what every login can see are unchanged, then rolls back and checks the
   database is exactly as before. It must say **REHEARSAL PASSED**.
4. **Backup right before:** Actions → *Database backup* → Run workflow. Wait for the green
   tick (it restores the backup and compares every table).
5. **Your explicit OK** to change production, with the time agreed (a quiet hour).
6. Apply the migrations to production **in order, each in one transaction**, then deploy the
   matching code to `main`.
7. Check: System health page, one invoice PDF, one sale, one payment, sign-in as a salesman.
8. **Undo:** apply the rollback scripts in reverse order (each in one transaction), then promote
   the previous production deployment. If data was damaged, restore the backup from step 4 —
   see `backup-and-restore.md`. A rollback script is not a restore.

## 3. Release notes

Each commit message on `main` says what changed and why, in plain words. For a release with
several commits, write a short note in the audit doc's progress section (date, what changed,
what was checked) so the team knows what is new.

## Never

- Change production data or schema by hand without a backup taken the same hour.
- Put a commit on `main` that has not passed Checks.
- Run a migration on production that has not passed on staging **and** in the rehearsal.
