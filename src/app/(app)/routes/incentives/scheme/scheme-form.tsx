"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Input, Label, Textarea } from "@/components/ui";
import { inr } from "@/lib/format";
import { saveScheme } from "../actions";

type Row = Record<string, string | number | null>;
const F = [
  ["sales_target", "Monthly sales target before GST (₹)"], ["sales_amount", "Incentive for sales (₹)"],
  ["billed_target", "Shops to bill in the month"], ["billed_amount", "Incentive for shops billed (₹)"],
  ["smart_target", "Smart retailers needed"], ["smart_min_purchase", "Smart: minimum purchase per month (₹, before GST)"],
  ["smart_pay_days", "Smart: pay within (days)"], ["smart_amount", "Incentive for smart retailers (₹)"],
  ["recovery_pct", "Recovery needed (%)"], ["recovery_amount", "Incentive for recovery (₹)"],
] as const;

export function SchemeForm({ current, defaultMonth }: { current: Row; defaultMonth: string }) {
  const router = useRouter();
  const [month, setMonth] = useState(defaultMonth);
  const [v, setV] = useState<Record<string, string>>(Object.fromEntries(F.map(([k]) => [k, String(Number(current[k]))])));
  const [notes, setNotes] = useState("");
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [pending, start] = useTransition();
  const max = ["sales_amount", "billed_amount", "smart_amount", "recovery_amount"].reduce((t, k) => t + (Number(v[k]) || 0), 0);

  return (
    <div className="space-y-3">
      <div><Label>Starts from month</Label><Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></div>
      <div className="grid grid-cols-2 gap-3">
        {F.map(([k, label]) => (
          <div key={k}><Label>{label}</Label><Input type="number" min={0} step="any" value={v[k]} onChange={(e) => setV((x) => ({ ...x, [k]: e.target.value }))} className="tabular" /></div>
        ))}
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
          recovery_pct: n("recovery_pct"), recovery_amount: n("recovery_amount"), notes,
        });
        if (r.error) setMsg({ error: r.error }); else { setMsg({ ok: "Scheme saved." }); router.refresh(); }
      })}>{pending ? "Saving…" : "Save scheme"}</Button>
    </div>
  );
}
