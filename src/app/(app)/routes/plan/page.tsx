import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { date } from "@/lib/format";
import { todayIST } from "@/lib/gst";
import { Card, PageHeader } from "@/components/ui";
import { RouteTabs } from "../manager-tabs";
import { PlanForm } from "./plan-form";

export const metadata: Metadata = { title: "Plan routes" };

export default async function PlanPage() {
  await requireRole("super_admin", "manager");
  const supabase = await createClient();
  const [{ data: routes }, { data: salesmen }, { data: plans }, { data: counts }] = await Promise.all([
    supabase.from("routes").select("id, name, default_salesman_id").eq("is_active", true).order("name"),
    supabase.from("profiles").select("id, full_name").eq("role", "salesman").eq("is_active", true).order("full_name"),
    supabase.from("route_plans").select("id, plan_date, salesman_id, route_id, routes(name)").gte("plan_date", todayIST()).order("plan_date").limit(100),
    supabase.from("visits").select("route_plan_id, status").gte("planned_date", todayIST()),
  ]);
  const names = new Map((salesmen ?? []).map((s) => [s.id as string, s.full_name as string]));
  const cnt = new Map<string, number>();
  for (const v of counts ?? []) if (v.route_plan_id) cnt.set(v.route_plan_id, (cnt.get(v.route_plan_id) ?? 0) + 1);

  return (
    <>
      <PageHeader title="Routes" />
      <RouteTabs />
      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <PlanForm routes={routes ?? []} salesmen={(salesmen ?? []).map((s) => ({ id: s.id, name: s.full_name }))} />
        <Card className="overflow-hidden">
          <div className="border-b border-slate-100 p-4 font-semibold">Upcoming plans</div>
          {(plans ?? []).length === 0 ? <p className="p-6 text-center text-sm text-slate-500">Nothing planned yet.</p> : (
            <ul className="max-h-[60vh] divide-y divide-slate-100 overflow-y-auto text-sm">
              {(plans ?? []).map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                  <span><span className="font-medium">{date(p.plan_date)}</span> · {(p.routes as unknown as { name: string })?.name}</span>
                  <span className="text-slate-500">{names.get(p.salesman_id)} · {cnt.get(p.id) ?? 0} shops</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
