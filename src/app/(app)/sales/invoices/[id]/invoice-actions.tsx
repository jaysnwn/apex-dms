"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileMinus, XCircle } from "lucide-react";
import { Alert, Button, Input, Label } from "@/components/ui";
import { Dialog } from "@/components/dialog";
import { cancelInvoice, createCreditNote } from "../../actions";
import { qty } from "@/lib/format";

type Line = { id: string; product_name: string; sku: string; qty: number; credited: number };

export function InvoiceActions({ invoiceId, canCancel, canCredit, lines, dispatched }: { invoiceId: string; canCancel: boolean; canCredit: boolean; lines: Line[]; dispatched: boolean }) {
  const [dialog, setDialog] = useState<"cancel" | "credit" | null>(null);
  return (
    <>
      {canCredit && (
        <Button variant="secondary" onClick={() => setDialog("credit")}>
          <FileMinus className="size-4" /> Credit note
        </Button>
      )}
      {canCancel && (
        <Button variant="ghost" className="text-red-700 hover:bg-red-50" onClick={() => setDialog("cancel")}>
          <XCircle className="size-4" /> Cancel invoice
        </Button>
      )}
      {dialog === "cancel" && <CancelDialog invoiceId={invoiceId} onClose={() => setDialog(null)} />}
      {dialog === "credit" && <CreditDialog invoiceId={invoiceId} lines={lines} dispatched={dispatched} onClose={() => setDialog(null)} />}
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

function CreditDialog({ invoiceId, lines, dispatched, onClose }: { invoiceId: string; lines: Line[]; dispatched: boolean; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [restock, setRestock] = useState(true);
  const [q, setQ] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Dialog title="Credit note" onClose={onClose} wide>
      <p className="mb-3 text-sm text-slate-600">Choose the quantity to credit on each line (returns or price corrections). GST is reversed proportionally.</p>
      <div className="mb-4 overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr><th className="px-3 py-2">Product</th><th className="px-3 py-2 text-right">Invoiced</th><th className="px-3 py-2 text-right">Already credited</th><th className="px-3 py-2 text-right">Credit qty</th></tr>
          </thead>
          <tbody className="divide-y">
            {lines.map((l) => (
              <tr key={l.id}>
                <td className="px-3 py-2">{l.product_name}<div className="font-mono text-xs text-slate-500">{l.sku}</div></td>
                <td className="tabular px-3 py-2 text-right">{qty(l.qty)}</td>
                <td className="tabular px-3 py-2 text-right">{qty(l.credited)}</td>
                <td className="px-3 py-2 text-right">
                  <Input type="number" min={0} max={l.qty - l.credited} step="any" value={q[l.id] ?? ""} onChange={(e) => setQ((s) => ({ ...s, [l.id]: e.target.value }))} className="tabular ml-auto h-9 w-24 text-right" disabled={l.qty - l.credited <= 0} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Label>Reason</Label>
      <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. 2 units returned damaged" />
      {dispatched && (
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} className="size-4" />
          Goods came back — add them to stock
        </label>
      )}
      {error && <div className="mt-3"><Alert>{error}</Alert></div>}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Close</Button>
        <Button disabled={pending || !reason.trim()} onClick={() => start(async () => {
          const res = await createCreditNote(invoiceId, reason, dispatched && restock, Object.entries(q).map(([invoice_line_id, v]) => ({ invoice_line_id, qty: Number(v) })).filter((l) => l.qty > 0));
          if (res.error) setError(res.error); else { onClose(); router.refresh(); }
        })}>{pending ? "Saving…" : "Issue credit note"}</Button>
      </div>
    </Dialog>
  );
}
