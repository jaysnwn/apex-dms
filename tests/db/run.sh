#!/usr/bin/env bash
# Runs all migrations + DB tests against a throwaway local Postgres database.
# Usage: PGHOST=/tmp PGPORT=5544 PGUSER=postgres tests/db/run.sh
#
# Each migration file runs in one transaction (as Supabase applies them), so a
# failed check inside a migration leaves nothing half-done.
# Server-side sessions (fixtures inserted as postgres, no signed-in user) work
# in the APEX TRADING CO. tenant through app.tenant_id, exactly like a trusted
# server job must name its tenant. Signed-in test users get their tenant from
# their membership, as in production.
set -euo pipefail
cd "$(dirname "$0")/../.."
DB=apex_test_$$
APEX=a9e70000-0000-4000-8000-000000000001
psql -q -d postgres -c "create database $DB" >/dev/null
trap 'psql -q -d postgres -c "drop database if exists $DB" >/dev/null' EXIT
P="psql -q -v ON_ERROR_STOP=1 -d $DB"
$P -f tests/db/supabase_stubs.sql
for f in supabase/migrations/*.sql; do $P -1 -f "$f"; done
psql -q -d postgres -c "alter database $DB set app.tenant_id = '$APEX'" >/dev/null
for t in tests/db/*_test.sql; do echo "== $t"; $P -f "$t"; done
