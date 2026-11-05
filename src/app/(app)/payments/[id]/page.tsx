import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { date, dateTime, inr } from "@/lib/format";
import { PAYMENT_METHOD, PAYMENT_STATUS } from "@/lib/status";
import { Alert, Badge, Card, cn } from "@/components/ui";
import { DocButtons } from "@/components/doc-buttons";
import { PaymentStatusActions } from "./payment-status";

export const metadata: Metadata = { title: "Payment" };

export default async function PaymentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ new?: string }> }) {
  const { profile } = await requireRole("super_admin", "manager", "billing", "salesman");
  const { id } = await params;
  const { new: isNew } = await searchParams;
  const supabase = await createClient();
  const { data: p } = await supabase.from("payments").select("*").eq("id", id).maybeSingle();
  if (!p) notFound();
  const [{ data: r }, { data: allocs }, { data: who }] = await Promise.all([
    supabase.from("retailers").select("id, shop_name, code, mobile").eq("id", p.retailer_id).single(),
    supabase.from("payment_allocations").select("invoice_id, amount, is_auto, invoices(invoice_no, invoice_date, due_date)").eq("payment_id", id),
    p.collected_by ? supabase.from("profiles").select("full_name").eq("id", p.collected_by).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const allocated = (allocs ?? []).reduce((t, a) => t + Number(a.amount), 0);
  const st = PAYMENT_STATUS[p.status];
  const isOffice = ["super_admin", "manager", "billing"].includes(profile.role);

  return (
    <div className="max-w-4xl space-y-6">
      {isNew && <Alert tone="green">Payment saved. Share the receipt with the retailer.</Alert>}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2"><h2 className="font-mono text-xl font-semibold">{p.receipt_no}</h2><Badge tone={st.tone}>{st.label}</Badge></div>
          <p className="text-sm text-slate-500">{date(p.payment_date)} · {PAYMENT_METHOD[p.method]}{p.reference_no ? ` · ${p.reference_no}` : ""} · entered {dateTime(p.created_at)}{who?.full_name ? ` by ${who.full_name}` : ""}</p>
        </div>
        <DocButtons kind="receipt" id={id} label="Receipt" />
      </div>

      <div className="grid gap-6 md:grid-cols-[1fr_280px]">
        <Card className="overflow-hidden">
          <div className="border-b border-slate-100 p-5">
            <div className="text-sm text-slate-500">Received from</div>
            <Link href={`/retailers/${r?.id}`} className="text-lg font-semibold hover:underline">{r?.shop_name}</Link>
            <div className="text-sm text-slate-500">{r?.code} · {r?.mobile}</div>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500"><tr><th className="px-5 py-2">Applied to invoice</th><th className="px-3 py-2">Due</th><th className="px-5 py-2 text-right">Amount</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {(allocs ?? []).length === 0 && <tr><td colSpan={3} className="px-5 py-6 text-center text-slate-500">{p.status === "bounced" || p.status === "cancelled" ? "Released — invoices are due again." : "Not applied yet (advance)."}</td></tr>}
              {(allocs ?? []).map((a) => {
                const inv = a.invoices as unknown as { invoice_no: string; invoice_date: string; due_date: string };
                return (
                  <tr key={a.invoice_id}>
                    <td className="px-5 py-2.5"><Link href={`/sales/invoices/${a.invoice_id}`} className="font-mono text-xs hover:underline">{inv?.invoice_no}</Link> {a.is_auto ? <span className="text-xs text-slate-400">auto</span> : <span className="text-xs text-violet-600">manual</span>}</td>
                    <td className="px-3 py-2.5 text-slate-500">{date(inv?.due_date)}</td>
                    <td className="tabular px-5 py-2.5 text-right font-medium">{inr(a.amount)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
        <div className="space-y-4">
          <Card className={cn("p-5", p.status === "received" ? "bg-emerald-50" : p.status === "cheque_pending" ? "bg-amber-50" : "bg-red-50")}>
            <div className="text-sm text-slate-600">Amount</div>
            <div className="tabular text-3xl font-semibold">{inr(p.amount)}</div>
            <div className="mt-2 text-sm text-slate-600">Applied {inr(allocated)}{Number(p.amount) - allocated > 0.009 && p.status !== "bounced" && p.status !== "cancelled" ? ` · advance ${inr(Number(p.amount) - allocated)}` : ""}</div>
            {p.bank_name && <div className="text-sm text-slate-600">Bank: {p.bank_name}{p.cheque_date ? ` · dated ${date(p.cheque_date)}` : ""}</div>}
          </Card>
          {p.notes && <Card className="p-4 text-sm text-slate-600">{p.notes}</Card>}
          {isOffice && <PaymentStatusActions id={id} status={p.status} canCancel={profile.role === "super_admin" || profile.role === "manager"} />}
        </div>
      </div>
    </div>
  );
}
