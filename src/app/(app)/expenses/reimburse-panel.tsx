"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, Wallet } from "lucide-react";
import { Alert, Badge, Button, Card, Input, Label, Select, Textarea, cn } from "@/components/ui";
import { Dialog } from "@/components/dialog";
import { date, inr } from "@/lib/format";
import { todayIST } from "@/lib/gst";
import { REIMBURSE_METHOD, type ExpenseRow } from "@/lib/expense-labels";
import { cancelReimbursement, reimburseExpenses } from "./actions";
import { uploadReceipt } from "./expense-form";

export type PaymentRow = {
  id: string; reimbursement_no: string | null; employee_id: string; employee_name: string; paid_on: string; amount: number;
  method: string; reference_no: string | null; notes: string | null; cancelled_at: string | null; cancel_reason: string | null; created_by_name: string | null;
};

export function ReimbursePanel({ groups, canPay, me }: { groups: { employeeId: string; name: string; rows: ExpenseRow[] }[]; canPay: boolean; me: string }) {
  if (groups.length === 0) return <Card className="p-10 text-center text-sm text-slate-500">Nothing waiting for reimbursement. Approved expenses paid by employees appear here.</Card>;
  return (
    <div className="space-y-4">
      {!canPay && <Alert tone="amber">You can see what is owed, but paying employees needs the “Can reimburse” permission (ask the Super Admin).</Alert>}
      {groups.map((g) => <EmployeeCard key={g.employeeId} g={g} canPay={canPay} me={me} />)}
    </div>
  );
}

