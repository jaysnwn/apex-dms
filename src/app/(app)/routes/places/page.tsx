import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { RouteTabs } from "../manager-tabs";
import { PlacesEditor } from "./places-editor";

export const metadata: Metadata = { title: "Towns & territories" };

export default async function PlacesPage() {
  await requireRole("super_admin", "manager");
  const sb = await createClient();
  const [{ data: territories }, { data: towns }, { data: rl }, { data: rets }] = await Promise.all([
    sb.from("territories").select("id, name, code, description, is_active").order("name"),
    sb.from("locations").select("id, name, territory_id, district, pincode, latitude, longitude, is_active").order("name"),
    sb.from("route_locations").select("location_id, routes(name, archived_at)"),
    sb.from("retailers").select("location_id").not("location_id", "is", null).limit(20000),
  ]);
  const routesOf: Record<string, string[]> = {};
  for (const r of rl ?? []) {
    const route = r.routes as unknown as { name: string; archived_at: string | null } | null;
    if (route && !route.archived_at) (routesOf[r.location_id] ??= []).push(route.name);
  }
  const shops: Record<string, number> = {};
  for (const r of rets ?? []) shops[r.location_id as string] = (shops[r.location_id as string] ?? 0) + 1;
  return (
    <>
      <PageHeader title="Routes" description="Territories group routes; towns and villages are the stops on a route. Renaming a town updates every route that uses it." />
      <RouteTabs />
      <PlacesEditor territories={territories ?? []} towns={towns ?? []} routesOf={routesOf} shops={shops} />
    </>
  );
}
