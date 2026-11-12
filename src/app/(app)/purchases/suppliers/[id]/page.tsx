import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { AlertTriangle, IndianRupee, PackagePlus, Pencil, ShoppingBag, Wallet } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { date, inr } from "@/lib/format";
import { todayIST } from "@/lib/gst";
import { DUE_STATUS } from "@/lib/status";
import { GST_STATES } from "@/lib/states";
import { Badge, Card, cn } from "@/components/ui";
import { LinkButton } from "@/components/chip";
import { StatCard } from "@/components/stat-card";
import { billStatus } from "../../data";

export const metadata: Metadata = { title: "Supplier" };

export default async function SupplierPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("super_admin", "manager", "billing");
  const { id } = await params;
  const supabase = await createClient();
  const { data: s } = await supabase.from("suppliers").select("*").eq("id", id).maybeSingle();
  if (!s) notFound();
  const today = todayIST();
  const year = Number(today.slice(0, 4));
  const fyStart = `${today.slice(5, 7) >= "04" ? year : year - 1}-04-01`;
  const [{ data: ledger }, { data: open }, { data: fy }, { count: ordered }] = await Promise.all([
    supabase.from("supplier_ledger").select("*").eq("supplier_id", id).order("entry_date").order("created_at").limit(2000),
    supabase.from("purchase_balances").select("*").eq("supplier_id", id).gt("balance", 0).order("due_date"),
    supabase.from("purchases").select("grand_total").eq("supplier_id", id).eq("status", "received").gte("supplier_bill_date", fyStart),
    supabase.from("purchases").select("id", { count: "exact", head: true }).eq("supplier_id", id).eq("status", "ordered"),
  ]);
  const payable = (open ?? []).reduce((t, b) => t + Number(b.balance), 0);
  // No due date means no agreed credit terms, so nothing is overdue yet.
  const overdue = (open ?? []).filter((b) => b.due_date !== null && b.due_date < today).reduce((t, b) => t + Number(b.balance), 0);
  const purchasedFy = (fy ?? []).reduce((t, p) => t + Number(p.grand_total), 0);
  let running = 0;
  const rows = (ledger ?? []).map((e) => {
    running += Number(e.credit) - Number(e.debit);
    return { ...e, running };
  });

  return (
    <>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2"><h2 className="text-lg font-semibold">{s.name}</h2><span className="font-mono text-xs text-slate-500">{s.code}</span>{!s.is_active && <Badge>Inactive</Badge>}</div>
          <p className="text-sm text-slate-600">
            {s.gstin ? <>GSTIN <span className="font-mono">{s.gstin}</span></> : <span className="text-amber-700">GSTIN missing — add it so GST is split correctly</span>}
            {s.state_code ? ` · ${GST_STATES[s.state_code] ?? s.state_code}` : ""} · {s.credit_days} days credit
          </p>
          <p className="text-sm text-slate-500">{[s.contact_name, s.mobile, s.email, [s.address, s.city, s.pincode].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}</p>
          {s.bank_details && <p className="mt-1 text-xs whitespace-pre-line text-slate-500">Bank: {s.bank_details}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <LinkButton href={`/purchases/new?supplier=${s.id}`} className="bg-fuchsia-700 text-white hover:bg-fuchsia-800"><PackagePlus className="size-4" /> New purchase</LinkButton>
          <LinkButton href={`/purchases/payments/new?supplier=${s.id}`} className="bg-emerald-600 text-white hover:bg-emerald-700"><Wallet className="size-4" /> Pay</LinkButton>
          <LinkButton href={`/purchases/suppliers/${s.id}/edit`}><Pencil className="size-4" /> Edit</LinkButton>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Payable" value={inr(payable, { decimals: false })} icon={IndianRupee} tone="orange" />
        <StatCard label="Overdue" value={inr(overdue, { decimals: false })} icon={AlertTriangle} tone="red" alert={overdue > 0} />
        <StatCard label="Purchased this year" value={inr(purchasedFy, { decimals: false })} icon={ShoppingBag} tone="violet" hint="since 1 April" />
        <StatCard label="Orders not received" value={String(ordered ?? 0)} icon={PackagePlus} tone={(ordered ?? 0) > 0 ? "amber" : "slate"} href="/purchases/orders" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
        <Card className="p-5">
          <h3 className="mb-2 font-semibold">Unpaid bills</h3>
          {(open ?? []).length === 0 ? <p className="text-sm text-slate-500">Nothing unpaid.</p> : (
            <ul className="divide-y divide-slate-100">
              {(open ?? []).map((b) => {
                const ds = billStatus(Number(b.balance), b.due_date, today);
                const st = DUE_STATUS[ds];
                return (
                  <li key={b.purchase_id} className="flex items-start justify-between gap-2 py-2.5">
                    <div>
                      <Link href={`/purchases/${b.purchase_id}`} className="text-sm font-medium hover:underline">{b.supplier_bill_no}</Link>
                      <div className="text-xs text-slate-500">{date(b.supplier_bill_date)} · due {date(b.due_date)}</div>
                      <Badge tone={st.tone}>{st.label}{ds === "overdue" ? ` ${b.days_overdue}d` : ""}</Badge>
                    </div>
                    <div className="tabular text-right text-sm font-semibold">{inr(b.balance)}</div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card className="overflow-x-auto">
          <div className="border-b border-slate-100 px-4 py-3 font-semibold">Statement</div>
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
              <tr><th className="px-4 py-2.5">Date</th><th className="px-3 py-2.5">Document</th><th className="px-3 py-2.5">Details</th><th className="px-3 py-2.5 text-right">Bill</th><th className="px-3 py-2.5 text-right">Paid</th><th className="px-4 py-2.5 text-right">We owe</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">No bills or payments yet.</td></tr>}
              {rows.map((e) => (
                <tr key={`${e.kind}-${e.doc_id}`}>
                  <td className="px-4 py-2 whitespace-nowrap text-slate-600">{date(e.entry_date)}</td>
                  <td className="px-3 py-2"><Link href={e.kind === "bill" ? `/purchases/${e.doc_id}` : `/purchases/payments/${e.doc_id}`} className="font-mono text-xs font-medium hover:underline">{e.doc_no}</Link></td>
                  <td className="px-3 py-2 text-slate-600">{e.narration}</td>
                  <td className="tabular px-3 py-2 text-right">{Number(e.credit) ? inr(e.credit) : ""}</td>
                  <td className="tabular px-3 py-2 text-right text-emerald-700">{Number(e.debit) ? inr(e.debit) : ""}</td>
                  <td className={cn("tabular px-4 py-2 text-right font-semibold", e.running < 0 && "text-sky-700")}>{e.running < 0 ? `${inr(-e.running)} adv.` : inr(e.running)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </>
  );
}
