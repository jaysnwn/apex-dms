import Link from "next/link";
import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { dateTime, MOVEMENT_LABELS, qty } from "@/lib/format";
import { Button, Card, Input, Select, cn } from "@/components/ui";

export const metadata: Metadata = { title: "Stock movements" };

const PAGE = 50;

export default async function MovementsPage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string; warehouse?: string; type?: string; from?: string; to?: string; page?: string }>;
}) {
  await requireRole("super_admin", "manager", "billing", "warehouse");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const supabase = await createClient();

  let query = supabase
    .from("stock_movements")
    .select("id, product_id, warehouse_id, movement_type, qty, reason, reference_type, created_by, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE, page * PAGE - 1);
  if (sp.product) query = query.eq("product_id", sp.product);
  if (sp.warehouse) query = query.eq("warehouse_id", sp.warehouse);
  if (sp.type && MOVEMENT_LABELS[sp.type]) query = query.eq("movement_type", sp.type);
  if (sp.from) query = query.gte("created_at", `${sp.from}T00:00:00+05:30`);
  if (sp.to) query = query.lte("created_at", `${sp.to}T23:59:59+05:30`);

  const [{ data, count }, { data: warehouses }, { data: people }] = await Promise.all([
    query,
    supabase.from("warehouses").select("id, name").order("name"),
    supabase.from("profiles").select("id, full_name"),
  ]);
  const rows = data ?? [];
  const productIds = [...new Set(rows.map((r) => r.product_id as string))];
  const { data: products } = productIds.length
    ? await supabase.from("catalog").select("id, name, sku").in("id", productIds)
    : { data: [] };
  const pMap = new Map((products ?? []).map((p) => [p.id as string, p]));
  const wMap = new Map((warehouses ?? []).map((w) => [w.id as string, w.name as string]));
  const uMap = new Map((people ?? []).map((u) => [u.id as string, u.full_name as string]));
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE));
  const filterProduct = sp.product ? pMap.get(sp.product) : undefined;

  const qs = (p: number) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, page: String(p) })) if (v) next.set(k, v);
    return `?${next}`;
  };

  return (
    <>
      <Card className="mb-4 p-4">
        <form className="grid gap-3 sm:grid-cols-5">
          {sp.product && <input type="hidden" name="product" value={sp.product} />}
          <Select name="warehouse" defaultValue={sp.warehouse ?? ""} aria-label="Warehouse">
            <option value="">All warehouses</option>
            {(warehouses ?? []).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </Select>
          <Select name="type" defaultValue={sp.type ?? ""} aria-label="Type">
            <option value="">All types</option>
            {Object.entries(MOVEMENT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          <Input type="date" name="from" defaultValue={sp.from} aria-label="From date" />
          <Input type="date" name="to" defaultValue={sp.to} aria-label="To date" />
          <Button type="submit" variant="secondary">Filter</Button>
        </form>
        {sp.product && (
          <p className="mt-3 text-sm text-slate-600">
            Showing only <span className="font-medium">{filterProduct?.name ?? "one product"}</span> ·{" "}
            <Link href="/stock/movements" className="text-accent-700 hover:underline">show all</Link>
          </p>
        )}
      </Card>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
            <tr>
              <th className="px-4 py-2.5">When</th>
              <th className="px-3 py-2.5">Product</th>
              <th className="px-3 py-2.5">Type</th>
              <th className="px-3 py-2.5">Warehouse</th>
              <th className="px-3 py-2.5">Note</th>
              <th className="px-3 py-2.5">By</th>
              <th className="px-4 py-2.5 text-right">Qty</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">No movements match.</td></tr>}
            {rows.map((m) => {
              const p = pMap.get(m.product_id);
              return (
                <tr key={m.id}>
                  <td className="px-4 py-2.5 whitespace-nowrap text-slate-500">{dateTime(m.created_at)}</td>
                  <td className="px-3 py-2.5">
                    <Link href={`/products/${m.product_id}`} className="font-medium hover:underline">{p?.name ?? "—"}</Link>
                    <div className="font-mono text-xs text-slate-500">{p?.sku}</div>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{MOVEMENT_LABELS[m.movement_type] ?? m.movement_type}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-slate-600">{wMap.get(m.warehouse_id)}</td>
                  <td className="px-3 py-2.5 text-slate-500">{m.reason}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-slate-500">{m.created_by ? uMap.get(m.created_by) : "System"}</td>
                  <td className={cn("tabular px-4 py-2.5 text-right font-medium", Number(m.qty) < 0 ? "text-red-700" : "text-emerald-700")}>
                    {Number(m.qty) > 0 ? "+" : ""}{qty(m.qty)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
        <span className="tabular">{(count ?? 0).toLocaleString("en-IN")} movements · page {page} of {pages}</span>
        <div className="flex gap-2">
          {page > 1 && <Link className="rounded-lg border bg-white px-3 py-1.5" href={qs(page - 1)}>Newer</Link>}
          {page < pages && <Link className="rounded-lg border bg-white px-3 py-1.5" href={qs(page + 1)}>Older</Link>}
        </div>
      </div>
    </>
  );
}
