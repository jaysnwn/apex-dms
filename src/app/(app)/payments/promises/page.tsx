import Link from "next/link";
import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { date, inr } from "@/lib/format";
import { PROMISE_STATUS } from "@/lib/status";
import { todayIST } from "@/lib/gst";
import { Badge, Card, cn } from "@/components/ui";
import { Chip } from "@/components/chip";
import { PromiseButtons } from "./promise-row";

export const metadata: Metadata = { title: "Payment promises" };

export default async function PromisesPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  await requireRole("super_admin", "manager", "billing", "salesman");
  const sp = await searchParams;
  const supabase = await createClient();
  let q = supabase.from("payment_promises").select("id, retailer_id, invoice_id, promised_date, amount, status, remarks, created_by, retailers(shop_name, code, mobile)").order("promised_date").limit(300);
  q = sp.show === "all" ? q : q.eq("status", "open");
  const [{ data: rows }, { data: people }] = await Promise.all([q, supabase.from("profiles").select("id, full_name")]);
  const uMap = new Map((people ?? []).map((u) => [u.id as string, u.full_name as string]));
  const today = todayIST();

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">Add a promise from a retailer&apos;s page or during a visit.</p>
        <div className="flex gap-2">
          <Chip href="/payments/promises" active={sp.show !== "all"}>Open</Chip>
          <Chip href="/payments/promises?show=all" active={sp.show === "all"}>All</Chip>
        </div>
      </div>
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
            <tr><th className="px-4 py-2.5">Promised for</th><th className="px-3 py-2.5">Retailer</th><th className="px-3 py-2.5">Remarks</th><th className="px-3 py-2.5 text-right">Amount</th><th className="px-4 py-2.5"></th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(rows ?? []).length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-500">No open promises.</td></tr>}
            {(rows ?? []).map((p) => {
              const r = p.retailers as unknown as { shop_name: string; code: string; mobile: string };
              const late = p.status === "open" && p.promised_date < today;
              const isToday = p.status === "open" && p.promised_date === today;
              const st = PROMISE_STATUS[p.status];
              return (
                <tr key={p.id} className={cn(late && "bg-red-50/40")}>
                  <td className="px-4 py-2.5">
                    <div className="font-medium">{date(p.promised_date)}</div>
                    {late ? <Badge tone="red">Missed</Badge> : isToday ? <Badge tone="amber">Today</Badge> : <Badge tone={st.tone}>{st.label}</Badge>}
                  </td>
                  <td className="px-3 py-2.5"><Link href={`/retailers/${p.retailer_id}`} className="hover:underline">{r?.shop_name}</Link><div className="text-xs text-slate-500">{r?.mobile} · by {uMap.get(p.created_by ?? "") ?? "—"}</div></td>
                  <td className="px-3 py-2.5 text-slate-600">{p.remarks}</td>
                  <td className="tabular px-3 py-2.5 text-right font-semibold">{inr(p.amount)}</td>
                  <td className="px-4 py-2.5">{p.status === "open" && <PromiseButtons id={p.id} />}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </>
  );
}
