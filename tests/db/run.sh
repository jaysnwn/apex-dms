#!/usr/bin/env bash
# Runs all migrations + DB tests against a throwaway local Postgres database.
# Usage: PGHOST=/tmp PGPORT=5544 PGUSER=postgres tests/db/run.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
DB=apex_test_$$
psql -q -d postgres -c "create database $DB" >/dev/null
trap 'psql -q -d postgres -c "drop database if exists $DB" >/dev/null' EXIT
P="psql -q -v ON_ERROR_STOP=1 -d $DB"
$P -f tests/db/supabase_stubs.sql
for f in supabase/migrations/*.sql; do $P -f "$f"; done
for t in tests/db/*_test.sql; do echo "== $t"; $P -f "$t"; done
