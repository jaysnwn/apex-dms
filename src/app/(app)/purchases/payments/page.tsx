import Link from "next/link";
import type { Metadata } from "next";
import { Building2, Plus, Wallet } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { date, inr } from "@/lib/format";
import { todayIST } from "@/lib/gst";
import { PAYMENT_METHOD, SUPPLIER_PAYMENT_STATUS } from "@/lib/status";
import { Badge, Button, Card, Input, Select } from "@/components/ui";
import { LinkButton } from "@/components/chip";
import { StatCard } from "@/components/stat-card";

export const metadata: Metadata = { title: "Supplier payments" };

export default async function SupplierPaymentsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; supplier?: string }> }) {
  await requireRole("super_admin", "manager", "billing");
  const sp = await searchParams;
  const today = todayIST();
  const from = sp.from || today.slice(0, 8) + "01";
  const to = sp.to || today;
  const supabase = await createClient();
  let q = supabase
    .from("supplier_payments")
    .select("id, payment_no, payment_date, amount, method, reference_no, status, suppliers(name), supplier_payment_allocations(amount)")
    .gte("payment_date", from).lte("payment_date", to)
    .order("payment_date", { ascending: false }).order("created_at", { ascending: false })
    .limit(500);
  if (sp.supplier) q = q.eq("supplier_id", sp.supplier);
  const [{ data: rows }, { data: suppliers }] = await Promise.all([q, supabase.from("suppliers").select("id, name").order("name")]);
  const live = (rows ?? []).filter((r) => r.status === "paid");
  const total = live.reduce((t, r) => t + Number(r.amount), 0);
  const advance = live.reduce((t, r) => t + Number(r.amount) - ((r.supplier_payment_allocations as unknown as { amount: number }[]) ?? []).reduce((s, a) => s + Number(a.amount), 0), 0);

  return (
    <>
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Paid in period" value={inr(total, { decimals: false })} icon={Wallet} tone="green" hint={`${live.length} payments`} />
        <StatCard label="Advances not yet used" value={inr(advance, { decimals: false })} icon={Building2} tone="blue" hint="applied to the next bill automatically" />
        <div className="flex items-center justify-end">
          <LinkButton href="/purchases/payments/new" className="h-11 bg-emerald-600 px-5 text-white hover:bg-emerald-700"><Plus className="size-4" /> Pay a supplier</LinkButton>
        </div>
      </div>
      <form className="mb-4 grid gap-2 sm:grid-cols-4">
        <Select name="supplier" defaultValue={sp.supplier ?? ""} aria-label="Supplier">
          <option value="">All suppliers</option>
          {(suppliers ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
        <Input type="date" name="from" defaultValue={from} aria-label="From" />
        <Input type="date" name="to" defaultValue={to} aria-label="To" />
        <Button type="submit" variant="secondary">Filter</Button>
      </form>
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
            <tr><th className="px-4 py-2.5">Payment</th><th className="px-3 py-2.5">Supplier</th><th className="px-3 py-2.5">Mode</th><th className="px-3 py-2.5">Status</th><th className="px-4 py-2.5 text-right">Amount</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(rows ?? []).length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-500">No supplier payments in this period.</td></tr>}
            {(rows ?? []).map((p) => {
              const st = SUPPLIER_PAYMENT_STATUS[p.status];
              return (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5"><Link href={`/purchases/payments/${p.id}`} className="font-mono text-xs font-medium hover:underline">{p.payment_no}</Link><div className="text-xs text-slate-500">{date(p.payment_date)}</div></td>
                  <td className="px-3 py-2.5 font-medium">{(p.suppliers as unknown as { name: string }).name}</td>
                  <td className="px-3 py-2.5">{PAYMENT_METHOD[p.method]}{p.reference_no && <div className="text-xs text-slate-500">{p.reference_no}</div>}</td>
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
