import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReportDef, ReportFilters, ReportResult } from "./reports";

// Expense reports. Every figure is read from expense_list / the journal; nothing is
// typed in by hand. Rejected, cancelled and draft expenses are left out unless noted.
type Row = {
  expense_no: string | null; employee_id: string; employee_name: string; category_name: string; route_name: string | null;
  brand_name: string | null; expense_date: string; amount: number; approved_amount: number | null; reimbursed_amount: number;
  outstanding: number; status: string; paid_by: string; description: string | null; reviewed_at: string | null;
};

const OFFICE = ["super_admin", "manager", "billing"];
const n = (v: unknown) => Number(v ?? 0);
const UUID = /^[0-9a-f-]{36}$/i;

async function pageAll<T>(make: () => { range: (a: number, b: number) => PromiseLike<{ data: unknown[] | null; error: unknown }> }) {
  const out: T[] = [];
  for (let from = 0; from <= 200000; from += 1000) {
    const { data, error } = await make().range(from, from + 999);
    if (error) throw error;
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

async function rows(sb: SupabaseClient, f: ReportFilters) {
  return pageAll<Row>(() => {
    let q = sb.from("expense_list")
      .select("expense_no, employee_id, employee_name, category_name, route_name, brand_name, expense_date, amount, approved_amount, reimbursed_amount, outstanding, status, paid_by, description, reviewed_at")
      .gte("expense_date", f.from).lte("expense_date", f.to).in("status", ["submitted", "approved"]).order("expense_date");
    if (f.employee && UUID.test(f.employee)) q = q.eq("employee_id", f.employee);
    if (f.route && UUID.test(f.route)) q = q.eq("route_id", f.route);
    if (f.category && UUID.test(f.category)) q = q.eq("category_id", f.category);
    return q;
  });
}

// Groups rows by a label and adds the standard money columns.
function by(label: string, key: (r: Row) => string): ReportDef["run"] {
  return async (sb, f): Promise<ReportResult> => {
    const list = await rows(sb, f);
    const m = new Map<string, Record<string, string | number | null>>();
    for (const r of list) {
      const k = key(r);
      const a = m.get(k) ?? { name: k, count: 0, pending: 0, approved: 0, employee_paid: 0, company_paid: 0, reimbursed: 0, outstanding: 0 };
      a.count = n(a.count) + 1;
      if (r.status === "submitted") a.pending = n(a.pending) + n(r.amount);
      if (r.status === "approved") {
        a.approved = n(a.approved) + n(r.approved_amount);
        if (r.paid_by === "company") a.company_paid = n(a.company_paid) + n(r.approved_amount);
        else a.employee_paid = n(a.employee_paid) + n(r.approved_amount);
        a.reimbursed = n(a.reimbursed) + n(r.reimbursed_amount);
        a.outstanding = n(a.outstanding) + n(r.outstanding);
      }
      m.set(k, a);
    }
    const out = [...m.values()].sort((x, y) => n(y.approved) + n(y.pending) - (n(x.approved) + n(x.pending)));
    const keys = ["count", "pending", "approved", "employee_paid", "company_paid", "reimbursed", "outstanding"];
    return {
      columns: [
        { key: "name", label },
        { key: "count", label: "Expenses", type: "int" },
        { key: "pending", label: "Waiting approval", type: "money" },
        { key: "approved", label: "Approved", type: "money" },
        { key: "employee_paid", label: "Paid by employee", type: "money" },
        { key: "company_paid", label: "Paid by company", type: "money" },
        { key: "reimbursed", label: "Reimbursed", type: "money" },
        { key: "outstanding", label: "Still to reimburse", type: "money" },
      ],
      rows: out,
      totals: Object.fromEntries(keys.map((k) => [k, out.reduce((t, r) => t + n(r[k]), 0)])),
      note: "Submitted and approved expenses by expense date. Drafts, rejected and cancelled expenses are not included.",
    };
  };
}

const F: ReportDef["filters"] = ["employee", "route", "category"];

export const EXPENSE_REPORTS: ReportDef[] = [
  { key: "expense-employee", title: "Employee-wise expenses", description: "Approved, waiting, reimbursed and still owed per employee.", group: "Expenses", roles: OFFICE, filters: F, run: by("Employee", (r) => r.employee_name) },
  { key: "expense-route", title: "Route-wise expenses", description: "Expenses per route (no route = office / general).", group: "Expenses", roles: OFFICE, filters: F, run: by("Route", (r) => r.route_name ?? "No route") },
  { key: "expense-brand", title: "Brand-wise expenses", description: "Expenses per brand, and those shared by all brands.", group: "Expenses", roles: OFFICE, filters: F, run: by("Brand", (r) => r.brand_name ?? "All brands (shared)") },
  { key: "expense-category", title: "Category-wise expenses", description: "Fuel, food, stay, travel… with totals.", group: "Expenses", roles: OFFICE, filters: F, run: by("Category", (r) => r.category_name) },
  { key: "expense-monthly", title: "Monthly expenses", description: "Expense totals month by month.", group: "Expenses", roles: OFFICE, filters: F, run: by("Month", (r) => r.expense_date.slice(0, 7)) },
  { key: "expense-paid-by", title: "Company-paid vs employee-paid", description: "What the company paid directly and what employees paid and claimed.", group: "Expenses", roles: OFFICE, filters: F, run: by("Paid by", (r) => (r.paid_by === "company" ? "Company" : "Employee")) },
  {
    key: "expense-outstanding", title: "Reimbursement outstanding", description: "Approved expenses still owed to employees (as of today), oldest first.", group: "Expenses", roles: OFFICE, filters: ["employee"],
    run: async (sb, f) => {
      const list = await pageAll<Row>(() => {
        let q = sb.from("expense_list").select("expense_no, employee_id, employee_name, category_name, route_name, brand_name, expense_date, amount, approved_amount, reimbursed_amount, outstanding, status, paid_by, description, reviewed_at")
          .gt("outstanding", 0).lte("expense_date", f.to).order("expense_date");
        if (f.employee && UUID.test(f.employee)) q = q.eq("employee_id", f.employee);
        return q;
      });
      const today = new Date().toISOString().slice(0, 10);
      const out = list.map((r) => ({
        employee: r.employee_name, no: r.expense_no, date: r.expense_date, category: r.category_name, description: r.description,
        approved: n(r.approved_amount), reimbursed: n(r.reimbursed_amount), outstanding: n(r.outstanding),
        days: r.reviewed_at ? Math.max(0, Math.round((Date.parse(today) - Date.parse(r.reviewed_at.slice(0, 10))) / 86400000)) : null,
      }));
      return {
        columns: [
          { key: "employee", label: "Employee" }, { key: "no", label: "Expense no." }, { key: "date", label: "Date", type: "date" },
          { key: "category", label: "Category" }, { key: "description", label: "Description" },
          { key: "approved", label: "Approved", type: "money" }, { key: "reimbursed", label: "Paid so far", type: "money" },
          { key: "outstanding", label: "Outstanding", type: "money" }, { key: "days", label: "Days since approval", type: "int" },
        ],
        rows: out,
        totals: { approved: out.reduce((t, r) => t + r.approved, 0), reimbursed: out.reduce((t, r) => t + r.reimbursed, 0), outstanding: out.reduce((t, r) => t + r.outstanding, 0) },
        note: "Expenses dated up to the To date. Company-paid expenses never appear here.",
      };
    },
  },
  {
    key: "expense-journal", title: "Expense journal (accounting)", description: "Double-entry postings for approvals, reimbursements and reversals — for Tally / your accountant.", group: "Expenses", roles: ["super_admin", "manager", "billing"], filters: [],
    run: async (sb, f) => {
      type J = { entry_date: string; source_type: string; event: string; narration: string | null; journal_lines: { account: string; debit: number; credit: number; employee_id: string | null }[] };
      const [list, people] = await Promise.all([
        pageAll<J>(() => sb.from("journal_entries").select("entry_date, source_type, event, narration, created_at, journal_lines(account, debit, credit, employee_id)").gte("entry_date", f.from).lte("entry_date", f.to).order("entry_date").order("created_at")),
        sb.from("tenant_people").select("id, full_name"),
      ]);
      const nm = new Map((people.data ?? []).map((p) => [p.id as string, p.full_name as string]));
      const EV: Record<string, string> = { "expense:approved": "Expense approved", "expense:cancelled": "Expense cancelled (reversal)", "reimbursement:paid": "Reimbursement paid", "reimbursement:cancelled": "Reimbursement reversed" };
      const out = list.flatMap((j) => j.journal_lines.map((l) => ({
        date: j.entry_date, type: EV[`${j.source_type}:${j.event}`] ?? `${j.source_type} ${j.event}`, narration: j.narration,
        account: l.account + (l.employee_id ? ` — ${nm.get(l.employee_id) ?? ""}` : ""), debit: n(l.debit) || null, credit: n(l.credit) || null,
      })));
      return {
        columns: [
          { key: "date", label: "Date", type: "date" }, { key: "type", label: "Entry" }, { key: "narration", label: "Narration" },
          { key: "account", label: "Account" }, { key: "debit", label: "Debit", type: "money" }, { key: "credit", label: "Credit", type: "money" },
        ],
        rows: out,
        totals: { debit: out.reduce((t, r) => t + n(r.debit), 0), credit: out.reduce((t, r) => t + n(r.credit), 0) },
        note: "Each approval, payment and reversal is posted exactly once. Debits always equal credits.",
      };
    },
  },
];
