import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayIST } from "@/lib/gst";
import { ROUTE_COLS, loadAssignments, loadRouteOutlets, loadSchedule, type RouteRow } from "@/lib/route-data";
import { PageHeader } from "@/components/ui";
import { RouteEditor } from "./route-editor";
import { required } from "@/lib/required";

export const metadata: Metadata = { title: "Route" };

export default async function RoutePage({ params }: { params: Promise<{ id: string }> }) {
  const { profile } = await requireRole("super_admin", "manager");
  const { id } = await params;
  const sb = await createClient();
  const today = todayIST();
  const isNew = id === "new";
  if (!isNew && !/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const [{ data: territories }, { data: locations }, { data: salesmen }] = await Promise.all([
    sb.from("territories").select("id, name").eq("is_active", true).order("name"),
    sb.from("locations").select("id, name, territory_id, latitude, longitude, is_active").order("name"),
    sb.from("tenant_people").select("id, full_name").eq("role", "salesman").eq("is_active", true).order("full_name"),
  ]);

  if (isNew) {
    return (
      <>
        <Link href="/routes/manage" className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="size-4" /> Routes</Link>
        <PageHeader title="New route" description="Name, territory and visit days first; then add towns, outlets and the salesman." />
        <RouteEditor route={null} territories={territories ?? []} locations={locations ?? []} salesmen={(salesmen ?? []).map((s) => ({ id: required(s.id, "Salesman id"), name: required(s.full_name, "Salesman name") }))}
          towns={[]} outlets={[]} assignments={[]} schedule={[]} events={[]} today={today} superAdmin={profile.role === "super_admin"} />
      </>
    );
  }

  const { data: route } = await sb.from("routes").select(ROUTE_COLS).eq("id", id).maybeSingle<RouteRow>();
  if (!route) notFound();
  const [{ towns, outlets }, assignments, schedule, { data: ev }] = await Promise.all([
    loadRouteOutlets(sb, id, today),
    loadAssignments(sb, id),
    loadSchedule(sb, today, 21, id),
    sb.from("route_events").select("id, action, details, performed_by, created_at").eq("route_id", id).order("id", { ascending: false }).limit(80),
  ]);
  const people = [...new Set((ev ?? []).map((e) => e.performed_by).filter(Boolean))] as string[];
  const { data: who } = people.length ? await sb.from("tenant_people").select("id, full_name").in("id", people) : { data: [] };
  const nm = new Map((who ?? []).map((p) => [p.id as string, p.full_name as string]));
  const events = (ev ?? []).map((e) => ({ id: e.id as number, action: e.action as string, details: e.details as Record<string, unknown> | null, by: e.performed_by ? nm.get(e.performed_by) ?? "" : "System", at: e.created_at as string }));

  return (
    <>
      <Link href="/routes/manage" className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="size-4" /> Routes</Link>
      <PageHeader title={route.name} description={`${route.code ?? ""}${towns.length ? " · " + towns.map((t) => t.name).join(" → ") : ""}`} />
      <RouteEditor route={route} territories={territories ?? []} locations={locations ?? []} salesmen={(salesmen ?? []).map((s) => ({ id: required(s.id, "Salesman id"), name: required(s.full_name, "Salesman name") }))}
        towns={towns} outlets={outlets} assignments={assignments} schedule={schedule} events={events} today={today} superAdmin={profile.role === "super_admin"} />
    </>
  );
}
