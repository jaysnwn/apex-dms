import Link from "next/link";
import type { Metadata } from "next";
import { ArrowDownUp, ImageOff, LayoutGrid, List, Pencil, Plus, Settings2, Upload } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { brandScope, getBrandContext } from "@/lib/brand";
import { signProductImages } from "@/lib/images";
import { inr, qty } from "@/lib/format";
import { Badge, Card, PageHeader, cn } from "@/components/ui";
import { SearchBar } from "@/components/search-bar";
import { Chip } from "@/components/chip";
import { BrandStrip } from "@/components/brand-badge";
import { ArchiveButton } from "./archive-button";
import { searchWords } from "@/lib/search-words";

export const metadata: Metadata = { title: "Products" };

type CatalogRow = {
  id: string; name: string; sku: string; barcode: string | null; brand_id: string; brand_name: string;
  category_name: string | null; unit_code: string; retailer_price: number; retailer_price_mode: string;
  mrp: number; gst_rate: number; is_active: boolean; image_path: string | null; created_at: string;
};
type Sp = { q?: string; cat?: string; stock?: string; sort?: string; archived?: string; view?: string };

const SORTS: Record<string, string> = { name: "Name A–Z", newest: "Newest", stock_low: "Stock: lowest first", stock_high: "Stock: highest first", price_high: "Price: highest first", price_low: "Price: lowest first" };

