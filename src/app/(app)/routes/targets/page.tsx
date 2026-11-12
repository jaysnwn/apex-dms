import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { date, inr } from "@/lib/format";
import { todayIST } from "@/lib/gst";
import { Card, PageHeader, cn } from "@/components/ui";
import { RouteTabs } from "../manager-tabs";
import { TargetForm } from "./target-form";
import { allRows } from "@/lib/all-rows";

export const metadata: Metadata = { title: "Targets" };

export default async function TargetsPage() {
  await requireRole("super_admin", "manager");
  const supabase = await createClient();
  const today = todayIST();
  const [{ data: salesmen }, { data: targets }] = await Promise.all([
    supabase.from("tenant_people").select("id, full_name").eq("role", "salesman").eq("is_active", true).order("full_name"),
    supabase.from("targets").select("*").gte("period_end", today).order("period_start"),
  ]);
  const minStart = (targets ?? []).reduce((m, t) => (t.period_start < m ? t.period_start : m), today);
  const [{ data: pays }, { data: invs }] = await Promise.all([
    allRows(() => supabase.from("payments").select("collected_by, amount, payment_date").in("status", ["received", "cheque_pending"]).gte("payment_date", minStart).order("id")),
    allRows(() => supabase.from("invoices").select("grand_total, invoice_date, orders(salesman_id)").eq("status", "issued").gte("invoice_date", minStart).order("id")),
  ]);
  const names = new Map((salesmen ?? []).map((s) => [s.id as string, s.full_name as string]));

  return (
    <>
      <PageHeader title="Routes" />
      <RouteTabs />
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          {(targets ?? []).length === 0 && <Card className="p-8 text-center text-sm text-slate-500">No current targets.</Card>}
          {(targets ?? []).map((t) => {
            const sold = (invs ?? []).filter((i) => (i.orders as unknown as { salesman_id: string } | null)?.salesman_id === t.salesman_id && i.invoice_date >= t.period_start && i.invoice_date <= t.period_end).reduce((s, i) => s + Number(i.grand_total), 0);
            const coll = (pays ?? []).filter((p) => p.collected_by === t.salesman_id && p.payment_date >= t.period_start && p.payment_date <= t.period_end).reduce((s, p) => s + Number(p.amount), 0);
            return (
              <Card key={t.id} className="p-5">
                <div className="mb-3 flex items-center justify-between"><span className="font-semibold">{names.get(t.salesman_id) ?? "Salesman"}</span><span className="text-sm text-slate-500">{date(t.period_start)} – {date(t.period_end)}</span></div>
                <Bar label="Sales" done={sold} goal={Number(t.sales_target)} />
                <Bar label="Collection" done={coll} goal={Number(t.collection_target)} />
              </Card>
            );
          })}
        </div>
        <TargetForm salesmen={(salesmen ?? []).map((s) => ({ id: s.id, name: s.full_name }))} />
      </div>
    </>
  );
}

function Bar({ label, done, goal }: { label: string; done: number; goal: number }) {
  const pct = goal > 0 ? Math.min(100, (done / goal) * 100) : 0;
  return (
    <div className="mb-2">
      <div className="mb-1 flex justify-between text-sm"><span className="text-slate-600">{label}</span><span className="tabular font-medium">{inr(done, { decimals: false })} / {inr(goal, { decimals: false })} <span className="text-slate-400">({Math.round(pct)}%)</span></span></div>
      <div className="h-2.5 overflow-hidden rounded-full bg-slate-100"><div className={cn("h-full rounded-full", pct >= 100 ? "bg-emerald-500" : pct >= 60 ? "bg-sky-500" : "bg-amber-500")} style={{ width: `${pct}%` }} /></div>
    </div>
  );
}
