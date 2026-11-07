"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, Undo2, Wallet } from "lucide-react";
import { Alert, Button, Input, Label, cn } from "@/components/ui";
import { Dialog } from "../../sales/order-builder";
import { inr } from "@/lib/format";
import { approveMonth, markPaid, reopenPayout } from "./actions";

export function ApproveButton({ month, canApprove, canOverride }: { month: string; canApprove: boolean; canOverride: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!canApprove && !canOverride) return null;
  return (
    <>
      <Button className={canApprove ? "bg-emerald-600 hover:bg-emerald-700" : ""} variant={canApprove ? "primary" : "secondary"} onClick={() => setOpen(true)}>
        <BadgeCheck className="size-4" /> {canApprove ? "Approve & lock month" : "Approve early"}
      </Button>
      {open && (
        <Dialog title="Approve incentives" onClose={() => setOpen(false)}>
          <p className="text-sm text-slate-600">
            This saves each salesman&apos;s figures and shop list permanently for this month. Later changes to bills or payments will not change approved incentives.
          </p>
          {!canApprove && <p className="mt-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-900">The payment window is not over yet, so some shops can still become smart. Approving early locks today&apos;s figures.</p>}
          {error && <div className="mt-3"><Alert>{error}</Alert></div>}
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={pending} onClick={() => start(async () => {
              const r = await approveMonth(month, !canApprove);
              if (r.error) setError(r.error); else { setOpen(false); router.refresh(); }
            })}>{pending ? "Approving…" : "Approve"}</Button>
          </div>
        </Dialog>
      )}
    </>
  );
}

export function PaidButton({ id, amount, name }: { id: string; amount: number; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState("upi");
  const [ref, setRef] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setOpen(true)}><Wallet className="size-3.5" /> Mark paid</Button>
      {open && (
        <Dialog title={`Pay ${inr(amount, { decimals: false })} to ${name}`} onClose={() => setOpen(false)}>
          <div className="grid grid-cols-4 gap-2">
            {[["cash", "Cash"], ["upi", "UPI"], ["bank_transfer", "Bank"], ["cheque", "Cheque"]].map(([k, l]) => (
              <button key={k} type="button" onClick={() => setMethod(k)} className={cn("h-10 rounded-lg border text-sm font-medium", method === k ? "border-emerald-600 bg-emerald-50 text-emerald-800" : "border-slate-300")}>{l}</button>
            ))}
          </div>
          {method !== "cash" && <div className="mt-3"><Label>Reference</Label><Input value={ref} onChange={(e) => setRef(e.target.value)} /></div>}
          {error && <div className="mt-3"><Alert>{error}</Alert></div>}
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={pending} onClick={() => start(async () => {
              const r = await markPaid(id, method, ref);
              if (r.error) setError(r.error); else { setOpen(false); router.refresh(); }
            })}>{pending ? "Saving…" : "Mark paid"}</Button>
          </div>
        </Dialog>
      )}
    </>
  );
}

export function ReopenButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button title="Undo approval (not paid yet)" disabled={pending} className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-red-700"
      onClick={() => { if (confirm("Undo this approval? Figures will be recalculated live.")) start(async () => { const r = await reopenPayout(id); if (r.error) alert(r.error); router.refresh(); }); }}>
      <Undo2 className="size-3.5" /> Undo
    </button>
  );
}
