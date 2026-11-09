-- =============================================================================
-- Unified expenses (0017): office + salesman entry, approval, reimbursement,
-- journal postings. Covers the 17 mandatory scenarios of the expense spec.
-- =============================================================================
\set ON_ERROR_STOP 1
select set_config('request.jwt.claim.sub', '', false);

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000021', 'ravi@apex.test',  '{"role":"salesman"}', '{"full_name":"Ravi Route"}'),
  ('00000000-0000-0000-0000-000000000022', 'kiran@apex.test', '{"role":"salesman"}', '{"full_name":"Kiran Field"}');
insert into public.profile_brands (user_id, brand_id)
select u, b.id from unnest(array['00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000022']::uuid[]) u
cross join public.brands b;
insert into public.routes (id, name, default_salesman_id) values
  ('10000000-0000-0000-0000-000000000021', 'Akole Road', '00000000-0000-0000-0000-000000000021');
-- 002 is a manager without the reimbursement permission; 003 (billing) has it.
update public.profiles set can_reimburse = false where id = '00000000-0000-0000-0000-000000000002';
update public.profiles set can_reimburse = true  where id = '00000000-0000-0000-0000-000000000003';

create schema t;
grant usage on schema t to authenticated;
create table t.x (k text primary key, val uuid);
grant all on t.x to authenticated;

create function t.cat(p_code text) returns uuid language sql stable security definer as $$
  select id from public.expense_categories where code = p_code $$;
create function t.save(p_emp uuid, p_code text, p_amount numeric, p_submit boolean, p_paid_by text default 'employee',
                       p_client uuid default null, p_route uuid default '10000000-0000-0000-0000-000000000021',
                       p_receipt text default null, p_brand uuid default null, p_notes text default null,
                       p_id uuid default null, p_date date default current_date, p_method text default 'cash')
returns uuid language sql as $$
  select (public.expense_save(p_id, p_emp, t.cat(p_code), p_amount, p_date, p_route, p_brand, 'test', p_method,
                              p_paid_by, p_receipt, p_notes, p_submit, p_client, 'office') ->> 'id')::uuid $$;
