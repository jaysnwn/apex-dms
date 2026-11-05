"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Card, Input, Label, Select } from "@/components/ui";
import { saveTarget } from "../actions";
import { todayIST } from "@/lib/gst";

export function TargetForm({ salesmen }: { salesmen: { id: string; name: string }[] }) {
  const t = todayIST();
  const monthEnd = new Date(Date.UTC(Number(t.slice(0, 4)), Number(t.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const [s, setS] = useState(salesmen[0]?.id ?? "");
  const [start, setStart] = useState(t.slice(0, 8) + "01");
  const [end, setEnd] = useState(monthEnd);
  const [sales, setSales] = useState("");
  const [collection, setCollection] = useState("");
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [pending, go] = useTransition();
  const router = useRouter();
  return (
    <Card className="p-5">
      <h2 className="mb-4 font-semibold">Set a target</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><Label>Salesman</Label><Select value={s} onChange={(e) => setS(e.target.value)}>{salesmen.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></div>
        <div><Label>From</Label><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></div>
        <div><Label>To</Label><Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
        <div><Label>Sales target (₹)</Label><Input type="number" min={0} value={sales} onChange={(e) => setSales(e.target.value)} /></div>
        <div><Label>Collection target (₹)</Label><Input type="number" min={0} value={collection} onChange={(e) => setCollection(e.target.value)} /></div>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <Button disabled={pending} onClick={() => go(async () => {
          const res = await saveTarget({ salesmanId: s, start, end, sales: Number(sales), collection: Number(collection) });
          setMsg(res.error ? { error: res.error } : { ok: "Target saved." });
          if (!res.error) router.refresh();
        })}>Save target</Button>
        {msg.error && <Alert>{msg.error}</Alert>}
        {msg.ok && <Alert tone="green">{msg.ok}</Alert>}
      </div>
    </Card>
  );
}
