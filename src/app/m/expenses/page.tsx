import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayIST } from "@/lib/gst";
import { expenseSummary, loadExpenseOptions } from "@/lib/expenses";
import type { ExpenseRow } from "@/lib/expense-labels";
import { ExpenseScreen } from "./expense-screen";

export const metadata: Metadata = { title: "Expenses" };

// The salesman's view of the same expense records the office uses.
export default async function FieldExpensesPage({ searchParams }: { searchParams: Promise<{ add?: string }> }) {
  const { user } = await requireRole("salesman", "manager", "super_admin");
  const { add } = await searchParams;
  const supabase = await createClient();
  const today = todayIST();
  const monthStart = today.slice(0, 8) + "01";

  const [options, { data: rows }, { data: plan }, month, allTime] = await Promise.all([
    loadExpenseOptions(supabase),
    supabase.from("expense_list").select("*").eq("employee_id", user.id)
      .or(`expense_date.gte.${monthStart},status.in.(draft,submitted,returned),outstanding.gt.0`)
      .order("expense_date", { ascending: false }).order("created_at", { ascending: false }).limit(200),
    supabase.from("route_plans").select("route_id").eq("salesman_id", user.id).eq("plan_date", today).limit(1).maybeSingle(),
    expenseSummary(supabase, { from: monthStart, to: today, employee: user.id }),
    expenseSummary(supabase, { from: "2020-01-01", to: today, employee: user.id }),
  ]);
  const defaultRoute = (plan?.route_id as string | undefined) ?? options.routes.find((r) => r.is_active && r.default_salesman_id === user.id)?.id ?? null;

  return (
    <ExpenseScreen
      userId={user.id}
      expenses={(rows ?? []) as ExpenseRow[]}
      categories={options.categories.filter((c) => c.is_active)}
      routes={options.routes.filter((r) => r.is_active)}
      brands={options.brands}
      defaultRoute={defaultRoute}
      openAdd={add === "1"}
      month={month}
      toBePaid={allTime.outstanding}
    />
  );
}
