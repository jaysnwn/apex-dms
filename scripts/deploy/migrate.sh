#!/usr/bin/env bash
# Applies the migrations production has not seen yet, oldest first, each in one
# transaction, exactly as Supabase applies them.
#
#   TARGET_URL   the database to migrate (the production pooler URL)
#   DRY_RUN=1    list what would be applied and stop
#
# What it will not do:
#   * skip ahead: migrations are applied in file order, never out of order
#   * repeat one: a migration whose name is already recorded is left alone
#   * carry on after a failure: a migration that raises stops the whole run,
#     and because each runs in its own transaction, the failed one leaves
#     nothing behind
#
# Each file is recorded in supabase_migrations.schema_migrations under its own
# name, so the next run knows it is done and the Supabase dashboard lists it.
set -euo pipefail
: "${TARGET_URL:?set TARGET_URL to the database to migrate}"
cd "$(dirname "$0")/../.."

Q() { psql "$TARGET_URL" -X -qAt -v ON_ERROR_STOP=1 "$@"; }

echo "Reading what this database has already had applied..."
APPLIED=$(Q -c "select coalesce(string_agg(name, '|'), '') from supabase_migrations.schema_migrations where name is not null")

PENDING=()
for f in supabase/migrations/*.sql; do
  base=$(basename "$f" .sql)
  name=${base#*_}
  case "|$APPLIED|" in
    *"|$name|"*) continue ;;
  esac
  PENDING+=("$f")
done

if [ ${#PENDING[@]} -eq 0 ]; then
  echo "Nothing to apply: the database is up to date with supabase/migrations."
  exit 0
fi

echo "To apply, in this order:"
for f in "${PENDING[@]}"; do echo "  $(basename "$f")"; done

if [ "${DRY_RUN:-}" = 1 ]; then
  echo "DRY_RUN=1: nothing was applied."
  exit 0
fi

for f in "${PENDING[@]}"; do
  base=$(basename "$f" .sql)
  version=${base%%_*}
  name=${base#*_}
  printf '[%s] applying %s ... ' "$(date -u +%H:%M:%S)" "$name"
  start=$(date +%s%3N)
  # One transaction for the migration and the line that records it, so a
  # database can never be left having run a migration it does not remember.
  psql "$TARGET_URL" -X -q -v ON_ERROR_STOP=1 --single-transaction \
    -f "$f" \
    -c "insert into supabase_migrations.schema_migrations (version, name) values ('$version', '$name') on conflict (version) do nothing"
  echo "done in $(( $(date +%s%3N) - start )) ms"
done

echo
echo "Applied ${#PENDING[@]} migration(s). The database now reports:"
Q -c "select '  ' || version || '  ' || coalesce(name, '') from supabase_migrations.schema_migrations order by version desc limit 5"
