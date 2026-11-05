import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { EntryForms } from "./entry-forms";

export const metadata: Metadata = { title: "Stock entry" };

const TYPES = ["stock_in", "transfer", "adjustment", "damage", "opening"] as const;

export default async function StockEntryPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const { profile } = await requireRole("super_admin", "manager", "warehouse");
  const { type } = await searchParams;
  const supabase = await createClient();
  const { data: warehouses } = await supabase.from("warehouses").select("id, name").eq("is_active", true).order("name");
  const initial = (TYPES as readonly string[]).includes(type ?? "") ? (type as (typeof TYPES)[number]) : "stock_in";

  return <EntryForms warehouses={warehouses ?? []} initialType={initial} canSetCost={profile.role !== "warehouse"} />;
}
