import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getBrandContext } from "@/lib/brand";
import { warehouseOr } from "@/lib/warehouse-scope";
import { todayIST } from "@/lib/gst";
import { EntryForms } from "./entry-forms";
import { ENTRY_TYPE_KEYS, type EntryType } from "./entry-types";

export const metadata: Metadata = { title: "Stock entry" };

// Stock of every brand is entered from one screen: the product decides the brand,
// and the warehouse may be the shared one.
export default async function StockEntryPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const { profile } = await requireRole("super_admin", "manager", "warehouse");
  const { type } = await searchParams;
  const ctx = await getBrandContext();

  const supabase = await createClient();
  const { data: warehouses } = await supabase.from("warehouses").select("id, name").eq("is_active", true)
    .or(warehouseOr(ctx.brands.map((b) => b.id))).order("name");
  const isMgr = profile.role === "super_admin" || profile.role === "manager";
  const allowed = ENTRY_TYPE_KEYS.filter((k) => isMgr || k !== "adjustment");
  const initial = (allowed as string[]).includes(type ?? "") ? (type as EntryType) : "stock_in";

  return (
    <EntryForms
      brandId={ctx.current?.id ?? null}
      brandName={ctx.current?.name ?? "This company"}
      warehouses={warehouses ?? []}
      initialType={initial}
      allowed={allowed}
      canSetCost={profile.role !== "warehouse"}
      today={todayIST()}
    />
  );
}
