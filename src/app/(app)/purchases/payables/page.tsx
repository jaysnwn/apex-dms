import Link from "next/link";
import type { Metadata } from "next";
import { AlertTriangle, CalendarClock, IndianRupee } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { inr } from "@/lib/format";
import { todayIST, addDays } from "@/lib/gst";
import { Card, cn } from "@/components/ui";
import { LinkButton } from "@/components/chip";
import { StatCard } from "@/components/stat-card";

export const metadata: Metadata = { title: "Payables" };

type Agg = { id: string; name: string; notDue: number; dueWeek: number; b0: number; b16: number; b31: number; b45: number; total: number; bills: number };

export default async function PayablesPage() {
  await requireRole("super_admin", "manager", "billing");
  const supabase = await createClient();
  const today = todayIST();
  const week = addDays(today, 7);
  const [{ data: bal }, { data: suppliers }] = await Promise.all([
    supabase.from("purchase_balances").select("supplier_id, due_date, balance, days_overdue").gt("balance", 0),
    supabase.from("suppliers").select("id, name"),
  ]);
  const names = new Map((suppliers ?? []).map((s) => [s.id as string, s.name as string]));
  const m = new Map<string, Agg>();
  for (const b of bal ?? []) {
    const a = m.get(b.supplier_id) ?? { id: b.supplier_id, name: names.get(b.supplier_id) ?? "—", notDue: 0, dueWeek: 0, b0: 0, b16: 0, b31: 0, b45: 0, total: 0, bills: 0 };
    const v = Number(b.balance);
    const d = Number(b.days_overdue);
    if (b.due_date >= today) { a.notDue += v; if (b.due_date <= week) a.dueWeek += v; }
    else if (d <= 15) a.b0 += v; else if (d <= 30) a.b16 += v; else if (d <= 45) a.b31 += v; else a.b45 += v;
    a.total += v; a.bills += 1;
    m.set(b.supplier_id, a);
  }
  const rows = [...m.values()].sort((x, y) => y.total - x.total);
  const tot = rows.reduce((t, r) => ({ total: t.total + r.total, overdue: t.overdue + r.b0 + r.b16 + r.b31 + r.b45, week: t.week + r.dueWeek }), { total: 0, overdue: 0, week: 0 });
  const cell = (v: number, tone: string) => <td className={cn("tabular px-3 py-2.5 text-right", v > 0 ? tone : "text-slate-300")}>{v > 0 ? inr(v, { decimals: false }) : "—"}</td>;

  return (
    <>
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Total payable" value={inr(tot.total, { decimals: false })} icon={IndianRupee} tone="orange" />
        <StatCard label="Overdue" value={inr(tot.overdue, { decimals: false })} icon={AlertTriangle} tone="red" alert={tot.overdue > 0} />
        <StatCard label="Due in the next 7 days" value={inr(tot.week, { decimals: false })} icon={CalendarClock} tone="amber" />
      </div>
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
            <tr>
              <th className="px-4 py-2.5">Supplier</th><th className="px-3 py-2.5 text-right">Bills</th><th className="px-3 py-2.5 text-right">Not yet due</th>
              <th className="px-3 py-2.5 text-right">0–15 days</th><th className="px-3 py-2.5 text-right">16–30</th><th className="px-3 py-2.5 text-right">31–45</th><th className="px-3 py-2.5 text-right">45+</th>
              <th className="px-3 py-2.5 text-right">Total</th><th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 && <tr><td colSpan={9} className="px-4 py-10 text-center text-slate-500">Nothing payable. All supplier bills are paid.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="px-4 py-2.5"><Link href={`/purchases/suppliers/${r.id}`} className="font-semibold hover:underline">{r.name}</Link></td>
                <td className="tabular px-3 py-2.5 text-right">{r.bills}</td>
                {cell(r.notDue, "text-sky-700")}
                {cell(r.b0, "text-amber-700 font-medium")}
                {cell(r.b16, "text-orange-700 font-medium")}
                {cell(r.b31, "text-red-600 font-semibold")}
                {cell(r.b45, "bg-red-50 text-red-700 font-bold")}
                <td className="tabular px-3 py-2.5 text-right font-semibold">{inr(r.total, { decimals: false })}</td>
                <td className="px-4 py-2.5 text-right"><LinkButton href={`/purchases/payments/new?supplier=${r.id}`} className="h-8 border-emerald-600 text-emerald-700">Pay</LinkButton></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
