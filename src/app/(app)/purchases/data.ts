import "server-only";

import { createClient } from "@/lib/supabase/server";
import { listSuppliers } from "./actions";

export async function builderOptions() {
  const supabase = await createClient();
  const [suppliers, { data: wh }, { data: brands }, { data: co }] = await Promise.all([
    listSuppliers(),
    supabase.from("warehouses").select("id, name").eq("is_active", true).order("name"),
    supabase.from("brands").select("id, name").eq("is_active", true).order("name"),
    supabase.from("company_settings").select("state_code").eq("id", 1).maybeSingle(),
  ]);
  return {
    suppliers,
    warehouses: (wh ?? []) as { id: string; name: string }[],
    brands: (brands ?? []) as { id: string; name: string }[],
    companyState: (co?.state_code as string) || "27",
  };
}

// paid / not yet due / due today / overdue, for a supplier bill.
export function billStatus(balance: number, dueDate: string | null, today: string) {
  if (balance <= 0.004) return "paid";
  if (!dueDate) return "not_yet_due";
  if (dueDate > today) return "not_yet_due";
  if (dueDate === today) return "due";
  return "overdue";
}
