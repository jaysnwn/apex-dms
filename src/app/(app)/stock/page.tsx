import Link from "next/link";
import type { Metadata } from "next";
import { AlertTriangle } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { inr, qty, safeSearch } from "@/lib/format";
import { Card, cn } from "@/components/ui";
import { SearchBar } from "@/components/search-bar";
import { Chip } from "@/components/chip";

export const metadata: Metadata = { title: "Stock" };

type Item = { id: string; name: string; sku: string; brand_id: string; brand_name: string; unit_code: string; min_stock_qty: number };

export default async function StockOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; brand?: string; low?: string }>;
}) {
  const { profile } = await requireRole("super_admin", "manager", "billing", "warehouse");
  const sp = await searchParams;
  const supabase = await createClient();
  const seesCost = profile.role !== "warehouse";

  let query = supabase
    .from("catalog")
    .select("id, name, sku, brand_id, brand_name, unit_code, min_stock_qty")
    .eq("is_active", true)
    .order("name")
    .limit(500);
  if (sp.brand) query = query.eq("brand_id", sp.brand);
  const term = safeSearch(sp.q);
  if (term) query = query.or(`name.ilike.%${term}%,sku.ilike.%${term}%,barcode.eq.${term}`);

  const [{ data: items }, { data: warehouses }, { data: brands }, { data: stock }, { data: byWh }, valuation] = await Promise.all([
    query,
    supabase.from("warehouses").select("id, name").eq("is_active", true).order("name"),
    supabase.from("brands").select("id, name").eq("is_active", true).order("name"),
    supabase.from("product_stock").select("product_id, on_hand, reserved, available, is_low"),
    supabase.from("stock_on_hand").select("product_id, warehouse_id, on_hand"),
    seesCost ? supabase.from("inventory_valuation").select("product_id, stock_value") : Promise.resolve({ data: null }),
  ]);

  const stockMap = new Map((stock ?? []).map((s) => [s.product_id as string, s]));
  const whMap = new Map<string, number>();
  for (const r of byWh ?? []) whMap.set(`${r.product_id}:${r.warehouse_id}`, Number(r.on_hand));
  const valueMap = new Map((valuation.data ?? []).map((v) => [v.product_id as string, Number(v.stock_value)]));

  let rows = (items ?? []) as Item[];
  const lowCount = rows.filter((r) => stockMap.get(r.id)?.is_low).length;
  if (sp.low === "1") rows = rows.filter((r) => stockMap.get(r.id)?.is_low);

  const totalUnits = rows.reduce((t, r) => t + Number(stockMap.get(r.id)?.on_hand ?? 0), 0);
  const totalValue = rows.reduce((t, r) => t + (valueMap.get(r.id) ?? 0), 0);
  const whs = warehouses ?? [];

  const href = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries({ q: sp.q, brand: sp.brand, low: sp.low, ...patch })) if (v) next.set(k, v);
    return `/stock?${next}`;
  };

  return (
    <>
      <div className={cn("mb-6 grid gap-4", seesCost ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
        <Card className="p-4">
          <div className="text-sm text-slate-500">Units on hand</div>
          <div className="tabular mt-1 text-2xl font-semibold">{qty(totalUnits)}</div>
        </Card>
        {seesCost && (
          <Card className="p-4">
            <div className="text-sm text-slate-500">Inventory value (avg. cost, excl. GST)</div>
            <div className="tabular mt-1 text-2xl font-semibold">{inr(totalValue, { decimals: false })}</div>
          </Card>
        )}
        <Link href={href({ low: sp.low === "1" ? undefined : "1" })}>
          <Card className={cn("h-full p-4", lowCount > 0 && "border-red-200 bg-red-50/50")}>
            <div className="flex items-center gap-1.5 text-sm text-slate-500">
              {lowCount > 0 && <AlertTriangle className="size-4 text-red-600" />} Low-stock items
            </div>
            <div className={cn("tabular mt-1 text-2xl font-semibold", lowCount > 0 && "text-red-700")}>{lowCount}</div>
          </Card>
        </Link>
      </div>

      <div className="mb-4">
        <SearchBar placeholder="Search name, model number or barcode" scan />
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        <Chip href={href({ brand: undefined })} active={!sp.brand}>All brands</Chip>
        {(brands ?? []).map((b) => (
          <Chip key={b.id} href={href({ brand: b.id })} active={sp.brand === b.id}>{b.name}</Chip>
        ))}
        <Chip href={href({ low: sp.low === "1" ? undefined : "1" })} active={sp.low === "1"}>Low stock only</Chip>
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
            <tr>
              <th className="px-4 py-2.5">Product</th>
              {whs.length > 1 && whs.map((w) => <th key={w.id} className="px-3 py-2.5 text-right">{w.name}</th>)}
              <th className="px-3 py-2.5 text-right">On hand</th>
              <th className="px-3 py-2.5 text-right">Reserved</th>
              <th className="px-3 py-2.5 text-right">Available</th>
              <th className="px-3 py-2.5 text-right">Min.</th>
              {seesCost && <th className="px-4 py-2.5 text-right">Value</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-500">No products match.</td></tr>
            )}
            {rows.map((r) => {
              const s = stockMap.get(r.id);
              return (
                <tr key={r.id} className={cn(s?.is_low && "bg-red-50/40")}>
                  <td className="px-4 py-2.5">
                    <Link href={`/products/${r.id}`} className="font-medium text-slate-900 hover:underline">{r.name}</Link>
                    <div className="text-xs text-slate-500">{r.brand_name} · <span className="font-mono">{r.sku}</span></div>
                  </td>
                  {whs.length > 1 && whs.map((w) => (
                    <td key={w.id} className="tabular px-3 py-2.5 text-right text-slate-600">{qty(whMap.get(`${r.id}:${w.id}`) ?? 0)}</td>
                  ))}
                  <td className="tabular px-3 py-2.5 text-right">{qty(s?.on_hand ?? 0)}</td>
                  <td className="tabular px-3 py-2.5 text-right text-slate-500">{qty(s?.reserved ?? 0)}</td>
                  <td className={cn("tabular px-3 py-2.5 text-right font-semibold", s?.is_low ? "text-red-700" : "text-emerald-700")}>
                    {qty(s?.available ?? 0)}
                  </td>
                  <td className="tabular px-3 py-2.5 text-right text-slate-500">{qty(r.min_stock_qty)}</td>
                  {seesCost && <td className="tabular px-4 py-2.5 text-right">{inr(valueMap.get(r.id) ?? 0, { decimals: false })}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </>
  );
}
