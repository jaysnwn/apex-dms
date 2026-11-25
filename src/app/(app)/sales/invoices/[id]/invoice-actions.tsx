"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Undo2, XCircle } from "lucide-react";
import { Alert, Button, Input, Label } from "@/components/ui";
import { Dialog } from "@/components/dialog";
import { cancelInvoice, createCreditNote, type ReturnSummary } from "../../actions";
import { inr, qty } from "@/lib/format";

type Line = { id: string; product_name: string; sku: string; qty: number; credited: number };

export function InvoiceActions({ invoiceId, canCancel, canCredit, lines, dispatched }: { invoiceId: string; canCancel: boolean; canCredit: boolean; lines: Line[]; dispatched: boolean }) {
  const [dialog, setDialog] = useState<"cancel" | "credit" | null>(null);
  return (
    <>
      {canCredit && (
        <Button variant="secondary" onClick={() => setDialog("credit")}>
          <Undo2 className="size-4" /> Return items
        </Button>
      )}
      {canCancel && (
        <Button variant="ghost" className="text-red-700 hover:bg-red-50" onClick={() => setDialog("cancel")}>
          <XCircle className="size-4" /> Cancel invoice
        </Button>
      )}
      {dialog === "cancel" && <CancelDialog invoiceId={invoiceId} onClose={() => setDialog(null)} />}
      {dialog === "credit" && <ReturnDialog invoiceId={invoiceId} lines={lines} dispatched={dispatched} canCancel={canCancel} onClose={() => setDialog(null)} />}
    </>
  );
}

function CancelDialog({ invoiceId, onClose }: { invoiceId: string; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Dialog title="Cancel invoice" onClose={onClose}>
      <p className="mb-3 text-sm text-slate-600">The invoice number stays in the series, marked Cancelled. Reserved stock is released. This cannot be undone.</p>
      <Label>Reason</Label>
      <Input value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
      {error && <div className="mt-3"><Alert>{error}</Alert></div>}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Keep invoice</Button>
        <Button variant="danger" disabled={pending || !reason.trim()} onClick={() => start(async () => {
          const res = await cancelInvoice(invoiceId, reason);
          if (res.error) setError(res.error); else { onClose(); router.refresh(); }
        })}>{pending ? "Cancelling…" : "Cancel invoice"}</Button>
      </div>
    </Dialog>
  );
}

