"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MapPin, Plus, Search, Store, Trash2, UserPlus, X } from "lucide-react";
import { Alert, Badge, Button, Card, Input, Label, Select, cn } from "@/components/ui";
import { Dialog } from "@/components/dialog";
import { SortableList } from "@/components/sortable";
import { date, inr } from "@/lib/format";
import { OUTLET_FREQUENCY, WEEKDAYS } from "@/lib/status";
import type { OutletInfo, RouteRow, Town } from "@/lib/route-data";
import { addOutlets, removeOutlet, reorderOutlets, saveTown, searchRetailers, setRouteTowns, updateOutlet, type PickRetailer } from "../actions";
import type { Loc } from "./route-editor";

const NO_TOWN = "none";

export function TownsAndOutlets({ routeId, route, towns: townsIn, outlets: outletsIn, locations, archived }: {
  routeId: string; route: RouteRow; towns: Town[]; outlets: OutletInfo[]; locations: Loc[]; archived: boolean;
}) {
  const router = useRouter();
  const [towns, setTowns] = useState(townsIn);
  const [outlets, setOutlets] = useState(outletsIn);
  useEffect(() => setTowns(townsIn), [townsIn]);
  useEffect(() => setOutlets(outletsIn), [outletsIn]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [removeTown, setRemoveTown] = useState<Town | null>(null);
  const [adding, setAdding] = useState<string | null>(null); // town id for the Add outlets dialog
  const [editing, setEditing] = useState<OutletInfo | null>(null);
  const [removing, setRemoving] = useState<OutletInfo | null>(null);

  const countIn = (townId: string | null) => outlets.filter((o) => (o.location_id ?? null) === townId).length;
  const groups = useMemo(() => {
    const g = towns.map((t) => ({ id: t.id, name: t.name, list: outlets.filter((o) => o.location_id === t.id) }));
    const loose = outlets.filter((o) => !o.location_id || !towns.some((t) => t.id === o.location_id));
    if (loose.length) g.push({ id: NO_TOWN, name: "No town set", list: loose });
    return g;
  }, [towns, outlets]);
  const rank = new Map(groups.flatMap((g) => g.list).map((o, i) => [o.retailer_id, i + 1]));

  const run = (fn: () => Promise<{ ok?: boolean; error?: string }>) => start(async () => {
    setError(null);
    const r = await fn();
    if (!r.ok) { setError(r.error ?? "Failed"); setTowns(townsIn); setOutlets(outletsIn); }
    router.refresh();
  });

  function reorderTowns(keys: string[]) {
    setTowns(keys.map((k) => towns.find((t) => t.id === k)!));
    run(() => setRouteTowns(routeId, keys));
  }
  function reorderGroup(townId: string, keys: string[]) {
    const others = outlets.filter((o) => !keys.includes(o.retailer_id));
    setOutlets([...others, ...keys.map((k, i) => ({ ...outlets.find((o) => o.retailer_id === k)!, sequence: (i + 1) * 10 }))]);
    run(() => reorderOutlets(routeId, townId === NO_TOWN ? null : townId, keys));
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[320px_1fr]">
      <div className="space-y-4">
        <Card className="overflow-hidden">
          <div className="border-b border-slate-100 px-4 py-3">
            <div className="font-semibold">Towns in visit order</div>
            <div className="text-xs text-slate-500">Drag or use the arrows. The salesman sees this order.</div>
          </div>
          {towns.length === 0 ? <p className="p-5 text-center text-sm text-slate-500">No towns yet — add the first one below.</p> : (
            <SortableList items={towns} keyOf={(t) => t.id} onReorder={reorderTowns} disabled={archived || pending}
              render={(t, i) => (
                <div className="flex items-center gap-2 py-2.5">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-ink-900 text-xs font-semibold text-white">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">{t.name}</span>
                  <span className="text-xs text-slate-500">{countIn(t.id)}</span>
                  {!archived && <button onClick={() => setRemoveTown(t)} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-700" aria-label={`Remove ${t.name}`}><X className="size-4" /></button>}
                </div>
              )} />
          )}
          {!archived && <AddTown routeTerritory={route.territory_id} towns={towns} locations={locations} pending={pending}
            onAdd={(id) => run(() => setRouteTowns(routeId, [...towns.map((t) => t.id), id]))} onError={setError} />}
        </Card>
        {towns.length > 0 && <p className="px-1 text-xs text-slate-500">Path: {towns.map((t) => t.name).join(" → ")}</p>}
      </div>

      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-sm text-slate-600"><b>{outlets.length}</b> outlets. Drag to change the visit order inside a town.</div>
          {!archived && (
            <div className="ml-auto flex gap-2">
              <Link href={`/retailers/new?route=${routeId}`}><Button variant="secondary"><UserPlus className="size-4" /> New retailer</Button></Link>
              <Button disabled={towns.length === 0} onClick={() => setAdding(towns[0]?.id ?? null)}><Plus className="size-4" /> Add outlets</Button>
            </div>
          )}
        </div>
        {error && <Alert>{error}</Alert>}
        {towns.length === 0 && outlets.length === 0 && <Card className="p-8 text-center text-sm text-slate-500">Add towns first, then add outlets to each town.</Card>}
        {groups.map((g) => (
          <Card key={g.id} className="overflow-hidden">
            <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2.5">
              <MapPin className="size-4 text-slate-400" />
              <span className="font-semibold">{g.name}</span>
              <span className="text-xs text-slate-500">{g.list.length} outlet{g.list.length === 1 ? "" : "s"}</span>
              {!archived && g.id !== NO_TOWN && <button onClick={() => setAdding(g.id)} className="ml-auto text-sm text-accent-700 hover:underline">+ Add here</button>}
            </div>
            {g.list.length === 0 ? <p className="px-4 py-4 text-sm text-slate-500">No outlets in {g.name} yet.</p> : (
              <SortableList items={g.list} keyOf={(o) => o.retailer_id} disabled={archived || pending} onReorder={(k) => reorderGroup(g.id, k)}
                render={(o) => (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5 pr-2">
                    <span className="tabular w-6 text-right text-xs font-semibold text-slate-400">{rank.get(o.retailer_id)}</span>
                    <div className="min-w-48 flex-1">
                      <Link href={`/retailers/${o.retailer_id}`} className="font-medium hover:underline">{o.shop_name}</Link>
                      {o.status !== "active" && <span className="ml-1.5"><Badge tone="amber">{o.status.replace("_", " ")}</Badge></span>}
                      {o.visit_frequency !== "every_visit" && <span className="ml-1.5"><Badge tone="violet">{OUTLET_FREQUENCY[o.visit_frequency]}</Badge></span>}
                      {o.visit_days && <span className="ml-1.5"><Badge>{o.visit_days.map((d) => WEEKDAYS[d - 1]).join(", ")} only</Badge></span>}
                      <div className="truncate text-xs text-slate-500">{[o.owner_name, o.mobile, o.address].filter(Boolean).join(" · ")}{!o.latitude && " · no GPS location"}</div>
                    </div>
                    <div className="text-right text-xs">
                      <div className={cn("tabular font-medium", o.overdue > 0 ? "text-red-700" : "text-slate-700")}>{inr(o.outstanding, { decimals: false })}{o.overdue > 0 && ` (${inr(o.overdue, { decimals: false })} overdue)`}</div>
                      <div className="text-slate-500">visited {o.last_visit ? date(o.last_visit) : "never"} · ordered {o.last_order ? date(o.last_order.date) : "never"}</div>
                    </div>
                    {!archived && (
                      <div className="flex gap-1">
                        <button onClick={() => setEditing(o)} className="rounded px-2 py-1 text-xs text-slate-600 hover:bg-slate-100">Change</button>
                        <button onClick={() => setRemoving(o)} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-700" aria-label={`Remove ${o.shop_name}`}><Trash2 className="size-4" /></button>
                      </div>
                    )}
                  </div>
                )} />
            )}
          </Card>
        ))}
      </div>

      {removeTown && <RemoveTownDialog town={removeTown} count={countIn(removeTown.id)} towns={towns} onClose={() => setRemoveTown(null)}
        onConfirm={async (opt) => {
          const r = await setRouteTowns(routeId, towns.filter((t) => t.id !== removeTown.id).map((t) => t.id), opt);
          if (r.ok) { setRemoveTown(null); router.refresh(); }
          return r;
        }} />}
      {adding !== null && <AddOutletsDialog routeId={routeId} towns={towns} locations={locations} initialTown={adding} onClose={() => setAdding(null)} onDone={() => { setAdding(null); router.refresh(); }} />}
      {editing && <EditOutletDialog routeId={routeId} route={route} outlet={editing} towns={towns} onClose={() => setEditing(null)} onDone={() => { setEditing(null); router.refresh(); }} />}
      {removing && <RemoveOutletDialog routeId={routeId} outlet={removing} onClose={() => setRemoving(null)} onDone={() => { setRemoving(null); router.refresh(); }} />}
    </div>
  );
}

function AddTown({ routeTerritory, towns, locations, pending, onAdd, onError }: { routeTerritory: string | null; towns: Town[]; locations: Loc[]; pending: boolean; onAdd: (id: string) => void; onError: (e: string) => void }) {
  const [pick, setPick] = useState("");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [busy, start] = useTransition();
  const free = locations.filter((l) => l.is_active && !towns.some((t) => t.id === l.id))
    .sort((a, b) => Number(b.territory_id === routeTerritory) - Number(a.territory_id === routeTerritory) || a.name.localeCompare(b.name));
  return (
    <div className="space-y-2 border-t border-slate-100 p-3">
      {!creating ? (
        <div className="flex gap-2">
          <Select value={pick} onChange={(e) => setPick(e.target.value)} className="flex-1" aria-label="Town to add">
            <option value="">Add a town…</option>
            {free.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </Select>
          <Button size="sm" disabled={!pick || pending} onClick={() => { onAdd(pick); setPick(""); }}>Add</Button>
        </div>
      ) : (
        <div className="flex gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New town or village" className="flex-1" autoFocus />
          <Button size="sm" disabled={!name.trim() || busy} onClick={() => start(async () => {
            const r = await saveTown({ name, territoryId: routeTerritory, active: true });
            if (!r.ok) return onError(r.error);
            onAdd(r.id); setName(""); setCreating(false);
          })}>Create</Button>
        </div>
      )}
      <button onClick={() => setCreating((c) => !c)} className="text-xs text-accent-700 hover:underline">{creating ? "Choose an existing town" : "+ Town not in the list"}</button>
    </div>
  );
}

function RemoveTownDialog({ town, count, towns, onClose, onConfirm }: {
  town: Town; count: number; towns: Town[]; onClose: () => void;
  onConfirm: (o: { moveTo?: string | null; removeOutlets?: boolean }) => Promise<{ ok?: boolean; error?: string }>;
}) {
  const others = towns.filter((t) => t.id !== town.id);
  const [mode, setMode] = useState<"move" | "remove">(others.length ? "move" : "remove");
  const [to, setTo] = useState(others[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Dialog title={`Remove ${town.name} from the route`} onClose={onClose}>
      <p className="mb-3 text-sm text-slate-600">The town itself is kept (other routes and retailers still use it); only its place on this route is removed.</p>
      {count > 0 && (
        <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
          <p className="font-medium text-amber-900">{count} outlet{count > 1 ? "s are" : " is"} in {town.name} on this route. What should happen to {count > 1 ? "them" : "it"}?</p>
          {others.length > 0 && (
            <label className="flex items-center gap-2"><input type="radio" checked={mode === "move"} onChange={() => setMode("move")} /> Move to
              <Select value={to} onChange={(e) => setTo(e.target.value)} className="h-8 w-44">{others.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>
            </label>
          )}
          <label className="flex items-center gap-2"><input type="radio" checked={mode === "remove"} onChange={() => setMode("remove")} /> Take them off this route (the retailers and their history stay)</label>
        </div>
      )}
      {error && <div className="mt-3"><Alert>{error}</Alert></div>}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Back</Button>
        <Button className="bg-red-600 hover:bg-red-700" disabled={pending} onClick={() => start(async () => {
          const r = await onConfirm(count === 0 ? {} : mode === "move" ? { moveTo: to } : { removeOutlets: true });
          if (!r.ok) setError(r.error ?? "Failed");
        })}>{pending ? "Saving…" : "Remove town"}</Button>
      </div>
    </Dialog>
  );
}

function AddOutletsDialog({ routeId, towns, locations, initialTown, onClose, onDone }: {
  routeId: string; towns: Town[]; locations: Loc[]; initialTown: string; onClose: () => void; onDone: () => void;
}) {
  const [town, setTown] = useState(initialTown);
  const [q, setQ] = useState("");
  const [filterTown, setFilterTown] = useState(initialTown);
  const [results, setResults] = useState<PickRetailer[]>([]);
  const [picked, setPicked] = useState<Map<string, PickRetailer>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setLoading(true);
      setResults(await searchRetailers(q, filterTown || null));
      setLoading(false);
    }, 250);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [q, filterTown]);

  const toggle = (r: PickRetailer) => setPicked((m) => { const n = new Map(m); if (n.has(r.id)) n.delete(r.id); else n.set(r.id, r); return n; });
  const add = (move: boolean) => start(async () => {
    setError(null);
    const r = await addOutlets(routeId, town, [...picked.keys()], move);
    if (!r.ok) {
      if (r.hint === "ON_OTHER_ROUTE") return setConflict(r.error);
      return setError(r.error);
    }
    onDone();
  });

  return (
    <Dialog title="Add outlets to the route" onClose={onClose} wide>
      <div className="mb-3 grid gap-3 sm:grid-cols-[1fr_200px_200px]">
        <div className="relative"><Search className="absolute top-3 left-3 size-4 text-slate-400" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Shop, owner, mobile or city" className="pl-9" autoFocus /></div>
        <Select value={filterTown} onChange={(e) => setFilterTown(e.target.value)} aria-label="Filter by town">
          <option value="">Any town</option>
          {locations.filter((l) => l.is_active).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </Select>
        <Select value={town} onChange={(e) => setTown(e.target.value)} aria-label="Add to town">{towns.map((t) => <option key={t.id} value={t.id}>Add to {t.name}</option>)}</Select>
      </div>
      <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-slate-200">
        {loading && results.length === 0 && <p className="p-6 text-center text-sm text-slate-500">Searching…</p>}
        {!loading && results.length === 0 && <p className="p-6 text-center text-sm text-slate-500">No retailers found{filterTown ? " in this town — try “Any town”" : ""}.</p>}
        <ul className="divide-y divide-slate-100">
          {results.map((r) => {
            const here = r.route_id === routeId;
            return (
              <li key={r.id}>
                <label className={cn("flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-slate-50", picked.has(r.id) && "bg-accent-50")}>
                  <input type="checkbox" className="size-4 accent-ink-900" checked={picked.has(r.id)} onChange={() => toggle(r)} />
                  <Store className="size-4 text-slate-400" />
                  <span className="min-w-0 flex-1"><span className="font-medium">{r.shop_name}</span><span className="block truncate text-xs text-slate-500">{[r.owner_name, r.mobile, r.city].filter(Boolean).join(" · ")}</span></span>
                  {here ? <Badge tone="green">On this route</Badge> : r.route_name ? <Badge tone="amber">On {r.route_name}</Badge> : <Badge>No route</Badge>}
                </label>
              </li>
            );
          })}
        </ul>
      </div>
      {conflict && (
        <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
          <p className="font-medium text-amber-900">{conflict}</p>
          <p className="mt-1 text-amber-900">A retailer is on one route at a time. Moving takes it off its current route; its invoices, payments and visits are not touched.</p>
          <div className="mt-2 flex gap-2"><Button size="sm" disabled={pending} onClick={() => add(true)}>Move them to this route</Button><Button size="sm" variant="secondary" onClick={() => setConflict(null)}>Back</Button></div>
        </div>
      )}
      {error && <div className="mt-3"><Alert>{error}</Alert></div>}
      <div className="mt-4 flex items-center justify-between gap-2">
        <span className="text-sm text-slate-600">{picked.size} selected</span>
        <div className="flex gap-2"><Button variant="secondary" onClick={onClose}>Close</Button><Button disabled={pending || picked.size === 0 || !!conflict} onClick={() => add(false)}>{pending ? "Adding…" : `Add ${picked.size || ""} to ${towns.find((t) => t.id === town)?.name ?? ""}`}</Button></div>
      </div>
    </Dialog>
  );
}

function EditOutletDialog({ routeId, route, outlet, towns, onClose, onDone }: { routeId: string; route: RouteRow; outlet: OutletInfo; towns: Town[]; onClose: () => void; onDone: () => void }) {
  const [town, setTown] = useState(outlet.location_id ?? "");
  const [freq, setFreq] = useState(outlet.visit_frequency);
  const [days, setDays] = useState<number[]>(outlet.visit_days ?? []);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Dialog title={outlet.shop_name} onClose={onClose}>
      <div className="space-y-3">
        <div><Label>Town on this route</Label><Select value={town} onChange={(e) => setTown(e.target.value)}><option value="">No town</option>{towns.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></div>
        <div><Label>How often</Label><Select value={freq} onChange={(e) => setFreq(e.target.value)}>{Object.entries(OUTLET_FREQUENCY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
          <p className="mt-1 text-xs text-slate-500">Big shops: every route day. Small shops: once a week or every 2 weeks.</p></div>
        {route.visit_days.length > 1 && (
          <div>
            <Label hint="leave all off for every route day">Only on these route days</Label>
            <div className="flex flex-wrap gap-1.5">
              {route.visit_days.map((d) => {
                const on = days.includes(d);
                return <button key={d} type="button" onClick={() => setDays(on ? days.filter((x) => x !== d) : [...days, d].sort())} className={cn("h-9 w-12 rounded-lg border text-sm", on ? "border-ink-900 bg-ink-900 text-white" : "border-slate-300")}>{WEEKDAYS[d - 1]}</button>;
              })}
            </div>
          </div>
        )}
      </div>
      {error && <div className="mt-3"><Alert>{error}</Alert></div>}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Back</Button>
        <Button disabled={pending} onClick={() => start(async () => {
          const r = await updateOutlet(routeId, outlet.retailer_id, town || null, freq, days.length ? days : null);
          if (!r.ok) return setError(r.error);
          onDone();
        })}>{pending ? "Saving…" : "Save"}</Button>
      </div>
    </Dialog>
  );
}

function RemoveOutletDialog({ routeId, outlet, onClose, onDone }: { routeId: string; outlet: OutletInfo; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Dialog title={`Remove ${outlet.shop_name} from the route`} onClose={onClose}>
      <p className="text-sm text-slate-600">Only the route assignment is removed. The retailer, its invoices, payments, balance ({inr(outlet.outstanding)}), orders and visit history all stay. Planned visits that have not started are dropped.</p>
      <div className="mt-3"><Label hint="optional">Reason</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Shop closed, moved to another route" /></div>
      {error && <div className="mt-3"><Alert>{error}</Alert></div>}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Back</Button>
        <Button className="bg-red-600 hover:bg-red-700" disabled={pending} onClick={() => start(async () => {
          const r = await removeOutlet(routeId, outlet.retailer_id, reason);
          if (!r.ok) return setError(r.error);
          onDone();
        })}>{pending ? "Removing…" : "Remove from route"}</Button>
      </div>
    </Dialog>
  );
}
