import Link from "next/link";
import type { Metadata } from "next";
import { CheckCircle2, ChevronLeft, ChevronRight, CircleDashed, Settings2 } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { date, inr } from "@/lib/format";
import { todayIST } from "@/lib/gst";
import { monthLabel, monthParam, shiftMonth, toSummary } from "@/lib/incentive";
import { Alert, Badge, Card, PageHeader, cn } from "@/components/ui";
import { LinkButton } from "@/components/chip";
import { RouteTabs } from "../manager-tabs";
import { ApproveButton, PaidButton, ReopenButton } from "./buttons";

export const metadata: Metadata = { title: "Incentives" };

type Payout = { id: string; salesman_id: string; net_sales: number; billed_shops: number; smart_shops: number; recovery_pct: number;
  sales_earned: number; billed_earned: number; smart_earned: number; recovery_earned: number; total: number; status: string; paid_method: string | null; paid_reference: string | null; paid_at: string | null; detail: Record<string, unknown> };

export default async function IncentivesPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { profile } = await requireRole("super_admin", "manager");
  const today = todayIST();
  const month = monthParam((await searchParams).month, today);
  const supabase = await createClient();
  const [{ data: salesmen }, { data: payouts }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, is_active").eq("role", "salesman").order("full_name"),
    supabase.from("incentive_payouts").select("*").eq("month", month),
  ]);
  const pMap = new Map(((payouts ?? []) as Payout[]).map((p) => [p.salesman_id, p]));
  const people = (salesmen ?? []).filter((s) => s.is_active || pMap.has(s.id));
  const live = await Promise.all(people.map(async (sm) => {
    if (pMap.has(sm.id)) return null;
    const { data } = await supabase.rpc("salesman_incentive", { p_salesman: sm.id, p_month: month });
    return toSummary(data as Record<string, unknown> | null);
  }));
  const any = live.find(Boolean) ?? toSummary((payouts?.[0] as Payout | undefined)?.detail ?? null);
  const scheme = any?.scheme;
  const isFinal = any?.is_final ?? false;
  const unlocked = people.filter((sm) => !pMap.has(sm.id)).length;
  const totalApproved = ((payouts ?? []) as Payout[]).reduce((t, p) => t + Number(p.total), 0);
  const totalUnpaid = ((payouts ?? []) as Payout[]).filter((p) => p.status !== "paid").reduce((t, p) => t + Number(p.total), 0);
  const thisMonth = today.slice(0, 8) + "01";

  return (
    <>
      <PageHeader title="Routes" />
      <RouteTabs />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link href={`/routes/incentives?month=${shiftMonth(month, -1).slice(0, 7)}`} className="grid size-9 place-items-center rounded-lg border border-slate-300 bg-white hover:bg-slate-50" aria-label="Previous month"><ChevronLeft className="size-4" /></Link>
          <span className="min-w-40 text-center text-lg font-semibold">{monthLabel(month)}</span>
          {month < thisMonth ? <Link href={`/routes/incentives?month=${shiftMonth(month, 1).slice(0, 7)}`} className="grid size-9 place-items-center rounded-lg border border-slate-300 bg-white hover:bg-slate-50" aria-label="Next month"><ChevronRight className="size-4" /></Link> : <span className="size-9" />}
          {any && <Badge tone={isFinal ? "green" : "amber"}>{isFinal ? "Final — ready to approve" : `Provisional · final on ${date(any.final_on)}`}</Badge>}
        </div>
        <div className="flex flex-wrap gap-2">
          <LinkButton href="/routes/incentives/scheme"><Settings2 className="size-4" /> Scheme</LinkButton>
          {unlocked > 0 && <ApproveButton month={month} canApprove={isFinal} canOverride={profile.role === "super_admin"} />}
        </div>
      </div>

      {scheme && (
        <p className="mb-4 text-sm text-slate-600">
          Scheme: sales ≥ {inr(scheme.sales_target, { decimals: false })} before GST ({inr(scheme.sales_amount, { decimals: false })}) ·
          {" "}{scheme.billed_target} shops billed ({inr(scheme.billed_amount, { decimals: false })}) ·
          {" "}{scheme.smart_target} smart shops ≥ {inr(scheme.smart_min_purchase, { decimals: false })} paid in {scheme.smart_pay_days} days ({inr(scheme.smart_amount, { decimals: false })}) ·
          {" "}recovery ≥ {scheme.recovery_pct}% ({inr(scheme.recovery_amount, { decimals: false })})
        </p>
      )}
      {(payouts ?? []).length > 0 && (
        <div className="mb-4"><Alert tone="green">Approved {inr(totalApproved, { decimals: false })} for {(payouts ?? []).length} salesm{(payouts ?? []).length === 1 ? "an" : "en"}{totalUnpaid > 0 ? ` · ${inr(totalUnpaid, { decimals: false })} still to pay` : " · all paid"}.</Alert></div>
      )}

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
            <tr>
              <th className="px-4 py-2.5">Salesman</th>
              <th className="px-3 py-2.5 text-right">Sales (ex GST)</th>
              <th className="px-3 py-2.5 text-right">Shops billed</th>
              <th className="px-3 py-2.5 text-right">Smart shops</th>
              <th className="px-3 py-2.5 text-right">Recovery</th>
              <th className="px-3 py-2.5 text-right">Incentive</th>
              <th className="px-4 py-2.5">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {people.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-500">No salesmen yet.</td></tr>}
            {people.map((sm, i) => {
              const p = pMap.get(sm.id);
              const s = live[i];
              const row = p
                ? { net_sales: Number(p.net_sales), billed: p.billed_shops, smart: p.smart_shops, rec: Number(p.recovery_pct), e: [p.sales_earned, p.billed_earned, p.smart_earned, p.recovery_earned].map(Number), total: Number(p.total) }
                : s ? { net_sales: s.net_sales, billed: s.billed_shops, smart: s.smart_shops, rec: s.recovery_pct, e: [s.sales_earned, s.billed_earned, s.smart_earned, s.recovery_earned], total: s.total } : null;
              const sc = (s ?? toSummary(p?.detail ?? null))?.scheme;
              return (
                <tr key={sm.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5"><Link href={`/routes/incentives/${sm.id}?month=${month.slice(0, 7)}`} className="font-semibold hover:underline">{sm.full_name}</Link></td>
                  {row && sc ? (
                    <>
                      <Cell ok={row.e[0] > 0} v={inr(row.net_sales, { decimals: false })} t={inr(sc.sales_target, { decimals: false })} />
                      <Cell ok={row.e[1] > 0} v={String(row.billed)} t={String(sc.billed_target)} />
                      <Cell ok={row.e[2] > 0} v={String(row.smart)} t={String(sc.smart_target)} />
                      <Cell ok={row.e[3] > 0} v={`${row.rec.toFixed(1)}%`} t={`${sc.recovery_pct}%`} />
                      <td className="tabular px-3 py-2.5 text-right text-base font-bold">{inr(row.total, { decimals: false })}</td>
                    </>
                  ) : <td colSpan={5} className="px-3 py-2.5 text-slate-400">—</td>}
                  <td className="px-4 py-2.5">
                    {!p ? <Badge tone={isFinal ? "amber" : "slate"}>{isFinal ? "To approve" : "Live"}</Badge>
                      : p.status === "paid" ? <span className="text-xs"><Badge tone="green">Paid</Badge> <span className="text-slate-500">{p.paid_method?.replace("_", " ")}{p.paid_reference ? ` · ${p.paid_reference}` : ""}</span></span>
                      : (
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone="blue">Approved</Badge>
                          {Number(p.total) > 0 ? <PaidButton id={p.id} amount={Number(p.total)} name={sm.full_name} /> : null}
                          {profile.role === "super_admin" && <ReopenButton id={p.id} />}
                        </div>
                      )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
      <p className="mt-3 text-xs text-slate-500">
        Live figures change until the month is approved. A month can be approved once every bill of that month has had its {scheme?.smart_pay_days ?? 21} payment days.
        Approval keeps a permanent copy of each salesman&apos;s figures and shop list.
      </p>
    </>
  );
}

function Cell({ ok, v, t }: { ok: boolean; v: string; t: string }) {
  return (
    <td className="px-3 py-2.5 text-right">
      <span className={cn("tabular inline-flex items-center gap-1 font-semibold", ok ? "text-emerald-700" : "text-slate-700")}>
        {ok ? <CheckCircle2 className="size-3.5" /> : <CircleDashed className="size-3.5 text-slate-300" />} {v}
      </span>
      <span className="tabular block text-[11px] text-slate-400">of {t}</span>
    </td>
  );
}
