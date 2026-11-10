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
for t in *.test.mjs; do echo "== $t"; node "$t"; done
