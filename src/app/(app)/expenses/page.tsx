import Link from "next/link";
import type { Metadata } from "next";
import { BadgeIndianRupee, Building2, CheckCircle2, Clock, Receipt, Send, Settings2, Wallet, XCircle } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { inr } from "@/lib/format";
import { todayIST } from "@/lib/gst";
import { EXPENSE_STATUS, type ExpenseRow } from "@/lib/expense-labels";
import { PAGE_SIZE, expenseQuery, expenseSummary, listExpenses, loadExpenseOptions, monthRange, type ExpenseFilters } from "@/lib/expenses";
import { Button, Card, Input, PageHeader, Select, cn } from "@/components/ui";
import { Chip } from "@/components/chip";
import { StatCard } from "@/components/stat-card";
import { ExpenseForm } from "./expense-form";
import { ExpenseTable } from "./expense-table";
import { PaymentsList, ReimbursePanel, type PaymentRow } from "./reimburse-panel";

export const metadata: Metadata = { title: "Expenses" };

type SP = { tab?: string; month?: string; from?: string; to?: string; employee?: string; category?: string; brand?: string; route?: string; status?: string; q?: string; sort?: string; page?: string };
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { user, profile } = await requireRole();
  const sp = await searchParams;
  const mgr = profile.role === "super_admin" || profile.role === "manager";
  const office = mgr || profile.role === "billing";
  const tabs = ["mine", ...(mgr ? ["approve"] : []), ...(office ? ["reimburse", "all"] : [])];
  const tab = tabs.includes(sp.tab ?? "") ? sp.tab! : mgr ? "approve" : office ? "all" : "mine";
  const today = todayIST();
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : today.slice(0, 7);
  const range = sp.from && DATE.test(sp.from) && sp.to && DATE.test(sp.to) ? { from: sp.from, to: sp.to } : monthRange(month);
  const supabase = await createClient();

  const f: ExpenseFilters = {
    ...range,
    employee: tab === "mine" ? user.id : sp.employee,
    category: sp.category, brand: sp.brand, route: sp.route, status: sp.status, q: sp.q,
    sort: (["amount", "-amount", "submitted"] as const).find((s) => s === sp.sort) ?? "date",
    page: Math.max(1, Number(sp.page) || 1),
  };
  const ALL_TIME = { from: "2020-01-01", to: today };

  const [options, canPayRes] = await Promise.all([loadExpenseOptions(supabase), supabase.rpc("can_reimburse_expenses")]);
  const canPay = canPayRes.data === true;

  let list: { rows: ExpenseRow[]; total: number; page: number } = { rows: [], total: 0, page: 1 };
  let summary = null;
  let groups: { employeeId: string; name: string; rows: ExpenseRow[] }[] = [];
  let payments: PaymentRow[] = [];
  let pendingTotal = 0;

  if (tab === "mine" || tab === "all") {
    [list, summary] = await Promise.all([listExpenses(supabase, f), expenseSummary(supabase, f)]);
  } else if (tab === "approve") {
    const af: ExpenseFilters = { ...ALL_TIME, employee: sp.employee, category: sp.category, brand: sp.brand, route: sp.route, q: sp.q, status: "submitted", sort: f.sort === "date" ? "submitted" : f.sort, page: f.page };
    const [l, s] = await Promise.all([listExpenses(supabase, af), expenseSummary(supabase, af)]);
    list = l; pendingTotal = s.pending;
  } else {
    const [{ data: owed }, { data: pays }] = await Promise.all([
      expenseQuery(supabase, { ...ALL_TIME, status: "to_reimburse", employee: sp.employee }).order("expense_date").limit(1000),
      supabase.from("reimbursements").select("id, reimbursement_no, employee_id, paid_on, amount, method, reference_no, notes, cancelled_at, cancel_reason, created_by").order("created_at", { ascending: false }).limit(25),
    ]);
    const m = new Map<string, { employeeId: string; name: string; rows: ExpenseRow[] }>();
    for (const r of (owed ?? []) as ExpenseRow[]) {
      if (!m.has(r.employee_id)) m.set(r.employee_id, { employeeId: r.employee_id, name: r.employee_name, rows: [] });
      m.get(r.employee_id)!.rows.push(r);
    }
    groups = [...m.values()].sort((a, b) => b.rows.reduce((t, r) => t + Number(r.outstanding), 0) - a.rows.reduce((t, r) => t + Number(r.outstanding), 0));
    const nm = new Map(options.allPeople.map((p) => [p.id, p.full_name]));
    payments = (pays ?? []).map((p) => ({ ...p, employee_name: nm.get(p.employee_id) ?? "", created_by_name: (p.created_by ? nm.get(p.created_by) : null) ?? null })) as PaymentRow[];
  }

  const qs = (over: Partial<SP>) => {
    const n = new URLSearchParams(Object.entries({ ...sp, ...over }).filter(([, v]) => v !== undefined && v !== "") as [string, string][]);
    return `/expenses?${n}`;
  };
  const pages = Math.max(1, Math.ceil(list.total / PAGE_SIZE));
  const me = { id: user.id, name: profile.full_name, role: profile.role };
  const owedTotal = groups.reduce((t, g) => t + g.rows.reduce((s, r) => s + Number(r.outstanding), 0), 0);

  return (
    <>
      <PageHeader
        title="Expenses"
        description="One expense record for office and salesman entries — approval, reimbursement and accounting in one flow."
        actions={
          <div className="flex gap-2">
            {office && <Link href="/reports#expenses"><Button variant="secondary">Reports</Button></Link>}
            {mgr && <Link href="/expenses/categories"><Button variant="secondary"><Settings2 className="size-4" /> Categories</Button></Link>}
          </div>
        }
      />
      <div className="mb-5 flex flex-wrap gap-2">
        <Chip href="/expenses?tab=mine" active={tab === "mine"}>My expenses</Chip>
        {mgr && <Chip href="/expenses?tab=approve" active={tab === "approve"}>To approve</Chip>}
        {office && <Chip href="/expenses?tab=reimburse" active={tab === "reimburse"}>To reimburse</Chip>}
        {office && <Chip href="/expenses?tab=all" active={tab === "all"}>All expenses</Chip>}
      </div>

      <div className={cn("grid gap-6", (tab === "mine" || tab === "all") && "xl:grid-cols-[1fr_380px]")}>
        <div className="min-w-0 space-y-4">
          {(tab === "mine" || tab === "all" || tab === "approve") && (
            <Card className="p-3">
              <form className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="tab" value={tab} />
                <Input name="q" defaultValue={sp.q} placeholder="Search no., description, employee…" className="w-56" aria-label="Search" />
                {tab !== "approve" && (
                  <>
                    <Input type="month" name="month" defaultValue={sp.from ? "" : month} className="w-40" aria-label="Month" />
                    <span className="self-center text-xs text-slate-400">or</span>
                    <Input type="date" name="from" defaultValue={sp.from} className="w-38" aria-label="From date" />
                    <Input type="date" name="to" defaultValue={sp.to} className="w-38" aria-label="To date" />
                  </>
                )}
                {tab !== "mine" && (
                  <Select name="employee" defaultValue={sp.employee ?? ""} className="w-44" aria-label="Employee">
                    <option value="">All employees</option>
                    {options.allPeople.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                  </Select>
                )}
                <Select name="category" defaultValue={sp.category ?? ""} className="w-40" aria-label="Category">
                  <option value="">All categories</option>
                  {options.categories.map((c) => <option key={c.id} value={c.id}>{c.name}{c.is_active ? "" : " (disabled)"}</option>)}
                </Select>
                <Select name="brand" defaultValue={sp.brand ?? ""} className="w-36" aria-label="Brand">
                  <option value="">Any brand</option>
                  <option value="none">For all brands</option>
                  {options.brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </Select>
                {options.routes.length > 0 && (
                  <Select name="route" defaultValue={sp.route ?? ""} className="w-36" aria-label="Route">
                    <option value="">All routes</option>
                    {options.routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </Select>
                )}
                {tab !== "approve" && (
                  <Select name="status" defaultValue={sp.status ?? ""} className="w-44" aria-label="Status">
                    <option value="">Any status</option>
                    {Object.entries(EXPENSE_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    <option value="to_reimburse">Approved, still to pay</option>
                  </Select>
                )}
                <Select name="sort" defaultValue={sp.sort ?? ""} className="w-40" aria-label="Sort">
                  <option value="">{tab === "approve" ? "Oldest first" : "Newest first"}</option>
                  <option value="-amount">Amount: high to low</option>
                  <option value="amount">Amount: low to high</option>
                </Select>
                <Button type="submit" variant="secondary">Apply</Button>
                <Link href={`/expenses?tab=${tab}`} className="self-center text-xs text-slate-500 hover:text-slate-800">Clear</Link>
              </form>
            </Card>
          )}

          {summary && (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard label="Total incurred" value={inr(summary.incurred, { decimals: false })} icon={Receipt} tone="violet" hint="submitted + approved" />
              <StatCard label="Submitted" value={inr(summary.submitted, { decimals: false })} icon={Send} tone="slate" hint={summary.drafts ? `${summary.drafts} draft${summary.drafts > 1 ? "s" : ""} not sent` : "all sent for approval"} />
              <StatCard label="Waiting approval" value={inr(summary.pending, { decimals: false })} icon={Clock} tone="amber" hint={`${summary.pending_count} expense${summary.pending_count === 1 ? "" : "s"}`} href={mgr ? "/expenses?tab=approve" : undefined} />
              <StatCard label="Approved" value={inr(summary.approved, { decimals: false })} icon={CheckCircle2} tone="blue" hint={`${summary.approved_count} expense${summary.approved_count === 1 ? "" : "s"}`} />
              <StatCard label="Rejected" value={inr(summary.rejected, { decimals: false })} icon={XCircle} tone="red" hint={`${summary.rejected_count} expense${summary.rejected_count === 1 ? "" : "s"}`} />
              <StatCard label="Still to reimburse" value={inr(summary.outstanding, { decimals: false })} icon={Wallet} tone="orange" href={office ? "/expenses?tab=reimburse" : undefined} />
              <StatCard label="Reimbursed" value={inr(summary.reimbursed, { decimals: false })} icon={BadgeIndianRupee} tone="green" hint="paid to employees" />
              <StatCard label="Company paid" value={inr(summary.company_paid, { decimals: false })} icon={Building2} tone="teal" hint="no reimbursement" />
            </div>
          )}

          {tab === "approve" && (
            <p className="text-sm text-slate-600"><b>{list.total}</b> expense{list.total === 1 ? "" : "s"} waiting for approval · <b className="tabular">{inr(pendingTotal)}</b>. Tick several to approve, return or reject them together.</p>
          )}

          {tab === "reimburse" ? (
            <>
              <p className="text-sm text-slate-600">Approved expenses paid by employees and not yet fully paid back: <b className="tabular">{inr(owedTotal)}</b>. Company-paid expenses never appear here.</p>
              <ReimbursePanel groups={groups} canPay={canPay} me={user.id} />
              <PaymentsList rows={payments} superAdmin={profile.role === "super_admin"} />
            </>
          ) : (
            <>
              <ExpenseTable rows={list.rows} me={me} office={office} options={options} selectable={tab === "approve"} showEmployee={tab !== "mine"}
                empty={tab === "approve" ? "Nothing waiting for approval." : "No expenses for these filters."} />
              {pages > 1 && (
                <div className="flex items-center justify-between text-sm text-slate-600">
                  <span>{(list.page - 1) * PAGE_SIZE + 1}–{Math.min(list.page * PAGE_SIZE, list.total)} of {list.total}</span>
                  <div className="flex gap-2">
                    {list.page > 1 && <Link href={qs({ page: String(list.page - 1) })}><Button variant="secondary" size="sm">Previous</Button></Link>}
                    {list.page < pages && <Link href={qs({ page: String(list.page + 1) })}><Button variant="secondary" size="sm">Next</Button></Link>}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        {(tab === "mine" || tab === "all") && (
          <div><ExpenseForm me={{ id: user.id, name: profile.full_name }} office={office} options={options} /></div>
        )}
      </div>
    </>
  );
}
