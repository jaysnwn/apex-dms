import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type RouteRow = {
  id: string; name: string; code: string | null; territory_id: string | null; description: string | null;
  visit_frequency: "weekly" | "fortnightly" | "on_demand"; visit_days: number[]; fortnight_anchor: string | null;
  sort_order: number; is_active: boolean; archived_at: string | null; default_salesman_id: string | null;
};
export type Town = { id: string; name: string; sequence: number; latitude: number | null; longitude: number | null };
export type OutletInfo = {
  retailer_id: string; code: string; shop_name: string; owner_name: string | null; mobile: string; address: string;
  location_id: string | null; sequence: number; visit_frequency: string; visit_days: number[] | null;
  latitude: number | null; longitude: number | null; status: string;
  outstanding: number; overdue: number;
  last_visit: string | null; last_order: { date: string; amount: number } | null; last_payment: { date: string; amount: number } | null;
  today: { visit_id: string; status: string; geo_status: string | null } | null;
};
export type Assignment = { id: string; salesman_id: string; salesman: string; start_date: string; end_date: string | null; status: string; notes: string | null; created_at: string };
export type ScheduleDay = { plan_date: string; route_id: string; outlets: number; status: string; salesman_id: string | null; reason: string | null };

export const ROUTE_COLS = "id, name, code, territory_id, description, visit_frequency, visit_days, fortnight_anchor, sort_order, is_active, archived_at, default_salesman_id";

async function inChunks<T>(ids: string[], run: (chunk: string[]) => PromiseLike<{ data: unknown[] | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 150) {
    const { data } = await run(ids.slice(i, i + 150));
    out.push(...((data ?? []) as T[]));
  }
  return out;
}
const firstBy = <T extends { retailer_id: string }>(rows: T[]) => {
  const m = new Map<string, T>();
  for (const r of rows) if (!m.has(r.retailer_id)) m.set(r.retailer_id, r);
  return m;
};

// Towns in order and outlets in visit order (town order, then outlet order), with the
// money and activity a salesman or manager needs on the card. Read-only.
export async function loadRouteOutlets(sb: SupabaseClient, routeId: string, today: string) {
  const [{ data: towns }, { data: ros }] = await Promise.all([
    sb.from("route_locations").select("location_id, sequence, locations(name, latitude, longitude)").eq("route_id", routeId).order("sequence"),
    sb.from("route_outlets").select("retailer_id, location_id, sequence, visit_frequency, visit_days, retailers(code, shop_name, owner_name, mobile, billing_address, billing_city, latitude, longitude, status)")
      .eq("route_id", routeId).eq("is_active", true),
  ]);
  const townList: Town[] = (towns ?? []).map((t) => {
    const l = t.locations as unknown as { name: string; latitude: number | null; longitude: number | null };
    return { id: t.location_id as string, name: l?.name ?? "", sequence: t.sequence as number, latitude: l?.latitude ?? null, longitude: l?.longitude ?? null };
  });
  const townSeq = new Map(townList.map((t) => [t.id, t.sequence]));
  const ids = (ros ?? []).map((r) => r.retailer_id as string);

  const [bal, visits, orders, pays, todays] = await Promise.all([
    inChunks<{ retailer_id: string; outstanding: number; overdue: number }>(ids, (c) => sb.from("retailer_balances").select("retailer_id, outstanding, overdue").in("retailer_id", c)),
    inChunks<{ retailer_id: string; checkin_at: string }>(ids, (c) => sb.from("visits").select("retailer_id, checkin_at").in("retailer_id", c).eq("status", "completed").order("checkin_at", { ascending: false }).limit(1000)),
    inChunks<{ retailer_id: string; created_at: string; grand_total: number }>(ids, (c) => sb.from("orders").select("retailer_id, created_at, grand_total").in("retailer_id", c).neq("status", "cancelled").order("created_at", { ascending: false }).limit(1000)),
    inChunks<{ retailer_id: string; payment_date: string; amount: number }>(ids, (c) => sb.from("payments").select("retailer_id, payment_date, amount").in("retailer_id", c).in("status", ["received", "cheque_pending"]).order("payment_date", { ascending: false }).limit(1000)),
    inChunks<{ id: string; retailer_id: string; status: string; geo_status: string | null }>(ids, (c) => sb.from("visits").select("id, retailer_id, status, geo_status").in("retailer_id", c).eq("planned_date", today).not("status", "in", "(rescheduled,cancelled)")),
  ]);
  const bM = new Map(bal.map((b) => [b.retailer_id, b]));
  const vM = firstBy(visits), oM = firstBy(orders), pM = firstBy(pays), tM = firstBy(todays);

  const outlets: OutletInfo[] = (ros ?? []).map((ro) => {
    const r = ro.retailers as unknown as { code: string; shop_name: string; owner_name: string | null; mobile: string; billing_address: string | null; billing_city: string | null; latitude: number | null; longitude: number | null; status: string };
    const id = ro.retailer_id as string;
    const t = tM.get(id);
    return {
      retailer_id: id, code: r.code, shop_name: r.shop_name, owner_name: r.owner_name, mobile: r.mobile,
      address: [r.billing_address, r.billing_city].filter(Boolean).join(", "),
      location_id: ro.location_id as string | null, sequence: ro.sequence as number,
      visit_frequency: ro.visit_frequency as string, visit_days: (ro.visit_days as number[] | null) ?? null,
      latitude: r.latitude, longitude: r.longitude, status: r.status,
      outstanding: Number(bM.get(id)?.outstanding ?? 0), overdue: Number(bM.get(id)?.overdue ?? 0),
      last_visit: vM.get(id)?.checkin_at ?? null,
      last_order: oM.get(id) ? { date: oM.get(id)!.created_at, amount: Number(oM.get(id)!.grand_total) } : null,
      last_payment: pM.get(id) ? { date: pM.get(id)!.payment_date, amount: Number(pM.get(id)!.amount) } : null,
      today: t ? { visit_id: t.id, status: t.status, geo_status: t.geo_status } : null,
    };
  }).sort((a, b) => (townSeq.get(a.location_id ?? "") ?? 1e9) - (townSeq.get(b.location_id ?? "") ?? 1e9) || a.sequence - b.sequence || a.shop_name.localeCompare(b.shop_name));

  return { towns: townList, outlets };
}

export async function loadAssignments(sb: SupabaseClient, routeId: string): Promise<Assignment[]> {
  const { data } = await sb.from("route_assignments").select("id, salesman_id, start_date, end_date, status, notes, created_at, profiles!route_assignments_salesman_id_fkey(full_name)")
    .eq("route_id", routeId).order("start_date", { ascending: false }).order("created_at", { ascending: false });
  return (data ?? []).map((a) => ({
    id: a.id, salesman_id: a.salesman_id, salesman: (a.profiles as unknown as { full_name: string } | null)?.full_name ?? "",
    start_date: a.start_date, end_date: a.end_date, status: a.status, notes: a.notes, created_at: a.created_at,
  }));
}

export async function loadSchedule(sb: SupabaseClient, from: string, days: number, routeId?: string): Promise<ScheduleDay[]> {
  const { data } = await sb.rpc("route_schedule", { p_from: from, p_days: days, p_route: routeId ?? null });
  return (data ?? []) as ScheduleDay[];
}

// "Ghargaon → Bota → Alephata"
export const townPath = (towns: { name: string }[]) => towns.map((t) => t.name).join(" → ");
