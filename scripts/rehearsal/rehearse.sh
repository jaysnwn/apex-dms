#!/usr/bin/env bash
# Upgrade rehearsal on a copy of PRODUCTION data. Production is only read.
#
#   SOURCE_URL   production connection string (read-only use: pg_dump + SELECTs)
#   RESTORE_URL  an EMPTY scratch Postgres 17 database (the CI service)
#   SKIP_DUMP=1  for testing: RESTORE_URL already holds a database at 0018
#
# 1. dump production (one consistent read-only snapshot) and restore it into
#    the scratch database WITH owners and grants, plus production's ensure_rls
#    event trigger (database-level, so not in a schema dump)
# 2. check the restore is identical to production (row counts + checksums)
# 3. record: schema fingerprint, business totals, a checksum of every row,
#    and what every existing login can see through row-level security
# 4. apply migrations 0019-0027, each in one transaction, as on Supabase
# 5. check: every old row unchanged, every row stamped Apex, business totals
#    equal, every login sees the same as before
# 6. roll back to 0018 with the rollback scripts and check schema, totals and
#    every row are exactly as before the upgrade
# The repository is public, so this prints only PASS/FAIL, table names and
# counts: never data, amounts or names.
set -euo pipefail
: "${RESTORE_URL:?}"
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../.." && pwd)
APEX=a9e70000-0000-4000-8000-000000000001
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
SUMMARY=${GITHUB_STEP_SUMMARY:-$WORK/summary.md}
FAILS=0
log()  { echo "[$(date -u +%H:%M:%S)] $*"; }
pass() { log "PASS  $*"; echo "| $* | PASS |" >> "$SUMMARY"; }
fail() { log "FAIL  $*"; echo "| $* | **FAIL** |" >> "$SUMMARY"; FAILS=$((FAILS + 1)); }
Q()    { psql "$RESTORE_URL" -X -qAt -v ON_ERROR_STOP=1 "$@"; }
{ echo "### Upgrade rehearsal on production data"; echo; echo "| Check | Result |"; echo "|---|---|"; } >> "$SUMMARY"

if [ "${SKIP_DUMP:-}" != 1 ]; then
  : "${SOURCE_URL:?}"
  NO_DATA=(auth.sessions auth.refresh_tokens auth.flow_state auth.one_time_tokens
           auth.mfa_challenges auth.audit_log_entries auth.mfa_amr_claims)
  EXCLUDE=(); for t in "${NO_DATA[@]}"; do EXCLUDE+=(--exclude-table-data="$t"); done
  psql "$SOURCE_URL" -X -qAt -v ON_ERROR_STOP=1 -c "begin isolation level repeatable read read only" \
    -f "$ROOT/scripts/backup/fingerprint.sql" -c "commit" > "$WORK/source.txt"
  pg_dump "$SOURCE_URL" --serializable-deferrable --format=custom \
    --schema=public --schema=auth --schema=storage --schema=supabase_migrations \
    "${EXCLUDE[@]}" --file="$WORK/db.dump"
  log "production dumped ($(du -h "$WORK/db.dump" | cut -f1)), read-only"
  Q -f "$HERE/prep.sql"
  set +e; pg_restore --dbname="$RESTORE_URL" "$WORK/db.dump" 2> "$WORK/restore.err"; set -e
  ERRS=$(grep -c "^pg_restore: error" "$WORK/restore.err" || true)
  log "restored with owners and grants, $ERRS error(s)"
  [ "$ERRS" = 0 ] || grep "^pg_restore: error" "$WORK/restore.err" | sed 's/DETAIL.*//' | head -20
  Q -c "create event trigger ensure_rls on ddl_command_end when tag in ('CREATE TABLE','CREATE TABLE AS','SELECT INTO') execute function public.rls_auto_enable()"
  Q -f "$ROOT/scripts/backup/fingerprint.sql" > "$WORK/restored.txt"
  if diff -q "$WORK/source.txt" "$WORK/restored.txt" >/dev/null; then
    pass "Copy identical to production ($(wc -l < "$WORK/source.txt") tables, $(awk -F'|' '{s+=$2} END {print s}' "$WORK/source.txt") rows)"
  else
    fail "Copy identical to production"; diff "$WORK/source.txt" "$WORK/restored.txt" | cut -d'|' -f1,2 || true
  fi
