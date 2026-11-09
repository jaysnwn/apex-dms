"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Card, Input, Label, Select } from "@/components/ui";
import { extraDay } from "../manage/actions";

// One-time visit day: every outlet of a route, for one date, by any salesman (e.g. a cover).
export function PlanForm({ routes, salesmen, today }: { routes: { id: string; name: string; default_salesman_id: string | null }[]; salesmen: { id: string; name: string }[]; today: string }) {
  const router = useRouter();
  const [route, setRoute] = useState(routes[0]?.id ?? "");
  const [salesman, setSalesman] = useState(routes[0]?.default_salesman_id ?? salesmen[0]?.id ?? "");
  const [day, setDay] = useState(today);
  const [notes, setNotes] = useState("");
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [pending, start] = useTransition();
  return (
    <Card className="p-5">
      <h2 className="mb-1 font-semibold">One-time visit day</h2>
      <p className="mb-4 text-sm text-slate-600">For a special visit or a temporary change: plans every outlet of the route for that date. Regular days come from the route&apos;s schedule.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label>Route</Label>
          <Select value={route} onChange={(e) => { setRoute(e.target.value); const r = routes.find((x) => x.id === e.target.value); if (r?.default_salesman_id) setSalesman(r.default_salesman_id); }}>
            {routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
        </div>
        <div><Label>Salesman</Label><Select value={salesman} onChange={(e) => setSalesman(e.target.value)}>{salesmen.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></div>
        <div><Label>Date</Label><Input type="date" min={today} value={day} onChange={(e) => setDay(e.target.value)} /></div>
        <div className="sm:col-span-2"><Label hint="optional">Note</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
      </div>
      {msg.error && <div className="mt-3"><Alert>{msg.error}</Alert></div>}
      {msg.ok && <div className="mt-3"><Alert tone="green">{msg.ok}</Alert></div>}
      <div className="mt-4"><Button disabled={pending || !route || !salesman} onClick={() => start(async () => {
        setMsg({});
        const r = await extraDay(route, salesman, day, notes);
        if (!r.ok) return setMsg({ error: r.error });
        setMsg({ ok: "Planned. It shows in the salesman's app for that day." }); router.refresh();
      })}>{pending ? "Planning…" : "Plan this day"}</Button></div>
    </Card>
  );
}
