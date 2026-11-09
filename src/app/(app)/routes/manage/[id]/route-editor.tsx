"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Badge, Button, Card, Input, Label, Select, Textarea, cn } from "@/components/ui";
import { date, dateTime } from "@/lib/format";
import { ROUTE_FREQUENCY, WEEKDAYS } from "@/lib/status";
import type { Assignment, OutletInfo, RouteRow, ScheduleDay, Town } from "@/lib/route-data";
import { archiveRoute, extraDay, saveRoute, skipDay } from "../actions";
import { TownsAndOutlets } from "./towns-outlets";
import { AssignmentPanel } from "./assignment-panel";
import { RouteMap } from "./route-map";

export type Loc = { id: string; name: string; territory_id: string | null; latitude: number | null; longitude: number | null; is_active: boolean };
export type Opt = { id: string; name: string };
type Ev = { id: number; action: string; details: Record<string, unknown> | null; by: string; at: string };

const TABS = [
  { k: "outlets", label: "Towns & outlets" },
  { k: "salesman", label: "Salesman" },
  { k: "schedule", label: "Visit schedule" },
  { k: "map", label: "Map" },
  { k: "details", label: "Details" },
  { k: "history", label: "History" },
] as const;

export function RouteEditor(p: {
  route: RouteRow | null; territories: Opt[]; locations: Loc[]; salesmen: Opt[];
  towns: Town[]; outlets: OutletInfo[]; assignments: Assignment[]; schedule: ScheduleDay[]; events: Ev[];
  today: string; superAdmin: boolean;
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]["k"]>(p.route ? "outlets" : "details");
  if (!p.route) return <DetailsForm {...p} />;
  const current = p.assignments.find((a) => !a.end_date || a.end_date >= p.today);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {p.route.archived_at ? <Badge>Archived</Badge> : p.route.is_active ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}
        <Badge tone="blue">{p.outlets.length} outlets · {p.towns.length} towns</Badge>
        <Badge tone={current ? (current.status === "paused" ? "amber" : "violet") : "red"}>{current ? `${current.salesman}${current.status === "paused" ? " (paused)" : ""}` : "No salesman"}</Badge>
        <Badge>{p.route.visit_frequency === "on_demand" ? "Only when planned" : `${p.route.visit_days.map((d) => WEEKDAYS[d - 1]).join(", ")}${p.route.visit_frequency === "fortnightly" ? " · every 2 weeks" : ""}`}</Badge>
      </div>
      <nav className="-mx-4 overflow-x-auto border-b border-slate-200 px-4 sm:mx-0 sm:px-0">
        <ul className="flex gap-1">
          {TABS.map((t) => (
            <li key={t.k}><button onClick={() => setTab(t.k)} className={cn("border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap", tab === t.k ? "border-accent-500 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800")}>{t.label}</button></li>
          ))}
        </ul>
      </nav>
      {tab === "outlets" && <TownsAndOutlets routeId={p.route.id} route={p.route} towns={p.towns} outlets={p.outlets} locations={p.locations} archived={!!p.route.archived_at} />}
      {tab === "salesman" && <AssignmentPanel routeId={p.route.id} assignments={p.assignments} salesmen={p.salesmen} today={p.today} archived={!!p.route.archived_at} />}
      {tab === "schedule" && <SchedulePanel route={p.route} schedule={p.schedule} salesmen={p.salesmen} current={current ?? null} today={p.today} />}
      {tab === "map" && <RouteMap towns={p.towns} outlets={p.outlets} />}
      {tab === "details" && <DetailsForm {...p} />}
      {tab === "history" && <History events={p.events} salesmen={p.salesmen} assignments={p.assignments} />}
    </div>
  );
}

