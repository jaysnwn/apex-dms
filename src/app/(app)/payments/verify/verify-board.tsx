"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Banknote, Building2, CheckCheck, CreditCard, Smartphone, XCircle } from "lucide-react";
import { Alert, Badge, Button, Card, Label, Textarea, cn } from "@/components/ui";
import { Dialog } from "../../sales/order-builder";
import { date, dateTime, inr } from "@/lib/format";
import { PAYMENT_METHOD } from "@/lib/status";
import { rejectCollection, verifyCollections } from "../actions";

export type PendingPayment = {
  id: string; receipt_no: string; payment_date: string; amount: number; method: string; reference_no: string | null; bank_name: string | null;
  status: string; created_at: string; salesman_id: string; salesman: string; shop: string; city: string | null;
};

const ICON: Record<string, typeof Banknote> = { cash: Banknote, upi: Smartphone, cheque: CreditCard, bank_transfer: Building2 };
const TONE: Record<string, string> = { cash: "bg-emerald-50 text-emerald-800", upi: "bg-sky-50 text-sky-800", cheque: "bg-amber-50 text-amber-900", bank_transfer: "bg-violet-50 text-violet-800" };
const HINT: Record<string, string> = { cash: "count the cash", upi: "check it in the bank / UPI app", cheque: "collect the cheque", bank_transfer: "check the bank statement" };

export function VerifyBoard({ payments }: { payments: PendingPayment[] }) {
  const router = useRouter();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<PendingPayment | null>(null);
  const [pending, start] = useTransition();

  const groups = useMemo(() => {
    const m = new Map<string, { name: string; rows: PendingPayment[] }>();
    for (const p of payments) {
      const g = m.get(p.salesman_id) ?? { name: p.salesman, rows: [] };
      g.rows.push(p);
      m.set(p.salesman_id, g);
    }
    return [...m.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name));
  }, [payments]);

  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const pickedTotal = payments.filter((p) => picked.has(p.id)).reduce((t, p) => t + p.amount, 0);

  function verify(ids: string[]) {
    setError(null); setDone(null);
    start(async () => {
      const r = await verifyCollections(ids);
      if (r.error) return setError(r.error);
      setDone(`${r.count} payment${r.count === 1 ? "" : "s"} verified.`);
      setPicked(new Set());
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-600">
        Salesmen record what they collect in the app. When they hand it over, check it and press <b>Verify</b>. If money was not handed over or the entry is wrong, <b>Reject</b> it — the bill becomes due again.
        Only verified payments count for incentives.
      </p>
      {error && <Alert>{error}</Alert>}
      {done && <Alert tone="green">{done}</Alert>}

      {groups.map(([sid, g]) => {
        const by = (m: string) => g.rows.filter((r) => r.method === m).reduce((t, r) => t + r.amount, 0);
        const total = g.rows.reduce((t, r) => t + r.amount, 0);
        const oldest = g.rows[0]?.payment_date;
        return (
          <Card key={sid} className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3">
              <div>
                <div className="text-base font-semibold">{g.name}</div>
                <div className="text-xs text-slate-500">{g.rows.length} payment{g.rows.length === 1 ? "" : "s"} to verify · oldest {date(oldest)}</div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {(["cash", "upi", "cheque", "bank_transfer"] as const).filter((m) => by(m) > 0).map((m) => {
                  const I = ICON[m];
                  return <span key={m} className={cn("flex items-center gap-1 rounded-lg px-2.5 py-1 text-sm font-semibold", TONE[m])}><I className="size-4" /> {PAYMENT_METHOD[m]} <span className="tabular">{inr(by(m), { decimals: false })}</span></span>;
                })}
                <span className="tabular rounded-lg bg-ink-900 px-2.5 py-1 text-sm font-bold text-white">{inr(total, { decimals: false })}</span>
                <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" disabled={pending} onClick={() => verify(g.rows.map((r) => r.id))}>
                  <CheckCheck className="size-4" /> Verify all
                </Button>
              </div>
            </div>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                {g.rows.map((p) => {
                  const I = ICON[p.method] ?? Banknote;
                  return (
                    <tr key={p.id} className={cn("hover:bg-slate-50", picked.has(p.id) && "bg-emerald-50/60")}>
                      <td className="w-10 px-4 py-2.5"><input type="checkbox" checked={picked.has(p.id)} onChange={() => toggle(p.id)} className="size-4" aria-label="Select" /></td>
                      <td className="px-2 py-2.5">
                        <div className="font-medium">{p.shop}</div>
                        <div className="text-xs text-slate-500">{date(p.payment_date)}{p.city ? ` · ${p.city}` : ""} · <Link href={`/payments/${p.id}`} className="font-mono hover:underline">{p.receipt_no.split("/").pop()}</Link> · entered {dateTime(p.created_at)}</div>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={cn("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold", TONE[p.method])}><I className="size-3.5" /> {PAYMENT_METHOD[p.method]}</span>
                        {p.reference_no && <div className="mt-0.5 font-mono text-xs text-slate-600">{p.reference_no}{p.bank_name ? ` · ${p.bank_name}` : ""}</div>}
                        <div className="text-[11px] text-slate-400">{HINT[p.method]}</div>
                        {p.status === "cheque_pending" && <Badge tone="amber">Cheque not cleared yet</Badge>}
                      </td>
                      <td className="tabular px-3 py-2.5 text-right text-base font-semibold">{inr(p.amount)}</td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" disabled={pending} onClick={() => verify([p.id])}>Verify</Button>{" "}
                        <Button size="sm" variant="secondary" disabled={pending} onClick={() => setRejecting(p)}><XCircle className="size-3.5" /> Reject</Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        );
      })}

      {picked.size > 0 && (
        <div className="sticky bottom-4 z-20 flex items-center justify-between gap-3 rounded-2xl bg-ink-900 px-5 py-3 text-white shadow-xl">
          <span>{picked.size} selected · <b className="tabular">{inr(pickedTotal)}</b></span>
          <span className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setPicked(new Set())}>Clear</Button>
            <Button size="sm" className="bg-emerald-500 hover:bg-emerald-600" disabled={pending} onClick={() => verify([...picked])}><CheckCheck className="size-4" /> Verify selected</Button>
          </span>
        </div>
      )}

      {rejecting && <RejectDialog p={rejecting} onClose={() => setRejecting(null)} onDone={() => { setRejecting(null); router.refresh(); }} />}
    </div>
  );
}

function RejectDialog({ p, onClose, onDone }: { p: PendingPayment; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const quick = ["Cash not handed over", "UPI not received in bank", "Cheque not received", "Wrong amount entered", "Entered twice"];
  return (
    <Dialog title={`Reject ${inr(p.amount)} from ${p.shop}`} onClose={onClose}>
      <p className="mb-3 text-sm text-slate-600">The payment by {p.salesman} is cancelled and the shop&apos;s bills become due again. He sees the reason in his app.</p>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {quick.map((q) => <button key={q} type="button" onClick={() => setReason(q)} className="rounded-full border border-slate-300 px-2.5 py-1 text-xs hover:bg-slate-50">{q}</button>)}
      </div>
      <Label htmlFor="rr">Reason</Label>
      <Textarea id="rr" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
      {error && <div className="mt-3"><Alert>{error}</Alert></div>}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Keep</Button>
        <Button variant="danger" disabled={pending || !reason.trim()} onClick={() => start(async () => {
          const r = await rejectCollection(p.id, reason);
          if (r.error) setError(r.error); else onDone();
        })}>{pending ? "Rejecting…" : "Reject payment"}</Button>
      </div>
    </Dialog>
  );
}
