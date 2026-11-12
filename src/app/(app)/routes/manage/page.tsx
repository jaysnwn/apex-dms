import Link from "next/link";
import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ROUTE_FREQUENCY, WEEKDAYS } from "@/lib/status";
import { todayIST } from "@/lib/gst";
import { safeSearch } from "@/lib/format";
import { Badge, Button, Card, Input, PageHeader, Select } from "@/components/ui";
import { RouteTabs } from "../manager-tabs";
import { allRows } from "@/lib/all-rows";
import { required } from "@/lib/required";

export const metadata: Metadata = { title: "Routes" };

type SP = { q?: string; territory?: string; salesman?: string; show?: string };

export default async function ManageRoutesPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireRole("super_admin", "manager");
  const sp = await searchParams;
  const show = sp.show ?? "current";
  const sb = await createClient();
  const today = todayIST();

  let q = sb.from("routes").select("id, name, code, territory_id, visit_frequency, visit_days, is_active, archived_at, sort_order").order("sort_order").order("name");
  if (show === "archived") q = q.not("archived_at", "is", null);
  else if (show !== "all") q = q.is("archived_at", null);
  if (show === "inactive") q = q.eq("is_active", false);
  if (sp.territory) q = q.eq("territory_id", sp.territory);
  const s = safeSearch(sp.q);
  if (s) q = q.or(`name.ilike.%${s}%,code.ilike.%${s}%`);

  const [{ data: routes }, { data: territories }, { data: salesmen }, { data: outlets }, { data: towns }, { data: assigns }] = await Promise.all([
    q,
    sb.from("territories").select("id, name").order("name"),
    sb.from("tenant_people").select("id, full_name").eq("role", "salesman").order("full_name"),
    allRows(() => sb.from("route_outlets").select("route_id").eq("is_active", true).order("id")),
    sb.from("route_locations").select("route_id, sequence, locations(name)").order("sequence"),
    sb.from("route_assignments").select("route_id, salesman_id, status, start_date").is("end_date", null),
  ]);
  const terr = new Map((territories ?? []).map((t) => [t.id as string, t.name as string]));
  const names = new Map((salesmen ?? []).map((p) => [p.id as string, p.full_name as string]));
  const count = new Map<string, number>();
  for (const o of outlets ?? []) count.set(o.route_id, (count.get(o.route_id) ?? 0) + 1);
  const path = new Map<string, string[]>();
  for (const t of towns ?? []) path.set(t.route_id, [...(path.get(t.route_id) ?? []), (t.locations as unknown as { name: string })?.name ?? ""]);
  const asg = new Map((assigns ?? []).map((a) => [a.route_id as string, a]));

  let list = routes ?? [];
  if (sp.salesman) list = list.filter((r) => asg.get(r.id)?.salesman_id === sp.salesman);
  if (show === "unassigned") list = list.filter((r) => !asg.get(r.id));

  return (
    <>
      <PageHeader title="Routes" description="Towns in order, outlets in visit order, the salesman and the visit days for every route."
        actions={<Link href="/routes/manage/new"><Button><Plus className="size-4" /> New route</Button></Link>} />
      <RouteTabs />
      <Card className="mb-4 p-3">
        <form className="flex flex-wrap items-center gap-2">
          <Input name="q" defaultValue={sp.q} placeholder="Route name or code" className="w-56" aria-label="Search" />
          <Select name="territory" defaultValue={sp.territory ?? ""} className="w-44" aria-label="Territory">
            <option value="">All territories</option>
            {(territories ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
          <Select name="salesman" defaultValue={sp.salesman ?? ""} className="w-44" aria-label="Salesman">
            <option value="">All salesmen</option>
            {(salesmen ?? []).map((p) => <option key={required(p.id, "Salesman id")} value={required(p.id, "Salesman id")}>{p.full_name}</option>)}
          </Select>
          <Select name="show" defaultValue={show} className="w-40" aria-label="Show">
            <option value="current">Current routes</option>
            <option value="unassigned">No salesman</option>
            <option value="inactive">Inactive</option>
            <option value="archived">Archived</option>
            <option value="all">All</option>
          </Select>
          <Button type="submit" variant="secondary">Apply</Button>
        </form>
      </Card>
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
            <tr><th className="px-4 py-2.5">Route</th><th className="px-3 py-2.5">Territory</th><th className="px-3 py-2.5">Salesman</th><th className="px-3 py-2.5 text-right">Outlets</th><th className="px-3 py-2.5">Visit days</th><th className="px-4 py-2.5">Status</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {list.length === 0 && <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-500">No routes{show === "current" ? " yet. Click “New route” to create the first one." : " for these filters."}</td></tr>}
            {list.map((r) => {
              const a = asg.get(r.id);
              return (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5">
                    <Link href={`/routes/manage/${r.id}`} className="font-medium hover:underline">{r.name}</Link>
                    <div className="text-xs text-slate-500"><span className="font-mono">{r.code}</span>{path.get(r.id)?.length ? ` · ${path.get(r.id)!.join(" → ")}` : " · no towns yet"}</div>
                  </td>
                  <td className="px-3 py-2.5 text-slate-600">{terr.get(r.territory_id ?? "") ?? "—"}</td>
                  <td className="px-3 py-2.5">
                    {a ? <>{names.get(a.salesman_id)}{a.status === "paused" && <span className="ml-1"><Badge tone="amber">Paused</Badge></span>}{a.start_date > today && <div className="text-xs text-slate-500">from {a.start_date}</div>}</> : <Badge tone="red">No salesman</Badge>}
                  </td>
                  <td className="tabular px-3 py-2.5 text-right font-medium">{count.get(r.id) ?? 0}</td>
                  <td className="px-3 py-2.5 text-xs">
                    {r.visit_frequency === "on_demand" ? "Only when planned" : (r.visit_days as number[]).map((d) => WEEKDAYS[d - 1]).join(", ")}
                    {r.visit_frequency === "fortnightly" && <div className="text-slate-500">{ROUTE_FREQUENCY.fortnightly}</div>}
                  </td>
                  <td className="px-4 py-2.5">{r.archived_at ? <Badge>Archived</Badge> : r.is_active ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </>
  );
}
