import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { inr } from "@/lib/format";
import { todayIST } from "@/lib/gst";
import { monthLabel, shiftMonth, toSlabs } from "@/lib/incentive";
import { Card, PageHeader } from "@/components/ui";
import { RouteTabs } from "../../manager-tabs";
import { SchemeForm } from "./scheme-form";

export const metadata: Metadata = { title: "Incentive scheme" };

export default async function SchemePage() {
  const { profile } = await requireRole("super_admin", "manager");
  const supabase = await createClient();
  const { data: rows } = await supabase.from("incentive_schemes").select("*").order("effective_from", { ascending: false });
  const current = (rows ?? []).find((r) => r.effective_from <= todayIST()) ?? rows?.[0];
  const nextMonth = shiftMonth(todayIST().slice(0, 8) + "01", 1).slice(0, 7);

  return (
    <>
      <PageHeader title="Routes" />
      <RouteTabs />
      <Link href="/routes/incentives" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:underline"><ArrowLeft className="size-4" /> Incentives</Link>
      <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
        <Card className="overflow-x-auto">
          <div className="border-b border-slate-100 px-4 py-3 font-semibold">Scheme history</div>
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
              <tr><th className="px-4 py-2">From</th><th className="px-3 py-2">Sales</th><th className="px-3 py-2">Shops billed</th><th className="px-3 py-2">Smart shops</th><th className="px-3 py-2">Collection slabs</th><th className="px-3 py-2 text-right">Max</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(rows ?? []).map((r) => (
                <tr key={r.id} className={r.id === current?.id ? "bg-emerald-50/50" : ""}>
                  <td className="px-4 py-2 font-medium">{monthLabel(r.effective_from)}{r.id === current?.id && <span className="ml-1 text-xs text-emerald-700">(current)</span>}</td>
                  <td className="tabular px-3 py-2">≥ {inr(r.sales_target, { decimals: false })} → {inr(r.sales_amount, { decimals: false })}</td>
                  <td className="tabular px-3 py-2">{r.billed_target} → {inr(r.billed_amount, { decimals: false })}</td>
                  <td className="tabular px-3 py-2">{r.smart_target} (≥ {inr(r.smart_min_purchase, { decimals: false })}, {r.smart_pay_days} d) → {inr(r.smart_amount, { decimals: false })}</td>
                  <td className="tabular px-3 py-2">{toSlabs(r.collection_slabs).map((sl) => `${sl.min_pct}% → ${inr(sl.amount, { decimals: false })}`).join(" · ")}</td>
                  <td className="tabular px-3 py-2 text-right font-semibold">{inr(Number(r.sales_amount) + Number(r.billed_amount) + Number(r.smart_amount) + Math.max(0, ...toSlabs(r.collection_slabs).map((x) => x.amount)), { decimals: false })}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-4 py-3 text-xs text-slate-500">Sales are counted before GST, net of returns. Collection % = money received in the month against every bill due by month end (old overdue included) ÷ that amount due. Only the highest slab reached is paid.</p>
        </Card>
        {profile.role === "super_admin" ? (
          <Card className="p-5">
            <h2 className="mb-1 font-semibold">Change the scheme</h2>
            <p className="mb-4 text-sm text-slate-500">Applies from the month you choose. Months already approved never change.</p>
            {current && <SchemeForm current={current} defaultMonth={nextMonth} />}
          </Card>
        ) : (
          <Card className="p-5 text-sm text-slate-600">Only the Super Administrator can change the incentive scheme.</Card>
        )}
      </div>
    </>
  );
}