function ReturnDialog({ invoiceId, lines, dispatched, canCancel, onClose }: { invoiceId: string; lines: Line[]; dispatched: boolean; canCancel: boolean; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [restock, setRestock] = useState(true);
  const [q, setQ] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<ReturnSummary | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const picked = Object.entries(q).map(([invoice_line_id, v]) => ({ invoice_line_id, qty: Number(v) })).filter((l) => l.qty > 0);

  if (done) {
    // money already paid on this bill beyond what it now owes
    const released = Math.max(0, done.amount - done.invoiceUnpaidBefore);
    const newCredit = Math.max(0, done.credit - done.creditBefore);
    const toOtherBills = Math.max(0, released - newCredit);
    return (
      <Dialog title="Return recorded" onClose={() => { onClose(); router.refresh(); }}>
        <div className="space-y-3 text-sm">
          <Alert tone="green">
            Return <span className="font-mono">{done.number}</span> for {inr(done.amount)} is recorded{done.restocked ? " and the items are back in stock" : ""}.
          </Alert>
          <dl className="tabular space-y-1.5">
            <div className="flex justify-between"><dt className="text-slate-500">Taken off the shop&apos;s bills</dt><dd>{inr(done.amount)}</dd></div>
            {toOtherBills > 0 && <div className="flex justify-between"><dt className="text-slate-500">Already paid, moved to other unpaid bills</dt><dd>{inr(toOtherBills)}</dd></div>}
            <div className="flex justify-between"><dt className="text-slate-500">Shop still owes</dt><dd>{inr(done.outstanding)}</dd></div>
            {done.credit > 0 && (
              <div className="flex justify-between font-semibold"><dt>Shop credit{newCredit > 0 && newCredit < done.credit ? ` (${inr(newCredit)} from this return)` : ""}</dt><dd className="text-green-700">{inr(done.credit)}</dd></div>
            )}
          </dl>
          {done.credit > 0 && (
            <p className="text-slate-600">The shop credit is used on their next bill automatically. To give it back in cash or UPI, open the retailer and choose Give money back.</p>
          )}
        </div>
        <div className="mt-5 flex justify-end">
          <Button onClick={() => { onClose(); router.refresh(); }}>Done</Button>
        </div>
      </Dialog>
    );
  }

  // A return before dispatch would leave the warehouse shipping the full bill
  // while the shop is billed for less: returns are recorded once goods have left.
  if (!dispatched) {
    return (
      <Dialog title="Return items" onClose={onClose}>
        <div className="space-y-3 text-sm text-slate-600">
          <Alert tone="blue">These goods have not left the warehouse yet, so nothing can come back.</Alert>
          {canCancel ? (
            <p>If the bill is wrong, use <span className="font-medium text-slate-900">Cancel invoice</span> and make a new one with the right items.</p>
          ) : (
            <p>This bill can no longer be cancelled (it has a payment or a return). Dispatch it first; then record the items that came back here, and they go back into stock.</p>
          )}
        </div>
        <div className="mt-5 flex justify-end"><Button variant="secondary" onClick={onClose}>Close</Button></div>
      </Dialog>
    );
  }

  return (
    <Dialog title="Return items" onClose={onClose} wide>
      <p className="mb-3 text-sm text-slate-600">
        Enter how many of each item came back. The amount comes off this bill. If the shop has already paid, the extra goes to their other unpaid bills and the rest becomes shop credit for the next bill.
      </p>
      <div className="mb-4 overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr><th className="px-3 py-2">Product</th><th className="px-3 py-2 text-right">Sold</th><th className="px-3 py-2 text-right">Returned</th><th className="px-3 py-2 text-right">Coming back</th></tr>
          </thead>
          <tbody className="divide-y">
            {lines.map((l) => {
              const left = l.qty - l.credited;
              return (
                <tr key={l.id}>
                  <td className="px-3 py-2">{l.product_name}<div className="font-mono text-xs text-slate-500">{l.sku}</div></td>
                  <td className="tabular px-3 py-2 text-right">{qty(l.qty)}</td>
                  <td className="tabular px-3 py-2 text-right">{qty(l.credited)}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {left > 0 && (
                        <button type="button" className="text-xs font-medium text-primary-text hover:underline" onClick={() => setQ((s) => ({ ...s, [l.id]: String(left) }))}>All {qty(left)}</button>
                      )}
                      <Input type="number" inputMode="decimal" min={0} max={left} step="any" aria-label={`Coming back: ${l.product_name}`} value={q[l.id] ?? ""} onChange={(e) => setQ((s) => ({ ...s, [l.id]: e.target.value }))} className="tabular h-9 w-24 text-right" disabled={left <= 0} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Label>Reason</Label>
      <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. 2 units returned damaged" />
      <label className="mt-3 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} className="size-4" />
        Put the items back in stock
      </label>
      <p className="mt-3 text-xs text-slate-500">A GST credit note is made for this return, rounded to whole rupees like the invoice.</p>
      {error && <div className="mt-3"><Alert>{error}</Alert></div>}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Close</Button>
        <Button disabled={pending || !reason.trim() || picked.length === 0} onClick={() => start(async () => {
          const res = await createCreditNote(invoiceId, reason, restock, picked);
          if (res.error) setError(res.error); else if (res.returned) setDone(res.returned); else { onClose(); router.refresh(); }
        })}>{pending ? "Saving…" : "Record return"}</Button>
      </div>
    </Dialog>
  );
}
