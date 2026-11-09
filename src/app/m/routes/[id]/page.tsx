import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayIST } from "@/lib/gst";
import { loadRouteOutlets } from "@/lib/route-data";
import { RouteOutlets } from "./route-outlets";

export const metadata: Metadata = { title: "Route" };

// One route: towns in the office's order, the shops under each town.
export default async function MyRoutePage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("salesman", "manager", "super_admin");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const sb = await createClient();
  const { data: route } = await sb.from("routes").select("id, name, code").eq("id", id).maybeSingle();
  if (!route) notFound();
  const { towns, outlets } = await loadRouteOutlets(sb, id, todayIST());
  if (outlets.length === 0 && towns.length === 0) {
    // the route exists for history but is no longer this salesman's
    const { count } = await sb.from("route_outlets").select("id", { count: "exact", head: true }).eq("route_id", id);
    if (!count) {
      return (
        <div className="space-y-4">
          <Link href="/m/routes" className="flex items-center gap-1 px-1 text-sm font-medium text-slate-600"><ArrowLeft className="size-4" /> My routes</Link>
          <div className="rounded-2xl bg-white p-6 text-center text-sm text-slate-500 shadow-sm ring-1 ring-slate-200/70">{route.name} has no outlets for you right now.</div>
        </div>
      );
    }
  }
  return (
    <div className="space-y-4">
      <Link href="/m/routes" className="flex items-center gap-1 px-1 text-sm font-medium text-slate-600"><ArrowLeft className="size-4" /> My routes</Link>
      <div className="px-1">
        <h1 className="text-xl font-bold">{route.name}</h1>
        <div className="text-sm text-slate-500">{route.code} · {outlets.length} outlets</div>
        {towns.length > 0 && <div className="mt-1 text-sm text-slate-700">{towns.map((t) => t.name).join(" → ")}</div>}
      </div>
      <RouteOutlets towns={towns} outlets={outlets} />
    </div>
  );
}
