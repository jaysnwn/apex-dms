#!/usr/bin/env bash
# Health check of the live app, run every 15 minutes by .github/workflows/monitor.yml.
# Exits non-zero when something needs attention; GitHub then e-mails the owner.
#
#   LIVE_URL     the live app, e.g. https://apex-dms-livid.vercel.app
#   DB_URL       production database (read-only use)
#   SINCE        ISO time of the previous check (errors after it are new)
#
# Checks:
#   1. the sign-in page answers 200 within SLOW_S seconds (default 8)
#   2. the database answers; its size against the free plan's 500 MB
#   3. new errors in the error log (ops.app_errors, present after the upgrade):
#      any server error, or BROWSER_MAX (default 3) or more browser errors
# The repository is public: only page addresses and counts are printed, never
# error messages, names or data.
set -uo pipefail
: "${LIVE_URL:?}" "${DB_URL:?}"
SINCE=${SINCE:-$(date -u -d '-30 min' +%Y-%m-%dT%H:%M:%SZ)}
SLOW_S=${SLOW_S:-8}
BROWSER_MAX=${BROWSER_MAX:-3}
SIZE_WARN_MB=${SIZE_WARN_MB:-400}
SIZE_FAIL_MB=${SIZE_FAIL_MB:-450}
PROBLEMS=()
SUMMARY=${GITHUB_STEP_SUMMARY:-/dev/stdout}
note() { echo "$*"; echo "- $*" >> "$SUMMARY"; }
problem() { echo "::error::$*"; echo "- **$***" >> "$SUMMARY"; PROBLEMS+=("$*"); }

echo "### Live app check $(date -u +%Y-%m-%dT%H:%MZ)" >> "$SUMMARY"
note "errors counted since $SINCE"

# 1. the app
OUT=$(curl -sS -o /tmp/login.html -w '%{http_code} %{time_total}' --max-time 30 "$LIVE_URL/login" 2>&1) || OUT="000 30"
CODE=${OUT%% *}; SECS=${OUT##* }
if [ "$CODE" != 200 ]; then
  problem "Live app is not answering: sign-in page returned $CODE"
elif ! grep -qi 'type="password"' /tmp/login.html; then
  problem "Live app answered, but the sign-in form is missing"
elif awk -v s="$SECS" -v m="$SLOW_S" 'BEGIN { exit !(s > m) }'; then
  problem "Live app is slow: sign-in page took ${SECS}s (limit ${SLOW_S}s)"
else
  note "live app up: sign-in page in ${SECS}s"
fi

# 2. the database
if ! SIZE=$(psql "$DB_URL" -X -qAt -v ON_ERROR_STOP=1 -c "select pg_database_size(current_database()) / 1048576" 2>/tmp/db.err); then
  if grep -q "password authentication failed" /tmp/db.err; then WHY="sign-in refused: check the PROD_DB_URL secret"
  elif grep -qi "timeout\|timed out" /tmp/db.err; then WHY="no answer in time: the project may be paused or down"
  else WHY="connection failed: the project may be paused; open the Supabase dashboard"; fi
  problem "Database is not answering ($WHY)"
else
  if [ "$SIZE" -ge "$SIZE_FAIL_MB" ]; then problem "Database is ${SIZE} MB: the free plan stops at 500 MB"
  elif [ "$SIZE" -ge "$SIZE_WARN_MB" ]; then echo "::warning::Database is ${SIZE} MB of 500 MB"; note "database ${SIZE} MB of 500 MB (plan the upgrade)"
  else note "database up: ${SIZE} MB of 500 MB"; fi

  # 3. the error log
  HAS_LOG=$(psql "$DB_URL" -X -qAt -c "select to_regclass('ops.app_errors') is not null")
  if [ "$HAS_LOG" != t ]; then
    note "error log not installed yet (it comes with the multi-business upgrade)"
  else
    if ! psql "$DB_URL" -X -qAt -F '|' -v ON_ERROR_STOP=1 -v since="$SINCE" > /tmp/errors.txt 2>/tmp/errq.err <<'SQL'
select source, coalesce(nullif(split_part(path, '?', 1), ''), '-'), count(*)
  from ops.app_errors where at > :'since'::timestamptz group by 1, 2 order by 3 desc limit 20;
SQL
    then
      problem "Could not read the error log"; : > /tmp/errors.txt; LOG_FAILED=1
    fi
    SERVER=$(awk -F'|' '$1 == "server" {s += $3} END {print s + 0}' /tmp/errors.txt)
    BROWSER=$(awk -F'|' '$1 == "browser" {s += $3} END {print s + 0}' /tmp/errors.txt)
    if [ -s /tmp/errors.txt ]; then
      sed 's/|/  /g; s/^/  /' /tmp/errors.txt
      awk -F'|' '{print "  - " $1 " error on " $2 ": " $3}' /tmp/errors.txt >> "$SUMMARY"
    fi
    if [ "$SERVER" -gt 0 ]; then problem "$SERVER new server error(s): open System health in the app to read them"
    elif [ "$BROWSER" -ge "$BROWSER_MAX" ]; then problem "$BROWSER new browser errors: open System health in the app to read them"
    elif [ -z "${LOG_FAILED:-}" ]; then note "error log: $SERVER server and $BROWSER browser error(s) since the last check"; fi
  fi
fi

if [ "${#PROBLEMS[@]}" -gt 0 ]; then
  echo "NEEDS ATTENTION: ${#PROBLEMS[@]} problem(s)"; exit 1
fi
echo "ALL GOOD"
