import "server-only";

import { createClient } from "@/lib/supabase/server";
import { listSuppliers } from "./actions";
import { getBrandContext } from "@/lib/brand";

export async function builderOptions() {
  const supabase = await createClient();
  const ctx = await getBrandContext();
  const ids = ctx.brands.map((b) => b.id);
  const [suppliers, { data: wh }, { data: co }] = await Promise.all([
    listSuppliers(),
    supabase.from("warehouses").select("id, name, brand_id").eq("is_active", true).in("brand_id", ids).order("name"),
    supabase.from("company_settings").select("state_code").eq("id", 1).maybeSingle(),
  ]);
  return {
    suppliers,
    warehouses: (wh ?? []) as { id: string; name: string; brand_id: string }[],
    brands: ctx.brands.map((b) => ({ id: b.id, name: b.name })),
    defaultBrandId: ctx.current?.id ?? ctx.brands[0]?.id,
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
