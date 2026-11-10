#!/usr/bin/env bash
# Backs up every file in Supabase Storage (receipts, delivery proofs, visit
# photos, product images, documents) into one encrypted archive, and checks
# that the number and total size of downloaded files match the database.
#
#   SOURCE_URL          production database connection string (reads storage.objects)
#   SUPABASE_URL        https://<project>.supabase.co
#   SERVICE_ROLE_KEY    service key (reads private buckets); never printed
#   BACKUP_PASSPHRASE   same passphrase as the database backup
#   OUT_DIR             output folder (default ./backup-out)
set -euo pipefail
: "${SOURCE_URL:?}" "${SUPABASE_URL:?}" "${SERVICE_ROLE_KEY:?}" "${BACKUP_PASSPHRASE:?}"
OUT_DIR=${OUT_DIR:-./backup-out}
STAMP=$(date -u +%Y-%m-%dT%H%MZ)
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$OUT_DIR" "$WORK/files"

psql "$SOURCE_URL" -X -qAt -F $'\t' -c \
  "select bucket_id, name, coalesce((metadata->>'size')::bigint, -1) from storage.objects order by bucket_id, name" \
  > "$WORK/list.tsv"
EXPECTED=$(wc -l < "$WORK/list.tsv")

GOT=0; FAILED=0
while IFS=$'\t' read -r bucket name size; do
  path=$(python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1]))' "$name")
  mkdir -p "$WORK/files/$bucket/$(dirname "$name")"
  if curl -sf --retry 3 -H "Authorization: Bearer $SERVICE_ROLE_KEY" -H "apikey: $SERVICE_ROLE_KEY" \
       -o "$WORK/files/$bucket/$name" "$SUPABASE_URL/storage/v1/object/$bucket/$path"; then
    actual=$(stat -c %s "$WORK/files/$bucket/$name")
    if [ "$size" != "-1" ] && [ "$actual" != "$size" ]; then
      echo "size mismatch: $bucket/<file $GOT>" >&2; FAILED=$((FAILED + 1))
    fi
    GOT=$((GOT + 1))
  else
    echo "download failed: $bucket/<file $((GOT + FAILED + 1))>" >&2; FAILED=$((FAILED + 1))
  fi
done < "$WORK/list.tsv"

echo "files: $GOT of $EXPECTED downloaded, $FAILED problem(s)"
[ "$FAILED" = 0 ] && [ "$GOT" = "$EXPECTED" ] || { echo "FILE BACKUP INCOMPLETE" >&2; exit 1; }

NAME="dms-files-$STAMP.tar.gz.gpg"
tar -C "$WORK/files" -czf - . | gpg --batch --yes --pinentry-mode loopback --symmetric --cipher-algo AES256 \
  --passphrase-fd 4 --output "$OUT_DIR/$NAME" 4<<<"$BACKUP_PASSPHRASE"
(cd "$OUT_DIR" && sha256sum "$NAME" > "$NAME.sha256")
echo "- files: $GOT, archive $NAME ($(du -h "$OUT_DIR/$NAME" | cut -f1))" >> "${GITHUB_STEP_SUMMARY:-/dev/stdout}"