function DetailsForm({ route, territories, superAdmin }: { route: RouteRow | null; territories: Opt[]; superAdmin: boolean }) {
  const router = useRouter();
  const [name, setName] = useState(route?.name ?? "");
  const [code, setCode] = useState(route?.code ?? "");
  const [territory, setTerritory] = useState(route?.territory_id ?? "");
  const [description, setDescription] = useState(route?.description ?? "");
  const [frequency, setFrequency] = useState<"weekly" | "fortnightly" | "on_demand">(route?.visit_frequency ?? "weekly");
  const [days, setDays] = useState<number[]>(route?.visit_days ?? [1]);
  const [anchor, setAnchor] = useState(route?.fortnight_anchor ?? "");
  const [sort, setSort] = useState(String(route?.sort_order ?? 0));
  const [active, setActive] = useState(route?.is_active ?? true);
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [pending, start] = useTransition();
  const [archiving, setArchiving] = useState(false);
  const [reason, setReason] = useState("");

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <Card className="p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><Label hint="e.g. Ghargaon – Bota – Alephata – Otur">Route name</Label><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoFocus={!route} /></div>
          <div>
            <Label hint={route ? (superAdmin ? "Super Admin can change it" : "set when created") : "leave empty to create it"}>Route code</Label>
            <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} disabled={!!route && !superAdmin} placeholder="GBAO-001" maxLength={20} className="font-mono" />
          </div>
          <div><Label>Territory</Label><Select value={territory} onChange={(e) => setTerritory(e.target.value)}><option value="">—</option>{territories.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></div>
          <div className="sm:col-span-2"><Label hint="optional">Description</Label><Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} /></div>
          <div>
            <Label>Visit frequency</Label>
            <Select value={frequency} onChange={(e) => setFrequency(e.target.value as typeof frequency)}>{Object.entries(ROUTE_FREQUENCY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
          </div>
          <div><Label hint="lower comes first">Route order</Label><Input type="number" min={0} value={sort} onChange={(e) => setSort(e.target.value)} /></div>
          {frequency !== "on_demand" && (
            <div className="sm:col-span-2">
              <Label>Visit days</Label>
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAYS.map((d, i) => {
                  const on = days.includes(i + 1);
                  return <button key={d} type="button" onClick={() => setDays(on ? days.filter((x) => x !== i + 1) : [...days, i + 1].sort())} className={cn("h-9 w-12 rounded-lg border text-sm font-medium", on ? "border-ink-900 bg-ink-900 text-white" : "border-slate-300 hover:border-slate-400")}>{d}</button>;
                })}
              </div>
              <p className="mt-1 text-xs text-slate-500">Twice a week (e.g. Mon + Thu) is fine. Each outlet can also be set to once a week, every 2 weeks or once a month.</p>
            </div>
          )}
          {frequency === "fortnightly" && <div><Label hint="the route runs in this week, then every second week">A week it runs</Label><Input type="date" value={anchor} onChange={(e) => setAnchor(e.target.value)} /></div>}
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" className="size-4 accent-ink-900" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active — visits are planned for this route</label>
        </div>
        {msg.error && <div className="mt-3"><Alert>{msg.error}</Alert></div>}
        {msg.ok && <div className="mt-3"><Alert tone="green">{msg.ok}</Alert></div>}
        <div className="mt-4 flex gap-2">
          <Button disabled={pending || !!route?.archived_at} onClick={() => start(async () => {
            setMsg({});
            const r = await saveRoute({ id: route?.id ?? null, name, code, territoryId: territory, description, frequency, days, anchor, sortOrder: Number(sort) || 0, active });
            if (!r.ok) return setMsg({ error: r.error });
            if (!route) router.push(`/routes/manage/${r.id}`); else { setMsg({ ok: "Saved. The salesman's app shows the change on its next refresh." }); router.refresh(); }
          })}>{pending ? "Saving…" : route ? "Save route" : "Create route"}</Button>
        </div>
      </Card>
      {route && (
        <Card className="h-fit p-5">
          <h3 className="mb-2 font-semibold">{route.archived_at ? "Archived route" : "Archive route"}</h3>
          <p className="mb-3 text-sm text-slate-600">{route.archived_at ? "Restore it to use it again. Its towns and outlets are still attached." : "Stops planning, ends the salesman assignment. Visits, sales and payments stay as they are."}</p>
          {archiving && !route.archived_at && <div className="mb-3"><Label>Reason</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} /></div>}
          <Button variant="secondary" className={route.archived_at ? "" : "text-red-700"} disabled={pending} onClick={() => {
            if (!route.archived_at && !archiving) return setArchiving(true);
            start(async () => {
              const r = await archiveRoute(route.id, !route.archived_at, reason);
              if (!r.ok) return setMsg({ error: r.error });
              setArchiving(false); router.refresh();
            });
          }}>{route.archived_at ? "Restore route" : archiving ? "Yes, archive" : "Archive…"}</Button>
        </Card>
      )}
    </div>
  );
}

