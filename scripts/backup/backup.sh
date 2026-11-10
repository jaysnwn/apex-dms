#!/usr/bin/env bash
# Nightly backup of the DMS production database, with a restore check.
#
#   SOURCE_URL          production connection string (session pooler, port 5432)
#   RESTORE_URL         an EMPTY scratch Postgres 17 database (the CI service)
#   BACKUP_PASSPHRASE   passphrase the backup file is encrypted with
#   OUT_DIR             where the encrypted backup is written (default ./backup-out)
#   SIZE_WARN_MB        warn when the database is larger (default 400; free plan cap 500)
#
# Steps, all against ONE snapshot of production so nothing written meanwhile
# can make the check pass or fail by accident:
#   1. open a read-only transaction and export its snapshot
#   2. fingerprint every table in that snapshot (row count + checksum)
#   3. pg_dump from the same snapshot
#   4. restore the dump into the scratch database and fingerprint it
#   5. the two fingerprints must be identical, else the job fails
#   6. encrypt the dump (AES-256) and write its checksum
# Session and token tables are left out (nobody needs old sessions after a
# restore, and they would let someone take over a login). Nothing here prints
# business data: only table names, counts and checksums.
set -euo pipefail

: "${SOURCE_URL:?}" "${RESTORE_URL:?}" "${BACKUP_PASSPHRASE:?}"
OUT_DIR=${OUT_DIR:-./backup-out}
SIZE_WARN_MB=${SIZE_WARN_MB:-400}
HERE=$(cd "$(dirname "$0")" && pwd)
STAMP=$(date -u +%Y-%m-%dT%H%MZ)
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$OUT_DIR"

NO_DATA=(auth.sessions auth.refresh_tokens auth.flow_state auth.one_time_tokens
         auth.mfa_challenges auth.audit_log_entries auth.mfa_amr_claims)
EXCLUDE=()
for t in "${NO_DATA[@]}"; do EXCLUDE+=(--exclude-table-data="$t"); done

log() { echo "[$(date -u +%H:%M:%S)] $*"; }

# 1. a transaction that holds the snapshot open while we work
mkfifo "$WORK/in"
psql "$SOURCE_URL" -X -qAt -v ON_ERROR_STOP=1 < "$WORK/in" > "$WORK/holder.out" 2> "$WORK/holder.err" &
HOLDER=$!
exec 3> "$WORK/in"
echo "begin isolation level repeatable read read only; select pg_export_snapshot();" >&3
for _ in $(seq 1 60); do [ -s "$WORK/holder.out" ] && break; sleep 1; done
SNAP=$(head -n1 "$WORK/holder.out")
[ -n "$SNAP" ] || { cat "$WORK/holder.err" >&2; echo "could not open a snapshot" >&2; exit 1; }
log "snapshot $SNAP"

SIZE_MB=$(psql "$SOURCE_URL" -X -qAt -c "select pg_database_size(current_database()) / 1048576")
log "database size ${SIZE_MB} MB"

# 2. fingerprint inside the snapshot
psql "$SOURCE_URL" -X -qAt -v ON_ERROR_STOP=1 \
  -c "begin isolation level repeatable read read only" \
  -c "set transaction snapshot '$SNAP'" \
  -f "$HERE/fingerprint.sql" -c "commit" > "$WORK/source.txt"
log "fingerprinted $(wc -l < "$WORK/source.txt") tables"

# 3. dump the same snapshot
pg_dump "$SOURCE_URL" --snapshot="$SNAP" --format=custom --compress=9 \
  --schema=public --schema=auth --schema=storage --schema=mt_rollback --schema=supabase_migrations \
  "${EXCLUDE[@]}" --file="$WORK/db.dump"
echo "commit;" >&3; exec 3>&-; wait "$HOLDER" || true
log "dump $(du -h "$WORK/db.dump" | cut -f1)"

# 4. restore into the scratch database
psql "$RESTORE_URL" -X -q -v ON_ERROR_STOP=1 -f "$HERE/restore_prep.sql"
set +e
pg_restore --dbname="$RESTORE_URL" --no-owner --no-acl "$WORK/db.dump" 2> "$WORK/restore.err"
set -e
ERRS=$(grep -c "^pg_restore: error" "$WORK/restore.err" || true)
log "restore finished with $ERRS error(s)"
[ "$ERRS" = 0 ] || sed -n '1,40p' "$WORK/restore.err" >&2
psql "$RESTORE_URL" -X -qAt -v ON_ERROR_STOP=1 -f "$HERE/fingerprint.sql" > "$WORK/restored.txt"

# 5. identical, or fail
if ! diff -u "$WORK/source.txt" "$WORK/restored.txt" > "$WORK/fingerprint.diff"; then
  echo "RESTORE CHECK FAILED: restored data differs from production" >&2
  cut -d'|' -f1,2 "$WORK/fingerprint.diff" >&2
  exit 1
fi
ROWS=$(awk -F'|' '{s += $2} END {print s}' "$WORK/source.txt")
log "restore check passed: $(wc -l < "$WORK/source.txt") tables, $ROWS rows identical"

# 6. encrypt
NAME="dms-$STAMP.dump.gpg"
gpg --batch --yes --pinentry-mode loopback --symmetric --cipher-algo AES256 \
    --passphrase-fd 4 --output "$OUT_DIR/$NAME" "$WORK/db.dump" 4<<<"$BACKUP_PASSPHRASE"
(cd "$OUT_DIR" && sha256sum "$NAME" > "$NAME.sha256")
cp "$WORK/source.txt" "$OUT_DIR/dms-$STAMP.fingerprint.txt"   # names, counts, checksums: no business data

SUMMARY=${GITHUB_STEP_SUMMARY:-/dev/stdout}
{
  echo "### DMS backup $STAMP"
  echo "- database size: ${SIZE_MB} MB of 500 MB (free plan)"
  echo "- tables checked: $(wc -l < "$WORK/source.txt"), rows: $ROWS, restore identical: yes"
  echo "- restore warnings: $ERRS"
  echo "- file: $NAME ($(du -h "$OUT_DIR/$NAME" | cut -f1))"
} >> "$SUMMARY"
if [ "$SIZE_MB" -ge "$SIZE_WARN_MB" ]; then
  echo "::warning::Database is ${SIZE_MB} MB; the free plan stops at 500 MB. Plan the upgrade now."
fi
if [ "$ERRS" != 0 ]; then
  echo "::warning::pg_restore reported $ERRS error(s); data matched, but read the log."
fi
