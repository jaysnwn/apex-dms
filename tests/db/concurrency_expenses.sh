#!/usr/bin/env bash
# Two people pay the same approved ₹500 expense at the same moment, and the same
# payment is sent twice at once. Only ₹500 may ever be paid.
# Usage: PGHOST=/tmp PGPORT=5544 PGUSER=postgres tests/db/concurrency_expenses.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
DB=apex_conc_$$
psql -q -d postgres -c "create database $DB" >/dev/null
trap 'psql -q -d postgres -c "drop database if exists $DB" >/dev/null' EXIT
P="psql -q -X -v ON_ERROR_STOP=1 -d $DB"
$P -f tests/db/supabase_stubs.sql >/dev/null
for f in supabase/migrations/*.sql; do $P -f "$f" >/dev/null 2>&1; done
$P >/dev/null <<'SQL'
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000001', 'a@t', '{"role":"super_admin"}', '{"full_name":"Admin"}'),
  ('00000000-0000-0000-0000-000000000003', 'b@t', '{"role":"billing"}', '{"full_name":"Billing"}'),
  ('00000000-0000-0000-0000-000000000021', 's@t', '{"role":"salesman"}', '{"full_name":"Ravi"}');
update public.profiles set can_reimburse = true where id = '00000000-0000-0000-0000-000000000003';
insert into public.routes (id, name) values ('10000000-0000-0000-0000-000000000021', 'Akole Road');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000021', false);
set role authenticated;
create temp table ids as select (public.expense_save(null, null, (select id from public.expense_categories where code = 'fuel'), 500, current_date,
  '10000000-0000-0000-0000-000000000021', null, 'Petrol', 'cash', 'employee', null, null, true,
  'c0000000-0000-0000-0000-000000000001', 'salesman_app') ->> 'id')::uuid as id;
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
set role authenticated;
select public.expense_review(array(select id from public.expenses), 'approve');
SQL

pay() {  # $1 user, $2 client uuid, $3 seconds to hold the transaction open
  $P -tA 2>&1 <<SQL || true
select set_config('request.jwt.claim.sub', '$1', false);
set role authenticated;
begin;
select 'PAID ' || public.reimburse_expenses(jsonb_build_array(jsonb_build_object('expense_id', (select id from public.expenses limit 1), 'amount', 500)),
  current_date, 'upi', 'UTR', null, null, '$2');
select pg_sleep($3);
commit;
SQL
}

echo "-- two different payments at once"
pay 00000000-0000-0000-0000-000000000001 d0000000-0000-0000-0000-000000000001 2 > /tmp/conc_a.txt &
sleep 0.5
pay 00000000-0000-0000-0000-000000000003 d0000000-0000-0000-0000-000000000002 0 > /tmp/conc_b.txt
wait
grep -h -E "PAID|ERROR" /tmp/conc_a.txt /tmp/conc_b.txt | sed 's/^/   /'
paid=$(grep -h -c PAID /tmp/conc_a.txt /tmp/conc_b.txt | paste -sd+ | bc)
[ "$paid" = "1" ] || { echo "FAIL: $paid payments succeeded"; exit 1; }

echo "-- the same payment sent twice at once (after cancelling the first)"
$P >/dev/null <<'SQL'
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
set role authenticated;
select public.cancel_reimbursement((select id from public.reimbursements where cancelled_at is null), 'test');
SQL
pay 00000000-0000-0000-0000-000000000001 e0000000-0000-0000-0000-000000000001 2 > /tmp/conc_a.txt &
sleep 0.5
pay 00000000-0000-0000-0000-000000000001 e0000000-0000-0000-0000-000000000001 0 > /tmp/conc_b.txt
wait
grep -h -E "PAID|ERROR" /tmp/conc_a.txt /tmp/conc_b.txt | sed 's/^/   /'
[ "$(grep -h PAID /tmp/conc_a.txt)" = "$(grep -h PAID /tmp/conc_b.txt)" ] || { echo "FAIL: retry did not return the same payment"; exit 1; }

total=$($P -tA -c "select reimbursed_amount from public.expenses")
rows=$($P -tA -c "select count(*) from public.reimbursements where cancelled_at is null")
echo "   reimbursed_amount=$total, live payments=$rows"
[ "$total" = "500.00" ] && [ "$rows" = "1" ] || { echo "FAIL"; exit 1; }
echo "CONCURRENCY TESTS PASSED"