const SCHED: Record<string, { label: string; tone: "green" | "amber" | "red" | "slate" | "violet" | "blue" }> = {
  scheduled: { label: "Planned", tone: "green" },
  extra: { label: "Extra day", tone: "violet" },
  skipped: { label: "Skipped", tone: "amber" },
  paused: { label: "Assignment paused", tone: "amber" },
  no_salesman: { label: "No salesman", tone: "red" },
};

function SchedulePanel({ route, schedule, salesmen, current, today }: { route: RouteRow; schedule: ScheduleDay[]; salesmen: Opt[]; current: Assignment | null; today: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [skipFor, setSkipFor] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [xDate, setXDate] = useState(today);
  const [xSm, setXSm] = useState(current?.salesman_id ?? salesmen[0]?.id ?? "");
  const [xNote, setXNote] = useState("");
  const days = schedule.filter((d) => d.status !== "off");
  const sm = new Map(salesmen.map((s) => [s.id, s.name]));
  const run = (fn: () => Promise<{ ok?: boolean; error?: string }>) => start(async () => { setError(null); const r = await fn(); if (!r.ok) setError(r.error ?? "Failed"); else { setSkipFor(null); setReason(""); router.refresh(); } });

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <Card className="overflow-hidden">
        <div className="border-b border-slate-100 px-4 py-3 text-sm">
          <b>Next 3 weeks.</b> {route.visit_frequency === "on_demand" ? "This route runs only on days you add." : `Runs ${route.visit_days.map((d) => WEEKDAYS[d - 1]).join(", ")}${route.visit_frequency === "fortnightly" ? ", every 2 weeks" : ""}.`} Visit lists are made from the outlets on the route each day, so changes show up straight away.
        </div>
        {error && <div className="p-3"><Alert>{error}</Alert></div>}
        <ul className="divide-y divide-slate-100 text-sm">
          {days.length === 0 && <li className="p-8 text-center text-slate-500">No visit days in the next 3 weeks.</li>}
          {days.map((d) => (
            <li key={d.plan_date} className="px-4 py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="w-32 font-medium">{date(d.plan_date)} <span className="text-slate-400">{WEEKDAYS[(new Date(d.plan_date + "T00:00:00Z").getUTCDay() + 6) % 7]}</span></span>
                <Badge tone={SCHED[d.status]?.tone ?? "slate"}>{SCHED[d.status]?.label ?? d.status}</Badge>
                <span className="text-slate-600">{d.outlets} outlet{d.outlets === 1 ? "" : "s"}{d.salesman_id ? ` · ${sm.get(d.salesman_id) ?? ""}` : ""}</span>
                {d.reason && <span className="text-xs text-slate-500">({d.reason})</span>}
                <span className="ml-auto">
                  {d.status === "skipped"
                    ? <button className="text-xs text-accent-700 hover:underline" disabled={pending} onClick={() => run(() => skipDay(route.id, d.plan_date, "", false))}>Undo skip</button>
                    : <button className="text-xs text-slate-500 hover:text-red-700 hover:underline" onClick={() => { setSkipFor(d.plan_date); setReason(""); }}>Skip this day</button>}
                </span>
              </div>
              {skipFor === d.plan_date && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason, e.g. holiday, salesman on leave" className="w-72" autoFocus />
                  <Button size="sm" disabled={pending || !reason.trim()} onClick={() => run(() => skipDay(route.id, d.plan_date, reason, true))}>Skip</Button>
                  <Button size="sm" variant="secondary" onClick={() => setSkipFor(null)}>Back</Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </Card>
      <Card className="h-fit p-5">
        <h3 className="mb-1 font-semibold">Extra or one-time visit day</h3>
        <p className="mb-3 text-sm text-slate-600">Plans every outlet of this route for one day — also to let another salesman cover the route.</p>
        <div className="space-y-3">
          <div><Label>Date</Label><Input type="date" min={today} value={xDate} onChange={(e) => setXDate(e.target.value)} /></div>
          <div><Label>Salesman</Label><Select value={xSm} onChange={(e) => setXSm(e.target.value)}>{salesmen.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></div>
          <div><Label hint="optional">Note</Label><Input value={xNote} onChange={(e) => setXNote(e.target.value)} /></div>
          <Button disabled={pending || !xSm} onClick={() => run(() => extraDay(route.id, xSm, xDate, xNote))}>Plan this day</Button>
        </div>
      </Card>
    </div>
  );
}

const EV: Record<string, string> = {
  created: "Route created", edited: "Details changed", archived: "Archived", restored: "Restored",
  towns_changed: "Towns changed", outlet_added: "Outlet added", outlet_removed: "Outlet removed", outlet_changed: "Outlet changed",
  outlets_reordered: "Outlet order changed", assigned: "Salesman assigned", unassigned: "Salesman removed",
  assignment_paused: "Assignment paused", assignment_resumed: "Assignment resumed", day_skipped: "Day skipped", day_restored: "Skip undone", extra_day: "Extra day planned",
};

function describe(e: Ev) {
  const d = e.details ?? {};
  const pick = (k: string) => (d[k] === undefined || d[k] === null ? null : d[k]);
  const arr = (v: unknown) => (Array.isArray(v) ? v.join(" → ") : String(v));
  const parts: string[] = [];
  if (pick("shop")) parts.push(String(d.shop));
  if (pick("location")) parts.push(Array.isArray(d.location) ? `town ${arr(d.location)}` : `at ${d.location}`);
  if (pick("order")) parts.push(arr(d.order));
  if (pick("added") && Array.isArray(d.added) && d.added.length) parts.push(`added ${(d.added as string[]).join(", ")}`);
  if (pick("removed") && Array.isArray(d.removed) && d.removed.length) parts.push(`removed ${(d.removed as string[]).join(", ")}`);
  if (pick("salesman")) parts.push(`${d.salesman}${d.from ? ` from ${d.from}` : ""}${d.previous ? ` (before: ${d.previous})` : ""}`);
  if (pick("date")) parts.push(String(d.date));
  if (pick("reason")) parts.push(`“${d.reason}”`);
  if (pick("name") && Array.isArray(d.name)) parts.push(`name ${arr(d.name)}`);
  if (pick("days")) parts.push("visit days changed");
  if (pick("frequency")) parts.push(`frequency ${arr(d.frequency)}`);
  if (pick("via")) parts.push(`(via ${d.via})`);
  return parts.join(" · ");
}

function History({ events, assignments }: { events: Ev[]; salesmen: Opt[]; assignments: Assignment[] }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <Card className="overflow-hidden">
        <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold">Changes to this route</div>
        <ul className="divide-y divide-slate-100 text-sm">
          {events.length === 0 && <li className="p-6 text-center text-slate-500">No changes yet.</li>}
          {events.map((e) => (
            <li key={e.id} className="px-4 py-2">
              <span className="font-medium">{EV[e.action] ?? e.action}</span> <span className="text-slate-600">{describe(e)}</span>
              <div className="text-xs text-slate-400">{e.by} · {dateTime(e.at)}</div>
            </li>
          ))}
        </ul>
      </Card>
      <Card className="h-fit overflow-hidden">
        <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold">Salesman history</div>
        <ul className="divide-y divide-slate-100 text-sm">
          {assignments.length === 0 && <li className="p-6 text-center text-slate-500">Never assigned.</li>}
          {assignments.map((a) => (
            <li key={a.id} className="px-4 py-2">
              <div className="font-medium">{a.salesman}</div>
              <div className="text-xs text-slate-500">{date(a.start_date)} → {a.end_date ? (a.end_date < a.start_date ? "replaced before it started" : date(a.end_date)) : "now"}{a.status === "paused" ? " · paused" : ""}{a.notes ? ` · ${a.notes}` : ""}</div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
