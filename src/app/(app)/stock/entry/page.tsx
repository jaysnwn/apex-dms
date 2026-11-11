import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getBrandContext } from "@/lib/brand";
import { todayIST } from "@/lib/gst";
import { Card } from "@/components/ui";
import { BrandStrip } from "@/components/brand-badge";
import { BrandSwitcher } from "@/components/brand-switcher";
import { EntryForms } from "./entry-forms";
import { ENTRY_TYPE_KEYS, type EntryType } from "./entry-types";

export const metadata: Metadata = { title: "Stock entry" };

export default async function StockEntryPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const { profile } = await requireRole("super_admin", "manager", "warehouse");
  const { type } = await searchParams;
  const ctx = await getBrandContext();

  // Stock is always entered for one brand: ask which one when "All brands" is on.
  if (!ctx.current) {
    return (
      <Card className="max-w-xl p-6">
        <h2 className="font-semibold">Which brand is this stock for?</h2>
        <p className="mb-4 text-sm text-slate-500">CONQRETE and BLUEI stock are kept completely separate. Pick the brand first.</p>
        <BrandSwitcher brands={ctx.brands} currentId={null} canSeeAll={false} />
      </Card>
    );
  }

  const supabase = await createClient();
  const { data: warehouses } = await supabase.from("warehouses").select("id, name").eq("is_active", true).eq("brand_id", ctx.current.id).order("name");
  const isMgr = profile.role === "super_admin" || profile.role === "manager";
  const allowed = ENTRY_TYPE_KEYS.filter((k) => isMgr || k !== "adjustment");
  const initial = (allowed as string[]).includes(type ?? "") ? (type as EntryType) : "stock_in";

  return (
    <>
      <BrandStrip name={ctx.current.name} code={ctx.current.code} />
      <EntryForms
        key={ctx.current.id}
        brandId={ctx.current.id}
        brandName={ctx.current.name}
        warehouses={warehouses ?? []}
        initialType={initial}
        allowed={allowed}
        canSetCost={profile.role !== "warehouse"}
        today={todayIST()}
      />
    </>
  );
}
