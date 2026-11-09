import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import type { ExpenseCategory } from "@/lib/expense-labels";
import { CategoryEditor } from "./category-editor";

export const metadata: Metadata = { title: "Expense categories" };

export default async function ExpenseCategoriesPage() {
  await requireRole("super_admin", "manager");
  const supabase = await createClient();
  const [{ data: cats }, { data: used }] = await Promise.all([
    supabase.from("expense_categories").select("id, code, name, receipt_required, route_required, approval_required, auto_approve_limit, is_active, sort_order").order("sort_order").order("name"),
    supabase.from("expenses").select("category_id").limit(10000),
  ]);
  const counts: Record<string, number> = {};
  for (const u of used ?? []) counts[u.category_id as string] = (counts[u.category_id as string] ?? 0) + 1;
  return (
    <>
      <Link href="/expenses" className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="size-4" /> Expenses</Link>
      <PageHeader title="Expense categories" description="One list for the office and the salesman app. Disable a category instead of deleting it — old expenses keep it." />
      <CategoryEditor categories={(cats ?? []) as ExpenseCategory[]} counts={counts} />
    </>
  );
}
