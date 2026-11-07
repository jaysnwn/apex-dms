"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Undo2 } from "lucide-react";
import { Alert, Button, Input, Label, Textarea } from "@/components/ui";
import { Dialog } from "../../sales/order-builder";
import { inr, qty as fmtQty } from "@/lib/format";
import { createPurchaseReturn } from "../actions";

export type ReturnableLine = { id: string; name: string; sku: string; unit: string; bought: number; returned: number; lineTotal: number };

const REASONS = ["Damaged in transit", "Defective / not working", "Wrong item supplied", "Excess quantity", "Expired / old stock"];

export function ReturnButton({ purchaseId, lines }: { purchaseId: string; lines: ReturnableLine[] }) {
  const [open, setOpen] = useState(false);
  if (!lines.some((l) => l.bought > l.returned)) return null;
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}><Undo2 className="size-4" /> Return to supplier</Button>
      {open && <ReturnDialog purchaseId={purchaseId} lines={lines} onClose={() => setOpen(false)} />}
    </>
  );
}

function ReturnDialog({ purchaseId, lines, onClose }: { purchaseId: string; lines: ReturnableLine[]; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [key] = useState(() => crypto.randomUUID());
  const [pending, start] = useTransition();
  const value = lines.reduce((t, l) => t + (Number(q[l.id]) || 0) * (l.lineTotal / l.bought), 0);

  return (
    <Dialog title="Return goods to the supplier" onClose={onClose} wide>
      <p className="mb-3 text-sm text-slate-600">The returned quantity leaves stock now and the amount comes off what you owe on this bill. A debit note number is created.</p>
      <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
        {lines.map((l) => {
          const left = l.bought - l.returned;
          return (
            <div key={l.id} className="flex items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <div className="font-medium">{l.name}</div>
                <div className="text-xs text-slate-500"><span className="font-mono">{l.sku}</span> · bought {fmtQty(l.bought)}{l.returned ? ` · already returned ${fmtQty(l.returned)}` : ""}</div>
              </div>
              <Input type="number" min={0} max={left} step="any" disabled={left <= 0} value={q[l.id] ?? ""} placeholder="0"
                onChange={(e) => setQ((p) => ({ ...p, [l.id]: e.target.value }))} className="tabular w-24 text-right" aria-label={`Return quantity for ${l.name}`} />
              <span className="w-10 text-xs text-slate-500">{l.unit.toLowerCase()}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-4">
        <Label htmlFor="ret_reason">Reason</Label>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {REASONS.map((r) => <button key={r} type="button" onClick={() => setReason(r)} className="rounded-full border border-slate-300 px-2.5 py-1 text-xs hover:bg-slate-50">{r}</button>)}
        </div>
        <Textarea id="ret_reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
      {error && <div className="mt-3"><Alert>{error}</Alert></div>}
      <div className="mt-5 flex items-center justify-between gap-2">
        <span className="tabular text-sm text-slate-600">Return value ≈ <b>{inr(value)}</b></span>
        <span className="flex gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="danger" disabled={pending || value <= 0 || !reason.trim()} onClick={() => start(async () => {
            const r = await createPurchaseReturn({ purchaseId, reason, clientUuid: key, lines: lines.map((l) => ({ purchase_line_id: l.id, qty: Number(q[l.id]) || 0 })) });
            if (r.error) return setError(r.error);
            onClose(); router.refresh();
          })}>{pending ? "Saving…" : "Confirm return"}</Button>
        </span>
      </div>
    </Dialog>
  );
}
