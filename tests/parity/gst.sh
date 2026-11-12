#!/usr/bin/env bash
# The GST maths exists twice (audit finding 16): public.calc_line in SQL, which
# decides what is saved and printed, and src/lib/gst.ts in the browser, which
# shows the salesman what the line will come to while they type. If the two
# ever disagree, a shop is quoted one figure on screen and invoiced another.
#
# This runs the same grid of lines through both and insists every paisa match.
# Needs Postgres (PGHOST/PGPORT/PGUSER) and Node; the Checks workflow runs it
# in the database job, which has both.
set -euo pipefail
cd "$(dirname "$0")/../.."

DB=apex_gst_$$
psql -q -d postgres -c "create database $DB" >/dev/null
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"; psql -q -d postgres -c "drop database if exists $DB" >/dev/null 2>&1 || true' EXIT

P="psql -q -v ON_ERROR_STOP=1 -d $DB"
$P -f tests/db/supabase_stubs.sql >/dev/null
for f in supabase/migrations/*.sql; do $P -1 -f "$f" >/dev/null; done

# the browser's version, as the browser gets it
npx --yes esbuild@0.25 src/lib/gst.ts --format=esm --outfile="$WORK/gst.mjs" --log-level=error

# every line the grid makes, with what the database says it comes to.
# Quantities, prices, discounts and rates are chosen to land on the awkward
# cases: a half-paisa, a third of a percent, a price that is already inclusive.
# The grid stays inside what the columns can hold, because a line that cannot
# be stored cannot be previewed either: unit_price is numeric(12,2), qty
# numeric(12,3), discount_pct and gst_rate numeric(5,2). The check below fails
# if those ever widen, so this grid cannot quietly stop covering the domain.
$P -tAc "
do \$\$
begin
  if (select numeric_scale from information_schema.columns
       where table_schema='public' and table_name='invoice_lines' and column_name='unit_price') <> 2
  or (select numeric_scale from information_schema.columns
       where table_schema='public' and table_name='invoice_lines' and column_name='qty') <> 3
  or (select numeric_scale from information_schema.columns
       where table_schema='public' and table_name='invoice_lines' and column_name='discount_pct') <> 2
  or (select numeric_scale from information_schema.columns
       where table_schema='public' and table_name='invoice_lines' and column_name='gst_rate') <> 2 then
    raise exception 'gst parity: an invoice line column changed its number of decimals; widen the grid in tests/parity/gst.sh to match';
  end if;
end \$\$;" >/dev/null

psql -q -d "$DB" -X -At -F ',' -v ON_ERROR_STOP=1 <<'SQL' > "$WORK/sql.csv"
select q.v, p.v, m.v, d.v, r.v,
       to_char(c.gross,   'FM999999999990.00'),
       to_char(c.discount,'FM999999999990.00'),
       to_char(c.taxable, 'FM999999999990.00'),
       to_char(c.tax,     'FM999999999990.00')
  from (values (1),(2),(3),(7),(0.5),(12.5),(0.125),(7.333),(100),(999.999)) q(v)
 cross join (values (0.01),(0.07),(1.00),(2.35),(9.99),(14.50),(99.95),(100.00),(123.45),(1199.00),(99999.99)) p(v)
 cross join (values ('inclusive'::public.price_tax_mode),('exclusive')) m(v)
 cross join (values (0),(0.01),(2.50),(7.00),(33.33),(99.99),(100.00)) d(v)
 cross join (values (0),(0.25),(3),(5),(12),(18),(28)) r(v)
 cross join lateral public.calc_line(q.v, p.v, m.v, d.v, r.v) c
 order by 1,2,3,4,5
SQL

node --input-type=module <<NODE
import { readFileSync } from "node:fs";
const { calcLine } = await import("$WORK/gst.mjs");
const rows = readFileSync("$WORK/sql.csv", "utf8").trim().split("\n");
const f2 = (n) => n.toFixed(2);
let bad = 0;
for (const line of rows) {
  const [q, p, mode, disc, rate, gross, discount, taxable, tax] = line.split(",");
  const got = calcLine(Number(q), Number(p), mode, Number(disc), Number(rate));
  const diffs = [
    ["gross", gross, f2(got.gross)],
    ["discount", discount, f2(got.discount)],
    ["taxable", taxable, f2(got.taxable)],
    ["tax", tax, f2(got.tax)],
  ].filter(([, a, b]) => a !== b);
  if (diffs.length) {
    if (bad < 15) {
      console.error(
        "FAIL  qty=" + q + " price=" + p + " " + mode + " discount=" + disc + "% gst=" + rate + "% -> " +
        diffs.map(([k, sql, ts]) => k + ": database " + sql + ", browser " + ts).join("; ")
      );
    }
    bad++;
  }
}
if (bad) {
  console.error("FAIL  " + bad + " of " + rows.length + " lines differ between the database and the browser preview");
  process.exit(1);
}
console.log("ok  all " + rows.length + " lines: the browser preview matches the database to the paisa");
NODE
