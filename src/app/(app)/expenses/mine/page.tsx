import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { expenseSummary, listExpenses, loadExpenseOptions } from "@/lib/expenses";
import { expenseAccess } from "../access";
import { ExpenseListBody, readFilters, type ExpenseSP } from "../expense-list-view";

export const metadata: Metadata = { title: "My expenses" };

export default async function MyExpensesPage({ searchParams }: { searchParams: Promise<ExpenseSP> }) {
  const { user, profile } = await requireRole();
  const sp = await searchParams;
  const { office } = expenseAccess(profile.role);
  const supabase = await createClient();
  const f = readFilters(sp, { employee: user.id });
  const [options, list, summary] = await Promise.all([loadExpenseOptions(supabase), listExpenses(supabase, f), expenseSummary(supabase, f)]);
  return (
    <ExpenseListBody path="/expenses/mine" sp={sp} rows={list.rows} total={list.total} page={list.page} summary={summary} options={options}
      me={{ id: user.id, name: profile.full_name, role: profile.role }} office={office} showEmployee={false} />
  );
}
