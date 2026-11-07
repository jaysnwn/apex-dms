import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayIST } from "@/lib/gst";
import { ExpenseScreen, type MyExpense } from "./expense-screen";

export const metadata: Metadata = { title: "Expenses" };

export default async function FieldExpensesPage({ searchParams }: { searchParams: Promise<{ add?: string }> }) {
  const { user } = await requireRole("salesman", "manager", "super_admin");
  const { add } = await searchParams;
  const supabase = await createClient();
  const today = todayIST();
  const since = today.slice(0, 8) + "01";
  const [{ data: rows }, { data: plan }] = await Promise.all([
    supabase.from("expenses").select("id, expense_date, category, amount, description, status, rejection_reason").eq("salesman_id", user.id)
      .or(`expense_date.gte.${since},status.in.(submitted,approved)`).order("expense_date", { ascending: false }).order("created_at", { ascending: false }).limit(200),
    supabase.from("route_plans").select("route_id").eq("salesman_id", user.id).eq("plan_date", today).limit(1).maybeSingle(),
  ]);
  return <ExpenseScreen userId={user.id} expenses={(rows ?? []) as MyExpense[]} routeId={(plan?.route_id as string) ?? null} openAdd={add === "1"} monthStart={since} />;
}
