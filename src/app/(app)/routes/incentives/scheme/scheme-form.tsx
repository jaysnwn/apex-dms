"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Alert, Button, Input, Label, Textarea } from "@/components/ui";
import { inr } from "@/lib/format";
import { saveScheme } from "../actions";

type Row = Record<string, string | number | null>;
const F = [
  ["sales_target", "Monthly sales target before GST (₹)"], ["sales_amount", "Incentive for sales (₹)"],
  ["billed_target", "Shops to bill in the month"], ["billed_amount", "Incentive for shops billed (₹)"],
  ["smart_target", "Smart retailers needed"], ["smart_min_purchase", "Smart: minimum purchase per month (₹, before GST)"],
  ["smart_pay_days", "Smart: pay within (days)"], ["smart_amount", "Incentive for smart retailers (₹)"],
] as const;

type Slab = { min_pct: string; amount: string };

export function SchemeForm({ current, defaultMonth }: { current: Row & { collection_slabs?: unknown }; defaultMonth: string }) {
  const router = useRouter();
  const [month, setMonth] = useState(defaultMonth);
  const [v, setV] = useState<Record<string, string>>(Object.fromEntries(F.map(([k]) => [k, String(Number(current[k]))])));
  const [slabs, setSlabs] = useState<Slab[]>(
    (Array.isArray(current.collection_slabs) ? (current.collection_slabs as { min_pct: number; amount: number }[]) : []).map((x) => ({ min_pct: String(x.min_pct), amount: String(x.amount) }))
  );
  const [notes, setNotes] = useState("");
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [pending, start] = useTransition();
  const max = ["sales_amount", "billed_amount", "smart_amount"].reduce((t, k) => t + (Number(v[k]) || 0), 0) + Math.max(0, ...slabs.map((x) => Number(x.amount) || 0));

  return (
    <div className="space-y-3">
      <div><Label>Starts from month</Label><Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></div>
      <div className="grid grid-cols-2 gap-3">
        {F.map(([k, label]) => (
          <div key={k}><Label>{label}</Label><Input type="number" min={0} step="any" value={v[k]} onChange={(e) => setV((x) => ({ ...x, [k]: e.target.value }))} className="tabular" /></div>
        ))}
      </div>
      <div>
        <Label hint="highest slab reached is paid, not added up">Payment collection slabs</Label>
        <div className="space-y-2">
          {slabs.map((sl, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-sm text-slate-500">From</span>
              <Input type="number" min={0} max={100} step="0.01" value={sl.min_pct} onChange={(e) => setSlabs((x) => x.map((y, j) => (j === i ? { ...y, min_pct: e.target.value } : y)))} className="tabular w-24" aria-label="Minimum %" />
              <span className="text-sm text-slate-500">% → ₹</span>
              <Input type="number" min={0} step="any" value={sl.amount} onChange={(e) => setSlabs((x) => x.map((y, j) => (j === i ? { ...y, amount: e.target.value } : y)))} className="tabular w-28" aria-label="Amount" />
              <button type="button" onClick={() => setSlabs((x) => x.filter((_, j) => j !== i))} className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Remove slab"><Trash2 className="size-4" /></button>
            </div>
          ))}
          <button type="button" onClick={() => setSlabs((x) => [...x, { min_pct: "", amount: "" }])} className="flex items-center gap-1 text-sm font-medium text-sky-700"><Plus className="size-4" /> Add slab</button>
          <p className="text-xs text-slate-500">Below the lowest slab pays ₹0. Collection % = collected in the month ÷ everything due in the month (old overdue included).</p>
        </div>
      </div>
      <div><Label hint="optional">Note</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Festive season target" /></div>
      <p className="text-sm">Maximum per month: <b className="tabular">{inr(max, { decimals: false })}</b></p>
      {msg.error && <Alert>{msg.error}</Alert>}
      {msg.ok && <Alert tone="green">{msg.ok}</Alert>}
      <Button disabled={pending} onClick={() => start(async () => {
        setMsg({});
        const n = (k: string) => Number(v[k]);
        const r = await saveScheme({
          effective_from: month, sales_target: n("sales_target"), sales_amount: n("sales_amount"), billed_target: n("billed_target"), billed_amount: n("billed_amount"),
          smart_target: n("smart_target"), smart_min_purchase: n("smart_min_purchase"), smart_pay_days: n("smart_pay_days"), smart_amount: n("smart_amount"),
          collection_slabs: slabs.filter((x) => x.min_pct !== "").map((x) => ({ min_pct: Number(x.min_pct), amount: Number(x.amount) || 0 })), notes,
        });
        if (r.error) setMsg({ error: r.error }); else { setMsg({ ok: "Scheme saved." }); router.refresh(); }
      })}>{pending ? "Saving…" : "Save scheme"}</Button>
    </div>
  );
}
