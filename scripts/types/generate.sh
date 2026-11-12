#!/usr/bin/env bash
# Regenerates src/lib/supabase/database.types.ts from supabase/migrations.
#
# The file is the app's contract with the database (audit finding 2). It is
# generated, never edited by hand: build a throwaway database from the
# migrations, ask the Supabase CLI what its types are, and write the result.
#
# Usage: PGHOST=localhost PGPORT=5544 PGUSER=postgres scripts/types/generate.sh
#        scripts/types/generate.sh --check     (changes nothing; fails if the
#                                               committed file is out of date)
#
# The Checks workflow runs it with --check, so a migration that is merged
# without regenerating this file turns the check red.
set -euo pipefail
cd "$(dirname "$0")/../.."

CHECK=no
[ "${1:-}" = "--check" ] && CHECK=yes

OUT=src/lib/supabase/database.types.ts
DB=apex_types_$$
psql -q -d postgres -c "create database $DB" >/dev/null
trap 'psql -q -d postgres -c "drop database if exists $DB" >/dev/null 2>&1 || true' EXIT

P="psql -q -v ON_ERROR_STOP=1 -d $DB"
$P -f tests/db/supabase_stubs.sql >/dev/null
for f in supabase/migrations/*.sql; do $P -1 -f "$f" >/dev/null; done

URL="postgresql://${PGUSER:-postgres}:${PGPASSWORD:-}@${PGHOST:-localhost}:${PGPORT:-5432}/$DB"
TMP=$(mktemp /tmp/apex-types-XXXXXX.ts)
trap 'rm -f "$TMP"; psql -q -d postgres -c "drop database if exists $DB" >/dev/null 2>&1 || true' EXIT

{
  echo "// GENERATED from the database built by supabase/migrations: do not edit by hand."
  echo "// Regenerate after every migration: scripts/types/generate.sh (the Checks job fails when this file is out of date)."
  npx --yes supabase@3 gen types typescript --db-url "$URL" 2>/dev/null
} > "$TMP"
npx --yes oxfmt "$TMP" >/dev/null 2>&1

if [ ! -s "$TMP" ] || ! grep -q "export type Database" "$TMP"; then
  echo "generate.sh: the generator produced nothing usable; the file was left alone." >&2
  exit 1
fi

if [ "$CHECK" = yes ]; then
  if diff -q "$OUT" "$TMP" >/dev/null 2>&1; then
    echo "database.types.ts is up to date with the migrations."
  else
    echo "database.types.ts does NOT match the migrations. Run scripts/types/generate.sh and commit the result." >&2
    diff "$OUT" "$TMP" | head -40 >&2
    exit 1
  fi
else
  cp "$TMP" "$OUT"
  echo "wrote $OUT"
fi
