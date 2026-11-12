import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayIST } from "@/lib/gst";
import { monthLabel, monthParam, toShops, toSummary } from "@/lib/incentive";
import { Alert, PageHeader } from "@/components/ui";
import { IncentiveView } from "@/components/incentive-view";
import { RouteTabs } from "../../manager-tabs";

export const metadata: Metadata = { title: "Salesman incentive" };

export default async function SalesmanIncentivePage({ params, searchParams }: { params: Promise<{ salesman: string }>; searchParams: Promise<{ month?: string }> }) {
  await requireRole("super_admin", "manager");
  const { salesman } = await params;
  const month = monthParam((await searchParams).month, todayIST());
  const supabase = await createClient();
  const { data: sm } = await supabase.from("tenant_people").select("id, full_name").eq("id", salesman).maybeSingle();
  if (!sm) notFound();
  const { data: payout } = await supabase.from("incentive_payouts").select("detail, status, approved_at").eq("salesman_id", salesman).eq("month", month).maybeSingle();

  let summary, shops;
  if (payout) {
    const d = payout.detail as Record<string, unknown>;
    summary = toSummary(d);
    shops = toShops((d.shops as Record<string, unknown>[]) ?? []);
  } else {
    const [{ data: j }, { data: rows }] = await Promise.all([
      supabase.rpc("salesman_incentive", { p_salesman: salesman, p_month: month }),
      supabase.rpc("incentive_shops", { p_salesman: salesman, p_month: month }),
    ]);
    summary = toSummary(j as Record<string, unknown> | null);
    shops = toShops(rows as Record<string, unknown>[] | null);
  }

  return (
    <>
      <PageHeader title="Routes" />
      <RouteTabs />
      <Link href={`/routes/incentives?month=${month.slice(0, 7)}`} className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:underline"><ArrowLeft className="size-4" /> All salesmen</Link>
      <h2 className="mb-3 text-lg font-semibold">{sm.full_name} · {monthLabel(month)}</h2>
      {payout && <div className="mb-4 max-w-2xl"><Alert tone="green">Approved{payout.status === "paid" ? " and paid" : ""}. Showing the figures saved at approval (shops that were not billed are not stored).</Alert></div>}
      <div className="max-w-2xl">
        {summary ? <IncentiveView s={summary} shops={shops} shopHref={(id) => `/retailers/${id}`} /> : <Alert tone="amber">No incentive scheme for this month.</Alert>}
      </div>
    </>
  );
}
