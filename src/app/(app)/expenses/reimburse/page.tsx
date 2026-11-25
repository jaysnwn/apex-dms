import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { inr } from "@/lib/format";
import { todayIST } from "@/lib/gst";
import type { ExpenseRow } from "@/lib/expense-labels";
import { expenseQuery, loadExpenseOptions } from "@/lib/expenses";
import { ALL_TIME_FROM, expenseAccess } from "../access";
import { PaymentsList, ReimbursePanel, type PaymentRow } from "../reimburse-panel";

export const metadata: Metadata = { title: "Expenses to reimburse" };

// Approved expenses that employees paid from their own pocket and are not yet fully
// paid back, one card per employee, then the recent payments.
export default async function ReimbursePage({ searchParams }: { searchParams: Promise<{ employee?: string }> }) {
  const { user, profile } = await requireRole();
  const { office } = expenseAccess(profile.role);
  if (!office) redirect("/expenses/mine");
  const sp = await searchParams;
  const supabase = await createClient();

  const [options, canPayRes, { data: owed }, { data: pays }] = await Promise.all([
    loadExpenseOptions(supabase),
    supabase.rpc("can_reimburse_expenses"),
    expenseQuery(supabase, { from: ALL_TIME_FROM, to: todayIST(), status: "to_reimburse", employee: sp.employee }).order("expense_date").limit(1000),
    supabase.from("reimbursements").select("id, reimbursement_no, employee_id, paid_on, amount, method, reference_no, notes, cancelled_at, cancel_reason, created_by").order("created_at", { ascending: false }).limit(25),
  ]);

  const m = new Map<string, { employeeId: string; name: string; rows: ExpenseRow[] }>();
  for (const r of (owed ?? []) as ExpenseRow[]) {
    if (!m.has(r.employee_id)) m.set(r.employee_id, { employeeId: r.employee_id, name: r.employee_name, rows: [] });
    m.get(r.employee_id)!.rows.push(r);
  }
  const sum = (rows: ExpenseRow[]) => rows.reduce((t, r) => t + Number(r.outstanding), 0);
  const groups = [...m.values()].sort((a, b) => sum(b.rows) - sum(a.rows));
  const owedTotal = groups.reduce((t, g) => t + sum(g.rows), 0);
  const nm = new Map(options.allPeople.map((p) => [p.id, p.full_name]));
  const payments = (pays ?? []).map((p) => ({ ...p, employee_name: nm.get(p.employee_id) ?? "", created_by_name: (p.created_by ? nm.get(p.created_by) : null) ?? null })) as PaymentRow[];

  return (
    <div className="space-y-4">
      {groups.length > 0 && (
        <p className="text-sm text-text-2">
          <b className="tabular text-text">{inr(owedTotal)}</b> to pay back to {groups.length} employee{groups.length === 1 ? "" : "s"}. Tick the expenses you are paying and press Pay. Company-paid expenses never appear here.
        </p>
      )}
      <ReimbursePanel groups={groups} canPay={canPayRes.data === true} me={user.id} />
      <PaymentsList rows={payments} superAdmin={profile.role === "super_admin"} />
    </div>
  );
}
