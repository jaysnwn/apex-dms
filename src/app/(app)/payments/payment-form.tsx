"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Banknote, Building2, CreditCard, Smartphone } from "lucide-react";
import { Alert, Badge, Button, Card, Input, Label, Textarea, cn } from "@/components/ui";
import { RetailerSelect } from "../sales/order-builder";
import type { PickerRetailer } from "../sales/actions";
import { date, inr } from "@/lib/format";
import { DUE_STATUS } from "@/lib/status";
import { todayIST } from "@/lib/gst";
import { openInvoices, recordPayment, type OpenInvoice } from "./actions";

const METHODS = [
  { key: "cash", label: "Cash", icon: Banknote },
  { key: "upi", label: "UPI", icon: Smartphone },
  { key: "bank_transfer", label: "Bank transfer", icon: Building2 },
  { key: "cheque", label: "Cheque", icon: CreditCard },
] as const;

export function PaymentForm({
  initialRetailer,
  focusInvoice,
  visitId,
  onDone,
  compact,
}: {
  initialRetailer?: PickerRetailer | null;
  focusInvoice?: string;
  visitId?: string;
  onDone?: (paymentId: string) => void;
  compact?: boolean;
}) {
  const router = useRouter();
  const [retailer, setRetailer] = useState<PickerRetailer | null>(initialRetailer ?? null);
  const [invoices, setInvoices] = useState<OpenInvoice[] | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<(typeof METHODS)[number]["key"]>("cash");
  const [reference, setReference] = useState("");
  const [chequeDate, setChequeDate] = useState("");
  const [bank, setBank] = useState("");
  const [payDate, setPayDate] = useState(todayIST());
  const [notes, setNotes] = useState("");
  const [mode, setMode] = useState<"fifo" | "manual">(focusInvoice ? "manual" : "fifo");
  const [manual, setManual] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const clientUuid = useRef(typeof crypto !== "undefined" ? crypto.randomUUID() : undefined);

  useEffect(() => {
    setInvoices(null);
    if (!retailer) return;
    openInvoices(retailer.id).then((list) => {
      setInvoices(list);
      if (focusInvoice) {
        const f = list.find((i) => i.invoice_id === focusInvoice);
        if (f) {
          setManual({ [f.invoice_id]: String(f.open) });
          setAmount((a) => a || String(f.open));
        }
      }
    });
  }, [retailer, focusInvoice]);

  const amt = Number(amount) || 0;
  const totalOpen = (invoices ?? []).reduce((t, i) => t + i.open, 0);

  // Preview of how FIFO will spread the money.
  const fifoPreview = useMemo(() => {
    let left = amt;
    const out = new Map<string, number>();
    for (const i of invoices ?? []) {
      if (left <= 0) break;
      const take = Math.min(i.open, left);
      if (take > 0) out.set(i.invoice_id, Math.round(take * 100) / 100);
      left -= take;
    }
    return { out, left: Math.max(0, Math.round(left * 100) / 100) };
  }, [amt, invoices]);

  const manualSum = Object.values(manual).reduce((t, v) => t + (Number(v) || 0), 0);
  const allocPreview = mode === "fifo" ? fifoPreview.out : new Map(Object.entries(manual).map(([k, v]) => [k, Number(v) || 0]));
  const unallocated = mode === "fifo" ? fifoPreview.left : Math.max(0, amt - manualSum);

  function submit() {
    setError(null);
    if (!retailer) return setError("Choose a retailer.");
    if (!(amt > 0)) return setError("Enter the amount received.");
    if (method !== "cash" && !reference.trim()) return setError(`Enter the ${method === "cheque" ? "cheque" : method === "upi" ? "UPI" : "transaction"} reference number.`);
    if (mode === "manual" && manualSum > amt + 0.001) return setError("Allocations add up to more than the amount received.");
    start(async () => {
      const res = await recordPayment({
        retailerId: retailer.id,
        amount: amt,
        method,
        date: payDate,
        reference,
        chequeDate,
        bank,
        notes,
        allocations: mode === "manual" ? Object.entries(manual).map(([invoice_id, v]) => ({ invoice_id, amount: Number(v) || 0 })).filter((a) => a.amount > 0) : null,
        visitId: visitId ?? null,
        clientUuid: clientUuid.current,
      });
      if (res.error) setError(res.error);
      else if (res.id) {
        if (onDone) onDone(res.id);
        else router.push(`/payments/${res.id}?new=1`);
      }
    });
  }

  return (
    <div className={cn("grid gap-6", !compact && "xl:grid-cols-[1fr_380px]")}>
      <div className="space-y-6">
        {!initialRetailer && (
          <Card className="p-5">
            <h2 className="mb-3 font-semibold">Retailer</h2>
            <RetailerSelect value={retailer} onChange={setRetailer} />
          </Card>
        )}

        <Card className="p-5">
          <h2 className="mb-3 font-semibold">Payment</h2>
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {METHODS.map((m) => (
              <button key={m.key} type="button" onClick={() => setMethod(m.key)}
                className={cn("flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium", method === m.key ? "border-emerald-600 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-600/20" : "border-slate-300 bg-white hover:border-slate-400")}>
                <m.icon className="size-4" /> {m.label}
              </button>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="amount">Amount received (₹)</Label>
              <Input id="amount" type="number" min={0} step="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="tabular text-lg font-semibold" />
              {retailer && invoices && totalOpen > 0 && (
                <button type="button" className="mt-1 text-xs text-accent-700 hover:underline" onClick={() => setAmount(String(Math.round(totalOpen * 100) / 100))}>
                  Full outstanding: {inr(totalOpen)}
                </button>
              )}
            </div>
            <div>
              <Label htmlFor="pdate">Payment date</Label>
              <Input id="pdate" type="date" value={payDate} max={todayIST()} onChange={(e) => setPayDate(e.target.value)} />
            </div>
            {method !== "cash" && (
              <div>
                <Label htmlFor="ref">{method === "cheque" ? "Cheque number" : method === "upi" ? "UPI reference" : "UTR / reference"}</Label>
                <Input id="ref" value={reference} onChange={(e) => setReference(e.target.value)} />
              </div>
            )}
            {method === "cheque" && (
              <>
                <div><Label htmlFor="cdate">Cheque date</Label><Input id="cdate" type="date" value={chequeDate} onChange={(e) => setChequeDate(e.target.value)} /></div>
                <div><Label htmlFor="bank">Bank</Label><Input id="bank" value={bank} onChange={(e) => setBank(e.target.value)} /></div>
              </>
            )}
            <div className="sm:col-span-2">
              <Label htmlFor="pnotes" hint="optional">Notes</Label>
              <Textarea id="pnotes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
          {method === "cheque" && <p className="mt-3 text-sm text-amber-800">Cheques are applied to invoices now but counted as paid only after you mark them cleared.</p>}
        </Card>
      </div>

      <div className="space-y-6">
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Apply to invoices</h2>
            <div className="flex rounded-lg border p-0.5 text-xs">
              <button type="button" onClick={() => setMode("fifo")} className={cn("rounded-md px-2 py-1", mode === "fifo" && "bg-ink-900 text-white")}>Oldest first</button>
              <button type="button" onClick={() => setMode("manual")} className={cn("rounded-md px-2 py-1", mode === "manual" && "bg-ink-900 text-white")}>Choose</button>
            </div>
          </div>
          {!retailer ? (
            <p className="text-sm text-slate-500">Choose a retailer to see unpaid invoices.</p>
          ) : invoices === null ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : invoices.length === 0 ? (
            <p className="text-sm text-slate-500">No unpaid invoices. The amount will be kept as an advance and used for the next invoice automatically.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {invoices.map((i) => {
                const st = DUE_STATUS[i.due_status] ?? DUE_STATUS.not_yet_due;
                const applied = allocPreview.get(i.invoice_id) ?? 0;
                return (
                  <li key={i.invoice_id} className="py-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-mono text-xs font-medium">{i.invoice_no}</div>
                        <div className="text-xs text-slate-500">due {date(i.due_date)}</div>
                        <Badge tone={st.tone}>{st.label}{i.due_status === "overdue" ? ` ${i.days_past_due}d` : ""}</Badge>
                      </div>
                      <div className="text-right">
                        <div className="tabular text-sm font-semibold">{inr(i.open)}</div>
                        {mode === "manual" ? (
                          <Input type="number" min={0} max={i.open} step="0.01" value={manual[i.invoice_id] ?? ""} placeholder="0"
                            onChange={(e) => setManual((m) => ({ ...m, [i.invoice_id]: e.target.value }))} className="tabular mt-1 h-8 w-28 text-right" />
                        ) : applied > 0 ? (
                          <div className="tabular text-xs font-medium text-emerald-700">− {inr(applied)}</div>
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {amt > 0 && unallocated > 0 && <p className="mt-3 rounded-lg bg-sky-50 p-2 text-sm text-sky-800">{inr(unallocated)} will be kept as advance.</p>}
        </Card>
        {error && <Alert>{error}</Alert>}
        <Button className="h-12 w-full bg-emerald-600 text-base hover:bg-emerald-700" disabled={pending} onClick={submit}>
          {pending ? "Saving…" : `Save payment${amt > 0 ? ` of ${inr(amt)}` : ""}`}
        </Button>
      </div>
    </div>
  );
}
