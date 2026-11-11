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
for t in *.test.mjs; do echo "== $t"; node "$t"; done
