import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { OutletForm } from "./outlet-form";

export const metadata: Metadata = { title: "New outlet" };

export default async function NewOutletPage({ searchParams }: { searchParams: Promise<{ then?: string }> }) {
  const { user } = await requireRole("salesman", "manager", "super_admin");
  const { then } = await searchParams;
  const supabase = await createClient();
  const today = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
  const [{ data: routes }, { data: plan }] = await Promise.all([
    supabase.from("routes").select("id, name, default_salesman_id").eq("is_active", true).order("name"),
    supabase.from("route_plans").select("route_id").eq("salesman_id", user.id).eq("plan_date", today).limit(1).maybeSingle(),
  ]);
  const mine = (routes ?? []).filter((r) => r.default_salesman_id === user.id);
  const list = (mine.length ? mine : routes ?? []).map((r) => ({ id: r.id as string, name: r.name as string }));
  return <OutletForm routes={list} defaultRoute={(plan?.route_id as string) ?? list[0]?.id ?? ""} thenOrder={then === "order"} />;
}
