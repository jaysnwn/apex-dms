import Link from "next/link";
import type { Metadata } from "next";
import { ImageOff, Plus, Settings2, Upload } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { signProductImages } from "@/lib/images";
import { inr, qty, safeSearch } from "@/lib/format";
import { Badge, Card, PageHeader, cn } from "@/components/ui";
import { SearchBar } from "@/components/search-bar";
import { Chip } from "@/components/chip";

export const metadata: Metadata = { title: "Products" };

type CatalogRow = {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  brand_id: string;
  brand_name: string;
  category_name: string | null;
  unit_code: string;
  retailer_price: number;
  retailer_price_mode: string;
  mrp: number;
  gst_rate: number;
  is_active: boolean;
  image_path: string | null;
};

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; brand?: string; low?: string; inactive?: string }>;
}) {
  const { profile } = await requireRole();
  const sp = await searchParams;
  const supabase = await createClient();
  const canEdit = profile.role === "super_admin" || profile.role === "manager";

  let query = supabase
    .from("catalog")
    .select("id, name, sku, barcode, brand_id, brand_name, category_name, unit_code, retailer_price, retailer_price_mode, mrp, gst_rate, is_active, image_path")
    .order("name")
    .limit(300);
  if (!(canEdit && sp.inactive === "1")) query = query.eq("is_active", true);
  if (sp.brand) query = query.eq("brand_id", sp.brand);
  const term = safeSearch(sp.q);
  if (term) query = query.or(`name.ilike.%${term}%,sku.ilike.%${term}%,barcode.eq.${term}`);

  const [{ data: rows }, { data: brands }] = await Promise.all([
    query,
    supabase.from("brands").select("id, name").eq("is_active", true).order("name"),
  ]);
  const products = (rows ?? []) as CatalogRow[];

  const ids = products.map((p) => p.id);
  const { data: stock } = ids.length
    ? await supabase.from("product_stock").select("product_id, available, is_low").in("product_id", ids)
    : { data: [] };
  const stockMap = new Map((stock ?? []).map((s) => [s.product_id as string, s as { available: number; is_low: boolean }]));
  const images = await signProductImages(supabase, products.map((p) => p.image_path));

  const visible = sp.low === "1" ? products.filter((p) => stockMap.get(p.id)?.is_low) : products;

  const href = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    const merged = { q: sp.q, brand: sp.brand, low: sp.low, inactive: sp.inactive, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) next.set(k, v);
    return `/products?${next}`;
  };

  return (
    <>
      <PageHeader
        title="Products"
        description={`${visible.length} product${visible.length === 1 ? "" : "s"}`}
        actions={
          canEdit && (
            <>
              <Link href="/products/settings" className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium hover:bg-slate-50">
                <Settings2 className="size-4" /> <span className="hidden sm:inline">Brands</span>
              </Link>
              <Link href="/import?tab=products" className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium hover:bg-slate-50">
                <Upload className="size-4" /> <span className="hidden sm:inline">Import</span>
              </Link>
              <Link href="/products/new" className="inline-flex h-10 items-center gap-2 rounded-lg bg-ink-900 px-4 text-sm font-medium text-white hover:bg-ink-800">
                <Plus className="size-4" /> Add product
              </Link>
            </>
          )
        }
      />

      <div className="mb-4">
        <SearchBar placeholder="Search name, model number or barcode" scan />
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        <Chip href={href({ brand: undefined })} active={!sp.brand}>All brands</Chip>
        {(brands ?? []).map((b) => (
          <Chip key={b.id} href={href({ brand: b.id })} active={sp.brand === b.id}>{b.name}</Chip>
        ))}
        <span className="mx-1 hidden w-px bg-slate-200 sm:block" />
        <Chip href={href({ low: sp.low === "1" ? undefined : "1" })} active={sp.low === "1"}>Low stock only</Chip>
        {canEdit && (
          <Chip href={href({ inactive: sp.inactive === "1" ? undefined : "1" })} active={sp.inactive === "1"}>Show inactive</Chip>
        )}
      </div>

      {visible.length === 0 ? (
        <Card className="p-10 text-center text-sm text-slate-500">
          No products match.{" "}
          {canEdit && <Link href="/products/new" className="font-medium text-ink-900 underline">Add a product</Link>}
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
          {visible.map((p) => {
            const s = stockMap.get(p.id);
            const img = p.image_path ? images.get(p.image_path) : undefined;
            return (
              <Link key={p.id} href={`/products/${p.id}`} className="group">
                <Card className="flex h-full flex-col overflow-hidden transition group-hover:border-slate-300 group-hover:shadow-sm">
                  <div className="relative aspect-square bg-slate-50">
                    {img ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={img} alt={p.name} className="h-full w-full object-contain p-3" loading="lazy" />
                    ) : (
                      <div className="grid h-full place-items-center text-slate-300"><ImageOff className="size-10" /></div>
                    )}
                    {!p.is_active && <span className="absolute top-2 left-2"><Badge>Inactive</Badge></span>}
                  </div>
                  <div className="flex flex-1 flex-col p-3">
                    <div className="text-[11px] font-semibold tracking-wide text-accent-700 uppercase">{p.brand_name}</div>
                    <div className="mt-0.5 line-clamp-2 text-sm font-medium text-slate-900">{p.name}</div>
                    <div className="mt-0.5 font-mono text-xs text-slate-500">{p.sku}</div>
                    <div className="mt-auto flex items-end justify-between gap-2 pt-3">
                      <div>
                        <div className="tabular text-sm font-semibold">{inr(p.retailer_price)}</div>
                        <div className="text-[11px] text-slate-500">
                          {p.retailer_price_mode === "inclusive" ? "incl." : "+"} {p.gst_rate}% GST · MRP {inr(p.mrp, { decimals: false })}
                        </div>
                      </div>
                      <span className={cn("tabular rounded-md px-2 py-0.5 text-xs font-semibold", s?.is_low ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700")}>
                        {qty(s?.available ?? 0)} {p.unit_code.toLowerCase()}
                      </span>
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
