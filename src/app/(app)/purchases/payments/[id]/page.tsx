import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { date, dateTime, inr } from "@/lib/format";
import { PAYMENT_METHOD, SUPPLIER_PAYMENT_STATUS } from "@/lib/status";
import { Alert, Badge, Card } from "@/components/ui";
import { CancelSupplierPaymentButton } from "./cancel-button";

export const metadata: Metadata = { title: "Supplier payment" };

export default async function SupplierPaymentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ new?: string }> }) {
  const { profile } = await requireRole("super_admin", "manager", "billing");
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: p } = await supabase.from("supplier_payments").select("*, suppliers(id, name)").eq("id", id).maybeSingle();
  if (!p) notFound();
  const [{ data: allocs }, { data: by }] = await Promise.all([
    supabase.from("supplier_payment_allocations").select("amount, is_auto, purchases(id, purchase_no, supplier_bill_no, supplier_bill_date)").eq("payment_id", id),
    p.created_by ? supabase.from("tenant_people").select("full_name").eq("id", p.created_by).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const s = p.suppliers as unknown as { id: string; name: string };
  const st = SUPPLIER_PAYMENT_STATUS[p.status];
  const applied = (allocs ?? []).reduce((t, a) => t + Number(a.amount), 0);
  const isMgr = profile.role === "super_admin" || profile.role === "manager";

  return (
    <>
      {sp.new && <div className="mb-4"><Alert tone="green">Payment of {inr(p.amount)} to {s.name} saved.</Alert></div>}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2"><h2 className="font-mono text-lg font-semibold">{p.payment_no}</h2><Badge tone={st.tone}>{st.label}</Badge></div>
          <p className="mt-1 text-sm text-slate-600">To <Link href={`/purchases/suppliers/${s.id}`} className="font-semibold text-slate-900 hover:underline">{s.name}</Link> · {date(p.payment_date)} · {PAYMENT_METHOD[p.method]}{p.reference_no ? ` · ${p.reference_no}` : ""}</p>
          <p className="text-xs text-slate-500">Recorded {dateTime(p.created_at)}{by?.full_name ? ` by ${by.full_name}` : ""}</p>
          {p.notes && <p className="mt-1 text-sm text-slate-600">{p.notes}</p>}
          {p.status === "cancelled" && <p className="mt-1 text-sm text-red-700">Cancelled: {p.cancel_reason}</p>}
        </div>
        {isMgr && p.status === "paid" && <CancelSupplierPaymentButton id={p.id} />}
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
              <tr><th className="px-4 py-2.5">Bill</th><th className="px-3 py-2.5">Bill date</th><th className="px-3 py-2.5">How</th><th className="px-4 py-2.5 text-right">Applied</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(allocs ?? []).length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-500">{p.status === "paid" ? "Not applied to any bill yet — kept as advance." : "Cancelled payments are not applied."}</td></tr>}
              {(allocs ?? []).map((a, i) => {
                const b = a.purchases as unknown as { id: string; purchase_no: string; supplier_bill_no: string; supplier_bill_date: string };
                return (
                  <tr key={i}>
                    <td className="px-4 py-2.5"><Link href={`/purchases/${b.id}`} className="font-medium hover:underline">{b.supplier_bill_no}</Link><div className="font-mono text-xs text-slate-500">{b.purchase_no}</div></td>
                    <td className="px-3 py-2.5 text-slate-600">{date(b.supplier_bill_date)}</td>
                    <td className="px-3 py-2.5 text-slate-600">{a.is_auto ? "Oldest first" : "Chosen"}</td>
                    <td className="tabular px-4 py-2.5 text-right font-semibold">{inr(a.amount)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
        <Card className="p-5">
          <dl className="tabular space-y-1.5 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">Amount</dt><dd className="font-semibold">{inr(p.amount)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Applied to bills</dt><dd>{inr(applied)}</dd></div>
            {p.status === "paid" && Number(p.amount) - applied > 0.004 && <div className="flex justify-between text-sky-800"><dt>Advance</dt><dd className="font-semibold">{inr(Number(p.amount) - applied)}</dd></div>}
          </dl>
        </Card>
      </div>
    </>
  );
}
