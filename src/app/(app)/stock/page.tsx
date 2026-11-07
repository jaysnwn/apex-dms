import Link from "next/link";
import type { Metadata } from "next";
import {
  AlertTriangle, ArrowDownToLine, ArrowUpFromLine, Boxes, ClipboardCheck, FileSpreadsheet, IndianRupee, Package,
  PackageX, Plus, SlidersHorizontal, Upload,
} from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { brandScope, getBrandContext } from "@/lib/brand";
import { inr, qty, safeSearch } from "@/lib/format";
import { Card, cn } from "@/components/ui";
import { SearchBar } from "@/components/search-bar";
import { Chip } from "@/components/chip";
import { StatCard } from "@/components/stat-card";
import { BrandBadge, BrandStrip } from "@/components/brand-badge";
import { signProductImages } from "@/lib/images";

export const metadata: Metadata = { title: "Inventory" };

type Item = { id: string; name: string; sku: string; brand_id: string; brand_name: string; category_name: string | null; unit_code: string; min_stock_qty: number; image_path: string | null };

export default async function InventoryDashboard({ searchParams }: { searchParams: Promise<{ q?: string; stock?: string; cat?: string }> }) {
  const { profile } = await requireRole("super_admin", "manager", "billing", "warehouse");
  const sp = await searchParams;
  const ctx = await getBrandContext();
  const scope = await brandScope();
  const supabase = await createClient();
  const seesCost = profile.role !== "warehouse";
  const isMgr = profile.role === "super_admin" || profile.role === "manager";
  const canMove = profile.role !== "billing";

  let query = supabase
    .from("catalog")
    .select("id, name, sku, brand_id, brand_name, category_name, unit_code, min_stock_qty, image_path")
    .eq("is_active", true)
    .in("brand_id", scope)
    .order("name")
    .limit(1000);
  const term = safeSearch(sp.q);
  if (term) query = query.or(`name.ilike.%${term}%,sku.ilike.%${term}%,barcode.eq.${term}`);

  const [{ data: items }, { data: stock }, valuation, { count: pendingCounts }] = await Promise.all([
    query,
    supabase.from("product_stock").select("product_id, brand_id, on_hand, reserved, available, is_low, is_out").in("brand_id", scope),
    seesCost ? supabase.from("inventory_valuation").select("product_id, brand_id, stock_value").in("brand_id", scope) : Promise.resolve({ data: null }),
    supabase.from("stock_counts").select("id", { count: "exact", head: true }).in("status", ["draft", "submitted"]).in("brand_id", scope),
  ]);

  const all = (items ?? []) as Item[];
  const stockMap = new Map((stock ?? []).map((s) => [s.product_id as string, s]));
  const valueMap = new Map((valuation.data ?? []).map((v) => [v.product_id as string, Number(v.stock_value)]));
  const isLow = (id: string) => !!stockMap.get(id)?.is_low && !stockMap.get(id)?.is_out;
  const isOut = (id: string) => stockMap.get(id)?.is_out ?? true;

  const lowCount = all.filter((r) => isLow(r.id)).length;
  const outCount = all.filter((r) => isOut(r.id)).length;
  const units = all.reduce((t, r) => t + Number(stockMap.get(r.id)?.on_hand ?? 0), 0);
  const value = all.reduce((t, r) => t + (valueMap.get(r.id) ?? 0), 0);

  const categories = [...new Set(all.map((r) => r.category_name).filter(Boolean))].sort() as string[];
  let rows = all;
  if (sp.cat) rows = rows.filter((r) => r.category_name === sp.cat);
  if (sp.stock === "low") rows = rows.filter((r) => isLow(r.id));
  else if (sp.stock === "out") rows = rows.filter((r) => isOut(r.id));
  else if (sp.stock === "available") rows = rows.filter((r) => !isOut(r.id));
  const images = await signProductImages(supabase, rows.slice(0, 200).map((r) => r.image_path));

  const href = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries({ q: sp.q, stock: sp.stock, cat: sp.cat, ...patch })) if (v) next.set(k, v);
    return `/stock?${next}`;
  };

  // Consolidated view: one line per brand, never mixed.
  const perBrand = ctx.isAll
    ? ctx.brands.map((b) => {
        const mine = all.filter((r) => r.brand_id === b.id);
        return {
          brand: b,
          products: mine.length,
          units: mine.reduce((t, r) => t + Number(stockMap.get(r.id)?.on_hand ?? 0), 0),
          value: mine.reduce((t, r) => t + (valueMap.get(r.id) ?? 0), 0),
          low: mine.filter((r) => isLow(r.id)).length,
          out: mine.filter((r) => isOut(r.id)).length,
        };
      })
    : [];

  const actions = [
    isMgr && { href: "/products/new", label: "Add product", icon: Plus, tone: "from-indigo-500 to-indigo-600" },
    isMgr && { href: "/import", label: "Import products", icon: Upload, tone: "from-slate-600 to-slate-700" },
    canMove && { href: "/stock/entry?type=stock_in", label: "Stock inward", icon: ArrowDownToLine, tone: "from-emerald-500 to-emerald-600" },
    canMove && { href: "/stock/entry?type=stock_out", label: "Stock outward", icon: ArrowUpFromLine, tone: "from-rose-500 to-rose-600" },
    { href: "/stock/reports", label: "Stock report", icon: FileSpreadsheet, tone: "from-amber-500 to-amber-600" },
    isMgr && { href: "/stock/entry?type=adjustment", label: "Stock adjustment", icon: SlidersHorizontal, tone: "from-violet-500 to-violet-600" },
  ].filter(Boolean) as { href: string; label: string; icon: typeof Plus; tone: string }[];

  return (
    <>
      <BrandStrip name={ctx.current?.name} code={ctx.current?.code} all={ctx.isAll} />

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Total products" value={String(all.length)} icon={Package} tone="violet" href="/products" />
        <StatCard label="Total stock qty" value={qty(units)} icon={Boxes} tone="teal" hint="units on hand" />
        {seesCost && <StatCard label="Inventory value" value={inr(value, { decimals: false })} icon={IndianRupee} tone="green" hint="avg. cost, excl. GST" href="/reports/stock-valuation" />}
        <StatCard label="Low stock" value={String(lowCount)} icon={AlertTriangle} tone={lowCount ? "amber" : "slate"} alert={lowCount > 0} href={href({ stock: "low" })} />
        <StatCard label="Out of stock" value={String(outCount)} icon={PackageX} tone={outCount ? "red" : "slate"} alert={outCount > 0} href={href({ stock: "out" })} />
        <StatCard label="Pending verification" value={String(pendingCounts ?? 0)} icon={ClipboardCheck} tone={(pendingCounts ?? 0) > 0 ? "amber" : "slate"} hint="open stock counts" href="/stock/counts" />
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {actions.map((a) => (
          <Link key={a.href} href={a.href} className={cn("group flex items-center gap-3 rounded-xl bg-gradient-to-br p-3 text-white shadow-sm transition hover:shadow-md active:scale-[0.99]", a.tone)}>
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/20"><a.icon className="size-5" /></span>
            <span className="text-sm font-semibold leading-tight">{a.label}</span>
          </Link>
        ))}
      </div>

      {ctx.isAll && (
        <Card className="mb-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
              <tr><th className="px-4 py-2.5">Brand</th><th className="px-3 py-2.5 text-right">Products</th><th className="px-3 py-2.5 text-right">Units</th>{seesCost && <th className="px-3 py-2.5 text-right">Value</th>}<th className="px-3 py-2.5 text-right">Low</th><th className="px-4 py-2.5 text-right">Out</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {perBrand.map((p) => (
                <tr key={p.brand.id}>
                  <td className="px-4 py-2.5"><BrandBadge name={p.brand.name} code={p.brand.code} /></td>
                  <td className="tabular px-3 py-2.5 text-right">{p.products}</td>
                  <td className="tabular px-3 py-2.5 text-right">{qty(p.units)}</td>
                  {seesCost && <td className="tabular px-3 py-2.5 text-right font-semibold">{inr(p.value, { decimals: false })}</td>}
                  <td className={cn("tabular px-3 py-2.5 text-right", p.low && "font-semibold text-amber-700")}>{p.low}</td>
                  <td className={cn("tabular px-4 py-2.5 text-right", p.out && "font-semibold text-red-700")}>{p.out}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <div className="mb-3"><SearchBar placeholder="Search name, model number or barcode" scan /></div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Chip href={href({ stock: undefined })} active={!sp.stock}>All</Chip>
        <Chip href={href({ stock: "available" })} active={sp.stock === "available"}>Available</Chip>
        <Chip href={href({ stock: "low" })} active={sp.stock === "low"}>Low stock{lowCount ? ` · ${lowCount}` : ""}</Chip>
        <Chip href={href({ stock: "out" })} active={sp.stock === "out"}>Out of stock{outCount ? ` · ${outCount}` : ""}</Chip>
        {categories.length > 1 && <span className="mx-1 h-5 w-px bg-slate-300" />}
        {categories.length > 1 && categories.map((c) => (
          <Chip key={c} href={href({ cat: sp.cat === c ? undefined : c })} active={sp.cat === c}>{c}</Chip>
        ))}
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
            <tr>
              <th className="px-4 py-2.5">Product</th>
              <th className="px-3 py-2.5 text-right">On hand</th>
              <th className="px-3 py-2.5 text-right">Reserved</th>
              <th className="px-3 py-2.5 text-right">Available</th>
              <th className="px-3 py-2.5 text-right">Min.</th>
              <th className="px-3 py-2.5">Status</th>
              {seesCost && <th className="px-4 py-2.5 text-right">Value</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-500">No products match.</td></tr>}
            {rows.map((r) => {
              const s = stockMap.get(r.id);
              const out = isOut(r.id), low = isLow(r.id);
              const img = r.image_path ? images.get(r.image_path) : null;
              return (
                <tr key={r.id} className={cn("hover:bg-slate-50", out && "bg-red-50/40", low && "bg-amber-50/40")}>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-3">
                      <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-slate-100">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {img ? <img src={img} alt="" className="size-full object-cover" /> : <Package className="size-4 text-slate-400" />}
                      </span>
                      <div className="min-w-0">
                        <Link href={`/products/${r.id}`} className="font-medium text-slate-900 hover:underline">{r.name}</Link>
                        <div className="text-xs text-slate-500"><span className="font-mono">{r.sku}</span>{r.category_name ? ` · ${r.category_name}` : ""}{ctx.isAll ? ` · ${r.brand_name}` : ""}</div>
                      </div>
                    </div>
                  </td>
                  <td className="tabular px-3 py-2 text-right">{qty(s?.on_hand ?? 0)}</td>
                  <td className="tabular px-3 py-2 text-right text-slate-500">{qty(s?.reserved ?? 0)}</td>
                  <td className={cn("tabular px-3 py-2 text-right font-semibold", out ? "text-red-700" : low ? "text-amber-700" : "text-emerald-700")}>{qty(s?.available ?? 0)}</td>
                  <td className="tabular px-3 py-2 text-right text-slate-500">{qty(r.min_stock_qty)}</td>
                  <td className="px-3 py-2">
                    <span className={cn("rounded-md px-2 py-0.5 text-xs font-semibold", out ? "bg-red-100 text-red-800" : low ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-800")}>
                      {out ? "Out of stock" : low ? "Low stock" : "In stock"}
                    </span>
                  </td>
                  {seesCost && <td className="tabular px-4 py-2 text-right">{inr(valueMap.get(r.id) ?? 0, { decimals: false })}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </>
  );
}
