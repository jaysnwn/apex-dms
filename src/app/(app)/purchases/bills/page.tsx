import Link from "next/link";
import type { Metadata } from "next";
import { AlertTriangle, IndianRupee, PackageCheck } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { date, inr } from "@/lib/format";
import { todayIST } from "@/lib/gst";
import { DUE_STATUS, PURCHASE_STATUS } from "@/lib/status";
import { Badge, Button, Card, Input, Select } from "@/components/ui";
import { StatCard } from "@/components/stat-card";
import { billStatus } from "../data";
import { allRows } from "@/lib/all-rows";

export const metadata: Metadata = { title: "Supplier bills" };

export default async function BillsPage({ searchParams }: { searchParams: Promise<{ supplier?: string; from?: string; to?: string; show?: string; q?: string }> }) {
  await requireRole("super_admin", "manager", "billing");
  const sp = await searchParams;
  const today = todayIST();
  const year = Number(today.slice(0, 4));
  const fyStart = `${today.slice(5, 7) >= "04" ? year : year - 1}-04-01`; // financial year starts 1 April
  const from = sp.from || fyStart;
  const to = sp.to || today;
  const supabase = await createClient();
  let q = supabase
    .from("purchases")
    .select("id, purchase_no, status, supplier_id, supplier_bill_no, supplier_bill_date, due_date, grand_total, taxable_total, suppliers(name)")
    .in("status", sp.show === "cancelled" ? ["cancelled"] : ["received"])
    .order("supplier_bill_date", { ascending: false })
    .limit(500);
  if (sp.show !== "cancelled") q = q.gte("supplier_bill_date", from).lte("supplier_bill_date", to);
  if (sp.supplier) q = q.eq("supplier_id", sp.supplier);
  if (sp.q) q = q.ilike("supplier_bill_no", `%${sp.q.replace(/[%,()]/g, "")}%`);
  const [{ data: rows }, { data: bal }, { data: suppliers }] = await Promise.all([
    q,
    allRows(() => supabase.from("purchase_balances").select("purchase_id, balance, days_overdue, due_date").order("purchase_id")),
    supabase.from("suppliers").select("id, name").order("name"),
  ]);
  const bMap = new Map((bal ?? []).map((b) => [b.purchase_id as string, b]));
  const open = (bal ?? []).filter((b) => Number(b.balance) > 0);
  const totalOpen = open.reduce((t, b) => t + Number(b.balance), 0);
  const overdue = open.filter((b) => b.due_date < today).reduce((t, b) => t + Number(b.balance), 0);
  const purchased = (rows ?? []).filter((r) => r.status === "received").reduce((t, r) => t + Number(r.grand_total), 0);

  return (
    <>
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Purchased in period" value={inr(purchased, { decimals: false })} icon={PackageCheck} tone="violet" hint={`${(rows ?? []).length} bills`} />
        <StatCard label="Payable to suppliers" value={inr(totalOpen, { decimals: false })} icon={IndianRupee} tone="orange" href="/purchases/payables" />
        <StatCard label="Overdue to suppliers" value={inr(overdue, { decimals: false })} icon={AlertTriangle} tone="red" alert={overdue > 0} href="/purchases/payables" />
      </div>

      <form className="mb-4 grid gap-2 sm:grid-cols-6">
        <Select name="supplier" defaultValue={sp.supplier ?? ""} aria-label="Supplier">
          <option value="">All suppliers</option>
          {(suppliers ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
        <Input type="date" name="from" defaultValue={from} aria-label="From" />
        <Input type="date" name="to" defaultValue={to} aria-label="To" />
        <Input name="q" defaultValue={sp.q ?? ""} placeholder="Bill number" />
        <Select name="show" defaultValue={sp.show ?? ""} aria-label="Show">
          <option value="">Received bills</option>
          <option value="cancelled">Cancelled</option>
        </Select>
        <Button type="submit" variant="secondary">Filter</Button>
      </form>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
            <tr><th className="px-4 py-2.5">Supplier bill</th><th className="px-3 py-2.5">Supplier</th><th className="px-3 py-2.5">Due</th><th className="px-3 py-2.5">Status</th><th className="px-3 py-2.5 text-right">Bill total</th><th className="px-4 py-2.5 text-right">Balance</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(rows ?? []).length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">No bills in this period.</td></tr>}
            {(rows ?? []).map((r) => {
              const b = bMap.get(r.id);
              const balance = Number(b?.balance ?? 0);
              const ds = r.status === "cancelled" ? "cancelled" : billStatus(balance, r.due_date, today);
              const st = r.status === "cancelled" ? PURCHASE_STATUS.cancelled : DUE_STATUS[ds];
              return (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5"><Link href={`/purchases/${r.id}`} className="font-medium hover:underline">{r.supplier_bill_no ?? "—"}</Link><div className="font-mono text-xs text-slate-500">{r.purchase_no} · {date(r.supplier_bill_date)}</div></td>
                  <td className="px-3 py-2.5">{(r.suppliers as unknown as { name: string }).name}</td>
                  <td className="px-3 py-2.5 text-slate-600">{date(r.due_date)}</td>
                  <td className="px-3 py-2.5"><Badge tone={st.tone}>{st.label}{ds === "overdue" ? ` ${b?.days_overdue}d` : ""}</Badge></td>
                  <td className="tabular px-3 py-2.5 text-right">{inr(r.grand_total)}</td>
                  <td className="tabular px-4 py-2.5 text-right font-semibold">{balance > 0 ? inr(balance) : <span className="text-emerald-700">Paid</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </>
  );
}
