import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CheckCircle2, Clock, IndianRupee, MapPin, Radio, ShoppingCart, XCircle } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { dateTime, inr } from "@/lib/format";
import { GEO_STATUS, VISIT_STATUS } from "@/lib/status";
import { addDays, todayIST } from "@/lib/gst";
import { Badge, Button, Card, Input, PageHeader, cn } from "@/components/ui";
import { StatCard } from "@/components/stat-card";
import { RouteMapView, type MapPerson, type MapStop } from "@/components/route-map";
import { RouteTabs } from "./manager-tabs";

export const metadata: Metadata = { title: "Routes" };

type V = {
  id: string; retailer_id: string; salesman_id: string; route_id: string | null; status: string; checkin_at: string | null; checkout_at: string | null;
  remarks: string | null; missed_reason: string | null; geo_status: string | null; distance_m: number | null; latitude: number | null; longitude: number | null;
  planned_sequence: number | null; source: string; retailers: { shop_name: string; route_sequence: number | null; latitude: number | null; longitude: number | null } | null;
};

const ago = (iso: string) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
};

export default async function RoutesMonitor({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { profile } = await requireRole("super_admin", "manager", "salesman");
  if (profile.role === "salesman") redirect("/m/route");
  const sp = await searchParams;
  const today = todayIST();
  const day = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date! : today;
  const sb = await createClient();

  // Make sure the day's planned visits exist (idempotent; only today .. 31 days ahead).
  if (day >= today && day <= addDays(today, 31)) await sb.rpc("generate_route_visits", { p_date: day, p_route: null });

  const [{ data: visits }, { data: salesmen }, { data: routes }, { data: pays }, { data: invs }, { data: locs }, { data: settings }] = await Promise.all([
    sb.from("visits").select("id, retailer_id, salesman_id, route_id, status, checkin_at, checkout_at, remarks, missed_reason, geo_status, distance_m, latitude, longitude, planned_sequence, source, retailers(shop_name, route_sequence, latitude, longitude)")
      .eq("planned_date", day).not("status", "in", "(cancelled)").limit(3000),
    sb.from("profiles").select("id, full_name, share_location").eq("role", "salesman").eq("is_active", true).order("full_name"),
    sb.from("routes").select("id, name, code, sort_order"),
    sb.from("payments").select("collected_by, amount").eq("payment_date", day).in("status", ["received", "cheque_pending"]),
    sb.from("invoices").select("grand_total, orders(salesman_id)").eq("invoice_date", day).eq("status", "issued"),
    sb.from("salesman_locations").select("salesman_id, recorded_at, latitude, longitude, accuracy_m, source").gte("recorded_at", new Date(Date.now() - 3 * 864e5).toISOString()).order("recorded_at", { ascending: false }).limit(2000),
    sb.from("company_settings").select("live_location_minutes, geofence_radius_m").eq("id", 1).maybeSingle(),
  ]);
  const liveMin = Number(settings?.live_location_minutes ?? 10);
  const rName = new Map((routes ?? []).map((r) => [r.id as string, r.name as string]));
  const rOrder = new Map((routes ?? []).map((r) => [r.id as string, Number(r.sort_order)]));
  const lastLoc = new Map<string, NonNullable<typeof locs>[number]>();
  for (const l of locs ?? []) if (!lastLoc.has(l.salesman_id)) lastLoc.set(l.salesman_id, l);
  const all = ((visits ?? []) as unknown as V[]);

  const per = (salesmen ?? []).map((s) => {
    const vs = all.filter((v) => v.salesman_id === s.id).sort((a, b) =>
      (rOrder.get(a.route_id ?? "") ?? 9e9) - (rOrder.get(b.route_id ?? "") ?? 9e9) ||
      (a.retailers?.route_sequence ?? a.planned_sequence ?? 9e9) - (b.retailers?.route_sequence ?? b.planned_sequence ?? 9e9));
    const n = (st: string) => vs.filter((v) => v.status === st).length;
    const lastCheckin = vs.map((v) => v.checkin_at).filter(Boolean).sort().pop() ?? null;
    const loc = lastLoc.get(s.id);
    const live = !!loc && loc.source === "ping" && Date.now() - Date.parse(loc.recorded_at) <= liveMin * 60000;
    return {
      id: s.id as string, name: s.full_name as string, sharing: !!s.share_location,
      routes: [...new Set(vs.map((v) => v.route_id).filter(Boolean) as string[])].map((id) => rName.get(id) ?? "Route"),
      planned: vs.filter((v) => v.status !== "rescheduled").length, done: n("completed"), here: n("in_progress"), todo: n("planned"), missed: n("missed"), moved: n("rescheduled"),
      verified: vs.filter((v) => v.geo_status === "verified").length, outside: vs.filter((v) => v.geo_status === "outside").length,
      collected: (pays ?? []).filter((p) => p.collected_by === s.id).reduce((t, p) => t + Number(p.amount), 0),
      sold: (invs ?? []).filter((i) => (i.orders as unknown as { salesman_id: string } | null)?.salesman_id === s.id).reduce((t, i) => t + Number(i.grand_total), 0),
      lastCheckin, loc, live, visits: vs,
    };
  }).sort((a, b) => b.planned - a.planned || a.name.localeCompare(b.name));
  const tot = (k: "planned" | "done" | "here" | "todo" | "missed" | "collected" | "sold") => per.reduce((t, p) => t + p[k], 0);
  const pct = (done: number, planned: number) => (planned ? Math.round((done / planned) * 1000) / 10 : 0);

  const stops: MapStop[] = all.filter((v) => v.retailers?.latitude != null && v.retailers?.longitude != null && v.status !== "rescheduled").map((v) => ({
    id: v.id, label: `${v.retailers!.shop_name} — ${(salesmen ?? []).find((s) => s.id === v.salesman_id)?.full_name ?? ""}`,
    n: v.retailers?.route_sequence ?? v.planned_sequence ?? 0, lat: Number(v.retailers!.latitude), lng: Number(v.retailers!.longitude),
    state: v.status === "completed" ? "done" : v.status === "missed" ? "missed" : v.status === "in_progress" ? "here" : "todo",
  }));
  const people: MapPerson[] = per.filter((p) => p.loc && (day === today)).map((p) => ({
    id: p.id, label: p.name, lat: Number(p.loc!.latitude), lng: Number(p.loc!.longitude), live: p.live,
    note: p.live ? `live, ${ago(p.loc!.recorded_at)}` : `last known ${ago(p.loc!.recorded_at)} (${p.loc!.source.replace("_", "-")})`,
  }));

  return (
    <>
      <PageHeader title="Routes" description="Planned versus actual visits by salesman — from the visit records, not estimates." />
      <RouteTabs />
      <form className="mb-5 flex flex-wrap items-center gap-2">
        <Input type="date" name="date" defaultValue={day} className="w-44" aria-label="Date" />
        <Button type="submit" variant="secondary">Show</Button>
        {day !== today && <Link href="/routes" className="text-sm text-accent-700 hover:underline">Today</Link>}
      </form>
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Visited" value={`${tot("done")} / ${tot("planned")}`} icon={CheckCircle2} tone="green" hint={`${pct(tot("done"), tot("planned"))}% done`} />
        <StatCard label="At a shop now / to visit" value={`${tot("here")} / ${tot("todo")}`} icon={Clock} tone="amber" />
        <StatCard label="Missed" value={String(tot("missed"))} icon={XCircle} tone="red" alert={tot("missed") > 0} />
        <StatCard label="Collected" value={inr(tot("collected"), { decimals: false })} icon={IndianRupee} tone="teal" />
        <StatCard label="Invoiced" value={inr(tot("sold"), { decimals: false })} icon={ShoppingCart} tone="blue" />
      </div>

      <div className="space-y-4">
        {per.map((p) => {
          const pc = pct(p.done, p.planned);
          return (
            <Card key={p.id} className="overflow-hidden">
              <details>
                <summary className="flex cursor-pointer list-none flex-col gap-3 p-4 lg:flex-row lg:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{p.name}</div>
                    <div className="text-sm text-slate-500">{p.routes.length ? p.routes.join(" + ") : "No route today"}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-slate-500">
                      {p.lastCheckin && <span>Last check-in {new Date(p.lastCheckin).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>}
                      {p.loc && day === today ? (
                        <a href={`https://maps.google.com/?q=${p.loc.latitude},${p.loc.longitude}`} target="_blank" rel="noopener" className={cn("inline-flex items-center gap-1 hover:underline", p.live ? "font-medium text-violet-700" : "text-slate-500")}>
                          {p.live ? <Radio className="size-3" /> : <MapPin className="size-3" />}
                          {p.live ? `Live · ${ago(p.loc.recorded_at)}` : `Last known · ${ago(p.loc.recorded_at)} (${p.loc.source === "ping" ? "app" : p.loc.source.replace("_", "-")})`}
                        </a>
                      ) : day === today && <span>{p.sharing ? "No location yet" : "Location sharing off"}</span>}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-sm">
                    <Badge tone="green">{p.done} visited</Badge>
                    {p.here > 0 && <Badge tone="blue">{p.here} at shop</Badge>}
                    <Badge tone="amber">{p.todo} pending</Badge>
                    {p.missed > 0 && <Badge tone="red">{p.missed} missed</Badge>}
                    {p.outside > 0 && <Badge tone="red">{p.outside} outside shop area</Badge>}
                    <span className="tabular text-teal-700">{inr(p.collected, { decimals: false })} collected</span>
                    <span className="tabular text-sky-700">{inr(p.sold, { decimals: false })} sold</span>
                  </div>
                  <div className="w-full lg:w-36">
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className={cn("h-full", pc >= 100 ? "bg-emerald-500" : "bg-accent-500")} style={{ width: `${Math.min(100, pc)}%` }} /></div>
                    <div className="tabular mt-0.5 text-right text-xs text-slate-500">{p.done}/{p.planned} · {pc}%</div>
                  </div>
                </summary>
                {p.visits.length > 0 && (
                  <ul className="divide-y divide-slate-100 border-t border-slate-100 text-sm">
                    {p.visits.map((v) => (
                      <li key={v.id} className="flex flex-wrap items-center gap-2 px-4 py-2">
                        <span className="tabular w-6 text-right text-xs text-slate-400">{v.retailers?.route_sequence ?? ""}</span>
                        <Link href={`/retailers/${v.retailer_id}`} className="min-w-0 flex-1 truncate hover:underline">{v.retailers?.shop_name}</Link>
                        {v.source === "unplanned" && <Badge tone="violet">Not planned</Badge>}
                        <Badge tone={VISIT_STATUS[v.status]?.tone ?? "slate"}>{VISIT_STATUS[v.status]?.label ?? v.status}</Badge>
                        {v.geo_status && <Badge tone={GEO_STATUS[v.geo_status].tone}>{GEO_STATUS[v.geo_status].label}{v.distance_m != null ? ` · ${Math.round(Number(v.distance_m))} m` : ""}</Badge>}
                        {v.checkin_at && <span className="text-xs text-slate-500">{new Date(v.checkin_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}{v.checkout_at ? `–${new Date(v.checkout_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}` : ""}</span>}
                        {v.latitude != null && <a href={`https://maps.google.com/?q=${v.latitude},${v.longitude}`} target="_blank" rel="noopener" className="text-accent-700" aria-label="Check-in location"><MapPin className="size-4" /></a>}
                        {(v.missed_reason || v.remarks) && <span className="w-full pl-8 text-xs text-slate-500">{v.status === "missed" ? `Reason: ${v.missed_reason}` : v.remarks}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </details>
            </Card>
          );
        })}
        {per.length === 0 && <Card className="p-8 text-center text-sm text-slate-500">No active salesmen. Add users with the Salesman role first.</Card>}
      </div>

      {(stops.length > 0 || people.length > 0) && (
        <Card className="mt-6 p-4">
          <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
            <span className="font-semibold">Map</span>
            <span className="flex items-center gap-1 text-xs"><span className="size-3 rounded-full bg-emerald-600" /> visited</span>
            <span className="flex items-center gap-1 text-xs"><span className="size-3 rounded-full bg-blue-600" /> at shop</span>
            <span className="flex items-center gap-1 text-xs"><span className="size-3 rounded-full bg-amber-600" /> to visit</span>
            <span className="flex items-center gap-1 text-xs"><span className="size-3 rounded-full bg-red-600" /> missed</span>
            <span className="flex items-center gap-1 text-xs"><span className="size-3 rounded-full bg-violet-600" /> salesman live</span>
            <span className="flex items-center gap-1 text-xs"><span className="size-3 rounded-full bg-slate-400" /> last known position</span>
          </div>
          <RouteMapView stops={stops} people={people} height={460} />
          <p className="mt-2 text-xs text-slate-500">Shops appear only when their location is saved. “Live” means the salesman&apos;s app sent its position in the last {liveMin} minutes with sharing switched on; anything older is shown as last known.</p>
        </Card>
      )}
      <p className="mt-4 text-xs text-slate-400">{dateTime(new Date().toISOString())}</p>
    </>
  );
}