-- Runs p_sql and requires it to fail with a message matching p_like.
create function t.fails(p_sql text, p_like text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm ilike p_like then return; end if;
    raise exception 'wrong error for [%]: %', p_sql, sqlerrm using errcode = 'ZZ999';
  end;
  raise exception 'expected failure: %', p_sql using errcode = 'ZZ999';
end $$;
create function t.pay(p_exp uuid, p_amount numeric, p_client uuid default null) returns uuid language sql as $$
  select public.reimburse_expenses(jsonb_build_array(jsonb_build_object('expense_id', p_exp, 'amount', p_amount)),
                                   current_date, 'upi', 'UTR123', 'test', null, p_client) $$;
grant execute on all functions in schema t to authenticated;

-- =============================================================================
-- 1, 13. Salesman submits a ₹500 fuel expense; a repeated tap does not duplicate it
-- =============================================================================
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000021', false);
set role authenticated;
do $$ declare v uuid; v2 uuid; r record; begin
  v := t.save(null, 'fuel', 500, true, p_client => 'a0000000-0000-0000-0000-000000000001');
  v2 := t.save(null, 'fuel', 500, true, p_client => 'a0000000-0000-0000-0000-000000000001');
  assert v = v2, 'same client_uuid returns the same expense';
  assert (select count(*) from public.expenses where client_uuid = 'a0000000-0000-0000-0000-000000000001') = 1, 'no duplicate row';
  select * into r from public.expense_list where id = v;
  assert r.status = 'submitted', 'fuel needs approval';
  assert r.source = 'salesman_app', 'salesman source is forced even if the client says office';
  assert r.employee_id = auth.uid() and r.created_by = auth.uid(), 'employee and creator';
  assert r.expense_no like 'APX/EXP/%', 'numbered on submit';
  insert into t.x values ('fuel500', v);

  -- validation (7)
  perform t.fails($q$select t.save(null, 'fuel', -5, true)$q$, '%above zero%');
  perform t.fails($q$select t.save(null, 'fuel', 0, true)$q$, '%above zero%');
  perform t.fails($q$select t.save(null, 'fuel', 10.555, true)$q$, '%2 decimals%');
  perform t.fails($q$select t.save(null, 'fuel', 100, true, p_date => current_date + 2)$q$, '%future%');
  perform t.fails($q$select t.save(null, 'fuel', 100, true, p_date => current_date - 90)$q$, '%older than 60 days%');
  perform t.fails($q$select t.save(null, 'fuel', 100, true, p_route => null)$q$, '%route%');
  -- cannot enter for someone else, nor reference another user's receipt
  perform t.fails($q$select t.save('00000000-0000-0000-0000-000000000022', 'food', 100, true)$q$, '%only your own%');
  perform t.fails($q$select t.save(null, 'food', 100, true, p_receipt => '00000000-0000-0000-0000-000000000022/x.jpg')$q$, '%receipt again%');
  -- receipt rule: Hotel / Stay needs a receipt; a draft may wait for it
  perform t.fails($q$select t.save(null, 'accommodation', 900, true)$q$, '%receipt is required%');
  v := t.save(null, 'accommodation', 900, false);
  assert (select status from public.expenses where id = v) = 'draft' and (select expense_no from public.expenses where id = v) is null, 'draft unnumbered';
  perform t.save(null, 'accommodation', 950, false, p_id => v, p_receipt => auth.uid() || '/bill.jpg');
  assert (select amount from public.expenses where id = v) = 950, 'draft edited';
  assert public.expense_delete(v) = 'deleted', 'draft deleted';
  assert not exists (select 1 from public.expenses where id = v), 'draft gone';

  -- locked after submit (no unrestricted editing), no direct writes
  perform t.fails(format($q$select t.save(null, 'fuel', 450, true, p_id => %L)$q$, (select val from t.x where k = 'fuel500')), '%locked%');
  perform t.fails(format($q$update public.expenses set amount = 1 where id = %L$q$, (select val from t.x where k = 'fuel500')), '%permission denied%');
  perform t.fails($q$insert into public.expenses (employee_id, category_id, amount) values (auth.uid(), t.cat('food'), 5)$q$, '%permission denied%');
  perform t.fails(format($q$delete from public.expenses where id = %L$q$, (select val from t.x where k = 'fuel500')), '%permission denied%');
  perform t.fails(format($q$select public.expense_delete(%L)$q$, (select val from t.x where k = 'fuel500')), '%draft or a returned%');
  -- 8. cannot approve or reimburse
  perform t.fails(format($q$select public.expense_review(array[%L]::uuid[], 'approve')$q$, (select val from t.x where k = 'fuel500')), '%Only a Manager%');
  perform t.fails(format($q$select t.pay(%L, 500)$q$, (select val from t.x where k = 'fuel500')), '%not allowed to reimburse%');
  perform t.fails($q$insert into public.expense_categories (name) values ('Bribes')$q$, '%row-level security%');
end $$;
reset role;

-- =============================================================================
-- 14. Another salesman cannot see Ravi's expenses
-- =============================================================================
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000022', false);
set role authenticated;
do $$ begin
  assert (select count(*) from public.expenses) = 0, 'Kiran sees no expenses of Ravi';
  assert (select count(*) from public.expense_list) = 0, 'list view filtered too';
  assert (select pending from public.expense_summary(current_date - 30, current_date)) = 0, 'summary filtered too';
  assert (select count(*) from public.expense_events) = 0, 'history filtered too';
  perform t.fails(format($q$select public.expense_submit(%L)$q$, (select val from t.x where k = 'fuel500')), '%not found%');
end $$;
reset role;

-- =============================================================================
-- 2, 3. Office sees it in To approve; manager approves (journal posted once)
-- =============================================================================
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$ declare v uuid := (select val from t.x where k = 'fuel500'); v_own uuid; begin
  assert exists (select 1 from public.expense_list where id = v and status = 'submitted' and employee_name = 'Ravi Route'), 'in To approve';
  assert public.expense_review(array[v], 'approve') = 1, 'approved';
  assert (select status from public.expenses where id = v) = 'approved', 'status approved';
  assert (select approved_amount from public.expenses where id = v) = 500, 'approved amount';
  assert (select reviewed_by from public.expenses where id = v) = auth.uid(), 'approver recorded';
  perform t.fails(format($q$select public.expense_review(array[%L]::uuid[], 'approve')$q$, v), '%already approved%');
  -- manager without the permission cannot reimburse
  perform t.fails(format($q$select t.pay(%L, 500)$q$, v), '%not allowed to reimburse%');
  -- nobody but the Super Admin approves their own expense
  v_own := t.save(null, 'food', 200, true);
  perform t.fails(format($q$select public.expense_review(array[%L]::uuid[], 'approve')$q$, v_own), '%own expense%');
  insert into t.x values ('mgr_own', v_own);
end $$;
reset role;

-- =============================================================================
-- 4, 5. Salesman sees Approved; it waits in To reimburse
-- =============================================================================
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000021', false);
set role authenticated;
do $$ declare r record; begin
  select * into r from public.expense_list where id = (select val from t.x where k = 'fuel500');
  assert r.status = 'approved' and r.reimbursement_status = 'pending' and r.outstanding = 500, 'salesman sees approved, pending payment';
  assert (select count(*) from public.expense_events where expense_id = r.id) >= 3, 'history visible (created, submitted, approved)';
end $$;
reset role;

-- =============================================================================
-- 6, 7, 13, 15. Billing (authorised) reimburses ₹500; retry is a no-op; no overpay
-- =============================================================================
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$ declare v uuid := (select val from t.x where k = 'fuel500'); r1 uuid; r2 uuid; begin
  assert exists (select 1 from public.expense_list where id = v and outstanding > 0), 'in To reimburse';
  r1 := t.pay(v, 500, 'b0000000-0000-0000-0000-000000000001');
  r2 := t.pay(v, 500, 'b0000000-0000-0000-0000-000000000001');
  assert r1 = r2, 'retry returns the same reimbursement';
  assert (select count(*) from public.reimbursement_lines where expense_id = v) = 1, 'paid once';
  assert (select reimbursement_status from public.expenses where id = v) = 'reimbursed', 'reimbursed';
  perform t.fails(format($q$select t.pay(%L, 1)$q$, v), '%outstanding%');
  assert (select reimbursement_no from public.reimbursements where id = r1) like 'APX/RMB/%', 'payment numbered';
  insert into t.x values ('rmb500', r1);
end $$;
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000021', false);
set role authenticated;
do $$ begin
  assert (select reimbursement_status from public.expense_list where id = (select val from t.x where k = 'fuel500')) = 'reimbursed', 'salesman sees Reimbursed';
  assert (select count(*) from public.reimbursements where id = (select val from t.x where k = 'rmb500')) = 1, 'salesman sees his payment';
end $$;
reset role;

-- =============================================================================
-- 8, 9, 10. Office enters expenses for Ravi (one company-paid); internal notes stay internal
-- =============================================================================
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$ declare v uuid; c uuid; r record; begin
  v := t.save('00000000-0000-0000-0000-000000000021', 'food', 300, true, p_notes => 'Team lunch at Akole');
  select * into r from public.expense_list where id = v;
  assert r.employee_id = '00000000-0000-0000-0000-000000000021' and r.created_by = auth.uid(), 'employee vs creator kept separately';
  assert r.source = 'office' and r.notes = 'Team lunch at Akole' and r.status = 'submitted', 'office entry';
  insert into t.x values ('office_food', v);
  c := t.save('00000000-0000-0000-0000-000000000021', 'parking', 100, true, p_paid_by => 'company', p_method => 'company_card');
  insert into t.x values ('company_parking', c);
  -- billing cannot approve
  perform t.fails(format($q$select public.expense_review(array[%L]::uuid[], 'approve')$q$, v), '%Only a Manager%');
end $$;
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000021', false);
set role authenticated;
do $$ begin
  assert exists (select 1 from public.expense_list where id = (select val from t.x where k = 'office_food')), 'office expense appears for the salesman';
  assert (select notes from public.expense_list where id = (select val from t.x where k = 'office_food')) is null, 'internal notes hidden';
  perform t.fails($q$select notes from public.expenses$q$, '%permission denied%');
end $$;
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$ declare c uuid := (select val from t.x where k = 'company_parking'); begin
  perform public.expense_review(array[c, (select val from t.x where k = 'office_food')], 'approve');   -- bulk approve
  assert (select reimbursement_status from public.expenses where id = c) = 'not_applicable', 'company-paid needs no reimbursement';
  assert (select outstanding from public.expenses where id = c) = 0, 'company-paid adds nothing to employee liability';
  assert (select count(*) from public.expense_events where expense_id in (c, (select val from t.x where k = 'office_food')) and action = 'approved') = 2,
    'one audit row per expense in a bulk approval';
end $$;
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$ begin
  perform t.fails(format($q$select t.pay(%L, 100)$q$, (select val from t.x where k = 'company_parking')), '%paid by the company%');
end $$;
reset role;

-- =============================================================================
-- 11. Rejection reason reaches the salesman; return for correction and resubmit
-- =============================================================================
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000021', false);
set role authenticated;
do $$ begin
  insert into t.x values ('rej', t.save(null, 'food', 250, true));
  insert into t.x values ('ret', t.save(null, 'food', 180, true));
  insert into t.x values ('travel', t.save(null, 'travel', 2000, true));
  insert into t.x values ('travel2', t.save(null, 'travel', 1000, true));
end $$;
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$ begin
  perform t.fails(format($q$select public.expense_review(array[%L]::uuid[], 'reject')$q$, (select val from t.x where k = 'rej')), '%reason%');
  perform public.expense_review(array[(select val from t.x where k = 'rej')], 'reject', 'No bill attached');
  perform public.expense_review(array[(select val from t.x where k = 'ret')], 'return', 'Add the bill photo');
  perform public.expense_review(array[(select val from t.x where k = 'travel')], 'approve');
  -- approving less than claimed needs a reason
  perform t.fails(format($q$select public.expense_review(array[%L]::uuid[], 'approve', null, jsonb_build_object(%L, 900))$q$,
                         (select val from t.x where k = 'travel2'), (select val from t.x where k = 'travel2')), '%less than claimed%');
  perform public.expense_review(array[(select val from t.x where k = 'travel2')], 'approve', 'Bus fare is ₹900',
                                jsonb_build_object((select val from t.x where k = 'travel2'), 900));
  assert (select approved_amount from public.expenses where id = (select val from t.x where k = 'travel2')) = 900, 'approved 900 of 1000';
end $$;
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000021', false);
set role authenticated;
do $$ declare v uuid := (select val from t.x where k = 'ret'); begin
  assert (select rejection_reason from public.expense_list where id = (select val from t.x where k = 'rej')) = 'No bill attached', 'salesman sees the reason';
  assert (select status from public.expenses where id = v) = 'returned', 'returned';
  perform t.save(null, 'food', 170, true, p_id => v, p_receipt => auth.uid() || '/lunch.jpg');
  assert (select status from public.expenses where id = v) = 'submitted' and (select amount from public.expenses where id = v) = 170, 'corrected and resubmitted';
  assert (select array_agg(new_status order by id) from public.expense_events where expense_id = v and action in ('submitted', 'returned'))
         = array['submitted', 'returned', 'submitted'], 'status history kept';
  -- a rejected expense is final
  perform t.fails(format($q$select t.save(null, 'food', 250, true, p_id => %L)$q$, (select val from t.x where k = 'rej')), '%rejected expense cannot be edited%');
end $$;
reset role;

-- =============================================================================
-- 12, 15. Partial reimbursement 1,200 + 800; never above what is outstanding
-- =============================================================================
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$ declare v uuid := (select val from t.x where k = 'travel'); r record; begin
  perform t.pay(v, 1200);
  select * into r from public.expense_list where id = v;
  assert r.approved_amount = 2000 and r.reimbursed_amount = 1200 and r.outstanding = 800 and r.reimbursement_status = 'partial', 'partial';
  perform t.fails(format($q$select t.pay(%L, 800.01)$q$, v), '%Only ₹800.00 is outstanding%');
  perform t.pay(v, 800);
  assert (select reimbursement_status from public.expenses where id = v) = 'reimbursed', 'fully paid';
  perform t.fails(format($q$select t.pay(%L, 1000)$q$, (select val from t.x where k = 'travel2')), '%Only ₹900.00%');
end $$;
reset role;

-- =============================================================================
-- 17. Journal: one balanced entry per event, reversals on cancellation, no duplicates
-- =============================================================================
do $$ declare v uuid := (select val from t.x where k = 'fuel500'); begin
  perform public.expense_post_approval(v);    -- posting again is a no-op
  assert (select count(*) from public.journal_entries where source_type = 'expense' and source_id = v) = 1, 'one approval entry';
  assert not exists (select 1 from public.journal_lines l group by entry_id having sum(debit) <> sum(credit)), 'every entry balances';
  assert (select sum(credit) from public.journal_lines l join public.journal_entries j on j.id = l.entry_id
           where j.source_id = v and l.account = 'Employee payable') = 500, 'approval credits employee payable';
  assert (select sum(debit) from public.journal_lines l join public.journal_entries j on j.id = l.entry_id
           where j.source_type = 'reimbursement' and l.account = 'Employee payable' and l.employee_id = '00000000-0000-0000-0000-000000000021') = 2500,
         'reimbursements settle the payable (500 + 1200 + 800), not a second expense';
  assert (select account from public.journal_lines l join public.journal_entries j on j.id = l.entry_id
           where j.source_id = (select val from t.x where k = 'company_parking') and l.credit > 0) = 'Company card', 'company-paid credits the company account';
  assert not exists (select 1 from public.journal_lines l join public.journal_entries j on j.id = l.entry_id
           where j.source_id = (select val from t.x where k = 'company_parking') and l.account = 'Employee payable'), 'no payable for company-paid';
  -- payable per employee = approved employee-paid − reimbursed
  assert (select coalesce(sum(credit - debit), 0) from public.journal_lines where account = 'Employee payable' and employee_id = '00000000-0000-0000-0000-000000000021')
       = (select sum(outstanding) from public.expenses where employee_id = '00000000-0000-0000-0000-000000000021'), 'ledger payable = outstanding';
  begin update public.journal_lines set debit = 0; raise exception 'journal editable' using errcode = 'ZZ999';
  exception when others then if sqlstate = 'ZZ999' then raise; end if; end;
end $$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$ declare v uuid := (select val from t.x where k = 'travel2'); begin
  perform t.fails(format($q$select public.expense_cancel(%L, '')$q$, v), '%reason%');
  perform public.expense_cancel(v, 'Duplicate of bus ticket');
  assert (select status from public.expenses where id = v) = 'cancelled', 'cancelled, not deleted';
  perform t.fails(format($q$select public.expense_cancel(%L, 'again')$q$, v), '%cancelled expense cannot%');
  perform t.fails(format($q$select public.expense_cancel(%L, 'x')$q$, (select val from t.x where k = 'fuel500')), '%cancel that reimbursement first%');
  perform t.fails(format($q$select public.cancel_reimbursement(%L, 'x')$q$, (select val from t.x where k = 'rmb500')), '%Only the Super Admin%');
end $$;
reset role;

do $$ declare v uuid := (select val from t.x where k = 'travel2'); begin
  assert (select count(*) from public.journal_entries where source_id = v) = 2, 'approval + reversal';
  assert (select sum(debit) - sum(credit) from public.journal_lines l join public.journal_entries j on j.id = l.entry_id
           where j.source_id = v and l.account like 'Expense:%') = 0, 'expense nets to zero after cancellation';
end $$;

-- Super Admin reverses a wrongly recorded payment; the expense is outstanding again
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$ declare v uuid := (select val from t.x where k = 'fuel500'); begin
  perform public.cancel_reimbursement((select val from t.x where k = 'rmb500'), 'Paid to the wrong UPI id');
  assert (select outstanding from public.expenses where id = v) = 500 and (select reimbursement_status from public.expenses where id = v) = 'pending', 'outstanding again';
  perform t.fails(format($q$select public.cancel_reimbursement(%L, 'x')$q$, (select val from t.x where k = 'rmb500')), '%Already cancelled%');
  perform t.pay(v, 500, 'b0000000-0000-0000-0000-000000000009');
  assert (select reimbursement_status from public.expenses where id = v) = 'reimbursed', 'paid again';
  -- Super Admin may approve his own claim
  perform public.expense_review(array[(select val from t.x where k = 'mgr_own')], 'approve');
  -- one payment never mixes employees
  perform t.fails(format($q$select public.reimburse_expenses(jsonb_build_array(jsonb_build_object('expense_id', %L, 'amount', 100),
      jsonb_build_object('expense_id', %L, 'amount', 100)), current_date, 'cash', null, null, null, null)$q$,
      (select val from t.x where k = 'office_food'), (select val from t.x where k = 'mgr_own')), '%one employee at a time%');
  perform t.fails(format($q$select public.reimburse_expenses(jsonb_build_array(jsonb_build_object('expense_id', %L, 'amount', 100),
      jsonb_build_object('expense_id', %L, 'amount', 100)), current_date, 'cash', null, null, null, null)$q$,
      (select val from t.x where k = 'office_food'), (select val from t.x where k = 'office_food')), '%listed twice%');
end $$;
reset role;

-- =============================================================================
-- 16. Monthly totals come from the database and match the rows
-- =============================================================================
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$ declare s record; f date := current_date - 31; begin
  select * into s from public.expense_summary(f, current_date);
  assert s.pending = (select coalesce(sum(amount), 0) from public.expenses where status = 'submitted' and expense_date >= f), 'pending';
  assert s.approved = (select sum(approved_amount) from public.expenses where status = 'approved' and expense_date >= f), 'approved';
  assert s.rejected = 250, 'rejected';
  assert s.outstanding = (select sum(approved_amount - reimbursed_amount) from public.expenses where status = 'approved' and paid_by = 'employee'), 'outstanding';
  assert s.company_paid = 100, 'company paid';
  assert (select reimbursed from public.expense_summary(f, current_date, p_employee => '00000000-0000-0000-0000-000000000021')) = 500 + 2000,
         'Ravi reimbursed 2,500 (the cancelled payment is not counted)';
  assert s.reimbursed = (select sum(l.amount) from public.reimbursement_lines l join public.reimbursements r on r.id = l.reimbursement_id where r.cancelled_at is null), 'matches payments';
  select * into s from public.expense_summary(f, current_date, p_employee => '00000000-0000-0000-0000-000000000021', p_category => t.cat('travel'));
  assert s.approved = 2000, 'filtered by employee + category';
  select * into s from public.expense_summary(f, current_date, p_status => 'to_reimburse');
  assert s.outstanding = (select sum(outstanding) from public.expenses), 'to reimburse filter';
end $$;
reset role;

-- =============================================================================
-- Categories, auto-approval, brand scope, immutable history
-- =============================================================================
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$ declare v uuid; begin
  insert into public.expense_categories (code, name, approval_required) values ('toll', 'Toll', false);
  update public.expense_categories set auto_approve_limit = 50 where code = 'parking';
  update public.expense_categories set is_active = false where code = 'courier';
end $$;
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000021', false);
set role authenticated;
do $$ declare v uuid; cq uuid := (select id from public.brands where name = 'CONQRETE'); begin
  v := t.save(null, 'toll', 80, true);
  assert (select status from public.expenses where id = v) = 'approved', 'no-approval category is approved at once';
  assert exists (select 1 from public.expense_events where expense_id = v and action = 'auto_approved'), 'auto approval logged';
  assert not exists (select 1 from public.journal_entries), 'salesmen cannot read the journal';
  insert into t.x values ('toll', v);
  v := t.save(null, 'parking', 40, true);
  assert (select status from public.expenses where id = v) = 'approved', 'under the auto-approval limit';
  v := t.save(null, 'parking', 60, true);
  assert (select status from public.expenses where id = v) = 'submitted', 'above the limit waits';
  perform t.fails($q$select t.save(null, 'courier', 60, true)$q$, '%category%');
  insert into t.x values ('cq', t.save(null, 'food', 90, true, p_brand => cq));
  insert into t.x values ('allbrands', t.save(null, 'food', 95, true));
  perform t.fails($q$update public.expense_events set remarks = 'x'$q$, '%permission denied%');
end $$;
reset role;

do $$ begin
  assert exists (select 1 from public.journal_entries where source_id = (select val from t.x where k = 'toll')), 'auto approval posted';
end $$;

-- BLUEI-only manager: sees all-brand expenses, not CONQRETE ones
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000012', false);
set role authenticated;
do $$ begin
  assert not exists (select 1 from public.expense_list where id = (select val from t.x where k = 'cq')), 'CONQRETE expense hidden from BLUEI manager';
  assert exists (select 1 from public.expense_list where id = (select val from t.x where k = 'allbrands')), 'all-brand expense visible';
  perform t.fails(format($q$select public.expense_review(array[%L]::uuid[], 'approve')$q$, (select val from t.x where k = 'cq')), '%not found%');
end $$;
reset role;

-- Receipts: the employee can open a receipt the office uploaded for him
grant select on storage.objects to authenticated;
insert into storage.objects (bucket_id, name) values ('expense-receipts', '00000000-0000-0000-0000-000000000003/r1.jpg');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', false);
set role authenticated;
select t.save('00000000-0000-0000-0000-000000000021', 'food', 75, true, p_receipt => '00000000-0000-0000-0000-000000000003/r1.jpg') is not null;
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000021', false);
set role authenticated;
do $$ begin
  assert (select count(*) from storage.objects where name = '00000000-0000-0000-0000-000000000003/r1.jpg') = 1, 'employee reads his receipt';
end $$;
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000022', false);
set role authenticated;
do $$ begin
  assert (select count(*) from storage.objects where name = '00000000-0000-0000-0000-000000000003/r1.jpg') = 0, 'other salesman cannot';
end $$;
reset role;

select set_config('request.jwt.claim.sub', '', false);
drop schema t cascade;
select 'ALL EXPENSE DATABASE TESTS PASSED' as result;
