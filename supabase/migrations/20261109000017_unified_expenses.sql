-- =============================================================================
-- 0017 Unified expense management
--   * one expenses table for office and salesman entries (employee vs creator, source)
--   * central expense categories with receipt / route / approval rules
--   * lifecycle: draft -> submitted -> approved | rejected | returned ; cancelled
--   * reimbursements with lines (partial payments, never more than approved)
--   * expense_events: one row per status change, written only by functions
--   * journal_entries / journal_lines: idempotent double-entry postings
--   * every write goes through security definer functions; RLS only reads
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Categories
-- -----------------------------------------------------------------------------
create table public.expense_categories (
  id                 uuid primary key default gen_random_uuid(),
  code               text unique,
  name               text not null check (length(trim(name)) between 1 and 60),
  receipt_required   boolean not null default false,
  route_required     boolean not null default false,
  approval_required  boolean not null default true,
  auto_approve_limit numeric(12,2) not null default 0 check (auto_approve_limit >= 0),
  is_active          boolean not null default true,
  sort_order         integer not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
comment on column public.expense_categories.auto_approve_limit is
  'When approval is required, claims up to this amount are approved automatically (0 = every claim needs approval)';
create unique index expense_categories_name_key on public.expense_categories (lower(trim(name)));
create trigger expense_categories_updated_at before update on public.expense_categories
  for each row execute function public.set_updated_at();
create trigger expense_categories_audit after insert or update or delete on public.expense_categories
  for each row execute function public.audit_row();
alter table public.expense_categories enable row level security;

insert into public.expense_categories (code, name, receipt_required, route_required, sort_order) values
  ('fuel',                'Fuel',                 false, true,  10),
  ('food',                'Food',                 false, false, 20),
  ('parking',             'Parking',              false, false, 30),
  ('accommodation',       'Hotel / Stay',         true,  false, 40),
  ('travel',              'Travel',               false, false, 50),
  ('transportation',      'Transportation',       false, false, 60),
  ('vehicle_maintenance', 'Vehicle Maintenance',  true,  false, 70),
  ('loading_unloading',   'Loading / Unloading',  false, false, 80),
  ('courier',             'Courier / Delivery',   false, false, 90),
  ('office_supplies',     'Office Supplies',      true,  false, 100),
  ('telephone_internet',  'Telephone / Internet', true,  false, 110),
  ('other',               'Other',                false, false, 120);

create policy expense_categories_select on public.expense_categories for select to authenticated
  using ((select public.is_active_user()));
create policy expense_categories_insert on public.expense_categories for insert to authenticated
  with check ((select public.has_role('super_admin', 'manager')));
create policy expense_categories_update on public.expense_categories for update to authenticated
  using ((select public.has_role('super_admin', 'manager')))
  with check ((select public.has_role('super_admin', 'manager')));

-- -----------------------------------------------------------------------------
-- 2. Settings and the reimbursement permission
-- -----------------------------------------------------------------------------
alter table public.company_settings
  add column if not exists expense_claim_days integer not null default 60 check (expense_claim_days between 1 and 365);

alter table public.profiles add column if not exists can_reimburse boolean not null default false;
-- Managers could reimburse before this change; keep that for existing managers.
update public.profiles set can_reimburse = true where role = 'manager';

create or replace function public.can_reimburse_expenses()
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role('super_admin')
      or exists (select 1 from public.profiles
                  where id = auth.uid() and is_active and can_reimburse and role in ('manager', 'billing'))
$$;
revoke all on function public.can_reimburse_expenses() from public, anon;
grant execute on function public.can_reimburse_expenses() to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Expenses
-- -----------------------------------------------------------------------------
drop policy if exists expenses_select on public.expenses;
drop policy if exists expenses_insert on public.expenses;
drop policy if exists expenses_update on public.expenses;
alter table public.expenses drop constraint if exists expense_rejection_reason;

alter table public.expenses rename column salesman_id to employee_id;
alter index if exists public.expenses_salesman_idx rename to expenses_employee_idx;
alter table public.expenses alter column employee_id drop default;
alter table public.expenses alter column status drop default;
alter table public.expenses alter column status type text using status::text;

alter table public.expenses
  add column expense_no         text,
  add column created_by         uuid references public.profiles (id),
  add column source             text not null default 'office',
  add column category_id        uuid references public.expense_categories (id),
  add column brand_id           uuid references public.brands (id),
  add column payment_method     text,
  add column paid_by            text not null default 'employee',
  add column notes              text,
  add column submitted_at       timestamptz,
  add column approved_amount    numeric(12,2),
  add column reimbursed_amount  numeric(12,2) not null default 0,
  add column cancelled_at       timestamptz,
  add column cancelled_by       uuid references public.profiles (id),
  add column cancel_reason      text;

-- Reimbursement header gets an employee + lines (one payment can settle many expenses, partly)
alter table public.reimbursements rename column salesman_id to employee_id;
alter table public.reimbursements
  add column reimbursement_no text unique,
  add column notes            text,
  add column proof_path       text,
  add column client_uuid      uuid unique,
  add column cancelled_at     timestamptz,
  add column cancelled_by     uuid references public.profiles (id),
  add column cancel_reason    text;
create index if not exists reimbursements_employee_idx on public.reimbursements (employee_id, paid_on);

create table public.reimbursement_lines (
  id                uuid primary key default gen_random_uuid(),
  reimbursement_id  uuid not null references public.reimbursements (id),
  expense_id        uuid not null references public.expenses (id),
  amount            numeric(12,2) not null check (amount > 0),
  created_at        timestamptz not null default now(),
  unique (reimbursement_id, expense_id)
);
create index reimbursement_lines_expense_idx on public.reimbursement_lines (expense_id);
alter table public.reimbursement_lines enable row level security;
create trigger reimbursement_lines_audit after insert or update or delete on public.reimbursement_lines
  for each row execute function public.audit_row();
create trigger reimbursement_lines_immutable before update or delete on public.reimbursement_lines
  for each row execute function public.prevent_mutation();

-- Carry existing rows over
update public.expenses e set
  category_id     = c.id,
  created_by      = e.employee_id,
  source          = case when p.role = 'salesman' then 'salesman_app' else 'office' end,
  submitted_at    = e.created_at,
  approved_amount = case when e.status in ('approved', 'reimbursed') then e.amount end
from public.expense_categories c, public.profiles p
where c.code = e.category::text and p.id = e.employee_id;

insert into public.reimbursement_lines (reimbursement_id, expense_id, amount)
select reimbursement_id, id, amount from public.expenses where reimbursement_id is not null;
update public.expenses set reimbursed_amount = amount, status = 'approved' where status = 'reimbursed';

do $$
declare r record;
begin
  for r in select id, expense_date from public.expenses order by created_at, id loop
    update public.expenses set expense_no = public.next_document_number('EXP', r.expense_date) where id = r.id;
  end loop;
  for r in select id, paid_on from public.reimbursements order by created_at, id loop
    update public.reimbursements set reimbursement_no = public.next_document_number('RMB', r.paid_on) where id = r.id;
  end loop;
end $$;

alter table public.expenses drop column category;
alter table public.expenses drop column reimbursement_id;
drop type if exists public.expense_category;
drop type if exists public.expense_status;

alter table public.expenses
  alter column category_id set not null,
  alter column created_by set not null,
  alter column created_by set default auth.uid(),
  alter column status set default 'draft',
  add constraint expenses_expense_no_key unique (expense_no),
  add constraint expenses_status_check check (status in ('draft', 'submitted', 'approved', 'rejected', 'returned', 'cancelled')),
  add constraint expenses_source_check check (source in ('office', 'salesman_app')),
  add constraint expenses_paid_by_check check (paid_by in ('employee', 'company')),
  add constraint expenses_payment_method_check check (payment_method is null or payment_method in ('cash', 'upi', 'bank', 'company_card', 'other')),
  add constraint expenses_amount_max check (amount <= 1000000),
  add constraint expenses_date_floor check (expense_date >= date '2020-01-01'),
  add constraint expenses_numbered check (status = 'draft' or expense_no is not null),
  add constraint expenses_reason check (status not in ('rejected', 'returned') or coalesce(trim(rejection_reason), '') <> ''),
  add constraint expenses_cancel_reason check (status <> 'cancelled' or coalesce(trim(cancel_reason), '') <> ''),
  add constraint expenses_approved_amount check (
    (status <> 'approved' or approved_amount is not null)
    and (approved_amount is null or (approved_amount > 0 and approved_amount <= amount))),
  add constraint expenses_reimbursed_range check (reimbursed_amount >= 0 and reimbursed_amount <= coalesce(approved_amount, 0)),
  add constraint expenses_reimbursed_only_approved check (reimbursed_amount = 0 or (status = 'approved' and paid_by = 'employee'));

alter table public.expenses
  add column reimbursement_status text generated always as (
    case
      when status <> 'approved' then null
      when paid_by = 'company' then 'not_applicable'
      when reimbursed_amount = 0 then 'pending'
      when reimbursed_amount < approved_amount then 'partial'
      else 'reimbursed'
    end) stored,
  add column outstanding numeric(12,2) generated always as (
    case when status = 'approved' and paid_by = 'employee' then approved_amount - reimbursed_amount else 0 end) stored;

create index expenses_status_idx on public.expenses (status, expense_date);
create index expenses_category_idx on public.expenses (category_id);
create index expenses_brand_idx on public.expenses (brand_id);
create index expenses_created_by_idx on public.expenses (created_by);
create index expenses_outstanding_idx on public.expenses (employee_id) where outstanding > 0;

-- Who may see an expense: the employee it belongs to; office staff within their brands
-- (expenses for all brands, brand_id null, are visible to every office user).
create or replace function public.can_see_expense(p_employee uuid, p_brand uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_employee = auth.uid()
      or public.has_role('super_admin')
      or (public.has_role('manager', 'billing') and (p_brand is null or p_brand = any (public.my_brand_ids())))
$$;
revoke all on function public.can_see_expense(uuid, uuid) from public, anon;
grant execute on function public.can_see_expense(uuid, uuid) to authenticated;

create policy expenses_select on public.expenses for select to authenticated
  using ((select public.is_active_user()) and public.can_see_expense(employee_id, brand_id));
revoke insert, update, delete on public.expenses from authenticated;

drop policy if exists reimbursements_select on public.reimbursements;
drop policy if exists reimbursements_insert on public.reimbursements;
create policy reimbursements_select on public.reimbursements for select to authenticated
  using ((select public.is_active_user()) and (employee_id = (select auth.uid()) or (select public.has_role('super_admin', 'manager', 'billing'))));
revoke insert, update, delete on public.reimbursements from authenticated;

create policy reimbursement_lines_select on public.reimbursement_lines for select to authenticated
  using (exists (select 1 from public.expenses e where e.id = expense_id));
revoke insert, update, delete on public.reimbursement_lines from authenticated;

-- -----------------------------------------------------------------------------
-- 4. Expense events (status history, written only by the functions below)
-- -----------------------------------------------------------------------------
create table public.expense_events (
  id            bigint generated always as identity primary key,
  expense_id    uuid not null,
  action        text not null,
  old_status    text,
  new_status    text,
  amount        numeric(12,2),
  performed_by  uuid default auth.uid(),
  remarks       text,
  created_at    timestamptz not null default now()
);
create index expense_events_expense_idx on public.expense_events (expense_id, id);
alter table public.expense_events enable row level security;
create trigger expense_events_immutable before update or delete on public.expense_events
  for each row execute function public.prevent_mutation();
create policy expense_events_select on public.expense_events for select to authenticated
  using (exists (select 1 from public.expenses e where e.id = expense_id));
revoke insert, update, delete on public.expense_events from authenticated;

insert into public.expense_events (expense_id, action, old_status, new_status, amount, performed_by, remarks, created_at)
select id, 'migrated', null, status, amount, created_by, 'Carried over from the previous expense module', created_at
from public.expenses;

create or replace function public.expense_log(p_id uuid, p_action text, p_old text, p_new text, p_amount numeric, p_remarks text)
returns void language sql security definer set search_path = public as $$
  insert into public.expense_events (expense_id, action, old_status, new_status, amount, performed_by, remarks)
  values (p_id, p_action, p_old, p_new, p_amount, auth.uid(), nullif(trim(p_remarks), ''))
$$;
revoke all on function public.expense_log(uuid, text, text, text, numeric, text) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 5. Journal (double entry). One entry per (source, event): posting twice is a no-op.
-- -----------------------------------------------------------------------------
create table public.journal_entries (
  id           uuid primary key default gen_random_uuid(),
  entry_date   date not null,
  source_type  text not null check (source_type in ('expense', 'reimbursement')),
  source_id    uuid not null,
  event        text not null,
  narration    text,
  brand_id     uuid references public.brands (id),
  reverses_id  uuid references public.journal_entries (id),
  created_by   uuid references public.profiles (id) default auth.uid(),
  created_at   timestamptz not null default now(),
  unique (source_type, source_id, event)
);
create table public.journal_lines (
  id           bigint generated always as identity primary key,
  entry_id     uuid not null references public.journal_entries (id),
  account      text not null,
  employee_id  uuid references public.profiles (id),
  debit        numeric(14,2) not null default 0 check (debit >= 0),
  credit       numeric(14,2) not null default 0 check (credit >= 0),
  constraint journal_line_one_side check ((debit > 0) <> (credit > 0))
);
create index journal_entries_date_idx on public.journal_entries (entry_date);
create index journal_lines_entry_idx on public.journal_lines (entry_id);
create index journal_lines_account_idx on public.journal_lines (account);
alter table public.journal_entries enable row level security;
alter table public.journal_lines enable row level security;
create trigger journal_entries_immutable before update or delete on public.journal_entries
  for each row execute function public.prevent_mutation();
create trigger journal_lines_immutable before update or delete on public.journal_lines
  for each row execute function public.prevent_mutation();
create policy journal_entries_select on public.journal_entries for select to authenticated
  using ((select public.has_role('super_admin', 'manager', 'billing')));
create policy journal_lines_select on public.journal_lines for select to authenticated
  using ((select public.has_role('super_admin', 'manager', 'billing')));
revoke insert, update, delete on public.journal_entries, public.journal_lines from authenticated;

-- p_lines: [{"account": "...", "employee_id": uuid|null, "debit": n, "credit": n}]
create or replace function public.post_journal(p_source_type text, p_source_id uuid, p_event text, p_date date,
                                               p_narration text, p_brand uuid, p_lines jsonb, p_reverses uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_dr numeric; v_cr numeric;
begin
  select coalesce(sum((l ->> 'debit')::numeric), 0), coalesce(sum((l ->> 'credit')::numeric), 0)
    into v_dr, v_cr from jsonb_array_elements(p_lines) l;
  if v_dr <= 0 or v_dr <> v_cr then
    raise exception 'Journal entry does not balance (debit %, credit %)', v_dr, v_cr using errcode = 'P0001';
  end if;
  insert into public.journal_entries (entry_date, source_type, source_id, event, narration, brand_id, reverses_id)
  values (p_date, p_source_type, p_source_id, p_event, p_narration, p_brand, p_reverses)
  on conflict (source_type, source_id, event) do nothing
  returning id into v_id;
  if v_id is null then return null; end if;   -- already posted
  insert into public.journal_lines (entry_id, account, employee_id, debit, credit)
  select v_id, l ->> 'account', nullif(l ->> 'employee_id', '')::uuid,
         coalesce((l ->> 'debit')::numeric, 0), coalesce((l ->> 'credit')::numeric, 0)
    from jsonb_array_elements(p_lines) l
   where coalesce((l ->> 'debit')::numeric, 0) > 0 or coalesce((l ->> 'credit')::numeric, 0) > 0;
  return v_id;
end $$;
revoke all on function public.post_journal(text, uuid, text, date, text, uuid, jsonb, uuid) from public, anon, authenticated;

-- Posts the reversal of an earlier entry (debits and credits swapped).
create or replace function public.reverse_journal(p_source_type text, p_source_id uuid, p_event text, p_new_event text, p_date date, p_narration text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_orig public.journal_entries%rowtype; v_lines jsonb;
begin
  select * into v_orig from public.journal_entries where source_type = p_source_type and source_id = p_source_id and event = p_event;
  if not found then return null; end if;
  select jsonb_agg(jsonb_build_object('account', account, 'employee_id', employee_id, 'debit', credit, 'credit', debit))
    into v_lines from public.journal_lines where entry_id = v_orig.id;
  return public.post_journal(p_source_type, p_source_id, p_new_event, p_date, p_narration, v_orig.brand_id, v_lines, v_orig.id);
end $$;
revoke all on function public.reverse_journal(text, uuid, text, text, date, text) from public, anon, authenticated;

create or replace function public.expense_credit_account(p_method text)
returns text language sql immutable set search_path = public as $$
  select case p_method
    when 'cash' then 'Cash in hand' when 'upi' then 'Bank (UPI)' when 'bank' then 'Bank'
    when 'bank_transfer' then 'Bank' when 'cheque' then 'Bank (cheque)' when 'company_card' then 'Company card'
    else 'Other payments' end
$$;

-- Approval posting: Dr expense category / Cr employee payable (or the company account that paid).
create or replace function public.expense_post_approval(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare e public.expenses%rowtype; v_cat text; v_name text;
begin
  select * into e from public.expenses where id = p_id;
  select name into v_cat from public.expense_categories where id = e.category_id;
  select full_name into v_name from public.profiles where id = e.employee_id;
  perform public.post_journal('expense', e.id, 'approved', e.expense_date,
    e.expense_no || ' · ' || v_cat || ' · ' || coalesce(v_name, ''), e.brand_id,
    jsonb_build_array(
      jsonb_build_object('account', 'Expense: ' || v_cat, 'debit', e.approved_amount),
      case when e.paid_by = 'employee'
        then jsonb_build_object('account', 'Employee payable', 'employee_id', e.employee_id, 'credit', e.approved_amount)
        else jsonb_build_object('account', public.expense_credit_account(e.payment_method), 'credit', e.approved_amount) end));
end $$;
revoke all on function public.expense_post_approval(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 6. Workflow functions
-- -----------------------------------------------------------------------------
create or replace function public.ist_today()
returns date language sql stable set search_path = public as $$ select (now() at time zone 'Asia/Kolkata')::date $$;

-- Moves a draft / returned expense to submitted (or approved when the category allows it).
create or replace function public.expense_submit_internal(p_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare e public.expenses%rowtype; c public.expense_categories%rowtype; v_auto boolean;
begin
  select * into e from public.expenses where id = p_id for update;
  select * into c from public.expense_categories where id = e.category_id;
  if not c.is_active then raise exception 'The category "%" is no longer in use; choose another', c.name using errcode = 'P0001'; end if;
  if c.receipt_required and e.receipt_path is null then
    raise exception 'A receipt is required for % expenses', c.name using errcode = 'P0001', hint = 'RECEIPT_REQUIRED';
  end if;
  if c.route_required and e.route_id is null then
    raise exception 'Choose the route for % expenses', c.name using errcode = 'P0001', hint = 'ROUTE_REQUIRED';
  end if;
  v_auto := not c.approval_required or (c.auto_approve_limit > 0 and e.amount <= c.auto_approve_limit);
  update public.expenses set
    expense_no = coalesce(expense_no, public.next_document_number('EXP', expense_date)),
    status = case when v_auto then 'approved' else 'submitted' end,
    submitted_at = now(),
    rejection_reason = null,
    approved_amount = case when v_auto then amount end,
    reviewed_by = null,
    reviewed_at = case when v_auto then now() end
  where id = p_id;
  perform public.expense_log(p_id, 'submitted', e.status, 'submitted', e.amount, null);
  if v_auto then
    perform public.expense_log(p_id, 'auto_approved', 'submitted', 'approved', e.amount,
      case when c.approval_required then 'Within the auto-approval limit of ' || c.name else c.name || ' does not need approval' end);
    perform public.expense_post_approval(p_id);
    return 'approved';
  end if;
  return 'submitted';
end $$;
revoke all on function public.expense_submit_internal(uuid) from public, anon, authenticated;

-- Create or edit an expense. Office staff may enter it for another employee.
create or replace function public.expense_save(
  p_id uuid, p_employee_id uuid, p_category_id uuid, p_amount numeric, p_expense_date date,
  p_route_id uuid, p_brand_id uuid, p_description text, p_payment_method text, p_paid_by text,
  p_receipt_path text, p_notes text, p_submit boolean, p_client_uuid uuid, p_source text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_role public.app_role := public.current_app_role();
  v_office boolean;
  v_emp uuid;
  v_days integer;
  v_cat public.expense_categories%rowtype;
  e public.expenses%rowtype;
  v_status text;
  v_changes text[] := '{}';
begin
  if v_role is null then raise exception 'Your account is not active' using errcode = '42501'; end if;
  v_office := v_role in ('super_admin', 'manager', 'billing');
  v_emp := coalesce(p_employee_id, v_uid);
  if v_emp <> v_uid and not v_office then
    raise exception 'You can enter only your own expenses' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = v_emp and is_active) then
    raise exception 'Choose an active employee' using errcode = 'P0001';
  end if;

  -- Same form sent twice (double tap, retry after a timeout): return the first one.
  if p_id is null and p_client_uuid is not null then
    select * into e from public.expenses where client_uuid = p_client_uuid;
    if found then
      if e.created_by <> v_uid then raise exception 'Duplicate request' using errcode = 'P0001'; end if;
      return jsonb_build_object('id', e.id, 'expense_no', e.expense_no, 'status', e.status, 'duplicate', true);
    end if;
  end if;

  select * into v_cat from public.expense_categories where id = p_category_id;
  if not found or not v_cat.is_active then raise exception 'Choose an expense category' using errcode = 'P0001'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Enter an amount above zero' using errcode = 'P0001'; end if;
  if p_amount > 1000000 then raise exception 'Amount looks too large (limit ₹10,00,000)' using errcode = 'P0001'; end if;
  if round(p_amount, 2) <> p_amount then raise exception 'Amount can have at most 2 decimals' using errcode = 'P0001'; end if;
  if p_expense_date is null or p_expense_date > public.ist_today() then
    raise exception 'The expense date cannot be in the future' using errcode = 'P0001';
  end if;
  if p_expense_date < date '2020-01-01' then raise exception 'Check the expense date' using errcode = 'P0001'; end if;
  if not v_office then
    select expense_claim_days into v_days from public.company_settings where id = 1;
    if p_expense_date < public.ist_today() - coalesce(v_days, 60) then
      raise exception 'Expenses older than % days must be entered by the office', coalesce(v_days, 60) using errcode = 'P0001';
    end if;
  end if;
  if coalesce(p_paid_by, 'employee') not in ('employee', 'company') then raise exception 'Choose who paid' using errcode = 'P0001'; end if;
  if p_payment_method is not null and p_payment_method not in ('cash', 'upi', 'bank', 'company_card', 'other') then
    raise exception 'Choose a payment method' using errcode = 'P0001';
  end if;
  if p_route_id is not null and not exists (select 1 from public.routes where id = p_route_id) then
    raise exception 'Unknown route' using errcode = 'P0001';
  end if;
  if p_brand_id is not null and not public.can_access_brand(p_brand_id) then
    raise exception 'You do not have access to this brand' using errcode = '42501';
  end if;
  if length(coalesce(p_description, '')) > 500 or length(coalesce(p_notes, '')) > 1000 then
    raise exception 'Description or notes are too long' using errcode = 'P0001';
  end if;

  if p_id is null then
    if p_receipt_path is not null and split_part(p_receipt_path, '/', 1) <> v_uid::text then
      raise exception 'Upload the receipt again' using errcode = '42501';
    end if;
    begin
      insert into public.expenses (employee_id, created_by, source, category_id, amount, expense_date, route_id, brand_id,
                                   description, payment_method, paid_by, receipt_path, notes, status, client_uuid)
      values (v_emp, v_uid,
              case when v_role = 'salesman' then 'salesman_app' when p_source = 'salesman_app' then 'salesman_app' else 'office' end,
              p_category_id, p_amount, p_expense_date, p_route_id, p_brand_id,
              nullif(trim(p_description), ''), p_payment_method, coalesce(p_paid_by, 'employee'), p_receipt_path,
              case when v_office then nullif(trim(p_notes), '') end, 'draft', p_client_uuid)
      returning * into e;
    exception when unique_violation then
      -- the same form arrived twice at the same moment; the first one won
      select * into e from public.expenses where client_uuid = p_client_uuid and created_by = v_uid;
      if not found then raise; end if;
      return jsonb_build_object('id', e.id, 'expense_no', e.expense_no, 'status', e.status, 'duplicate', true);
    end;
    perform public.expense_log(e.id, 'created', null, 'draft', e.amount,
      case when v_emp <> v_uid then 'Entered by the office for the employee' end);
  else
    select * into e from public.expenses where id = p_id for update;
    if not found or not public.can_see_expense(e.employee_id, e.brand_id) then
      raise exception 'Expense not found' using errcode = 'P0001';
    end if;
    if e.status in ('draft', 'returned') then
      if not (e.employee_id = v_uid or e.created_by = v_uid or v_role in ('super_admin', 'manager')) then
        raise exception 'You cannot edit this expense' using errcode = '42501';
      end if;
    elsif e.status = 'submitted' then
      if v_role not in ('super_admin', 'manager') then
        raise exception 'This expense is waiting for approval and is locked' using errcode = 'P0001';
      end if;
    else
      raise exception 'A % expense cannot be edited', e.status using errcode = 'P0001';
    end if;
    if v_emp <> e.employee_id and not v_office then
      raise exception 'Only the office can change the employee' using errcode = '42501';
    end if;
    if p_receipt_path is distinct from e.receipt_path and p_receipt_path is not null
       and split_part(p_receipt_path, '/', 1) <> v_uid::text then
      raise exception 'Upload the receipt again' using errcode = '42501';
    end if;
    if e.amount <> p_amount then v_changes := array_append(v_changes, format('amount %s → %s', e.amount, p_amount)); end if;
    if e.expense_date <> p_expense_date then v_changes := array_append(v_changes, format('date %s → %s', e.expense_date, p_expense_date)); end if;
    if e.category_id <> p_category_id then v_changes := array_append(v_changes, 'category'); end if;
    if e.employee_id <> v_emp then v_changes := array_append(v_changes, 'employee'); end if;
    if e.paid_by <> coalesce(p_paid_by, 'employee') then v_changes := array_append(v_changes, ('paid by ' || coalesce(p_paid_by, 'employee'))); end if;
    if e.receipt_path is distinct from p_receipt_path then v_changes := array_append(v_changes, 'receipt'); end if;
    update public.expenses set
      employee_id = v_emp, category_id = p_category_id, amount = p_amount, expense_date = p_expense_date,
      route_id = p_route_id, brand_id = p_brand_id, description = nullif(trim(p_description), ''),
      payment_method = p_payment_method, paid_by = coalesce(p_paid_by, 'employee'), receipt_path = p_receipt_path,
      notes = case when v_office then nullif(trim(p_notes), '') else notes end
    where id = p_id returning * into e;
    perform public.expense_log(e.id, 'edited', e.status, e.status, e.amount,
      nullif(array_to_string(v_changes, ', '), ''));
  end if;

  v_status := e.status;
  if p_submit and e.status in ('draft', 'returned') then
    v_status := public.expense_submit_internal(e.id);
  end if;
  select * into e from public.expenses where id = e.id;
  return jsonb_build_object('id', e.id, 'expense_no', e.expense_no, 'status', v_status, 'duplicate', false);
end $$;
revoke all on function public.expense_save(uuid, uuid, uuid, numeric, date, uuid, uuid, text, text, text, text, text, boolean, uuid, text) from public, anon;
grant execute on function public.expense_save(uuid, uuid, uuid, numeric, date, uuid, uuid, text, text, text, text, text, boolean, uuid, text) to authenticated;

create or replace function public.expense_submit(p_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare e public.expenses%rowtype;
begin
  select * into e from public.expenses where id = p_id for update;
  if not found or not public.can_see_expense(e.employee_id, e.brand_id) then raise exception 'Expense not found' using errcode = 'P0001'; end if;
  if e.status not in ('draft', 'returned') then raise exception 'This expense is already %', e.status using errcode = 'P0001'; end if;
  if not (e.employee_id = auth.uid() or e.created_by = auth.uid() or public.has_role('super_admin', 'manager')) then
    raise exception 'You cannot submit this expense' using errcode = '42501';
  end if;
  return public.expense_submit_internal(p_id);
end $$;
revoke all on function public.expense_submit(uuid) from public, anon;
grant execute on function public.expense_submit(uuid) to authenticated;

-- Approve / reject / return one or many expenses. p_amounts: {"<expense id>": approved amount} when less than claimed.
create or replace function public.expense_review(p_ids uuid[], p_decision text, p_reason text default null, p_amounts jsonb default null)
returns integer language plpgsql security definer set search_path = public as $$
declare e public.expenses%rowtype; v_amt numeric; v_n integer := 0; v_new text;
begin
  if not public.has_role('super_admin', 'manager') then
    raise exception 'Only a Manager or Super Admin can approve expenses' using errcode = '42501';
  end if;
  if p_decision not in ('approve', 'reject', 'return') then raise exception 'Unknown decision' using errcode = 'P0001'; end if;
  if p_decision in ('reject', 'return') and coalesce(trim(p_reason), '') = '' then
    raise exception 'Enter the reason' using errcode = 'P0001';
  end if;
  if coalesce(array_length(p_ids, 1), 0) = 0 then raise exception 'Choose expenses' using errcode = 'P0001'; end if;
  v_new := case p_decision when 'approve' then 'approved' when 'reject' then 'rejected' else 'returned' end;

  for e in select * from public.expenses where id = any (p_ids) order by id for update loop
    if not public.can_see_expense(e.employee_id, e.brand_id) then raise exception 'Expense not found' using errcode = 'P0001'; end if;
    if e.status <> 'submitted' then
      raise exception 'Expense % is already %', e.expense_no, e.status using errcode = 'P0001';
    end if;
    if e.employee_id = auth.uid() and not public.has_role('super_admin') then
      raise exception 'You cannot approve your own expense (%)', e.expense_no using errcode = '42501';
    end if;
    v_amt := case when p_decision = 'approve' then coalesce((p_amounts ->> e.id::text)::numeric, e.amount) end;
    if p_decision = 'approve' and (v_amt <= 0 or v_amt > e.amount or round(v_amt, 2) <> v_amt) then
      raise exception 'Approved amount for % must be between ₹0.01 and the claimed ₹%', e.expense_no, e.amount using errcode = 'P0001';
    end if;
    if p_decision = 'approve' and v_amt < e.amount and coalesce(trim(p_reason), '') = '' then
      raise exception 'Enter the reason for approving less than claimed (%)', e.expense_no using errcode = 'P0001';
    end if;
    update public.expenses set
      status = v_new,
      approved_amount = v_amt,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      rejection_reason = case when p_decision = 'approve' then null else trim(p_reason) end
    where id = e.id;
    perform public.expense_log(e.id, v_new, 'submitted', v_new, coalesce(v_amt, e.amount),
      case when p_decision = 'approve' and v_amt < e.amount then format('Approved ₹%s of ₹%s: %s', v_amt, e.amount, trim(p_reason))
           else p_reason end);
    if p_decision = 'approve' then perform public.expense_post_approval(e.id); end if;
    v_n := v_n + 1;
  end loop;
  if v_n <> (select count(distinct x) from unnest(p_ids) x) then raise exception 'Some expenses were not found' using errcode = 'P0001'; end if;
  return v_n;
end $$;
revoke all on function public.expense_review(uuid[], text, text, jsonb) from public, anon;
grant execute on function public.expense_review(uuid[], text, text, jsonb) to authenticated;

-- Delete a draft. A returned expense already has a number, so it is withdrawn (cancelled) instead.
create or replace function public.expense_delete(p_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare e public.expenses%rowtype;
begin
  select * into e from public.expenses where id = p_id for update;
  if not found or not public.can_see_expense(e.employee_id, e.brand_id) then raise exception 'Expense not found' using errcode = 'P0001'; end if;
  if not (e.employee_id = auth.uid() or e.created_by = auth.uid() or public.has_role('super_admin', 'manager')) then
    raise exception 'You cannot delete this expense' using errcode = '42501';
  end if;
  if e.status = 'draft' then
    perform public.expense_log(e.id, 'deleted', 'draft', null, e.amount, 'Draft deleted');
    delete from public.expenses where id = p_id;
    return 'deleted';
  elsif e.status = 'returned' then
    update public.expenses set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = 'Withdrawn after it was returned'
     where id = p_id;
    perform public.expense_log(e.id, 'withdrawn', 'returned', 'cancelled', e.amount, 'Withdrawn after it was returned');
    return 'cancelled';
  end if;
  raise exception 'Only a draft or a returned expense can be deleted' using errcode = 'P0001';
end $$;
revoke all on function public.expense_delete(uuid) from public, anon;
grant execute on function public.expense_delete(uuid) to authenticated;

-- Cancel a submitted or approved (not yet reimbursed) expense; the journal entry is reversed.
create or replace function public.expense_cancel(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare e public.expenses%rowtype;
begin
  if not public.has_role('super_admin', 'manager') then
    raise exception 'Only a Manager or Super Admin can cancel expenses' using errcode = '42501';
  end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Enter the reason' using errcode = 'P0001'; end if;
  select * into e from public.expenses where id = p_id for update;
  if not found or not public.can_see_expense(e.employee_id, e.brand_id) then raise exception 'Expense not found' using errcode = 'P0001'; end if;
  if e.status not in ('submitted', 'approved', 'returned') then
    raise exception 'A % expense cannot be cancelled', e.status using errcode = 'P0001';
  end if;
  if e.reimbursed_amount > 0 then
    raise exception 'Money was already paid for this expense; cancel that reimbursement first' using errcode = 'P0001';
  end if;
  update public.expenses set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = trim(p_reason)
   where id = p_id;
  perform public.expense_log(e.id, 'cancelled', e.status, 'cancelled', e.amount, p_reason);
  if e.status = 'approved' then
    perform public.reverse_journal('expense', e.id, 'approved', 'cancelled', public.ist_today(), 'Cancelled: ' || e.expense_no || ' · ' || trim(p_reason));
  end if;
end $$;
revoke all on function public.expense_cancel(uuid, text) from public, anon;
grant execute on function public.expense_cancel(uuid, text) to authenticated;

-- Pay an employee for approved expenses, fully or partly.
-- p_lines: [{"expense_id": uuid, "amount": n}] — all for one employee. p_client_uuid makes a retry safe.
drop function if exists public.reimburse_expenses(uuid[], public.payment_method, text);
create or replace function public.reimburse_expenses(p_lines jsonb, p_paid_on date, p_method public.payment_method,
                                                     p_reference text, p_notes text, p_proof_path text, p_client_uuid uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid; v_emp uuid; v_total numeric := 0; v_amt numeric; v_no text; v_name text;
  e public.expenses%rowtype; l jsonb;
  v_ids uuid[];
begin
  if not public.can_reimburse_expenses() then
    raise exception 'You are not allowed to reimburse expenses' using errcode = '42501';
  end if;
  if p_client_uuid is not null then
    select id into v_id from public.reimbursements where client_uuid = p_client_uuid;
    if found then return v_id; end if;
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Choose the expenses to pay' using errcode = 'P0001';
  end if;
  if p_paid_on is null or p_paid_on > public.ist_today() then raise exception 'The payment date cannot be in the future' using errcode = 'P0001'; end if;
  if p_method = 'cheque' and coalesce(trim(p_reference), '') = '' then raise exception 'Enter the cheque number' using errcode = 'P0001'; end if;
  if p_proof_path is not null and split_part(p_proof_path, '/', 1) <> auth.uid()::text then
    raise exception 'Upload the payment proof again' using errcode = '42501';
  end if;
  select array_agg((x ->> 'expense_id')::uuid) into v_ids from jsonb_array_elements(p_lines) x;
  if cardinality(v_ids) <> (select count(distinct u) from unnest(v_ids) u) then
    raise exception 'An expense is listed twice' using errcode = 'P0001';
  end if;

  -- Lock in a fixed order so two payments for the same expenses wait for each other,
  -- then look for the same request again (it may have committed while we waited).
  perform 1 from public.expenses where id = any (v_ids) order by id for update;
  if p_client_uuid is not null then
    select id into v_id from public.reimbursements where client_uuid = p_client_uuid;
    if found then return v_id; end if;
  end if;
  for e in select * from public.expenses where id = any (v_ids) order by id loop
    if not public.can_see_expense(e.employee_id, e.brand_id) then raise exception 'Expense not found' using errcode = 'P0001'; end if;
    if v_emp is null then v_emp := e.employee_id;
    elsif v_emp <> e.employee_id then raise exception 'Pay one employee at a time' using errcode = 'P0001';
    end if;
    if e.status <> 'approved' then raise exception 'Expense % is not approved', e.expense_no using errcode = 'P0001'; end if;
    if e.paid_by <> 'employee' then raise exception 'Expense % was paid by the company; nothing to reimburse', e.expense_no using errcode = 'P0001'; end if;
    select (x ->> 'amount')::numeric into v_amt from jsonb_array_elements(p_lines) x where (x ->> 'expense_id')::uuid = e.id;
    if v_amt is null or v_amt <= 0 or round(v_amt, 2) <> v_amt then
      raise exception 'Enter the amount to pay for %', e.expense_no using errcode = 'P0001';
    end if;
    if v_amt > e.approved_amount - e.reimbursed_amount then
      raise exception 'Only ₹% is outstanding on %', e.approved_amount - e.reimbursed_amount, e.expense_no using errcode = 'P0001';
    end if;
    if p_paid_on < e.expense_date then raise exception 'Payment date is before the expense date of %', e.expense_no using errcode = 'P0001'; end if;
    v_total := v_total + v_amt;
  end loop;
  if v_emp is null or (select count(*) from public.expenses where id = any (v_ids)) <> cardinality(v_ids) then
    raise exception 'Some expenses were not found' using errcode = 'P0001';
  end if;

  v_no := public.next_document_number('RMB', p_paid_on);
  insert into public.reimbursements (employee_id, paid_on, amount, method, reference_no, notes, proof_path, client_uuid, reimbursement_no, created_by)
  values (v_emp, p_paid_on, v_total, p_method, nullif(trim(p_reference), ''), nullif(trim(p_notes), ''), p_proof_path, p_client_uuid, v_no, auth.uid())
  returning id into v_id;

  for l in select * from jsonb_array_elements(p_lines) loop
    v_amt := (l ->> 'amount')::numeric;
    insert into public.reimbursement_lines (reimbursement_id, expense_id, amount) values (v_id, (l ->> 'expense_id')::uuid, v_amt);
    update public.expenses set reimbursed_amount = reimbursed_amount + v_amt where id = (l ->> 'expense_id')::uuid
    returning * into e;
    perform public.expense_log(e.id, 'reimbursed', 'approved', 'approved', v_amt,
      v_no || case when e.outstanding > 0 then format(' · part payment, ₹%s still due', e.outstanding) else ' · fully paid' end);
  end loop;

  select full_name into v_name from public.profiles where id = v_emp;
  perform public.post_journal('reimbursement', v_id, 'paid', p_paid_on, v_no || ' · ' || coalesce(v_name, ''), null,
    jsonb_build_array(
      jsonb_build_object('account', 'Employee payable', 'employee_id', v_emp, 'debit', v_total),
      jsonb_build_object('account', public.expense_credit_account(p_method::text), 'credit', v_total)));
  return v_id;
end $$;
revoke all on function public.reimburse_expenses(jsonb, date, public.payment_method, text, text, text, uuid) from public, anon;
grant execute on function public.reimburse_expenses(jsonb, date, public.payment_method, text, text, text, uuid) to authenticated;

-- Reverse a wrongly recorded reimbursement (Super Admin). The expenses become outstanding again.
create or replace function public.cancel_reimbursement(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare r public.reimbursements%rowtype; l record;
begin
  if not public.has_role('super_admin') then
    raise exception 'Only the Super Admin can cancel a reimbursement' using errcode = '42501';
  end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Enter the reason' using errcode = 'P0001'; end if;
  select * into r from public.reimbursements where id = p_id for update;
  if not found then raise exception 'Reimbursement not found' using errcode = 'P0001'; end if;
  if r.cancelled_at is not null then raise exception 'Already cancelled' using errcode = 'P0001'; end if;
  perform 1 from public.expenses where id in (select expense_id from public.reimbursement_lines where reimbursement_id = p_id) order by id for update;
  update public.reimbursements set cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = trim(p_reason) where id = p_id;
  for l in select expense_id, amount from public.reimbursement_lines where reimbursement_id = p_id loop
    update public.expenses set reimbursed_amount = reimbursed_amount - l.amount where id = l.expense_id;
    perform public.expense_log(l.expense_id, 'reimbursement_cancelled', 'approved', 'approved', l.amount,
      coalesce(r.reimbursement_no, '') || ' cancelled: ' || trim(p_reason));
  end loop;
  perform public.reverse_journal('reimbursement', p_id, 'paid', 'cancelled', public.ist_today(),
    'Cancelled: ' || coalesce(r.reimbursement_no, '') || ' · ' || trim(p_reason));
end $$;
revoke all on function public.cancel_reimbursement(uuid, text) from public, anon;
grant execute on function public.cancel_reimbursement(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 7. Read model: list view and database-side totals
-- -----------------------------------------------------------------------------
-- Owner-rights view: rows are filtered by the same rule as the table policy, and the
-- internal office notes are shown to office staff only (employees cannot read that column).
create or replace view public.expense_list as
select e.id, e.expense_no, e.employee_id, emp.full_name as employee_name, emp.role as employee_role,
       e.created_by, cr.full_name as created_by_name, e.source,
       e.category_id, c.name as category_name, e.amount, e.expense_date,
       e.route_id, rt.name as route_name, e.brand_id, b.name as brand_name, b.code as brand_code,
       e.description, e.payment_method, e.paid_by, e.receipt_path,
       case when public.has_role('super_admin', 'manager', 'billing') then e.notes end as notes, e.status,
       e.submitted_at, e.reviewed_by, rv.full_name as reviewed_by_name, e.reviewed_at, e.rejection_reason,
       e.approved_amount, e.reimbursed_amount, e.outstanding, e.reimbursement_status,
       e.cancelled_at, e.cancel_reason, e.client_uuid, e.created_at, e.updated_at,
       exists (select 1 from public.expenses d
                where d.id <> e.id and d.employee_id = e.employee_id and d.expense_date = e.expense_date
                  and d.category_id = e.category_id and d.amount = e.amount
                  and d.status not in ('draft', 'rejected', 'cancelled')) as possible_duplicate
from public.expenses e
join public.profiles emp on emp.id = e.employee_id
left join public.profiles cr on cr.id = e.created_by
left join public.profiles rv on rv.id = e.reviewed_by
join public.expense_categories c on c.id = e.category_id
left join public.routes rt on rt.id = e.route_id
left join public.brands b on b.id = e.brand_id
where public.is_active_user() and public.can_see_expense(e.employee_id, e.brand_id);
revoke all on public.expense_list from anon;
grant select on public.expense_list to authenticated;

-- Employees read their rows from the table too, but never the office notes column.
revoke select on public.expenses from authenticated;
grant select (id, expense_no, employee_id, created_by, source, category_id, amount, expense_date, route_id, brand_id,
              description, payment_method, paid_by, receipt_path, status, submitted_at, reviewed_by, reviewed_at,
              rejection_reason, approved_amount, reimbursed_amount, outstanding, reimbursement_status,
              cancelled_at, cancelled_by, cancel_reason, client_uuid, created_at, updated_at)
  on public.expenses to authenticated;
revoke all on public.expense_categories, public.reimbursement_lines, public.expense_events,
              public.journal_entries, public.journal_lines from anon;

-- p_brand: null = any, 'none' = expenses for all brands (no brand), otherwise a brand id.
create or replace function public.expense_summary(p_from date, p_to date, p_employee uuid default null, p_brand text default null,
                                                  p_route uuid default null, p_category uuid default null, p_status text default null)
returns table (incurred numeric, submitted numeric, pending numeric, pending_count bigint, approved numeric, approved_count bigint,
               rejected numeric, rejected_count bigint, returned numeric, outstanding numeric, reimbursed numeric,
               company_paid numeric, employee_paid numeric, drafts bigint)
language sql stable security invoker set search_path = public as $$
  select
    coalesce(sum(case when status in ('submitted', 'approved') then coalesce(approved_amount, amount) end), 0),
    coalesce(sum(case when status not in ('draft') then amount end), 0),
    coalesce(sum(case when status = 'submitted' then amount end), 0),
    count(*) filter (where status = 'submitted'),
    coalesce(sum(case when status = 'approved' then approved_amount end), 0),
    count(*) filter (where status = 'approved'),
    coalesce(sum(case when status = 'rejected' then amount end), 0),
    count(*) filter (where status = 'rejected'),
    coalesce(sum(case when status = 'returned' then amount end), 0),
    coalesce(sum(outstanding), 0),
    coalesce(sum(reimbursed_amount), 0),
    coalesce(sum(case when status = 'approved' and paid_by = 'company' then approved_amount end), 0),
    coalesce(sum(case when status = 'approved' and paid_by = 'employee' then approved_amount end), 0),
    count(*) filter (where status = 'draft')
  from public.expenses
  where expense_date between p_from and p_to
    and (p_employee is null or employee_id = p_employee)
    and (p_brand is null or (p_brand = 'none' and brand_id is null) or brand_id::text = p_brand)
    and (p_route is null or route_id = p_route)
    and (p_category is null or category_id = p_category)
    and (p_status is null or status = p_status
         or (p_status = 'to_reimburse' and outstanding > 0))
$$;
revoke all on function public.expense_summary(date, date, uuid, text, uuid, uuid, text) from public, anon;
grant execute on function public.expense_summary(date, date, uuid, text, uuid, uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 8. Receipts: the employee can open a receipt the office uploaded for them,
--    and the proof of a payment made to them.
-- -----------------------------------------------------------------------------
drop policy if exists "receipts read" on storage.objects;
create policy "receipts read" on storage.objects for select to authenticated
  using (bucket_id = 'expense-receipts'
         and (public.has_role('super_admin', 'manager', 'billing')
              or (storage.foldername(name))[1] = auth.uid()::text
              or exists (select 1 from public.expenses e where e.receipt_path = name and e.employee_id = auth.uid())
              or exists (select 1 from public.reimbursements r where r.proof_path = name and r.employee_id = auth.uid())));
