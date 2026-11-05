"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Card, Input, Label, Select, cn } from "@/components/ui";
import { planRoute, planWeek } from "../actions";
import { todayIST } from "@/lib/gst";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function PlanForm({ routes, salesmen }: { routes: { id: string; name: string; default_salesman_id: string | null }[]; salesmen: { id: string; name: string }[] }) {
  const [route, setRoute] = useState(routes[0]?.id ?? "");
  const [salesman, setSalesman] = useState(routes[0]?.default_salesman_id ?? salesmen[0]?.id ?? "");
  const [dateV, setDate] = useState(todayIST());
  const [repeat, setRepeat] = useState(false);
  const [days, setDays] = useState<number[]>([]);
  const [weeks, setWeeks] = useState(4);
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [pending, start] = useTransition();
  const router = useRouter();

  return (
    <Card className="p-5">
      <h2 className="mb-4 font-semibold">Plan a route</h2>
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <Label>Route</Label>
          <Select value={route} onChange={(e) => { setRoute(e.target.value); const r = routes.find((x) => x.id === e.target.value); if (r?.default_salesman_id) setSalesman(r.default_salesman_id); }}>
            {routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
        </div>
        <div>
          <Label>Salesman</Label>
          <Select value={salesman} onChange={(e) => setSalesman(e.target.value)}>
            {salesmen.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </div>
        <div>
          <Label>{repeat ? "Starting" : "Date"}</Label>
          <Input type="date" value={dateV} min={todayIST()} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>
      <label className="mt-4 flex items-center gap-2 text-sm"><input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} className="size-4" /> Repeat every week</label>
      {repeat && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {DAYS.map((d, i) => (
            <button key={d} type="button" onClick={() => setDays((s) => (s.includes(i) ? s.filter((x) => x !== i) : [...s, i]))}
              className={cn("rounded-lg border px-3 py-1.5 text-sm", days.includes(i) ? "border-ink-900 bg-ink-900 text-white" : "border-slate-300")}>{d}</button>
          ))}
          <span className="ml-2 text-sm text-slate-500">for</span>
          <Input type="number" min={1} max={12} value={weeks} onChange={(e) => setWeeks(Number(e.target.value))} className="w-20" />
          <span className="text-sm text-slate-500">weeks</span>
        </div>
      )}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button disabled={pending || !route || !salesman} onClick={() => start(async () => {
          setMsg({});
          const res = repeat
            ? await planWeek({ routeId: route, salesmanId: salesman, startDate: dateV, weekdays: days, weeks })
            : await planRoute({ routeId: route, salesmanId: salesman, date: dateV });
          if (res.error) setMsg({ error: res.error });
          else { setMsg({ ok: repeat ? `Planned ${"count" in res ? res.count : 0} day(s).` : "Route planned. Visits created for every retailer on the route." }); router.refresh(); }
        })}>{pending ? "Planning…" : "Plan route"}</Button>
        {msg.error && <Alert>{msg.error}</Alert>}
        {msg.ok && <Alert tone="green">{msg.ok}</Alert>}
      </div>
      {routes.length === 0 && <p className="mt-3 text-sm text-amber-700">Create routes first under Retailers → Routes, and assign retailers to them.</p>}
    </Card>
  );
}
