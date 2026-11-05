"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Banknote, Building2, CreditCard, Smartphone } from "lucide-react";
import { Alert, Badge, Button, Card, Input, Label, Select, Textarea, cn } from "@/components/ui";
import { date, inr } from "@/lib/format";
import { todayIST } from "@/lib/gst";
import { openBills, recordSupplierPayment, type OpenBill, type PickerSupplier } from "./actions";

const METHODS = [
  { key: "bank_transfer", label: "Bank transfer", icon: Building2 },
  { key: "upi", label: "UPI", icon: Smartphone },
  { key: "cheque", label: "Cheque", icon: CreditCard },
  { key: "cash", label: "Cash", icon: Banknote },
] as const;

export function SupplierPaymentForm({ suppliers, initialSupplier, focusBill }: { suppliers: PickerSupplier[]; initialSupplier?: string; focusBill?: string }) {
  const router = useRouter();
  const [supplierId, setSupplierId] = useState(initialSupplier ?? (suppliers.length === 1 ? suppliers[0].id : ""));
  const [bills, setBills] = useState<OpenBill[] | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<(typeof METHODS)[number]["key"]>("bank_transfer");
  const [reference, setReference] = useState("");
  const [payDate, setPayDate] = useState(todayIST());
  const [notes, setNotes] = useState("");
  const [mode, setMode] = useState<"fifo" | "manual">(focusBill ? "manual" : "fifo");
  const [manual, setManual] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    setBills(null);
    setManual({});
    if (!supplierId) return;
    openBills(supplierId).then((list) => {
      setBills(list);
      const f = focusBill && list.find((b) => b.purchase_id === focusBill);
      if (f) { setManual({ [f.purchase_id]: String(f.balance) }); setAmount(String(f.balance)); }
    });
  }, [supplierId, focusBill]);

  const amt = Number(amount) || 0;
  const totalOpen = (bills ?? []).reduce((t, b) => t + b.balance, 0);
  const fifo = useMemo(() => {
    let left = amt;
    const out = new Map<string, number>();
    for (const b of bills ?? []) {
      if (left <= 0) break;
      const take = Math.min(b.balance, left);
      if (take > 0) out.set(b.purchase_id, Math.round(take * 100) / 100);
      left -= take;
    }
    return { out, left: Math.max(0, Math.round(left * 100) / 100) };
  }, [amt, bills]);
  const manualSum = Object.values(manual).reduce((t, v) => t + (Number(v) || 0), 0);
  const preview = mode === "fifo" ? fifo.out : new Map(Object.entries(manual).map(([k, v]) => [k, Number(v) || 0]));
  const advance = mode === "fifo" ? fifo.left : Math.max(0, amt - manualSum);

  function submit() {
    setError(null);
    if (!supplierId) return setError("Choose a supplier.");
    if (!(amt > 0)) return setError("Enter the amount paid.");
    if (method !== "cash" && !reference.trim()) return setError("Enter the reference number.");
    if (mode === "manual" && manualSum > amt + 0.001) return setError("Bill amounts add up to more than the payment.");
    start(async () => {
      const res = await recordSupplierPayment({
        supplierId, amount: amt, method, date: payDate, reference, notes,
        allocations: mode === "manual" ? Object.entries(manual).map(([purchase_id, v]) => ({ purchase_id, amount: Number(v) || 0 })).filter((a) => a.amount > 0) : null,
      });
      if (res.error) setError(res.error);
      else router.push(`/purchases/payments/${res.id}?new=1`);
    });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_400px]">
      <Card className="p-5">
        <div className="mb-4">
          <Label htmlFor="sup">Supplier</Label>
          <div className="flex flex-wrap gap-2">
            {suppliers.slice(0, 6).map((s) => (
              <button key={s.id} type="button" onClick={() => setSupplierId(s.id)}
                className={cn("rounded-lg border px-3 py-2 text-sm font-semibold", supplierId === s.id ? "border-fuchsia-600 bg-fuchsia-50 text-fuchsia-800 ring-2 ring-fuchsia-600/20" : "border-slate-300 bg-white hover:border-slate-400")}>
                {s.name}
              </button>
            ))}
          </div>
          {suppliers.length > 6 && (
            <Select id="sup" className="mt-2" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">Other supplier…</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          )}
        </div>
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
            <Label htmlFor="amt">Amount paid (₹)</Label>
            <Input id="amt" type="number" min={0} step="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="tabular text-lg font-semibold" />
            {bills && totalOpen > 0 && (
              <button type="button" className="mt-1 text-xs text-fuchsia-700 hover:underline" onClick={() => setAmount(String(Math.round(totalOpen * 100) / 100))}>Full payable: {inr(totalOpen)}</button>
            )}
          </div>
          <div><Label htmlFor="pd">Payment date</Label><Input id="pd" type="date" value={payDate} max={todayIST()} onChange={(e) => setPayDate(e.target.value)} /></div>
          {method !== "cash" && (
            <div><Label htmlFor="ref">{method === "cheque" ? "Cheque number" : method === "upi" ? "UPI reference" : "UTR / reference"}</Label><Input id="ref" value={reference} onChange={(e) => setReference(e.target.value)} /></div>
          )}
          <div className="sm:col-span-2"><Label htmlFor="n" hint="optional">Notes</Label><Textarea id="n" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        </div>
      </Card>

      <div className="space-y-6">
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Apply to bills</h2>
            <div className="flex rounded-lg border p-0.5 text-xs">
              <button type="button" onClick={() => setMode("fifo")} className={cn("rounded-md px-2 py-1", mode === "fifo" && "bg-ink-900 text-white")}>Oldest first</button>
              <button type="button" onClick={() => setMode("manual")} className={cn("rounded-md px-2 py-1", mode === "manual" && "bg-ink-900 text-white")}>Choose</button>
            </div>
          </div>
          {!supplierId ? <p className="text-sm text-slate-500">Choose a supplier to see unpaid bills.</p>
            : bills === null ? <p className="text-sm text-slate-500">Loading…</p>
            : bills.length === 0 ? <p className="text-sm text-slate-500">No unpaid bills. The amount is kept as an advance and applied to the next bill automatically.</p>
            : (
              <ul className="divide-y divide-slate-100">
                {bills.map((b) => {
                  const overdue = b.days_overdue > 0;
                  const applied = preview.get(b.purchase_id) ?? 0;
                  return (
                    <li key={b.purchase_id} className="py-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-medium">{b.supplier_bill_no}</div>
                          <div className="text-xs text-slate-500">{date(b.supplier_bill_date)} · due {date(b.due_date)}</div>
                          <Badge tone={overdue ? "red" : "blue"}>{overdue ? `Overdue ${b.days_overdue}d` : "Not yet due"}</Badge>
                        </div>
                        <div className="text-right">
                          <div className="tabular text-sm font-semibold">{inr(b.balance)}</div>
                          {mode === "manual" ? (
                            <Input type="number" min={0} max={b.balance} step="0.01" value={manual[b.purchase_id] ?? ""} placeholder="0"
                              onChange={(e) => setManual((m) => ({ ...m, [b.purchase_id]: e.target.value }))} className="tabular mt-1 h-8 w-28 text-right" />
                          ) : applied > 0 ? <div className="tabular text-xs font-medium text-emerald-700">− {inr(applied)}</div> : null}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          {amt > 0 && advance > 0 && <p className="mt-3 rounded-lg bg-sky-50 p-2 text-sm text-sky-800">{inr(advance)} will be kept as advance to this supplier.</p>}
        </Card>
        {error && <Alert>{error}</Alert>}
        <Button className="h-12 w-full bg-emerald-600 text-base hover:bg-emerald-700" disabled={pending} onClick={submit}>
          {pending ? "Saving…" : `Save payment${amt > 0 ? ` of ${inr(amt)}` : ""}`}
        </Button>
      </div>
    </div>
  );
}