fi

VERSION=$(Q -c "select max(version) from supabase_migrations.schema_migrations" 2>/dev/null || echo "?")
log "schema version before: $VERSION"

# 3. before
Q -f "$ROOT/tests/db/schema_fingerprint.sql" > "$WORK/schema0.txt"
Q -f "$HERE/functions.sql" > "$WORK/fn0.txt"
Q -f "$ROOT/tests/db/snapshot.sql" > "$WORK/biz0.json"
Q -f "$HERE/rows_before.sql"
Q -v phase=before -f "$HERE/visible.sql"
log "recorded: $(Q -c 'select count(*) from rh.rows') rows in $(Q -c 'select count(*) from rh.cols') tables, $(Q -c "select count(distinct who) from rh.visible") logins"

# 4. upgrade
for f in "$ROOT"/supabase/migrations/2026111000001[9]_*.sql "$ROOT"/supabase/migrations/2026111000002[0-9]_*.sql; do
  [ -e "$f" ] || continue
  n=$(basename "$f" | cut -d_ -f1 | tail -c 5)
  s=$(date +%s%N)
  if Q -1 -f "$f" > "$WORK/m.out" 2>&1; then
    log "migration $n applied in $(( ($(date +%s%N) - s) / 1000000 )) ms"
  else
    fail "Migration $n applies"; sed -n '1,15p' "$WORK/m.out"; break
  fi
done
[ "$FAILS" = 0 ] && pass "All upgrade migrations (0019-0027) applied, each in one transaction"

