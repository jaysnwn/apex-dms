import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CheckCircle2, Circle, Wallet } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { date, dateTime, inr, qty } from "@/lib/format";
import { DUE_STATUS, PAYMENT_METHOD, PAYMENT_STATUS } from "@/lib/status";
import { GST_STATES } from "@/lib/states";
import { Alert, Badge, Card, cn } from "@/components/ui";
import { DocButtons } from "@/components/doc-buttons";
import { TermsButton } from "./terms-button";
import { InvoiceActions } from "./invoice-actions";

export const metadata: Metadata = { title: "Invoice" };

export default async function InvoicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ new?: string }> }) {
  const { profile } = await requireRole("super_admin", "manager", "billing", "salesman", "warehouse");
  const { id } = await params;
  const { new: isNew } = await searchParams;
  const supabase = await createClient();
  const { data: inv } = await supabase.from("invoices").select("*").eq("id", id).maybeSingle();
  if (!inv) notFound();

  const [{ data: lines }, { data: bal }, { data: dispatch }, { data: allocs }, { data: cns }, { data: order }] = await Promise.all([
    supabase.from("invoice_lines").select("id, line_no, product_name, sku, hsn_code, unit_code, qty, unit_price, price_mode, discount_pct, taxable_value, gst_rate, cgst, sgst, igst, line_total").eq("invoice_id", id).order("line_no"),
    supabase.from("invoice_balances").select("*").eq("invoice_id", id).maybeSingle(),
    supabase.from("dispatches").select("*").eq("invoice_id", id).maybeSingle(),
    supabase.from("payment_allocations").select("amount, payment_id, payments(receipt_no, payment_date, method, status)").eq("invoice_id", id),
    supabase.from("credit_notes").select("id, credit_note_no, note_date, reason, grand_total, status").eq("invoice_id", id).order("created_at"),
    supabase.from("orders").select("order_no, notes").eq("id", inv.order_id).maybeSingle(),
  ]);
  const { data: cnl } = (cns ?? []).length
    ? await supabase.from("credit_note_lines").select("invoice_line_id, qty").in("credit_note_id", (cns ?? []).map((c) => c.id))
    : { data: [] };
  const credited = new Map<string, number>();
  for (const c of cnl ?? []) credited.set(c.invoice_line_id, (credited.get(c.invoice_line_id) ?? 0) + Number(c.qty));

  const snap = inv.retailer_snapshot as Record<string, string | null>;
  const cancelled = inv.status === "cancelled";
  const ds = cancelled ? DUE_STATUS.cancelled : DUE_STATUS[bal?.due_status ?? "not_yet_due"];
  const isOffice = ["super_admin", "manager", "billing"].includes(profile.role);
  const dispatched = dispatch?.status === "dispatched" || dispatch?.status === "delivered";
  const hasPayments = (allocs ?? []).some((a) => ["received", "cheque_pending"].includes((a.payments as unknown as { status: string })?.status));
  const today = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
  const canCancel = !cancelled && !dispatched && !hasPayments && (cns ?? []).length === 0 &&
    (profile.role === "super_admin" || profile.role === "manager" || (profile.role === "billing" && inv.invoice_date === today));

  const steps = [
    { label: "Invoiced", done: true, when: dateTime(inv.created_at) },
    { label: "Dispatched", done: dispatched, when: dispatch?.dispatched_at ? dateTime(dispatch.dispatched_at) : undefined },
    { label: "Delivered", done: dispatch?.status === "delivered", when: dispatch?.delivered_at ? dateTime(dispatch.delivered_at) : undefined },
    { label: "Paid", done: !cancelled && Number(bal?.balance ?? 1) <= 0 },
  ];

  return (
    <div className="max-w-6xl space-y-6">
      {isNew && <Alert tone="green">Invoice {inv.invoice_no} created. It is now waiting for dispatch.</Alert>}
      {cancelled && <Alert>Cancelled on {dateTime(inv.cancelled_at)} — {inv.cancel_reason}</Alert>}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-mono text-xl font-semibold">{inv.invoice_no}</h2>
            <Badge tone={ds.tone}>{ds.label}{bal?.due_status === "overdue" ? ` · ${bal.days_past_due} days` : ""}</Badge>
          </div>
          <p className="text-sm text-slate-500">
            {date(inv.invoice_date)} · due {date(inv.due_date)} ({Number(inv.credit_days) === 0 ? "immediate" : `${inv.credit_days} days`}) · order {order?.order_no}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <DocButtons kind="invoice" id={id} />
          {isOffice && !cancelled && Number(bal?.balance ?? 0) > 0 && (
            <Link href={`/payments/new?retailer=${inv.retailer_id}&invoice=${id}`} className="inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700">
              <Wallet className="size-4" /> Record payment
            </Link>
          )}
          {(profile.role === "super_admin" || profile.role === "manager") && !cancelled && (
            <TermsButton invoiceId={id} invoiceDate={inv.invoice_date} creditDays={Number(inv.credit_days)} />
          )}
          {isOffice && !cancelled && (
            <InvoiceActions
              invoiceId={id}
              canCancel={canCancel}
              canCredit
              dispatched={dispatched}
              lines={(lines ?? []).map((l) => ({ id: l.id, product_name: l.product_name, sku: l.sku, qty: Number(l.qty), credited: credited.get(l.id) ?? 0 }))}
            />
          )}
        </div>
      </div>

      {!cancelled && (
        <Card className="p-4">
          <ol className="grid grid-cols-4 gap-2">
            {steps.map((s) => (
              <li key={s.label} className="flex flex-col items-center text-center">
                {s.done ? <CheckCircle2 className="size-6 text-emerald-600" /> : <Circle className="size-6 text-slate-300" />}
                <span className={cn("mt-1 text-sm font-medium", s.done ? "text-slate-900" : "text-slate-400")}>{s.label}</span>
                {s.when && <span className="text-[11px] text-slate-500">{s.when}</span>}
              </li>
            ))}
          </ol>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card className="grid gap-4 p-5 sm:grid-cols-2">
            <div>
              <div className="text-xs font-semibold text-slate-500 uppercase">Bill to</div>
              <Link href={`/retailers/${inv.retailer_id}`} className="font-semibold hover:underline">{snap.shop_name}</Link>
              <div className="text-sm text-slate-600">{snap.owner_name}</div>
              <div className="text-sm text-slate-600">{[snap.billing_address, snap.billing_city, snap.billing_pincode].filter(Boolean).join(", ")}</div>
              <div className="text-sm text-slate-600">{snap.mobile} · GSTIN {snap.gstin ?? "Unregistered"}</div>
            </div>
            <div className="text-sm">
              <div className="text-xs font-semibold text-slate-500 uppercase">Tax</div>
              <div>Place of supply: {inv.place_of_supply} {GST_STATES[inv.place_of_supply]}</div>
              <div>{inv.is_igst ? "IGST (inter-state)" : "CGST + SGST (within state)"}</div>
              {order?.notes && <div className="mt-2 rounded bg-amber-50 p-2 text-amber-900">{order.notes}</div>}
            </div>
          </Card>

          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
                <tr>
                  <th className="px-4 py-2.5">Product</th><th className="px-3 py-2.5">HSN</th><th className="px-3 py-2.5 text-right">Qty</th>
                  <th className="px-3 py-2.5 text-right">Taxable</th><th className="px-3 py-2.5 text-right">GST</th><th className="px-4 py-2.5 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(lines ?? []).map((l) => (
                  <tr key={l.id}>
                    <td className="px-4 py-2.5"><div className="font-medium">{l.product_name}</div><div className="text-xs text-slate-500"><span className="font-mono">{l.sku}</span> · {inr(l.unit_price)} {l.price_mode === "inclusive" ? "incl." : "+"} {Number(l.gst_rate)}%{Number(l.discount_pct) > 0 ? ` · ${Number(l.discount_pct)}% off` : ""}</div>{credited.get(l.id) ? <div className="text-xs text-violet-700">{qty(credited.get(l.id))} credited</div> : null}</td>
                    <td className="px-3 py-2.5 font-mono text-xs">{l.hsn_code ?? "—"}</td>
                    <td className="tabular px-3 py-2.5 text-right">{qty(l.qty)} {l.unit_code.toLowerCase()}</td>
                    <td className="tabular px-3 py-2.5 text-right">{inr(l.taxable_value)}</td>
                    <td className="tabular px-3 py-2.5 text-right">{inr(Number(l.cgst) + Number(l.sgst) + Number(l.igst))}</td>
                    <td className="tabular px-4 py-2.5 text-right font-medium">{inr(l.line_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="overflow-hidden">
            <div className={cn("px-5 py-4 text-white", cancelled ? "bg-slate-500" : Number(bal?.balance ?? 0) <= 0 ? "bg-emerald-600" : bal?.due_status === "overdue" ? "bg-red-600" : "bg-ink-900")}>
              <div className="text-sm opacity-80">{cancelled ? "Cancelled" : Number(bal?.balance ?? 0) <= 0 ? "Fully paid" : "Balance due"}</div>
              <div className="tabular text-3xl font-semibold">{inr(cancelled ? 0 : Math.max(0, Number(bal?.balance ?? 0)))}</div>
              <div className="text-xs opacity-80">of {inr(inv.grand_total)}</div>
            </div>
            <dl className="tabular space-y-1.5 p-5 text-sm">
              <R k="Taxable value" v={inr(inv.taxable_total)} />
              {inv.is_igst ? <R k="IGST" v={inr(inv.igst_total)} /> : (<><R k="CGST" v={inr(inv.cgst_total)} /><R k="SGST" v={inr(inv.sgst_total)} /></>)}
              {Number(inv.round_off) !== 0 && <R k="Round off" v={inr(inv.round_off)} />}
              <R k="Invoice total" v={inr(inv.grand_total)} strong />
              {Number(bal?.credited ?? 0) > 0 && <R k="Credit notes" v={`− ${inr(bal?.credited)}`} />}
              {Number(bal?.paid ?? 0) > 0 && <R k="Paid" v={`− ${inr(bal?.paid)}`} />}
              {Number(bal?.cheque_pending ?? 0) > 0 && <R k="Cheques not cleared" v={inr(bal?.cheque_pending)} />}
            </dl>
          </Card>

          <Card className="p-5">
            <h3 className="mb-2 font-semibold">Payments</h3>
            {(allocs ?? []).length === 0 ? <p className="text-sm text-slate-500">None yet.</p> : (
              <ul className="space-y-2 text-sm">
                {(allocs ?? []).map((a) => {
                  const p = a.payments as unknown as { receipt_no: string; payment_date: string; method: string; status: string };
                  const st = PAYMENT_STATUS[p.status];
                  return (
                    <li key={a.payment_id} className="flex items-center justify-between gap-2">
                      <Link href={`/payments/${a.payment_id}`} className="min-w-0 hover:underline">
                        <span className="font-mono text-xs">{p.receipt_no}</span>
                        <span className="block text-xs text-slate-500">{date(p.payment_date)} · {PAYMENT_METHOD[p.method]}</span>
                      </Link>
                      <span className="text-right"><span className="tabular font-medium">{inr(a.amount)}</span><br /><Badge tone={st.tone}>{st.label}</Badge></span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {(cns ?? []).length > 0 && (
            <Card className="p-5">
              <h3 className="mb-2 font-semibold">Credit notes</h3>
              <ul className="space-y-3 text-sm">
                {(cns ?? []).map((c) => (
                  <li key={c.id}>
                    <div className="flex justify-between"><span className="font-mono text-xs">{c.credit_note_no}</span><span className="tabular font-medium text-violet-700">− {inr(c.grand_total)}</span></div>
                    <div className="text-xs text-slate-500">{date(c.note_date)} · {c.reason}</div>
                    <div className="mt-1"><DocButtons kind="credit-note" id={c.id} size="sm" /></div>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {dispatch && (
            <Card className="p-5 text-sm">
              <h3 className="mb-2 font-semibold">Dispatch</h3>
              <div>{dispatch.dispatch_no}{dispatch.vehicle_no ? ` · ${dispatch.vehicle_no}` : ""}</div>
              {dispatch.delivery_remarks && <div className="text-slate-500">{dispatch.delivery_remarks}</div>}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function R({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className={cn("flex justify-between", strong && "border-t border-slate-100 pt-1.5 font-semibold")}>
      <dt className={strong ? "" : "text-slate-500"}>{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}
