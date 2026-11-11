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
import { stopwatch } from "@/lib/timing";

export const metadata: Metadata = { title: "Stock entry" };

export default async function StockEntryPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const sw = stopwatch("page.stock.entry");
  const { profile } = await requireRole("super_admin", "manager", "warehouse");
  sw.mark("auth");
  const { type } = await searchParams;
  sw.mark("params");
  const ctx = await getBrandContext();
  sw.mark("brands");

  // Stock is always entered for one brand: ask which one when "All brands" is on.
  if (!ctx.current) {
    return (
      <Card className="max-w-xl p-6">
        <h2 className="font-semibold">Which brand is this stock for?</h2>
        <p className="mb-4 text-sm text-slate-500">Each brand&apos;s stock is kept completely separate. Pick the brand first.</p>
        <BrandSwitcher brands={ctx.brands} currentId={null} canSeeAll={false} />
      </Card>
    );
  }

  const supabase = await createClient();
  const { data: warehouses } = await supabase.from("warehouses").select("id, name").eq("is_active", true).eq("brand_id", ctx.current.id).order("name");
  sw.mark("warehouses");
  sw.done();
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
