import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getBrandContext } from "@/lib/brand";
import { date } from "@/lib/format";
import { addDays, todayIST } from "@/lib/gst";
import { Card } from "@/components/ui";
import { BrandBadge } from "@/components/brand-badge";
import { ReorderList, type Suggestion } from "./reorder-list";

export const metadata: Metadata = { title: "Reorder list" };

export default async function ReorderPage() {
  await requireRole("super_admin", "manager", "billing");
  const ctx = await getBrandContext();
  const supabase = await createClient();
  const brands = ctx.current ? [ctx.current] : ctx.brands;
  const { data: co } = await supabase.from("company_settings").select("reorder_lead_days, reorder_cover_days").single();
  const lead = Number(co?.reorder_lead_days ?? 8), cover = Number(co?.reorder_cover_days ?? 30);
  const today = todayIST();
  const lists = await Promise.all(brands.map(async (b) => {
    const { data } = await supabase.rpc("reorder_suggestions", { p_brand: b.id });
    return { brand: b, rows: ((data ?? []) as Record<string, unknown>[]).map((r): Suggestion => ({
      product_id: String(r.product_id), name: String(r.name), sku: String(r.sku), category: (r.category_name as string) ?? null, unit: String(r.unit_code),
      available: Number(r.available), on_order: Number(r.on_order), min: Number(r.min_stock_qty), sold_30d: Number(r.sold_30d), avg_daily: Number(r.avg_daily),
      days_left: r.days_left == null ? null : Number(r.days_left), suggested: Number(r.suggested_qty), unit_cost: Number(r.unit_cost),
      cost_mode: r.cost_mode as "inclusive" | "exclusive", supplier_id: (r.supplier_id as string) ?? null, supplier_name: (r.supplier_name as string) ?? null,
      lead_days: Number(r.lead_days), urgency: r.urgency as Suggestion["urgency"],
    })) };
  }));

  return (
    <div className="space-y-6">
      <Card className="p-4 text-sm text-slate-600">
        <b className="text-slate-900">Daily reorder list · {date(today)}.</b> A product appears when its stock (plus what is already on order) will not last until a new delivery arrives —
        goods arrive about <b>{lead} days</b> after ordering, so an order placed today arrives around <b>{date(addDays(today, lead))}</b> — or when it is at or below its minimum.
        The suggested quantity covers the delivery time plus <b>{cover} days</b> of sales (average of the last 30 days), and at least twice the minimum. Change any quantity before creating the orders.
        <span className="mt-1 block"><Link href="/reports/reorder-list" className="font-medium text-accent-700 hover:underline">Download this list as Excel / PDF</Link></span>
      </Card>
      {lists.map(({ brand, rows }) => (
        <section key={brand.id}>
          <div className="mb-2"><BrandBadge name={brand.name} code={brand.code} /></div>
          {rows.length === 0 ? (
            <Card className="flex items-center gap-3 p-6 text-sm text-slate-600"><CheckCircle2 className="size-6 text-emerald-500" /> Nothing to reorder for {brand.name} today.</Card>
          ) : (
            <ReorderList brandId={brand.id} brandName={brand.name} rows={rows} />
          )}
        </section>
      ))}
    </div>
  );
}