export default async function ProductsPage({ searchParams }: { searchParams: Promise<Sp> }) {
  const { profile } = await requireRole();
  const sp = await searchParams;
  const ctx = await getBrandContext();
  const scope = await brandScope();
  const supabase = await createClient();
  const canEdit = profile.role === "super_admin" || profile.role === "manager";
  const seesCost = canEdit || profile.role === "billing";
  const archivedView = canEdit && sp.archived === "1";

  const COLS = "id, name, sku, barcode, brand_id, brand_name, category_name, unit_code, retailer_price, retailer_price_mode, mrp, gst_rate, is_active, image_path, created_at";
  const words = searchWords(sp.q);
  const { data: rows } = await (words.length
    ? supabase.rpc("search_catalog", { p_words: words, p_limit: 1000, p_active: !archivedView }).select(COLS)
    : supabase.from("catalog").select(COLS).eq("is_active", !archivedView).order("name").limit(1000))
    .in("brand_id", scope);
  const all = (rows ?? []) as CatalogRow[];

  const ids = all.map((p) => p.id);
  const [{ data: stock }, costs] = await Promise.all([
    ids.length ? supabase.from("product_stock").select("product_id, available, is_low, is_out").in("product_id", ids) : Promise.resolve({ data: [] }),
    seesCost && ids.length ? supabase.from("products").select("id, purchase_cost, purchase_cost_mode").in("id", ids) : Promise.resolve({ data: [] }),
  ]);
  const stockMap = new Map((stock ?? []).map((s) => [s.product_id as string, s as { available: number; is_low: boolean; is_out: boolean }]));
  const costMap = new Map(((costs.data ?? []) as { id: string; purchase_cost: number; purchase_cost_mode: string }[]).map((c) => [c.id, c]));
  const avail = (id: string) => Number(stockMap.get(id)?.available ?? 0);
  const status = (id: string) => (stockMap.get(id)?.is_out ?? true) ? "out" : stockMap.get(id)?.is_low ? "low" : "ok";

  const categories = [...new Set(all.map((p) => p.category_name).filter(Boolean))].sort() as string[];
  let visible = all;
  if (sp.cat) visible = visible.filter((p) => p.category_name === sp.cat);
  if (sp.stock === "available") visible = visible.filter((p) => status(p.id) !== "out");
  if (sp.stock === "low") visible = visible.filter((p) => status(p.id) === "low");
  if (sp.stock === "out") visible = visible.filter((p) => status(p.id) === "out");
  const sort = SORTS[sp.sort ?? ""] ? sp.sort! : "name";
  visible = [...visible].sort((a, b) => {
    switch (sort) {
      case "newest": return b.created_at.localeCompare(a.created_at);
      case "stock_low": return avail(a.id) - avail(b.id);
      case "stock_high": return avail(b.id) - avail(a.id);
      case "price_high": return Number(b.retailer_price) - Number(a.retailer_price);
      case "price_low": return Number(a.retailer_price) - Number(b.retailer_price);
      default: return a.name.localeCompare(b.name);
    }
  });
  const images = await signProductImages(supabase, visible.slice(0, 300).map((p) => p.image_path));

  const href = (patch: Partial<Sp>) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, ...patch })) if (v) next.set(k, v);
    return `/products?${next}`;
  };
  const grid = sp.view === "grid";

  return (
    <>
      <PageHeader
        title="Products"
        description={`${visible.length} ${archivedView ? "archived " : ""}product${visible.length === 1 ? "" : "s"}`}
        actions={canEdit && (
          <>
            <Link href="/products/settings" className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium hover:bg-slate-50">
              <Settings2 className="size-4" /> <span className="hidden sm:inline">Brands &amp; categories</span>
            </Link>
            <Link href="/import?tab=products" className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium hover:bg-slate-50">
              <Upload className="size-4" /> <span className="hidden sm:inline">Import</span>
            </Link>
            <Link href="/products/new" className="inline-flex h-10 items-center gap-2 rounded-lg bg-ink-900 px-4 text-sm font-medium text-white hover:bg-ink-800">
              <Plus className="size-4" /> Add product
            </Link>
          </>
        )}
      />
      <BrandStrip name={ctx.current?.name} code={ctx.current?.code} all={ctx.isAll} />

      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex-1"><SearchBar placeholder="Search name, SKU or barcode" scan /></div>
        <form className="flex items-center gap-2">
          {Object.entries(sp).filter(([k, v]) => v && k !== "sort").map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          <ArrowDownUp className="size-4 text-slate-400" />
          <select name="sort" defaultValue={sort} className="h-10 rounded-lg border border-slate-300 bg-white px-2 text-sm" aria-label="Sort">
            {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium hover:bg-slate-50">Sort</button>
          <span className="ml-1 flex overflow-hidden rounded-lg border border-slate-300">
            <Link href={href({ view: undefined })} aria-label="Table view" className={cn("grid size-10 place-items-center", !grid ? "bg-ink-900 text-white" : "bg-white text-slate-600")}><List className="size-4" /></Link>
            <Link href={href({ view: "grid" })} aria-label="Photo grid" className={cn("grid size-10 place-items-center", grid ? "bg-ink-900 text-white" : "bg-white text-slate-600")}><LayoutGrid className="size-4" /></Link>
          </span>
        </form>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Chip href={href({ stock: undefined })} active={!sp.stock}>All stock</Chip>
        <Chip href={href({ stock: "available" })} active={sp.stock === "available"}>Available</Chip>
        <Chip href={href({ stock: "low" })} active={sp.stock === "low"}>Low</Chip>
        <Chip href={href({ stock: "out" })} active={sp.stock === "out"}>Out of stock</Chip>
        {categories.length > 0 && <span className="mx-1 h-5 w-px bg-slate-300" />}
        {categories.map((c) => <Chip key={c} href={href({ cat: sp.cat === c ? undefined : c })} active={sp.cat === c}>{c}</Chip>)}
        {canEdit && <span className="ml-auto"><Chip href={href({ archived: archivedView ? undefined : "1" })} active={archivedView}>Archived</Chip></span>}
      </div>

      {visible.length === 0 ? (
        <Card className="p-10 text-center text-sm text-slate-500">
          No products match.{" "}
          {canEdit && <Link href="/products/new" className="font-medium text-ink-900 underline">Add a product</Link>}
        </Card>
      ) : grid ? (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
          {visible.map((p) => {
            const img = p.image_path ? images.get(p.image_path) : undefined;
            const st = status(p.id);
            return (
              <Link key={p.id} href={`/products/${p.id}`} className="group">
                <Card className="flex h-full flex-col overflow-hidden transition group-hover:border-slate-300 group-hover:shadow-sm">
                  <div className="relative aspect-square bg-slate-50">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {img ? <img src={img} alt={p.name} className="h-full w-full object-contain p-3" loading="lazy" /> : <div className="grid h-full place-items-center text-slate-300"><ImageOff className="size-10" /></div>}
                  </div>
                  <div className="flex flex-1 flex-col p-3">
                    <div className="text-[11px] font-semibold tracking-wide text-accent-700 uppercase">{p.category_name ?? p.brand_name}</div>
                    <div className="mt-0.5 line-clamp-2 text-sm font-medium text-slate-900">{p.name}</div>
                    <div className="mt-0.5 font-mono text-xs text-slate-500">{p.sku}</div>
                    <div className="mt-auto flex items-end justify-between gap-2 pt-3">
                      <div className="tabular text-sm font-semibold">{inr(p.retailer_price)}</div>
                      <StockPill st={st} n={avail(p.id)} unit={p.unit_code} />
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
              <tr>
                <th className="px-4 py-2.5">Product</th>
                <th className="px-3 py-2.5">SKU</th>
                <th className="px-3 py-2.5">Category</th>
                {seesCost && <th className="px-3 py-2.5 text-right">Purchase</th>}
                <th className="px-3 py-2.5 text-right">Selling</th>
                <th className="px-3 py-2.5 text-right">GST</th>
                <th className="px-3 py-2.5 text-right">Available</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.map((p) => {
                const img = p.image_path ? images.get(p.image_path) : undefined;
                const c = costMap.get(p.id);
                const st = status(p.id);
                return (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2">
                      <Link href={`/products/${p.id}`} className="flex items-center gap-3">
                        <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-lg bg-slate-100">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          {img ? <img src={img} alt="" className="size-full object-cover" loading="lazy" /> : <ImageOff className="size-4 text-slate-300" />}
                        </span>
                        <span className="min-w-0">
                          <span className="block font-medium text-slate-900 hover:underline">{p.name}</span>
                          {ctx.isAll && <span className="text-xs text-slate-500">{p.brand_name}</span>}
                        </span>
                      </Link>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-600">{p.sku}</td>
                    <td className="px-3 py-2 text-slate-600">{p.category_name ?? "—"}</td>
                    {seesCost && <td className="tabular px-3 py-2 text-right text-slate-600">{c ? inr(c.purchase_cost) : "—"}{c?.purchase_cost_mode === "inclusive" && <span className="text-[10px] text-slate-400"> incl.</span>}</td>}
                    <td className="tabular px-3 py-2 text-right font-semibold">{inr(p.retailer_price)}{p.retailer_price_mode === "inclusive" && <span className="text-[10px] font-normal text-slate-400"> incl.</span>}</td>
                    <td className="tabular px-3 py-2 text-right text-slate-600">{p.gst_rate}%</td>
                    <td className="tabular px-3 py-2 text-right font-semibold">{qty(avail(p.id))}</td>
                    <td className="px-3 py-2">{archivedView ? <Badge>Archived</Badge> : <StockPill st={st} />}</td>
                    <td className="px-3 py-2">
                      {canEdit && (
                        <span className="flex justify-end gap-0.5">
                          <Link href={`/products/${p.id}/edit`} title="Edit" aria-label={`Edit ${p.name}`} className="grid size-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800"><Pencil className="size-4" /></Link>
                          <ArchiveButton id={p.id} archived={archivedView} name={p.name} />
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}

function StockPill({ st, n, unit }: { st: string; n?: number; unit?: string }) {
  return (
    <span className={cn("tabular rounded-md px-2 py-0.5 text-xs font-semibold whitespace-nowrap",
      st === "out" ? "bg-red-50 text-red-700" : st === "low" ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700")}>
      {n !== undefined ? `${qty(n)} ${unit?.toLowerCase() ?? ""}` : st === "out" ? "Out of stock" : st === "low" ? "Low stock" : "In stock"}
    </span>
  );
}
