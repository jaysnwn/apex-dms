import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { signProductImages } from "@/lib/images";
import { dateTime, inr, MOVEMENT_LABELS, qty } from "@/lib/format";
import { Badge, Card, PageHeader, cn } from "@/components/ui";
import { LinkButton } from "@/components/chip";
import { PhotoManager } from "./photo-manager";

export const metadata: Metadata = { title: "Product" };

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { profile } = await requireRole();
  const { id } = await params;
  const supabase = await createClient();
  const role = profile.role;
  const canEdit = role === "super_admin" || role === "manager";
  const seesCost = canEdit || role === "billing";
  const seesMovements = role !== "salesman";

  const { data: p } = await supabase.from("catalog").select("*").eq("id", id).maybeSingle();
  if (!p) notFound();

  const [images, stock, warehouses, location, cost, movements] = await Promise.all([
    supabase.from("product_images").select("id, storage_path, is_primary, sort_order").eq("product_id", id).order("sort_order"),
    supabase.from("product_stock").select("on_hand, reserved, available, is_low").eq("product_id", id).maybeSingle(),
    supabase.from("stock_on_hand").select("warehouse_id, on_hand").eq("product_id", id),
    p.default_location_id
      ? supabase.from("warehouse_locations").select("code").eq("id", p.default_location_id).maybeSingle()
      : Promise.resolve({ data: null }),
    seesCost
      ? supabase.from("inventory_valuation").select("avg_cost, stock_value").eq("product_id", id).maybeSingle()
      : Promise.resolve({ data: null }),
    seesMovements
      ? supabase
          .from("stock_movements")
          .select("id, movement_type, qty, reason, created_at, warehouse_id, created_by")
          .eq("product_id", id)
          .order("created_at", { ascending: false })
          .limit(15)
      : Promise.resolve({ data: null }),
  ]);

  const { data: whNames } = await supabase.from("warehouses").select("id, name");
  const whMap = new Map((whNames ?? []).map((w) => [w.id as string, w.name as string]));
  const { data: people } = await supabase.from("profiles").select("id, full_name");
  const nameMap = new Map((people ?? []).map((u) => [u.id as string, u.full_name as string]));

  const urls = await signProductImages(supabase, (images.data ?? []).map((i) => i.storage_path));
  const photos = (images.data ?? []).map((i) => ({ id: i.id as string, is_primary: i.is_primary as boolean, url: urls.get(i.storage_path) }));
  const s = stock.data;

  const facts: [string, React.ReactNode][] = [
    ["Brand", p.brand_name],
    ["Category", p.category_name ?? "—"],
    ["Model / SKU", <span key="sku" className="font-mono">{p.sku}</span>],
    ["Barcode", p.barcode ?? "—"],
    ["HSN code", p.hsn_code ?? "—"],
    ["Unit", p.unit_code],
    ["GST rate", `${p.gst_rate}%`],
    ["Retailer price", `${inr(p.retailer_price)} ${p.retailer_price_mode === "inclusive" ? "incl. GST" : "+ GST"}`],
    ["MRP", `${inr(p.mrp)} ${p.mrp_mode === "inclusive" ? "incl. GST" : "+ GST"}`],
    ...(seesCost && cost.data
      ? ([["Avg. purchase cost", `${inr(cost.data.avg_cost)} excl. GST`]] as [string, React.ReactNode][])
      : []),
    ["Rack / shelf", location.data?.code ?? "—"],
    ["Minimum stock", qty(p.min_stock_qty)],
  ];

  return (
    <>
      <PageHeader
        title={p.name}
        description={`${p.brand_name} · ${p.sku}`}
        actions={
          canEdit && (
            <LinkButton href={`/products/${id}/edit`}>
              <Pencil className="size-4" /> Edit
            </LinkButton>
          )
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,360px)_1fr]">
        <div>
          <PhotoManager productId={id} photos={photos} canEdit={canEdit} />
        </div>

        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label="Available to sell" value={qty(s?.available ?? 0)} tone={s?.is_low ? "red" : "green"} hint={s?.is_low ? "Low stock" : undefined} />
            <Stat label="On hand" value={qty(s?.on_hand ?? 0)} />
            <Stat label="Reserved for invoices" value={qty(s?.reserved ?? 0)} />
          </div>

          <Card className="p-5">
            <div className="mb-3 flex items-center gap-2">
              <h2 className="font-semibold">Details</h2>
              {!p.is_active && <Badge>Inactive</Badge>}
            </div>
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              {facts.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 border-b border-slate-100 pb-2">
                  <dt className="text-slate-500">{k}</dt>
                  <dd className="text-right font-medium">{v}</dd>
                </div>
              ))}
            </dl>
            {p.description && <p className="mt-4 text-sm whitespace-pre-line text-slate-600">{p.description}</p>}
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 font-semibold">Stock by warehouse</h2>
            {(warehouses.data ?? []).length === 0 ? (
              <p className="text-sm text-slate-500">No stock recorded yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100 text-sm">
                {(warehouses.data ?? []).map((w) => (
                  <li key={w.warehouse_id} className="flex justify-between py-2">
                    <span>{whMap.get(w.warehouse_id) ?? "Warehouse"}</span>
                    <span className="tabular font-medium">{qty(w.on_hand)} {p.unit_code.toLowerCase()}</span>
                  </li>
                ))}
              </ul>
            )}
            {seesCost && cost.data && (
              <p className="mt-3 text-sm text-slate-500">
                Stock value: <span className="tabular font-medium text-slate-900">{inr(cost.data.stock_value)}</span>
              </p>
            )}
          </Card>

          {seesMovements && (
            <Card className="overflow-hidden">
              <div className="flex items-center justify-between p-5 pb-3">
                <h2 className="font-semibold">Recent stock movements</h2>
                <Link href={`/stock/movements?product=${id}`} className="text-sm font-medium text-accent-700 hover:underline">
                  All movements
                </Link>
              </div>
              {(movements.data ?? []).length === 0 ? (
                <p className="px-5 pb-5 text-sm text-slate-500">No movements yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-slate-100">
                      {(movements.data ?? []).map((m) => (
                        <tr key={m.id}>
                          <td className="py-2 pl-5 whitespace-nowrap text-slate-500">{dateTime(m.created_at)}</td>
                          <td className="py-2 pl-4">{MOVEMENT_LABELS[m.movement_type] ?? m.movement_type}</td>
                          <td className="py-2 pl-4 text-slate-500">{whMap.get(m.warehouse_id)}</td>
                          <td className="hidden py-2 pl-4 text-slate-500 sm:table-cell">{m.reason ?? ""}</td>
                          <td className="hidden py-2 pl-4 text-slate-500 md:table-cell">{m.created_by ? nameMap.get(m.created_by) : ""}</td>
                          <td className={cn("tabular py-2 pr-5 pl-4 text-right font-medium", Number(m.qty) < 0 ? "text-red-700" : "text-emerald-700")}>
                            {Number(m.qty) > 0 ? "+" : ""}{qty(m.qty)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function Stat({ label, value, tone, hint }: { label: string; value: string; tone?: "red" | "green"; hint?: string }) {
  return (
    <Card className="p-4">
      <div className="text-sm text-slate-500">{label}</div>
      <div className={cn("tabular mt-1 text-2xl font-semibold", tone === "red" && "text-red-700", tone === "green" && "text-emerald-700")}>{value}</div>
      {hint && <div className="text-xs font-medium text-red-700">{hint}</div>}
    </Card>
  );
}
