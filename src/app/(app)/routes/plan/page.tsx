import Link from "next/link";
import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { WEEKDAYS } from "@/lib/status";
import { addDays, todayIST } from "@/lib/gst";
import { loadSchedule } from "@/lib/route-data";
import { Card, PageHeader, cn } from "@/components/ui";
import { RouteTabs } from "../manager-tabs";
import { PlanForm } from "./plan-form";

export const metadata: Metadata = { title: "Visit schedule" };

const TONE: Record<string, string> = {
  scheduled: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  extra: "bg-violet-50 text-violet-800 ring-violet-200",
  skipped: "bg-amber-50 text-amber-800 ring-amber-200 line-through",
  paused: "bg-amber-50 text-amber-800 ring-amber-200",
  no_salesman: "bg-red-50 text-red-800 ring-red-200",
};

export default async function PlanPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  await requireRole("super_admin", "manager");
  const sp = await searchParams;
  const today = todayIST();
  const from = /^\d{4}-\d{2}-\d{2}$/.test(sp.from ?? "") && sp.from! >= today ? sp.from! : today;
  const sb = await createClient();
  const [schedule, { data: routes }, { data: salesmen }] = await Promise.all([
    loadSchedule(sb, from, 14),
    sb.from("routes").select("id, name, code, default_salesman_id").eq("is_active", true).is("archived_at", null).order("sort_order").order("name"),
    sb.from("profiles").select("id, full_name").eq("role", "salesman").eq("is_active", true).order("full_name"),
  ]);
  const days = Array.from({ length: 14 }, (_, i) => addDays(from, i));
  const rMap = new Map((routes ?? []).map((r) => [r.id as string, r]));
  const active = schedule.filter((s) => s.status !== "off");
  const rows = [
    ...(salesmen ?? []).map((s) => ({ id: s.id as string, name: s.full_name as string })),
    ...(active.some((s) => !s.salesman_id) ? [{ id: "", name: "No salesman" }] : []),
  ];
  const cell = (sid: string, d: string) => active.filter((s) => (s.salesman_id ?? "") === sid && s.plan_date === d);

  return (
    <>
      <PageHeader title="Routes" description="The next two weeks as the schedule will plan them. Days and outlet frequencies are set on each route; skip a day or add one on the route's schedule tab." />
      <RouteTabs />
      <div className="mb-3 flex items-center gap-3 text-sm">
        {from > today && <Link href={`/routes/plan?from=${addDays(from, -14) < today ? today : addDays(from, -14)}`} className="text-accent-700 hover:underline">← Earlier</Link>}
        <span className="text-slate-600">{from} to {days[13]}</span>
        <Link href={`/routes/plan?from=${addDays(from, 14)}`} className="text-accent-700 hover:underline">Later →</Link>
      </div>
      <Card className="mb-6 overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
            <tr>
              <th className="sticky left-0 bg-slate-50 px-3 py-2 text-left">Salesman</th>
              {days.map((d) => {
                const dow = (new Date(d + "T00:00:00Z").getUTCDay() + 6) % 7;
                return <th key={d} className={cn("min-w-20 px-1 py-2 text-center font-medium", d === today && "text-accent-700", dow === 6 && "bg-slate-100")}>{WEEKDAYS[dow]}<div className="font-normal">{d.slice(8)}/{d.slice(5, 7)}</div></th>;
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 && <tr><td colSpan={15} className="px-4 py-10 text-center text-sm text-slate-500">No salesmen or routes yet.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id || "none"} className="align-top">
                <td className="sticky left-0 bg-white px-3 py-2 text-sm font-medium whitespace-nowrap">{r.name}</td>
                {days.map((d) => (
                  <td key={d} className="px-1 py-1.5">
                    {cell(r.id, d).map((s) => {
                      const route = rMap.get(s.route_id);
                      return (
                        <Link key={s.route_id} href={`/routes/manage/${s.route_id}`} title={`${route?.name} · ${s.outlets} outlets${s.reason ? ` · ${s.reason}` : ""}`}
                          className={cn("mb-1 block rounded px-1 py-0.5 text-center ring-1 hover:brightness-95", TONE[s.status] ?? "bg-slate-50 ring-slate-200")}>
                          <span className="font-mono">{route?.code}</span> <span className="tabular">· {s.outlets}</span>
                        </Link>
                      );
                    })}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex flex-wrap gap-3 border-t border-slate-100 px-3 py-2 text-[11px] text-slate-500">
          <span><span className="rounded bg-emerald-50 px-1 ring-1 ring-emerald-200">CODE · n</span> planned, n outlets</span>
          <span><span className="rounded bg-violet-50 px-1 ring-1 ring-violet-200">extra</span> one-time day</span>
          <span><span className="rounded bg-amber-50 px-1 ring-1 ring-amber-200">skipped / paused</span></span>
          <span><span className="rounded bg-red-50 px-1 ring-1 ring-red-200">no salesman</span></span>
        </div>
      </Card>
      <div className="max-w-xl">
        <PlanForm routes={(routes ?? []).map((r) => ({ id: r.id, name: `${r.name} (${r.code})`, default_salesman_id: r.default_salesman_id }))} salesmen={(salesmen ?? []).map((s) => ({ id: s.id, name: s.full_name }))} today={today} />
      </div>
    </>
  );
}
