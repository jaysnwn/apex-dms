"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { Alert, Button, Input, Label, Select } from "@/components/ui";
import { Dialog } from "../sales/order-builder";
import { inr } from "@/lib/format";
import { reimburse, reviewExpense } from "./actions";

export function ReviewButtons({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-1">
        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" disabled={pending} onClick={() => start(async () => {
          const r = await reviewExpense(id, "approved"); if (r.error) setError(r.error); else router.refresh();
        })}><Check className="size-4" /> Approve</Button>
        <Button size="sm" variant="secondary" className="text-red-700" disabled={pending} onClick={() => {
          const reason = prompt("Reason for rejection");
          if (!reason) return;
          start(async () => { const r = await reviewExpense(id, "rejected", reason); if (r.error) setError(r.error); else router.refresh(); });
        }}><X className="size-4" /> Reject</Button>
      </div>
      {error && <span className="text-xs text-red-700">{error}</span>}
    </div>
  );
}

export function ReimburseButton({ ids, total, name }: { ids: string[]; total: number; name: string }) {
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<"cash" | "upi" | "bank_transfer" | "cheque">("upi");
  const [ref, setRef] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>Reimburse {inr(total, { decimals: false })}</Button>
      {open && (
        <Dialog title={`Reimburse ${name}`} onClose={() => setOpen(false)}>
          <p className="mb-3 text-sm text-slate-600">{ids.length} approved expense(s), total <span className="font-semibold">{inr(total)}</span>.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label>Paid by</Label><Select value={method} onChange={(e) => setMethod(e.target.value as typeof method)}><option value="upi">UPI</option><option value="bank_transfer">Bank transfer</option><option value="cash">Cash</option><option value="cheque">Cheque</option></Select></div>
            <div><Label hint="optional">Reference</Label><Input value={ref} onChange={(e) => setRef(e.target.value)} /></div>
          </div>
          {error && <div className="mt-3"><Alert>{error}</Alert></div>}
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={pending} onClick={() => start(async () => {
              const r = await reimburse(ids, method, ref); if (r.error) setError(r.error); else { setOpen(false); router.refresh(); }
            })}>{pending ? "Saving…" : "Mark reimbursed"}</Button>
          </div>
        </Dialog>
      )}
    </>
  );
}
