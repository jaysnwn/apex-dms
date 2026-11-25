import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { expenseSummary, listExpenses, loadExpenseOptions } from "@/lib/expenses";
import { expenseAccess } from "../access";
import { ExpenseListBody, readFilters, type ExpenseSP } from "../expense-list-view";

export const metadata: Metadata = { title: "All expenses" };

export default async function AllExpensesPage({ searchParams }: { searchParams: Promise<ExpenseSP> }) {
  const { user, profile } = await requireRole();
  const { office } = expenseAccess(profile.role);
  if (!office) redirect("/expenses/mine");
  const sp = await searchParams;
  const supabase = await createClient();
  const f = readFilters(sp);
  const [options, list, summary] = await Promise.all([loadExpenseOptions(supabase), listExpenses(supabase, f), expenseSummary(supabase, f)]);
  return (
    <ExpenseListBody path="/expenses/all" sp={sp} rows={list.rows} total={list.total} page={list.page} summary={summary} options={options}
      me={{ id: user.id, name: profile.full_name, role: profile.role }} office showEmployee />
  );
}
