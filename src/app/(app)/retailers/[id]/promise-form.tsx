"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Input, Label } from "@/components/ui";
import { savePromise } from "../../payments/actions";
import { todayIST } from "@/lib/gst";

export function PromiseForm({ retailerId }: { retailerId: string }) {
  const [dateV, setDate] = useState(todayIST());
  const [amount, setAmount] = useState("");
  const [remarks, setRemarks] = useState("");
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="grid gap-2 sm:grid-cols-[auto_auto_1fr_auto] sm:items-end">
      <div><Label>Will pay on</Label><Input type="date" value={dateV} min={todayIST()} onChange={(e) => setDate(e.target.value)} /></div>
      <div><Label>Amount (₹)</Label><Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} className="w-32" /></div>
      <div><Label hint="optional">Remarks</Label><Input value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="e.g. After weekly market" /></div>
      <Button disabled={pending} onClick={() => start(async () => {
        const res = await savePromise({ retailerId, date: dateV, amount: Number(amount), remarks });
        setMsg(res.error ? { error: res.error } : { ok: "Promise saved." });
        if (!res.error) { setAmount(""); setRemarks(""); router.refresh(); }
      })}>Add promise</Button>
      {msg.error && <div className="sm:col-span-4"><Alert>{msg.error}</Alert></div>}
      {msg.ok && <div className="sm:col-span-4"><Alert tone="green">{msg.ok}</Alert></div>}
    </div>
  );
}
