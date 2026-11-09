import Link from "next/link";
import type { Metadata } from "next";
import { ChevronRight, MapPin } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayIST } from "@/lib/gst";
import { WEEKDAYS } from "@/lib/status";

export const metadata: Metadata = { title: "My routes" };

// The routes assigned to this salesman now, with today's progress on each.
export default async function MyRoutesPage() {
  const { user } = await requireRole("salesman", "manager", "super_admin");
  const sb = await createClient();
  const today = todayIST();
  const { data: asg } = await sb.from("route_assignments").select("route_id, status, start_date, end_date")
    .eq("salesman_id", user.id).lte("start_date", today).or(`end_date.is.null,end_date.gte.${today}`);
  const ids = (asg ?? []).map((a) => a.route_id as string);
  const [{ data: routes }, { data: towns }, { data: outlets }, { data: visits }, { data: terr }] = ids.length ? await Promise.all([
    sb.from("routes").select("id, name, code, territory_id, visit_days, visit_frequency, sort_order").in("id", ids).is("archived_at", null).order("sort_order"),
    sb.from("route_locations").select("route_id, sequence, locations(name)").in("route_id", ids).order("sequence"),
    sb.from("route_outlets").select("route_id").in("route_id", ids).eq("is_active", true),
    sb.from("visits").select("route_id, status").eq("salesman_id", user.id).eq("planned_date", today).in("route_id", ids),
    sb.from("territories").select("id, name"),
  ]) : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }];
  const dow = (new Date(today + "T00:00:00Z").getUTCDay() + 6) % 7 + 1;

  return (
    <div className="space-y-4">
      <h1 className="px-1 text-xl font-bold">My routes</h1>
      {(routes ?? []).length === 0 && <div className="rounded-2xl bg-white p-6 text-center text-sm text-slate-500 shadow-sm ring-1 ring-slate-200/70">No route is assigned to you yet. Your manager assigns routes.</div>}
      {(routes ?? []).map((r) => {
        const path = (towns ?? []).filter((t) => t.route_id === r.id).map((t) => (t.locations as unknown as { name: string } | null)?.name ?? "");
        const vs = (visits ?? []).filter((v) => v.route_id === r.id && v.status !== "rescheduled" && v.status !== "cancelled");
        const n = (s: string) => vs.filter((v) => v.status === s).length;
        const paused = (asg ?? []).find((a) => a.route_id === r.id)?.status === "paused";
        const todayRoute = (r.visit_days as number[]).includes(dow) && r.visit_frequency !== "on_demand";
        return (
          <Link key={r.id} href={`/m/routes/${r.id}`} className="block rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70 active:bg-slate-50">
            <div className="flex items-start gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-teal-100 text-teal-700"><MapPin className="size-5" /></span>
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{r.name}</div>
                <div className="text-xs text-slate-500">{r.code}{r.territory_id ? ` · ${(terr ?? []).find((t) => t.id === r.territory_id)?.name ?? ""}` : ""} · {(outlets ?? []).filter((o) => o.route_id === r.id).length} outlets</div>
                {path.length > 0 && <div className="mt-1 text-sm text-slate-700">{path.join(" → ")}</div>}
                <div className="mt-1 text-xs text-slate-500">{r.visit_frequency === "on_demand" ? "When planned" : (r.visit_days as number[]).map((d) => WEEKDAYS[d - 1]).join(", ")}{r.visit_frequency === "fortnightly" ? " · every 2 weeks" : ""}{paused ? " · paused" : ""}</div>
              </div>
              <ChevronRight className="mt-3 size-5 text-slate-300" />
            </div>
            {vs.length > 0 ? (
              <div className="mt-3 grid grid-cols-4 gap-1.5 text-center text-xs">
                <div className="rounded-lg bg-slate-50 p-1.5"><div className="tabular text-base font-bold">{vs.length}</div>planned</div>
                <div className="rounded-lg bg-emerald-50 p-1.5 text-emerald-800"><div className="tabular text-base font-bold">{n("completed")}</div>done</div>
                <div className="rounded-lg bg-amber-50 p-1.5 text-amber-800"><div className="tabular text-base font-bold">{n("planned") + n("in_progress")}</div>pending</div>
                <div className="rounded-lg bg-red-50 p-1.5 text-red-800"><div className="tabular text-base font-bold">{n("missed")}</div>missed</div>
              </div>
            ) : todayRoute && !paused ? <div className="mt-2 text-xs text-slate-500">Today&apos;s visits appear when you open Today&apos;s route.</div> : null}
          </Link>
        );
      })}
    </div>
  );
}
