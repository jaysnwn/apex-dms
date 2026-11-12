#!/usr/bin/env bash
# App logic tests that need no browser and no database.
# Usage: tests/app/run.sh
set -euo pipefail
cd "$(dirname "$0")"
rm -rf build && mkdir -p build
npx --yes esbuild@0.25 ../../src/lib/supabase/client.ts --bundle --format=esm --platform=neutral \
  --outfile=build/client.mjs --external:@supabase/ssr --log-level=error
# the Supabase browser client is not needed for these tests
sed -i 's#^import { createBrowserClient } from "@supabase/ssr";#const createBrowserClient = () => null;#' build/client.mjs
npx esbuild@0.25 ../../src/lib/search-words.ts --format=esm --outfile=build/search-words.mjs --log-level=error
npx esbuild@0.25 ../../src/lib/password-policy.ts --format=esm --outfile=build/password-policy.mjs --log-level=error
npx esbuild@0.25 ../../src/lib/supabase/row-cap.ts --bundle --format=esm --outfile=build/row-cap.mjs --log-level=error
npx esbuild@0.25 ../../src/lib/all-rows.ts --format=esm --outfile=build/all-rows.mjs --log-level=error
npx esbuild@0.25 ../../src/lib/offline-reset.ts --format=esm --outfile=build/offline-reset.mjs --log-level=error
python3 client-imports.check.py
# zod's .uuid() rejects ids Postgres accepts (e.g. 31000000-0000-0000-0000-000000000001),
# so forms silently refused those records. Use .guid() for database ids.
if grep -rn "\.uuid(" ../../src; then echo "FAIL  use .guid() for ids, not .uuid()"; exit 1; fi
echo "ok  id checks accept every id the database accepts (.guid, not .uuid)"
# Clock times must go through time()/dateTime() in src/lib/format.ts (India time):
# the server runs in UTC, so a bare toLocaleTimeString shows times 5.5 h off.
if grep -rn "toLocaleTimeString(" ../../src | grep -v "src/lib/format.ts"; then echo "FAIL  use time() from @/lib/format for clock times"; exit 1; fi
echo "ok  clock times are shown in India time"
# PDFs need pdfkit's built-in fonts in the deployed bundle (see next.config.ts).
grep -q 'pdfkit/js/standard-fonts' ../../next.config.ts || { echo "FAIL  next.config.ts must include pdfkit's standard fonts"; exit 1; }
echo "ok  PDF fonts are included in the deployment"
# A function is changed by writing it out in full, never by reading its stored text and
# replacing a line (audit finding 1: the repository must show the code that runs).
# Migrations up to 0028 did that; 0029 restates those functions in full.
for f in ../../supabase/migrations/*.sql; do
  n=$(basename "$f" | cut -d_ -f1 | tail -c 5)
  [ "$((10#$n))" -gt 29 ] || continue
  if grep -n "pg_get_functiondef" "$f"; then echo "FAIL  $(basename "$f"): write the whole function with create or replace, do not patch its stored text"; exit 1; fi
done
echo "ok  migrations after 0029 state functions in full"
# Shared components and library code must not reach into a page folder
# (audit finding 13): what several screens use lives in src/components or src/lib.
if grep -rnE 'from "(@/app/|(\.\./)+app/)' ../../src/components ../../src/lib; then echo "FAIL  shared code imports from a page folder: move the shared piece to src/lib or src/components"; exit 1; fi
echo "ok  shared code does not depend on page folders"
for t in *.test.mjs; do echo "== $t"; node "$t"; done
