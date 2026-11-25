"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { HandCoins } from "lucide-react";
import { Alert, Button, Input, Label, Select } from "@/components/ui";
import { Dialog } from "@/components/dialog";
import { cancelRefund, recordRefund } from "../../payments/actions";
import { inr } from "@/lib/format";
import { todayIST } from "@/lib/gst";

// Give a shop's credit back in cash or UPI (office staff).
export function RefundButton({ retailerId, shop, credit }: { retailerId: string; shop: string; credit: number }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"cash" | "upi">("cash");
  const [reference, setReference] = useState("");
  const [day, setDay] = useState(todayIST());
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const amt = Number(amount);
  const tooMuch = amt > credit;

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}><HandCoins className="size-4" /> Give money back</Button>
      {open && (
        <Dialog title="Give money back" onClose={() => setOpen(false)}>
          <p className="mb-4 text-sm text-slate-600">
            {shop} has {inr(credit)} of shop credit. Record the cash or UPI you hand back; it comes off the credit and shows on their statement.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="rf-amount">Amount (₹)</Label>
              <div className="flex items-center gap-2">
                <Input id="rf-amount" type="number" inputMode="decimal" min={0} max={credit} step="any" value={amount} onChange={(e) => setAmount(e.target.value)} className="tabular" autoFocus />
                <button type="button" className="shrink-0 text-xs font-medium text-primary-text hover:underline" onClick={() => setAmount(String(credit))}>All {inr(credit, { decimals: false })}</button>
              </div>
            </div>
            <div>
              <Label htmlFor="rf-method">Paid by</Label>
              <Select id="rf-method" value={method} onChange={(e) => setMethod(e.target.value as "cash" | "upi")}>
                <option value="cash">Cash</option>
                <option value="upi">UPI</option>
              </Select>
            </div>
            {method === "upi" && (
              <div>
                <Label htmlFor="rf-ref">UPI reference</Label>
                <Input id="rf-ref" value={reference} onChange={(e) => setReference(e.target.value)} />
              </div>
            )}
            <div>
              <Label htmlFor="rf-date">Date</Label>
              <Input id="rf-date" type="date" value={day} max={todayIST()} onChange={(e) => setDay(e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="rf-notes" hint="optional">Note</Label>
              <Input id="rf-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Cables returned, credit paid back" />
            </div>
          </div>
          {tooMuch && <div className="mt-3"><Alert tone="amber">That is more than the shop credit of {inr(credit)}.</Alert></div>}
          {error && <div className="mt-3"><Alert>{error}</Alert></div>}
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>Close</Button>
            <Button disabled={pending || !(amt > 0) || tooMuch || (method === "upi" && !reference.trim())} onClick={() => start(async () => {
              const res = await recordRefund({ retailerId, amount: amt, method, date: day, reference, notes });
              if (res.error) setError(res.error); else { setOpen(false); setAmount(""); setReference(""); setNotes(""); router.refresh(); }
            })}>{pending ? "Saving…" : `Give back ${amt > 0 ? inr(amt) : ""}`.trim()}</Button>
          </div>
        </Dialog>
      )}
    </>
  );
}

export function CancelRefundButton({ id, retailerId, number }: { id: string; retailerId: string; number: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <>
      <button type="button" className="text-xs font-medium text-red-700 hover:underline" onClick={() => setOpen(true)}>Cancel</button>
      {open && (
        <Dialog title={`Cancel ${number}`} onClose={() => setOpen(false)}>
          <p className="mb-3 text-sm text-slate-600">Use this only if the money was not actually given back. The amount returns to the shop credit.</p>
          <Label>Reason</Label>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
          {error && <div className="mt-3"><Alert>{error}</Alert></div>}
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>Keep</Button>
            <Button variant="danger" disabled={pending || !reason.trim()} onClick={() => start(async () => {
              const res = await cancelRefund(id, retailerId, reason);
              if (res.error) setError(res.error); else { setOpen(false); router.refresh(); }
            })}>{pending ? "Cancelling…" : "Cancel refund"}</Button>
          </div>
        </Dialog>
      )}
    </>
  );
}
