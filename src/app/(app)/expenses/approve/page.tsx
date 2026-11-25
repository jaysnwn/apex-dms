import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { inr } from "@/lib/format";
import { expenseSummary, listExpenses, loadExpenseOptions } from "@/lib/expenses";
import { expenseAccess } from "../access";
import { ExpenseFilterBar, Pager, readFilters, type ExpenseSP } from "../expense-list-view";
import { ExpenseTable } from "../expense-table";

export const metadata: Metadata = { title: "Expenses to approve" };

// Everything waiting for approval, whatever its date, oldest first.
export default async function ApproveExpensesPage({ searchParams }: { searchParams: Promise<ExpenseSP> }) {
  const { user, profile } = await requireRole();
  const { mgr, office } = expenseAccess(profile.role);
  if (!mgr) redirect("/expenses/mine");
  const sp = await searchParams;
  const supabase = await createClient();
  const f = readFilters(sp, { allTime: true, status: "submitted", sort: "submitted" });
  const [options, list, summary] = await Promise.all([loadExpenseOptions(supabase), listExpenses(supabase, f), expenseSummary(supabase, f)]);
  return (
    <>
      <ExpenseFilterBar path="/expenses/approve" sp={sp} options={options} showEmployee showDates={false} />
      {list.total > 0 && (
        <p className="mb-3 text-sm text-text-2">
          <b className="text-text">{list.total}</b> waiting · <b className="tabular text-text">{inr(summary.pending)}</b>. Open one to check it, or tick several to approve, return or reject them together.
        </p>
      )}
      <ExpenseTable rows={list.rows} me={{ id: user.id, name: profile.full_name, role: profile.role }} office={office} options={options}
        selectable showEmployee empty="Nothing waiting for approval." emptyArt="check" />
      <Pager path="/expenses/approve" sp={sp} page={list.page} total={list.total} />
    </>
  );
}
