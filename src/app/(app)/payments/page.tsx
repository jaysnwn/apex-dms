import Link from "next/link";
import type { Metadata } from "next";
import { Banknote, Clock, CreditCard, Smartphone } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { date, inr } from "@/lib/format";
import { PAYMENT_METHOD, PAYMENT_STATUS } from "@/lib/status";
import { todayIST } from "@/lib/gst";
import { Badge, Button, Card, Input, Select } from "@/components/ui";
import { StatCard } from "@/components/stat-card";

export const metadata: Metadata = { title: "Collections" };

export default async function CollectionsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; method?: string; status?: string }> }) {
  await requireRole("super_admin", "manager", "billing", "salesman");
  const sp = await searchParams;
  const today = todayIST();
  const from = sp.from || today.slice(0, 8) + "01";
  const to = sp.to || today;
  const supabase = await createClient();

  let q = supabase
    .from("payments")
    .select("id, receipt_no, retailer_id, payment_date, amount, method, reference_no, status, collected_by, retailers(shop_name, code)")
    .gte("payment_date", from)
    .lte("payment_date", to)
    .order("payment_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(500);
  if (sp.method) q = q.eq("method", sp.method);
  if (sp.status) q = q.eq("status", sp.status);
  const [{ data: rows }, { data: people }, { data: pendingCheques }] = await Promise.all([
    q,
    supabase.from("profiles").select("id, full_name"),
    supabase.from("payments").select("id, amount").eq("status", "cheque_pending"),
  ]);
  const uMap = new Map((people ?? []).map((u) => [u.id as string, u.full_name as string]));
  const live = (rows ?? []).filter((r) => r.status === "received" || r.status === "cheque_pending");
  const sum = (m?: string) => live.filter((r) => !m || r.method === m).reduce((t, r) => t + Number(r.amount), 0);

  return (
    <>
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Collected in period" value={inr(sum(), { decimals: false })} icon={Banknote} tone="green" hint={`${live.length} payments`} />
        <StatCard label="Cash" value={inr(sum("cash"), { decimals: false })} icon={Banknote} tone="teal" />
        <StatCard label="UPI + bank" value={inr(sum("upi") + sum("bank_transfer"), { decimals: false })} icon={Smartphone} tone="blue" />
        <StatCard
          label="Cheques not cleared"
          value={inr((pendingCheques ?? []).reduce((t, p) => t + Number(p.amount), 0), { decimals: false })}
          icon={Clock}
          tone="amber"
          hint={`${(pendingCheques ?? []).length} cheque(s) · all dates`}
          href="/payments?status=cheque_pending&from=2000-01-01"
        />
      </div>

      <form className="mb-4 grid gap-2 sm:grid-cols-5">
        <Input type="date" name="from" defaultValue={from} aria-label="From" />
        <Input type="date" name="to" defaultValue={to} aria-label="To" />
        <Select name="method" defaultValue={sp.method ?? ""} aria-label="Method">
          <option value="">All methods</option>
          {Object.entries(PAYMENT_METHOD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        <Select name="status" defaultValue={sp.status ?? ""} aria-label="Status">
          <option value="">Any status</option>
          {Object.entries(PAYMENT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </Select>
        <Button type="submit" variant="secondary">Filter</Button>
      </form>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
            <tr><th className="px-4 py-2.5">Receipt</th><th className="px-3 py-2.5">Retailer</th><th className="px-3 py-2.5">Mode</th><th className="hidden px-3 py-2.5 md:table-cell">Collected by</th><th className="px-3 py-2.5">Status</th><th className="px-4 py-2.5 text-right">Amount</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(rows ?? []).length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">No payments in this period. <Link href="/payments/new" className="font-medium text-accent-700 underline">Record a payment</Link></td></tr>}
            {(rows ?? []).map((p) => {
              const r = p.retailers as unknown as { shop_name: string; code: string } | null;
              const st = PAYMENT_STATUS[p.status];
              return (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5"><Link href={`/payments/${p.id}`} className="font-mono text-xs font-medium hover:underline">{p.receipt_no}</Link><div className="text-xs text-slate-500">{date(p.payment_date)}</div></td>
                  <td className="px-3 py-2.5">{r?.shop_name}<div className="font-mono text-xs text-slate-500">{r?.code}</div></td>
                  <td className="px-3 py-2.5">{p.method === "cheque" ? <CreditCard className="mr-1 inline size-3.5" /> : null}{PAYMENT_METHOD[p.method]}{p.reference_no && <div className="text-xs text-slate-500">{p.reference_no}</div>}</td>
                  <td className="hidden px-3 py-2.5 text-slate-600 md:table-cell">{p.collected_by ? uMap.get(p.collected_by) : "—"}</td>
                  <td className="px-3 py-2.5"><Badge tone={st.tone}>{st.label}</Badge></td>
                  <td className="tabular px-4 py-2.5 text-right font-semibold">{inr(p.amount)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </>
  );
}
