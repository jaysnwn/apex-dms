"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { Alert, Button, Card, cn } from "@/components/ui";
import { inr, qty as fmtQty } from "@/lib/format";
import { createReorderPurchases } from "../actions";

export type Suggestion = {
  product_id: string; name: string; sku: string; category: string | null; unit: string;
  available: number; on_order: number; min: number; sold_30d: number; avg_daily: number; days_left: number | null;
  suggested: number; unit_cost: number; cost_mode: "inclusive" | "exclusive"; supplier_id: string | null; supplier_name: string | null;
  lead_days: number; urgency: "out" | "urgent" | "low";
};

const URG = {
  out: { label: "Out of stock", cls: "bg-red-100 text-red-800" },
  urgent: { label: "Runs out before delivery", cls: "bg-orange-100 text-orange-800" },
  low: { label: "Below minimum", cls: "bg-amber-100 text-amber-900" },
};

export function ReorderList({ brandId, brandName, rows }: { brandId: string; brandName: string; rows: Suggestion[] }) {
  const router = useRouter();
  const [qty, setQty] = useState<Record<string, string>>(Object.fromEntries(rows.map((r) => [r.product_id, String(r.suggested)])));
  const [picked, setPicked] = useState<Set<string>>(new Set(rows.filter((r) => r.supplier_id).map((r) => r.product_id)));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const chosen = rows.filter((r) => picked.has(r.product_id) && Number(qty[r.product_id]) > 0);
  const value = chosen.reduce((t, r) => t + Number(qty[r.product_id]) * r.unit_cost, 0);
  const suppliers = new Set(chosen.map((r) => r.supplier_name ?? "—"));

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
            <tr>
              <th className="w-10 px-4 py-2.5"><input type="checkbox" className="size-4" checked={picked.size === rows.length} onChange={(e) => setPicked(new Set(e.target.checked ? rows.map((r) => r.product_id) : []))} aria-label="Select all" /></th>
              <th className="px-2 py-2.5">Product</th>
              <th className="px-3 py-2.5 text-right">Available</th>
              <th className="px-3 py-2.5 text-right">On order</th>
              <th className="px-3 py-2.5 text-right">Sold / day</th>
              <th className="px-3 py-2.5 text-right">Days left</th>
              <th className="px-3 py-2.5 text-right">Min.</th>
              <th className="px-3 py-2.5">Supplier</th>
              <th className="px-4 py-2.5 text-right">Order qty</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => {
              const u = URG[r.urgency];
              return (
                <tr key={r.product_id} className={cn(picked.has(r.product_id) && "bg-fuchsia-50/40")}>
                  <td className="px-4 py-2"><input type="checkbox" className="size-4" checked={picked.has(r.product_id)} onChange={() => setPicked((s) => { const n = new Set(s); if (n.has(r.product_id)) n.delete(r.product_id); else n.add(r.product_id); return n; })} aria-label={`Select ${r.name}`} /></td>
                  <td className="px-2 py-2">
                    <div className="font-medium">{r.name}</div>
                    <div className="text-xs text-slate-500"><span className="font-mono">{r.sku}</span>{r.category ? ` · ${r.category}` : ""} · <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-semibold", u.cls)}>{u.label}</span></div>
                  </td>
                  <td className={cn("tabular px-3 py-2 text-right font-semibold", r.available <= 0 ? "text-red-700" : "text-amber-700")}>{fmtQty(r.available)}</td>
                  <td className="tabular px-3 py-2 text-right text-slate-600">{r.on_order ? fmtQty(r.on_order) : "—"}</td>
                  <td className="tabular px-3 py-2 text-right text-slate-600">{r.avg_daily ? fmtQty(r.avg_daily) : "—"}</td>
                  <td className="tabular px-3 py-2 text-right text-slate-600">{r.days_left ?? "—"}</td>
                  <td className="tabular px-3 py-2 text-right text-slate-600">{fmtQty(r.min)}</td>
                  <td className="px-3 py-2 text-slate-600">{r.supplier_name ?? <span className="text-red-700">No supplier</span>}<div className="text-[11px] text-slate-400">arrives in {r.lead_days} days</div></td>
                  <td className="px-4 py-2 text-right">
                    <input type="number" min={0} step="any" value={qty[r.product_id]} onChange={(e) => setQty((q) => ({ ...q, [r.product_id]: e.target.value }))}
                      className="tabular h-9 w-24 rounded-lg border border-slate-300 px-2 text-right font-semibold" aria-label={`Order quantity for ${r.name}`} />
                    <div className="text-[11px] text-slate-400">{r.unit.toLowerCase()}</div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col gap-3 border-t border-slate-100 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-sm text-slate-600">{chosen.length} product{chosen.length === 1 ? "" : "s"} · approx. <b className="tabular">{inr(value, { decimals: false })}</b> before GST · {suppliers.size} purchase order{suppliers.size === 1 ? "" : "s"}</span>
        <span className="flex items-center gap-2">
          {error && <Alert>{error}</Alert>}
          <Button className="bg-fuchsia-600 hover:bg-fuchsia-700" disabled={pending || !chosen.length} onClick={() => start(async () => {
            setError(null);
            const r = await createReorderPurchases({ brandId, items: chosen.map((c) => ({ product_id: c.product_id, qty: Number(qty[c.product_id]), supplier_id: c.supplier_id, unit_cost: c.unit_cost, cost_mode: c.cost_mode })) });
            if (r.error) return setError(r.error);
            router.push(r.ids?.length === 1 ? `/purchases/${r.ids[0]}?saved=1` : "/purchases/orders");
          })}>
            <ClipboardList className="size-4" /> {pending ? "Creating…" : `Create ${brandName} purchase order${suppliers.size === 1 ? "" : "s"}`}
          </Button>
        </span>
      </div>
    </Card>
  );
}
