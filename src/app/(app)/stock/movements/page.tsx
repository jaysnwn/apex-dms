import Link from "next/link";
import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { brandScope, getBrandContext } from "@/lib/brand";
import { dateTime, MOVEMENT_LABELS, qty, txnLabel } from "@/lib/format";
import { Button, Card, Input, Select, cn } from "@/components/ui";
import { BrandStrip } from "@/components/brand-badge";
import { enumParam } from "@/lib/enum-param";

export const metadata: Metadata = { title: "Stock movement history" };

const PAGE = 50;
const TONE: Record<string, string> = {
  Purchase: "bg-fuchsia-50 text-fuchsia-800", "Stock inward": "bg-emerald-50 text-emerald-800", Sale: "bg-orange-50 text-orange-800",
  "Sales return": "bg-teal-50 text-teal-800", "Purchase return": "bg-rose-50 text-rose-800", "Stock adjustment": "bg-violet-50 text-violet-800",
  "Stock verification": "bg-violet-50 text-violet-800", "Transfer in": "bg-sky-50 text-sky-800", "Transfer out": "bg-sky-50 text-sky-800",
  Damaged: "bg-amber-50 text-amber-900", "Stock outward": "bg-rose-50 text-rose-800",
};

export default async function MovementsPage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string; warehouse?: string; type?: string; from?: string; to?: string; page?: string }>;
}) {
  await requireRole("super_admin", "manager", "billing", "warehouse");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const ctx = await getBrandContext();
  const scope = await brandScope();
  const supabase = await createClient();

  let query = supabase
    .from("stock_ledger")
    .select("id, created_at, movement_date, brand_name, product_id, product_name, sku, warehouse_id, warehouse_name, movement_type, qty, reference_type, reference_id, reference_no, reason, notes, created_by_name, balance_before, balance_after", { count: "exact" })
    .in("brand_id", scope)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range((page - 1) * PAGE, page * PAGE - 1);
  if (sp.product) query = query.eq("product_id", sp.product);
  if (sp.warehouse) query = query.eq("warehouse_id", sp.warehouse);
  const movementType = enumParam("stock_movement_type", sp.type);
  if (movementType) query = query.eq("movement_type", movementType);
  if (sp.from) query = query.gte("created_at", `${sp.from}T00:00:00+05:30`);
  if (sp.to) query = query.lte("created_at", `${sp.to}T23:59:59+05:30`);

  const [{ data, count }, { data: warehouses }] = await Promise.all([
    query,
    supabase.from("warehouses").select("id, name").in("brand_id", scope).order("name"),
  ]);
  const rows = data ?? [];
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE));
  const multiWh = (warehouses ?? []).length > 1;

  const qs = (p: number) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, page: String(p) })) if (v) next.set(k, v);
    return `?${next}`;
  };
  const refHref = (m: (typeof rows)[number]) =>
    m.reference_type === "purchase" && m.reference_id ? `/purchases/${m.reference_id}` :
    m.reference_type === "stock_count" && m.reference_id ? `/stock/counts/${m.reference_id}` : null;

  return (
    <>
      <BrandStrip name={ctx.current?.name} code={ctx.current?.code} all={ctx.isAll} />
      <Card className="mb-4 p-4">
        <form className="grid gap-3 sm:grid-cols-5">
          {sp.product && <input type="hidden" name="product" value={sp.product} />}
          <Select name="warehouse" defaultValue={sp.warehouse ?? ""} aria-label="Warehouse">
            <option value="">All warehouses</option>
            {(warehouses ?? []).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </Select>
          <Select name="type" defaultValue={sp.type ?? ""} aria-label="Type">
            <option value="">All transaction types</option>
            {Object.keys(MOVEMENT_LABELS).map((k) => <option key={k} value={k}>{txnLabel(k)}</option>)}
          </Select>
          <Input type="date" name="from" defaultValue={sp.from} aria-label="From date" />
          <Input type="date" name="to" defaultValue={sp.to} aria-label="To date" />
          <Button type="submit" variant="secondary">Filter</Button>
        </form>
        {sp.product && (
          <p className="mt-3 text-sm text-slate-600">
            Showing only <span className="font-medium">{rows[0]?.product_name ?? "one product"}</span> ·{" "}
            <Link href="/stock/movements" className="text-accent-700 hover:underline">show all</Link>
          </p>
        )}
      </Card>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
            <tr>
              <th className="px-4 py-2.5">Date &amp; time</th>
              <th className="px-3 py-2.5">Product</th>
              <th className="px-3 py-2.5">Transaction</th>
              <th className="px-3 py-2.5 text-right">Added</th>
              <th className="px-3 py-2.5 text-right">Removed</th>
              <th className="px-3 py-2.5 text-right">Previous</th>
              <th className="px-3 py-2.5 text-right">Updated</th>
              <th className="px-3 py-2.5">Reference</th>
              <th className="px-4 py-2.5">User</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 && <tr><td colSpan={9} className="px-4 py-10 text-center text-slate-500">No movements match.</td></tr>}
            {rows.map((m) => {
              const q = Number(m.qty);
              const label = txnLabel(m.movement_type, m.reference_type);
              const href = refHref(m);
              const ref = m.reference_no || m.reason;
              return (
                <tr key={m.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 whitespace-nowrap text-slate-600">{dateTime(m.created_at)}</td>
                  <td className="px-3 py-2.5">
                    <Link href={`/stock/movements?product=${m.product_id}`} className="font-medium hover:underline">{m.product_name}</Link>
                    <div className="text-xs text-slate-500"><span className="font-mono">{m.sku}</span>{multiWh ? ` · ${m.warehouse_name}` : ""}{ctx.isAll ? ` · ${m.brand_name}` : ""}</div>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap"><span className={cn("rounded-md px-2 py-0.5 text-xs font-semibold", TONE[label] ?? "bg-slate-100 text-slate-700")}>{label}</span></td>
                  <td className="tabular px-3 py-2.5 text-right font-semibold text-emerald-700">{q > 0 ? `+${qty(q)}` : ""}</td>
                  <td className="tabular px-3 py-2.5 text-right font-semibold text-red-700">{q < 0 ? `−${qty(-q)}` : ""}</td>
                  <td className="tabular px-3 py-2.5 text-right text-slate-500">{qty(m.balance_before)}</td>
                  <td className="tabular px-3 py-2.5 text-right font-semibold">{qty(m.balance_after)}</td>
                  <td className="max-w-64 px-3 py-2.5 text-slate-600">
                    {href ? <Link href={href} className="hover:underline">{ref}</Link> : ref}
                    {m.notes && <div className="text-xs text-slate-400">{m.notes}</div>}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-slate-600">{m.created_by_name ?? "System"}</td>
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
