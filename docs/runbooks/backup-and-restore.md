# Backup and restore (Supabase free plan)

The free plan has no Supabase backups. These are ours.

| | |
| --- | --- |
| What | All tables in `public`, `auth` (users, identities), `storage`, `mt_rollback`, `supabase_migrations`; every stored file |
| Not included | Login sessions and tokens (everyone signs in again after a restore) |
| When | 02:47, 08:47, 14:47 and 20:47 India time, by `.github/workflows/backup.yml`, plus "Run workflow" by hand. GitHub can start a scheduled run hours late or skip one; four slots keep the gap under 12 hours |
| Recovery point (RPO) | at most 12 hours of entries lost |
| Recovery time (RTO) | target 2 hours; **not yet measured on Supabase**, see "Drill" below |
| Kept | 35 days, as GitHub Actions artifacts. The dump and files are encrypted with AES-256; next to them are the table names, row counts and checksums, which contain no business data |
| Check | Every run restores the dump into an empty database and compares every table (row count + checksum of every row) with production, read in the same snapshot. Any difference fails the run, and GitHub e-mails the owner |
| Alerts | A failed run e-mails the owner. A warning appears when the database passes 400 MB (the free plan stops at 500 MB) |

## Secrets

Repository → Settings → Secrets and variables → Actions:

| Secret | Value |
| --- | --- |
| `PROD_DB_URL` | Supabase → Connect → **Session pooler** connection string (port 5432), with the database password |
| `BACKUP_PASSPHRASE` | A long random passphrase. **Keep a copy outside GitHub** (password manager + paper): without it no backup can be opened |
| `PROD_SUPABASE_URL` | `https://<project-ref>.supabase.co` (for the stored files) |
| `PROD_SERVICE_ROLE_KEY` | Supabase → Project settings → API keys → `service_role` (for the stored files) |

Changing the passphrase only affects new backups; keep the old one for 35 days.

## Restore into a new Supabase project

Use this after losing the project, or to move it (for example to the Mumbai region).
Do **not** restore over a live project.

1. **Get the files.** Actions → "Database backup" → pick the run → download the artifact. Check and decrypt:

   ```bash
   sha256sum -c dms-<time>.dump.gpg.sha256
   gpg -d dms-<time>.dump.gpg > db.dump                  # asks for BACKUP_PASSPHRASE
   gpg -d dms-files-<time>.tar.gz.gpg | tar -xzf - -C files/
   ```

2. **Create the project** (same organization, region `ap-south-1`) and copy its Session pooler connection string into `NEW`.

3. **Role and app schema** (structure first, no data yet):

   ```bash
   psql "$NEW" -v ON_ERROR_STOP=1 -c "create role app_definer nologin inherit nobypassrls; grant anon to app_definer; grant app_definer to postgres with inherit true, set true; grant create on schema public to app_definer;"
   pg_restore -d "$NEW" --section=pre-data -n public -n mt_rollback -n supabase_migrations db.dump
   psql "$NEW" -c "revoke create on schema public from app_definer;"
   ```

   The temporary `create` grant is what Supabase needs before functions can be handed to `app_definer`; it is taken back straight after.

   "schema public already exists" is expected.

4. **People, then business data, then indexes and rules:**

   ```bash
   pg_restore -d "$NEW" --data-only -n auth -t users -t identities db.dump
   pg_restore -d "$NEW" --data-only -n storage -t buckets -t objects db.dump
   pg_restore -d "$NEW" --data-only -n public -n mt_rollback -n supabase_migrations --disable-triggers db.dump
   pg_restore -d "$NEW" --section=post-data -n public -n mt_rollback -n supabase_migrations db.dump
   psql "$NEW" -c "create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();"
   ```

   `--disable-triggers` stops the stamp and audit triggers from firing on old rows. If Supabase refuses it, run that line without the flag.

5. **Files:** upload `files/<bucket>/...` back into the same buckets with the same paths (Supabase CLI `supabase storage cp -r`, or a short script with the service key).

6. **Prove it:** `psql "$NEW" -qAt -f scripts/backup/fingerprint.sql | diff - dms-<time>.fingerprint.txt`. Every `public.`, `mt_rollback.` and `supabase_migrations.` line must match. `auth.` and `storage.` lines can differ only in columns Supabase manages itself. Then sign in as each role and open an invoice, a payment and a photo.

7. **Switch the app:** set the new URL and keys in the hosting's environment variables, redeploy, and run the smoke test.

## Drill

A backup counts only once a restore has worked. Status:

- [x] Nightly automatic restore into plain Postgres 17, with every table compared: in the workflow
- [x] Locally tested: dump → restore → identical; one changed value is detected; the encrypted file restores identically into a fresh database; a wrong passphrase is refused; a missing stored file fails the run
- [ ] First run against production in GitHub (needs the secrets)
- [ ] Full restore into a **Supabase** project with this runbook, timed. Planned as the move to Mumbai, which is exactly this procedure
- [ ] Repeat every 3 months, and after any change to this runbook
