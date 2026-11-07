"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock } from "lucide-react";
import { Alert, Button, Input, Label } from "@/components/ui";
import { Dialog } from "@/components/dialog";
import { addDays } from "@/lib/gst";
import { date as fmtDate } from "@/lib/format";
import { changeInvoiceTerms } from "../../actions";

// Manager / Super Admin: change an issued invoice's payment terms; the due date follows.
export function TermsButton({ invoiceId, invoiceDate, creditDays }: { invoiceId: string; invoiceDate: string; creditDays: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState(creditDays);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}><CalendarClock className="size-4" /> Payment terms</Button>
      {open && (
        <Dialog title="Change payment terms" onClose={() => setOpen(false)}>
          <div className="mb-3 flex flex-wrap gap-2">
            {[0, 10, 15, 21, 30, 45].map((d) => (
              <button key={d} type="button" onClick={() => setDays(d)} className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${days === d ? "border-ink-900 bg-ink-900 text-white" : "border-slate-300"}`}>{d === 0 ? "Immediate" : `${d} days`}</button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label htmlFor="t-days">Credit days</Label><Input id="t-days" type="number" min={0} max={365} value={days} onChange={(e) => setDays(Number(e.target.value) || 0)} /></div>
            <div><Label>New due date</Label><div className="flex h-10 items-center font-semibold">{fmtDate(addDays(invoiceDate, days))}</div></div>
            <div className="sm:col-span-2"><Label htmlFor="t-reason">Reason</Label><Input id="t-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. agreed with the owner on phone" /></div>
          </div>
          <p className="mt-2 text-xs text-slate-500">Only this invoice changes; the shop&apos;s default terms and other invoices stay as they are. The change is logged with your name and reason.</p>
          {error && <div className="mt-3"><Alert>{error}</Alert></div>}
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={pending || !reason.trim() || days === creditDays} onClick={() => start(async () => {
              const r = await changeInvoiceTerms(invoiceId, days, reason);
              if (r.error) return setError(r.error);
              setOpen(false); router.refresh();
            })}>{pending ? "Saving…" : "Save terms"}</Button>
          </div>
        </Dialog>
      )}
    </>
  );
}
