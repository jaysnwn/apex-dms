"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Badge, Button, Card, Input, Label, Select } from "@/components/ui";
import { date } from "@/lib/format";
import type { Assignment } from "@/lib/route-data";
import { assignRoute, pauseAssignment, unassignRoute } from "../actions";
import type { Opt } from "./route-editor";

export function AssignmentPanel({ routeId, assignments, salesmen, today, archived }: { routeId: string; assignments: Assignment[]; salesmen: Opt[]; today: string; archived: boolean }) {
  const router = useRouter();
  const current = assignments.find((a) => !a.end_date);
  const running = assignments.find((a) => a.start_date <= today && (!a.end_date || a.end_date >= today));
  const [who, setWho] = useState(salesmen.find((s) => s.id !== current?.salesman_id)?.id ?? "");
  const [from, setFrom] = useState(today);
  const [note, setNote] = useState("");
  const [lastDay, setLastDay] = useState(today);
  const [confirm, setConfirm] = useState<null | "assign" | "end">(null);
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok?: boolean; error?: string }>, ok: string) => start(async () => {
    setMsg({});
    const r = await fn();
    if (!r.ok) return setMsg({ error: r.error });
    setMsg({ ok }); setConfirm(null); setNote(""); router.refresh();
  });
  const name = (id: string) => salesmen.find((s) => s.id === id)?.name ?? "";

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="p-5">
        <h3 className="mb-3 font-semibold">Who runs this route</h3>
        {running ? (
          <div className="mb-4 rounded-xl bg-slate-50 p-4">
            <div className="text-lg font-semibold">{running.salesman} {running.status === "paused" && <Badge tone="amber">Paused</Badge>}</div>
            <div className="text-sm text-slate-500">since {date(running.start_date)}{running.end_date ? ` · last day ${date(running.end_date)}` : ""}</div>
          </div>
        ) : <Alert tone="amber">No salesman runs this route today, so no visits are planned for it.</Alert>}
        {current && current !== running && <p className="mb-3 text-sm text-slate-600">{current.salesman} takes over on {date(current.start_date)}.</p>}
        {msg.error && <div className="mb-3"><Alert>{msg.error}</Alert></div>}
        {msg.ok && <div className="mb-3"><Alert tone="green">{msg.ok}</Alert></div>}
        {!archived && current && (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" disabled={pending} onClick={() => run(() => pauseAssignment(routeId, current.status !== "paused"), current.status === "paused" ? "Resumed — visits are planned again." : "Paused — no new visits until you resume.")}>
              {current.status === "paused" ? "Resume" : "Pause for now"}
            </Button>
            <Button variant="secondary" className="text-red-700" onClick={() => setConfirm(confirm === "end" ? null : "end")}>End assignment…</Button>
          </div>
        )}
        {confirm === "end" && current && (
          <div className="mt-3 rounded-lg border border-slate-200 p-3">
            <Label>Last day for {current.salesman}</Label>
            <div className="flex gap-2"><Input type="date" min={today} value={lastDay} onChange={(e) => setLastDay(e.target.value)} className="w-44" />
              <Button className="bg-red-600 hover:bg-red-700" disabled={pending} onClick={() => run(() => unassignRoute(routeId, lastDay), "Assignment ended. The route has no salesman after that day.")}>End</Button></div>
          </div>
        )}
      </Card>

      {!archived && (
        <Card className="p-5">
          <h3 className="mb-1 font-semibold">{current ? "Change salesman" : "Assign a salesman"}</h3>
          <p className="mb-3 text-sm text-slate-600">Visits already made, sales and collections stay with whoever made them. Visits planned from the start date move to the new salesman.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label>Salesman</Label><Select value={who} onChange={(e) => setWho(e.target.value)}><option value="">Choose…</option>{salesmen.map((s) => <option key={s.id} value={s.id}>{s.name}{s.id === current?.salesman_id ? " (current)" : ""}</option>)}</Select></div>
            <div><Label>From</Label><Input type="date" min={today} value={from} onChange={(e) => setFrom(e.target.value)} /></div>
            <div className="sm:col-span-2"><Label hint="optional">Note</Label><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Covering while Ramesh is on leave" /></div>
          </div>
          {confirm === "assign" ? (
            <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
              {current ? <>Move the route from <b>{current.salesman}</b> to <b>{name(who)}</b> from <b>{date(from)}</b>?</> : <>Assign <b>{name(who)}</b> from <b>{date(from)}</b>?</>}
              <div className="mt-2 flex gap-2"><Button size="sm" disabled={pending} onClick={() => run(() => assignRoute(routeId, who, from, note), "Saved. The salesman sees the route in the app.")}>Yes</Button><Button size="sm" variant="secondary" onClick={() => setConfirm(null)}>Back</Button></div>
            </div>
          ) : (
            <div className="mt-4"><Button disabled={!who || who === current?.salesman_id} onClick={() => setConfirm("assign")}>{current ? "Change salesman" : "Assign"}</Button></div>
          )}
        </Card>
      )}

      <Card className="overflow-hidden lg:col-span-2">
        <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold">Assignment history</div>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-slate-500"><tr><th className="px-4 py-2">Salesman</th><th className="px-3 py-2">From</th><th className="px-3 py-2">To</th><th className="px-3 py-2">Status</th><th className="px-4 py-2">Note</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {assignments.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-500">Never assigned.</td></tr>}
            {assignments.map((a) => (
              <tr key={a.id}>
                <td className="px-4 py-2 font-medium">{a.salesman}</td>
                <td className="px-3 py-2">{date(a.start_date)}</td>
                <td className="px-3 py-2">{a.end_date ? (a.end_date < a.start_date ? "never started" : date(a.end_date)) : "—"}</td>
                <td className="px-3 py-2">{!a.end_date ? (a.status === "paused" ? <Badge tone="amber">Paused</Badge> : a.start_date > today ? <Badge tone="violet">Starts later</Badge> : <Badge tone="green">Current</Badge>) : <Badge>Ended</Badge>}</td>
                <td className="px-4 py-2 text-slate-500">{a.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
