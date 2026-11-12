import Link from "next/link";
import type { Metadata } from "next";
import { AlertTriangle } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { WEEKDAYS } from "@/lib/status";
import { todayIST } from "@/lib/gst";
import { Badge, Card, PageHeader, cn } from "@/components/ui";
import { RouteTabs } from "../manager-tabs";
import { allRows } from "@/lib/all-rows";

export const metadata: Metadata = { title: "Salesmen & routes" };

export default async function AssignmentsPage() {
  await requireRole("super_admin", "manager");
  const sb = await createClient();
  const today = todayIST();
  const [{ data: routes }, { data: salesmen }, { data: assigns }, { data: outlets }] = await Promise.all([
    sb.from("routes").select("id, name, code, visit_days, visit_frequency, is_active").is("archived_at", null).order("sort_order").order("name"),
    sb.from("tenant_people").select("id, full_name").eq("role", "salesman").eq("is_active", true).order("full_name"),
    sb.from("route_assignments").select("route_id, salesman_id, status, start_date, end_date").or(`end_date.is.null,end_date.gte.${today}`),
    allRows(() => sb.from("route_outlets").select("route_id").eq("is_active", true).order("id")),
  ]);
  const cnt = new Map<string, number>();
  for (const o of outlets ?? []) cnt.set(o.route_id, (cnt.get(o.route_id) ?? 0) + 1);
  // the assignment that applies today (or the next one if it starts later)
  const cur = new Map<string, NonNullable<typeof assigns>[number]>();
  for (const a of (assigns ?? []).sort((x, y) => x.start_date.localeCompare(y.start_date))) {
    if (a.start_date <= today && (!a.end_date || a.end_date >= today)) cur.set(a.route_id, a);
    else if (!cur.has(a.route_id) && !a.end_date) cur.set(a.route_id, a);
  }
  const rs = (routes ?? []).filter((r) => r.is_active);
  const unassigned = rs.filter((r) => !cur.get(r.id));

  const bySalesman = (salesmen ?? []).map((s) => {
    const mine = rs.filter((r) => cur.get(r.id)?.salesman_id === s.id);
    const week = WEEKDAYS.map((_, i) => mine.filter((r) => r.visit_frequency !== "on_demand" && (r.visit_days as number[]).includes(i + 1)));
    return { s, mine, week, outlets: mine.reduce((t, r) => t + (cnt.get(r.id) ?? 0), 0), clash: week.some((d) => d.length > 1) };
  });

  return (
    <>
      <PageHeader title="Routes" description="Which salesman runs which route, on which days. Change the salesman on the route's Salesman tab." />
      <RouteTabs />
      <div className="space-y-6">
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
              <tr><th className="px-4 py-2.5">Salesman</th>{WEEKDAYS.map((d) => <th key={d} className="px-2 py-2.5 text-center">{d}</th>)}<th className="px-3 py-2.5 text-right">Routes</th><th className="px-4 py-2.5 text-right">Outlets</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {bySalesman.length === 0 && <tr><td colSpan={10} className="px-4 py-10 text-center text-slate-500">No active salesmen.</td></tr>}
              {bySalesman.map(({ s, mine, week, outlets, clash }) => (
                <tr key={s.id} className="align-top">
                  <td className="px-4 py-2.5 font-medium">{s.full_name}{clash && <div className="mt-0.5 flex items-center gap-1 text-xs font-normal text-amber-700"><AlertTriangle className="size-3" /> two routes on one day</div>}</td>
                  {week.map((list, i) => (
                    <td key={i} className={cn("px-1 py-2 text-center text-xs", list.length > 1 && "bg-amber-50")}>
                      {list.length === 0 ? <span className="text-slate-300">—</span> : list.map((r) => <Link key={r.id} href={`/routes/manage/${r.id}`} className="mb-0.5 block truncate rounded bg-slate-100 px-1 py-0.5 font-mono hover:bg-slate-200" title={r.name}>{r.code}</Link>)}
                    </td>
                  ))}
                  <td className="tabular px-3 py-2.5 text-right">{mine.length}</td>
                  <td className="tabular px-4 py-2.5 text-right">{outlets}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card className="overflow-x-auto">
          <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold">All routes</div>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate-500"><tr><th className="px-4 py-2">Route</th><th className="px-3 py-2">Salesman</th><th className="px-3 py-2 text-right">Outlets</th><th className="px-3 py-2">Visit days</th><th className="px-4 py-2">Status</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {rs.map((r) => {
                const a = cur.get(r.id);
                const nm = (salesmen ?? []).find((s) => s.id === a?.salesman_id)?.full_name;
                return (
                  <tr key={r.id}>
                    <td className="px-4 py-2"><Link href={`/routes/manage/${r.id}`} className="font-medium hover:underline">{r.name}</Link> <span className="font-mono text-xs text-slate-400">{r.code}</span></td>
                    <td className="px-3 py-2">{nm ?? "—"}{a && a.start_date > today && <span className="text-xs text-slate-500"> from {a.start_date}</span>}</td>
                    <td className="tabular px-3 py-2 text-right">{cnt.get(r.id) ?? 0}</td>
                    <td className="px-3 py-2 text-xs">{r.visit_frequency === "on_demand" ? "When planned" : (r.visit_days as number[]).map((d) => WEEKDAYS[d - 1]).join(", ")}{r.visit_frequency === "fortnightly" ? " · 2-weekly" : ""}</td>
                    <td className="px-4 py-2">{!a ? <Badge tone="red">No salesman</Badge> : a.status === "paused" ? <Badge tone="amber">Paused</Badge> : a.start_date > today ? <Badge tone="violet">Starts later</Badge> : <Badge tone="green">Active</Badge>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
        {unassigned.length > 0 && <p className="text-sm text-red-700">{unassigned.length} active route{unassigned.length > 1 ? "s have" : " has"} no salesman: {unassigned.map((r) => r.name).join(", ")}.</p>}
      </div>
    </>
  );
}