if [ "$FAILS" = 0 ]; then
  # 5. after
  Q -F '|' -f "$HERE/rows_after.sql" > "$WORK/rows.txt"
  BAD=$(awk -F'|' '$4 > 0' "$WORK/rows.txt")
  if [ -z "$BAD" ]; then pass "Every existing row unchanged ($(awk -F'|' '{s+=$2} END {print s}' "$WORK/rows.txt") rows in $(wc -l < "$WORK/rows.txt") tables)"
  else fail "Every existing row unchanged"; echo "$BAD" | cut -d'|' -f1,4 | sed 's/^/  missing or changed: /'; fi
  awk -F'|' '$5 > 0 {print "  rows added by the upgrade: " $1 " +" $5}' "$WORK/rows.txt"

  Q -f "$HERE/ownership.sql" > "$WORK/own.txt"
  NOT_APEX=$(grep -v '^tables:' "$WORK/own.txt" | paste -sd, - || true)
  STAMPED=$(grep '^tables:' "$WORK/own.txt" | cut -d: -f2)
  if [ -z "$NOT_APEX" ]; then pass "Every row in all $STAMPED business tables belongs to APEX TRADING CO."
  else fail "Every row belongs to APEX TRADING CO."; echo "  not Apex: $NOT_APEX"; fi

  TEN=$(Q -c "select count(*) from public.tenants")
  MEM=$(Q -c "select (select count(*) from public.profiles) = (select count(*) from public.tenant_members where tenant_id = '$APEX')")
  if [ "$TEN" = 1 ] && [ "$MEM" = t ]; then pass "One business (Apex); every existing user is its member"
  else fail "One business, every user a member (tenants=$TEN, members match=$MEM)"; fi

  Q -f "$ROOT/tests/db/snapshot.sql" > "$WORK/biz1.json"
  DIFF=$(jq -rn --slurpfile a "$WORK/biz0.json" --slurpfile b "$WORK/biz1.json" '
    ($a[0]) as $x | ($b[0]) as $y |
    [ ($x | keys[]) as $k | select($k != "row_counts") | select($x[$k] != $y[$k]) | $k ] +
    [ ($x.row_counts | keys[]) as $t | select($x.row_counts[$t] != $y.row_counts[$t]) | "rows of " + $t ] | join(", ")')
  if [ -z "$DIFF" ]; then pass "Business totals identical (sales, payments, stock by product and warehouse, balances, ledger, expenses, number series, audit)"
  else fail "Business totals identical"; echo "  differ: $DIFF"; fi

  Q -v phase=after -f "$HERE/visible.sql"
  VIS=$(Q -c "select string_agg(format('login %s %s: %s -> %s', b.who, b.obj, b.n, a.n), '; ')
              from rh.visible b join rh.visible a on a.who = b.who and a.obj = b.obj and a.phase = 'after'
             where b.phase = 'before' and a.n is distinct from b.n")
  if [ -z "$VIS" ]; then pass "Every login sees exactly the same records as before ($(Q -c "select count(*) from rh.visible where phase='after'") checks)"
  else fail "Every login sees the same records"; echo "  $VIS"; fi

  # 6. roll back
  for f in $(ls -r "$ROOT"/supabase/rollback/2026111000002*_down.sql); do
    if ! Q -1 -f "$f" > "$WORK/r.out" 2>&1; then fail "Rollback $(basename "$f") applies"; sed -n '1,15p' "$WORK/r.out"; break; fi
  done
  if [ "$FAILS" = 0 ]; then
    Q -f "$ROOT/tests/db/schema_fingerprint.sql" > "$WORK/schema2.txt"
    Q -f "$HERE/functions.sql" > "$WORK/fn2.txt"
    Q -f "$ROOT/tests/db/snapshot.sql" > "$WORK/biz2.json"
    Q -c "truncate rh.after" -c "drop table rh.after" >/dev/null
    Q -F '|' -f "$HERE/rows_after.sql" > "$WORK/rows2.txt"
    # Functions are compared on their logic: production's copies were stored
    # without comments (stripped by the tool that applied 0001-0018), while a
    # rollback restores some from the migration files, comments included.
    FN_CODE=$(join -t'|' -a1 -a2 -e MISSING -o 0,1.3,2.3 "$WORK/fn0.txt" "$WORK/fn2.txt" | awk -F'|' '$2 != $3 {print $1}' | paste -sd, -)
    FN_NOTE=$(join -t'|' -a1 -a2 -e MISSING -o 0,1.2,1.3,2.2,2.3 "$WORK/fn0.txt" "$WORK/fn2.txt" | awk -F'|' '$2 != $4 && $3 == $5 {print $1}' | paste -sd, -)
    OTHER=$(diff "$WORK/schema0.txt" "$WORK/schema2.txt" | grep '^[<>]' | cut -d'|' -f1 | sed 's/^[<>] //' | grep -v '^functions$' | sort -u | paste -sd, - || true)
    ROWDIFF=$(awk -F'|' '$4 > 0 || $5 > 0 {print $1}' "$WORK/rows2.txt" | paste -sd, -)
    if [ -z "$FN_CODE" ] && [ -z "$OTHER" ] && [ -z "$ROWDIFF" ] && cmp -s "$WORK/biz0.json" "$WORK/biz2.json"; then
      pass "Rollback to 0018 returns schema, function logic, totals and every row exactly to the starting state"
      [ -z "$FN_NOTE" ] || { log "  note: comments differ in $FN_NOTE (logic identical)"; echo "| Note: only comments differ in $FN_NOTE after rollback | info |" >> "$SUMMARY"; }
    else
      fail "Rollback returns exactly to the starting state"
      [ -z "$FN_CODE" ] || echo "  function logic differs: $FN_CODE"
      [ -z "$OTHER" ] || echo "  schema differs in: $OTHER"
      [ -z "$ROWDIFF" ] || echo "  rows differ in: $ROWDIFF"
      cmp -s "$WORK/biz0.json" "$WORK/biz2.json" || echo "  business totals differ"
    fi
  fi
fi

echo >> "$SUMMARY"
if [ "$FAILS" = 0 ]; then echo "**Rehearsal passed.** Production was only read." >> "$SUMMARY"; log "REHEARSAL PASSED"
else echo "**Rehearsal failed: $FAILS check(s).** Production was only read." >> "$SUMMARY"; log "REHEARSAL FAILED ($FAILS)"; fi
[ -z "${GITHUB_STEP_SUMMARY:-}" ] && cat "$SUMMARY"
exit "$FAILS"
