import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { expenseAccess } from "./access";
import { ExpensesHeader } from "./expenses-header";

export default async function ExpensesLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireRole();
  const { mgr, office } = expenseAccess(profile.role);
  const supabase = await createClient();
  const [approve, owed] = await Promise.all([
    mgr ? supabase.from("expense_list").select("id", { count: "exact", head: true }).eq("status", "submitted") : Promise.resolve({ count: 0 }),
    office ? supabase.from("expense_list").select("id", { count: "exact", head: true }).gt("outstanding", 0) : Promise.resolve({ count: 0 }),
  ]);
  return (
    <>
      <ExpensesHeader
        office={office}
        mgr={mgr}
        items={[
          { href: "/expenses/new", label: "Add expense" },
          ...(mgr ? [{ href: "/expenses/approve", label: "To approve", count: approve.count ?? 0 }] : []),
          ...(office ? [{ href: "/expenses/reimburse", label: "To reimburse", count: owed.count ?? 0 }] : []),
          { href: "/expenses/mine", label: "My expenses" },
          ...(office ? [{ href: "/expenses/all", label: "All expenses" }] : []),
        ]}
      />
      {children}
    </>
  );
}
