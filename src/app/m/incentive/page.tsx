import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { inr } from "@/lib/format";
import { todayIST } from "@/lib/gst";
import { monthLabel, monthParam, shiftMonth } from "@/lib/incentive";
import { Badge } from "@/components/ui";
import { IncentiveView } from "@/components/incentive-view";
import { getIncentive } from "../data";

export const metadata: Metadata = { title: "My incentive" };

export default async function MyIncentivePage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { user } = await requireRole("salesman", "manager", "super_admin");
  const today = todayIST();
  const month = monthParam((await searchParams).month, today);
  const thisMonth = today.slice(0, 8) + "01";
  const supabase = await createClient();
  const [{ summary, shops }, { data: history }] = await Promise.all([
    getIncentive(supabase, user.id, month),
    supabase.from("incentive_payouts").select("month, total, status, paid_at").eq("salesman_id", user.id).order("month", { ascending: false }).limit(12),
  ]);
  const prev = shiftMonth(month, -1).slice(0, 7);
  const next = shiftMonth(month, 1);

  return (
    <div className="space-y-4">
      <Link href="/m" className="flex items-center gap-1 px-1 text-sm font-medium text-slate-600"><ArrowLeft className="size-4" /> Home</Link>
      <div className="flex items-center justify-between rounded-2xl bg-white p-2 shadow-sm ring-1 ring-slate-200/70">
        <Link href={`/m/incentive?month=${prev}`} className="grid size-10 place-items-center rounded-xl active:bg-slate-100" aria-label="Previous month"><ChevronLeft className="size-5" /></Link>
        <span className="font-semibold">{monthLabel(month)}</span>
        {next <= thisMonth ? (
          <Link href={`/m/incentive?month=${next.slice(0, 7)}`} className="grid size-10 place-items-center rounded-xl active:bg-slate-100" aria-label="Next month"><ChevronRight className="size-5" /></Link>
        ) : <span className="size-10" />}
      </div>

      {summary ? (
        <IncentiveView s={summary} shops={shops} shopHref={(id) => `/m/outlets/${id}`} orderHref={month === thisMonth ? (id) => `/m/order?retailer=${id}` : undefined} />
      ) : (
        <p className="rounded-2xl bg-white p-6 text-center text-sm text-slate-500">No incentive scheme for this month.</p>
      )}

      {(history ?? []).length > 0 && (
        <section className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70">
          <h2 className="px-4 pt-3 pb-1 text-sm font-semibold">Approved incentives</h2>
          <ul className="divide-y divide-slate-100">
            {(history ?? []).map((h) => (
              <li key={h.month}>
                <Link href={`/m/incentive?month=${String(h.month).slice(0, 7)}`} className="flex items-center justify-between px-4 py-2.5 text-sm active:bg-slate-50">
                  <span>{monthLabel(h.month)}</span>
                  <span className="flex items-center gap-2"><span className="tabular font-semibold">{inr(h.total, { decimals: false })}</span><Badge tone={h.status === "paid" ? "green" : "blue"}>{h.status === "paid" ? "Paid" : "Approved"}</Badge></span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="px-2 text-center text-[11px] text-slate-400">Shops on your routes and shops you added count as yours. Payments count when received (cheques once cleared) and are applied to the oldest bills first.</p>
    </div>
  );
}