function EmployeeCard({ g, canPay, me }: { g: { employeeId: string; name: string; rows: ExpenseRow[] }; canPay: boolean; me: string }) {
  const owed = g.rows.reduce((t, r) => t + Number(r.outstanding), 0);
  const [sel, setSel] = useState<Record<string, string>>({});
  const [open, setOpen] = useState(false);
  const chosen = g.rows.filter((r) => sel[r.id] !== undefined);
  const total = chosen.reduce((t, r) => t + (Number(sel[r.id]) || 0), 0);
  const toggle = (r: ExpenseRow) => setSel((s) => {
    const n = { ...s };
    if (n[r.id] !== undefined) delete n[r.id]; else n[r.id] = String(r.outstanding);
    return n;
  });
  const all = chosen.length === g.rows.length;

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3">
        <span className="grid size-9 place-items-center rounded-lg bg-amber-50 text-amber-600"><Wallet className="size-5" /></span>
        <div>
          <div className="font-semibold">{g.name}</div>
          <div className="text-xs text-slate-500">{g.rows.length} approved expense{g.rows.length > 1 ? "s" : ""} not fully paid</div>
        </div>
        <div className="ml-auto text-right">
          <div className="text-xs text-slate-500">Owed</div>
          <div className="tabular text-lg font-bold">{inr(owed)}</div>
        </div>
        {canPay && (
          <Button disabled={total <= 0} onClick={() => setOpen(true)}>Pay {total > 0 ? inr(total) : "selected"}</Button>
        )}
      </div>
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-slate-500">
          <tr>
            {canPay && <th className="w-10 py-2 pl-4"><input type="checkbox" className="size-4 accent-ink-900" aria-label="Select all" checked={all} onChange={() => setSel(all ? {} : Object.fromEntries(g.rows.map((r) => [r.id, String(r.outstanding)])))} /></th>}
            <th className="px-4 py-2">Expense</th>
            <th className="px-3 py-2 text-right">Approved</th>
            <th className="px-3 py-2 text-right">Paid</th>
            <th className="px-3 py-2 text-right">Due</th>
            {canPay && <th className="px-4 py-2 text-right">Pay now (₹)</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {g.rows.map((r) => (
            <tr key={r.id} className={cn(sel[r.id] !== undefined && "bg-amber-50/50")}>
              {canPay && <td className="pl-4"><input type="checkbox" className="size-4 accent-ink-900" checked={sel[r.id] !== undefined} onChange={() => toggle(r)} aria-label={`Select ${r.expense_no}`} /></td>}
              <td className="px-4 py-2">
                <span className="font-medium">{r.category_name}</span> <span className="text-slate-500">· {date(r.expense_date)} · {r.expense_no}</span>
                {r.description && <div className="truncate text-xs text-slate-500">{r.description}</div>}
              </td>
              <td className="tabular px-3 py-2 text-right">{inr(r.approved_amount)}</td>
              <td className="tabular px-3 py-2 text-right text-slate-500">{Number(r.reimbursed_amount) > 0 ? inr(r.reimbursed_amount) : "—"}</td>
              <td className="tabular px-3 py-2 text-right font-medium">{inr(r.outstanding)}{r.reimbursement_status === "partial" && <div><Badge tone="violet">Partly paid</Badge></div>}</td>
              {canPay && (
                <td className="px-4 py-2 text-right">
                  <Input type="number" min={0.01} max={r.outstanding} step="0.01" className="ml-auto h-9 w-28 text-right"
                    disabled={sel[r.id] === undefined} value={sel[r.id] ?? ""} onChange={(e) => setSel((s) => ({ ...s, [r.id]: e.target.value }))} aria-label="Amount to pay" />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {open && <PayDialog name={g.name} lines={chosen.map((r) => ({ id: r.id, no: r.expense_no ?? "", amount: Number(sel[r.id]) || 0, due: Number(r.outstanding) }))} me={me} onClose={() => setOpen(false)} onPaid={() => { setSel({}); setOpen(false); }} />}
    </Card>
  );
}

function PayDialog({ name, lines, me, onClose, onPaid }: { name: string; lines: { id: string; no: string; amount: number; due: number }[]; me: string; onClose: () => void; onPaid: () => void }) {
  const router = useRouter();
  const [paidOn, setPaidOn] = useState(todayIST());
  const [method, setMethod] = useState<"upi" | "bank_transfer" | "cash" | "cheque">("upi");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const clientUuid = useRef(crypto.randomUUID());
  const total = lines.reduce((t, l) => t + l.amount, 0);
  const over = lines.find((l) => l.amount > l.due + 0.001 || l.amount <= 0);
  const partial = lines.some((l) => l.amount < l.due);

  return (
    <Dialog title={`Pay ${name}`} onClose={onClose}>
      <ul className="mb-3 divide-y divide-slate-100 rounded-lg border border-slate-200 text-sm">
        {lines.map((l) => <li key={l.id} className="flex justify-between px-3 py-1.5"><span>{l.no}{l.amount < l.due && <span className="text-xs text-violet-700"> · part payment, {inr(l.due - l.amount)} stays due</span>}</span><span className="tabular">{inr(l.amount)}</span></li>)}
        <li className="flex justify-between px-3 py-2 font-semibold"><span>Total</span><span className="tabular">{inr(total)}</span></li>
      </ul>
      {over && <div className="mb-3"><Alert>Amount for {over.no} must be between ₹0.01 and {inr(over.due)}.</Alert></div>}
      <div className="grid gap-3 sm:grid-cols-2">
        <div><Label>Payment date</Label><Input type="date" value={paidOn} max={todayIST()} onChange={(e) => setPaidOn(e.target.value)} /></div>
        <div><Label>Paid by</Label><Select value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>{Object.entries(REIMBURSE_METHOD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></div>
        <div className="sm:col-span-2"><Label hint={method === "cheque" ? "required" : "UTR / transaction id"}>Reference</Label><Input value={reference} onChange={(e) => setReference(e.target.value)} /></div>
        <div className="sm:col-span-2"><Label hint="optional">Notes</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        <div className="sm:col-span-2">
          <Label hint="optional">Payment proof</Label>
          <label className={cn("flex cursor-pointer items-center gap-2 rounded-lg border border-dashed p-3 text-sm", file ? "border-emerald-400 bg-emerald-50 text-emerald-800" : "border-slate-300 text-slate-600")}>
            <Camera className="size-4" /> {file ? file.name : "Screenshot or PDF"}
            <input type="file" accept="image/*,application/pdf" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
        </div>
      </div>
      {error && <div className="mt-3"><Alert>{error}</Alert></div>}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Back</Button>
        <Button disabled={pending || !!over || total <= 0} onClick={() => start(async () => {
          setError(null);
          let proofPath: string | null = null;
          if (file) { try { proofPath = await uploadReceipt(me, file, "proof-"); } catch (e) { return setError((e as Error).message); } }
          const r = await reimburseExpenses({ lines: lines.map((l) => ({ expenseId: l.id, amount: l.amount })), paidOn, method, reference, notes, proofPath, clientUuid: clientUuid.current });
          if (!r.ok) return setError(r.error);
          onPaid(); router.refresh();
        })}>{pending ? "Saving…" : `Confirm ${partial ? "part " : ""}payment of ${inr(total)}`}</Button>
      </div>
    </Dialog>
  );
}

export function PaymentsList({ rows, superAdmin }: { rows: PaymentRow[]; superAdmin: boolean }) {
  const router = useRouter();
  const [cancel, setCancel] = useState<PaymentRow | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (rows.length === 0) return null;
  return (
    <Card className="overflow-x-auto">
      <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold">Recent reimbursements</div>
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-slate-500"><tr><th className="px-4 py-2">Date</th><th className="px-3 py-2">No.</th><th className="px-3 py-2">Employee</th><th className="px-3 py-2">Method</th><th className="px-3 py-2">By</th><th className="px-3 py-2 text-right">Amount</th>{superAdmin && <th className="px-4 py-2" />}</tr></thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((p) => (
            <tr key={p.id} className={cn(p.cancelled_at && "text-slate-400")}>
              <td className="px-4 py-2 whitespace-nowrap">{date(p.paid_on)}</td>
              <td className="px-3 py-2 font-mono text-xs">{p.reimbursement_no}</td>
              <td className="px-3 py-2">{p.employee_name}</td>
              <td className="px-3 py-2">{REIMBURSE_METHOD[p.method] ?? p.method}{p.reference_no ? ` · ${p.reference_no}` : ""}</td>
              <td className="px-3 py-2 text-xs">{p.created_by_name}</td>
              <td className={cn("tabular px-3 py-2 text-right font-medium", p.cancelled_at && "line-through")}>{inr(p.amount)}</td>
              {superAdmin && <td className="px-4 py-2 text-right">{p.cancelled_at ? <span className="text-xs" title={p.cancel_reason ?? ""}>Reversed</span> : <button className="text-xs text-red-700 hover:underline" onClick={() => { setCancel(p); setReason(""); setError(null); }}>Reverse</button>}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      {cancel && (
        <Dialog title={`Reverse ${cancel.reimbursement_no}`} onClose={() => setCancel(null)}>
          <p className="mb-3 text-sm">Use this only if the payment of <b>{inr(cancel.amount)}</b> to <b>{cancel.employee_name}</b> was recorded by mistake. The expenses become due again and the accounting entry is reversed.</p>
          <Label>Reason</Label><Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
          {error && <div className="mt-3"><Alert>{error}</Alert></div>}
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCancel(null)}>Back</Button>
            <Button className="bg-red-600 hover:bg-red-700" disabled={pending || !reason.trim()} onClick={() => start(async () => {
              const r = await cancelReimbursement(cancel.id, reason);
              if (!r.ok) return setError(r.error);
              setCancel(null); router.refresh();
            })}>{pending ? "Saving…" : "Reverse payment"}</Button>
          </div>
        </Dialog>
      )}
    </Card>
  );
}
