import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadExpenseOptions } from "@/lib/expenses";
import { expenseAccess } from "../access";
import { ExpenseForm } from "../expense-form";

export const metadata: Metadata = { title: "Add expense" };

export default async function NewExpensePage() {
  const { user, profile } = await requireRole();
  const { office } = expenseAccess(profile.role);
  const supabase = await createClient();
  const options = await loadExpenseOptions(supabase);
  return (
    <div className="max-w-2xl">
      <ExpenseForm me={{ id: user.id, name: profile.full_name }} office={office} options={options} />
    </div>
  );
}
