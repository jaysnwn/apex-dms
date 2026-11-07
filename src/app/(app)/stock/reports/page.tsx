import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3, FileSpreadsheet, FileText, IndianRupee } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getBrandContext } from "@/lib/brand";
import { Card } from "@/components/ui";
import { BrandBadge } from "@/components/brand-badge";
import { brandTone } from "@/lib/brand-style";

export const metadata: Metadata = { title: "Stock reports" };

// One card per brand: reports are never combined across brands.
export default async function StockReportsPage() {
  const { profile } = await requireRole("super_admin", "manager", "billing", "warehouse");
  const ctx = await getBrandContext();
  const supabase = await createClient();
  const brands = ctx.current ? [ctx.current] : ctx.brands;
  const { data: whs } = await supabase.from("warehouses").select("id, name, brand_id").eq("is_active", true).in("brand_id", brands.map((b) => b.id)).order("name");
  const seesCost = profile.role !== "warehouse";

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-600">Each brand gets its own reports with its own name and logo (logo is set in Products → Brands &amp; categories). Reports are never combined across brands.</p>
      {brands.map((b) => {
        const mine = (whs ?? []).filter((w) => w.brand_id === b.id);
        const t = brandTone(b.code);
        return (
          <Card key={b.id} className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3" style={{ borderTop: `4px solid ${t.hex}` }}>
              <BrandBadge name={b.name} code={b.code} />
              <span className="text-xs text-slate-500">{mine.length} warehouse{mine.length === 1 ? "" : "s"}</span>
            </div>
            <div className="grid gap-4 p-5 md:grid-cols-3">
              <form action="/api/stock/pdf" target="_blank" className="flex flex-col rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
                <div className="mb-1 flex items-center gap-2 font-semibold"><FileText className="size-5 text-red-600" /> {b.name} stock report (PDF)</div>
                <p className="mb-3 flex-1 text-sm text-slate-500">Print-ready list by category with quantities, totals and page numbers — for warehouse staff and management.</p>
                <input type="hidden" name="brand" value={b.id} />
                {mine.length > 1 && (
                  <select name="warehouse" className="mb-2 h-10 rounded-lg border border-slate-300 bg-white px-2 text-sm" aria-label="Warehouse">
                    <option value="">All {b.name} warehouses</option>
                    {mine.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                )}
                {seesCost && <label className="mb-3 flex items-center gap-2 text-sm"><input type="checkbox" name="value" value="1" className="size-4" /> Include inventory valuation</label>}
                <button className="h-10 rounded-lg bg-ink-900 text-sm font-semibold text-white hover:bg-ink-800">Open PDF</button>
              </form>

              <form action="/api/stock/xlsx" className="flex flex-col rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
                <div className="mb-1 flex items-center gap-2 font-semibold"><FileSpreadsheet className="size-5 text-emerald-600" /> {b.name} stock verification (Excel)</div>
                <p className="mb-3 flex-1 text-sm text-slate-500">Six columns: Sr. No., Product Name, Qty, Physical Qty, Difference, Notes. Staff fill Physical Qty; Difference works itself out (red = short, green = extra).</p>
                <input type="hidden" name="brand" value={b.id} />
                {mine.length > 1 && (
                  <select name="warehouse" className="mb-3 h-10 rounded-lg border border-slate-300 bg-white px-2 text-sm" aria-label="Warehouse">
                    <option value="">All {b.name} warehouses</option>
                    {mine.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                )}
                <button className="h-10 rounded-lg bg-emerald-600 text-sm font-semibold text-white hover:bg-emerald-700">Download Excel</button>
              </form>

              <div className="flex flex-col rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
                <div className="mb-1 flex items-center gap-2 font-semibold"><BarChart3 className="size-5 text-amber-600" /> More {b.name} reports</div>
                <ul className="flex-1 space-y-2 text-sm">
                  {seesCost && <li><Link className="flex items-center gap-2 font-medium text-accent-700 hover:underline" href={`/reports/stock-valuation?brand=${b.id}`}><IndianRupee className="size-4" /> Inventory valuation</Link></li>}
                  <li><Link className="font-medium text-accent-700 hover:underline" href={`/reports/stock-movement?brand=${b.id}`}>Stock movement (opening, in, out, closing)</Link></li>
                  <li><Link className="font-medium text-accent-700 hover:underline" href={`/stock?stock=low`}>Low &amp; out-of-stock list</Link></li>
                  {seesCost && <li><Link className="font-medium text-accent-700 hover:underline" href={`/reports/reorder-list?brand=${b.id}`}>Reorder list</Link></li>}
                  <li><Link className="font-medium text-accent-700 hover:underline" href="/stock/counts">Record a verification on screen</Link></li>
                </ul>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
