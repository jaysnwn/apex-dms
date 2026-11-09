"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayIST } from "@/lib/gst";

export type FieldVisit = {
  visit_id: string | null;
  retailer_id: string;
  code: string;
  shop_name: string;
  owner_name: string | null;
  mobile: string;
  address: string;
  route_id: string | null;
  route_name: string | null;
  town: string | null;
  order: number;            // position on today's list (route, town, outlet order set by the office)
  status: "planned" | "in_progress" | "completed" | "missed";
  checkin_at: string | null;
  checkout_at: string | null;
  geo_status: string | null;
  distance_m: number | null;
  remarks: string | null;
  missed_reason: string | null;
  lat: number | null;       // the shop's saved location (for directions)
  lng: number | null;
  outstanding: number;
  overdue: number;
  overdue_bills: { invoice_no: string; due_date: string; balance: number; days: number }[];
  last_payment: { date: string; amount: number } | null;
  last_order: { date: string; amount: number } | null;
  last_visit: string | null;
  promise: { date: string; amount: number } | null;
};

export type FieldDay = {
  date: string;
  routeNames: string[];
  routes: { id: string; name: string; code: string | null; towns: string[] }[];
  visits: FieldVisit[];
  rescheduled: number;
  collectedToday: number;
  soldToday: number;
  target: { sales: number; collection: number; salesDone: number; collectionDone: number; period: string } | null;
  shareLocation: boolean;
  geofenceRadius: number;
  loadedAt: string;
};

// Everything the salesman needs for today's route, in one payload (cached on the phone).
// Today's visits are made from the route schedule first (idempotent).
export async function fieldToday(): Promise<FieldDay> {
  const { user, profile } = await requireRole("salesman", "manager", "super_admin");
  const supabase = await createClient();
  const today = todayIST();
  if (profile.role === "salesman") await supabase.rpc("generate_route_visits", { p_date: today, p_route: null });

  const { data: visits } = await supabase.from("visits")
    .select("id, retailer_id, route_id, status, checkin_at, checkout_at, geo_status, distance_m, remarks, missed_reason, planned_sequence")
    .eq("salesman_id", user.id).eq("planned_date", today).not("status", "eq", "cancelled");
  const live = (visits ?? []).filter((v) => v.status !== "rescheduled");
  const retailerIds = [...new Set(live.map((v) => v.retailer_id as string))];
  const routeIds = [...new Set(live.map((v) => v.route_id).filter(Boolean) as string[])];
  const has = retailerIds.length > 0;

  const [{ data: rs }, { data: bal }, { data: open }, { data: pays }, { data: ords }, { data: proms }, { data: lastV }, { data: routes }, { data: towns }, { data: me }, { data: settings }] = await Promise.all([
    has ? supabase.from("retailers").select("id, code, shop_name, owner_name, mobile, billing_address, billing_city, route_sequence, location_id, latitude, longitude, locations(name)").in("id", retailerIds) : Promise.resolve({ data: [] }),
    has ? supabase.from("retailer_balances").select("retailer_id, outstanding, overdue").in("retailer_id", retailerIds) : Promise.resolve({ data: [] }),
    has ? supabase.from("invoice_balances").select("retailer_id, invoice_no, due_date, balance, days_past_due").in("retailer_id", retailerIds).gt("balance", 0).gte("days_past_due", 0).order("due_date") : Promise.resolve({ data: [] }),
    has ? supabase.from("payments").select("retailer_id, payment_date, amount").in("retailer_id", retailerIds).in("status", ["received", "cheque_pending"]).order("payment_date", { ascending: false }) : Promise.resolve({ data: [] }),
    has ? supabase.from("orders").select("retailer_id, created_at, grand_total").in("retailer_id", retailerIds).neq("status", "cancelled").order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
    has ? supabase.from("payment_promises").select("retailer_id, promised_date, amount").in("retailer_id", retailerIds).eq("status", "open").order("promised_date") : Promise.resolve({ data: [] }),
    has ? supabase.from("visits").select("retailer_id, checkin_at").in("retailer_id", retailerIds).eq("status", "completed").lt("planned_date", today).order("checkin_at", { ascending: false }).limit(500) : Promise.resolve({ data: [] }),
    routeIds.length ? supabase.from("routes").select("id, name, code, sort_order").in("id", routeIds) : Promise.resolve({ data: [] }),
    routeIds.length ? supabase.from("route_locations").select("route_id, location_id, sequence, locations(name)").in("route_id", routeIds).order("sequence") : Promise.resolve({ data: [] }),
    supabase.from("profiles").select("share_location").eq("id", user.id).maybeSingle(),
    supabase.from("company_settings").select("geofence_radius_m").eq("id", 1).maybeSingle(),
  ]);
  const rMap = new Map((rs ?? []).map((r) => [r.id as string, r]));
  const bMap = new Map((bal ?? []).map((b) => [b.retailer_id as string, b]));
  const first = <T extends { retailer_id: string }>(rows: T[] | null) => {
    const m = new Map<string, T>();
    for (const r of rows ?? []) if (!m.has(r.retailer_id)) m.set(r.retailer_id, r);
    return m;
  };
  const payM = first(pays as { retailer_id: string; payment_date: string; amount: number }[] | null);
  const ordM = first(ords as { retailer_id: string; created_at: string; grand_total: number }[] | null);
  const proM = first(proms as { retailer_id: string; promised_date: string; amount: number }[] | null);
  const visM = first(lastV as { retailer_id: string; checkin_at: string }[] | null);
  const routeM = new Map((routes ?? []).map((r) => [r.id as string, r]));
  const townSeq = new Map((towns ?? []).map((t) => [`${t.route_id}:${t.location_id}`, Number(t.sequence)]));

  const list: FieldVisit[] = live.map((v) => {
    const r = rMap.get(v.retailer_id);
    const b = bMap.get(v.retailer_id);
    const p = payM.get(v.retailer_id);
    const o = ordM.get(v.retailer_id);
    const pr = proM.get(v.retailer_id);
    return {
      visit_id: v.id,
      retailer_id: v.retailer_id,
      code: r?.code ?? "",
      shop_name: r?.shop_name ?? "",
      owner_name: r?.owner_name ?? null,
      mobile: r?.mobile ?? "",
      address: [r?.billing_address, r?.billing_city].filter(Boolean).join(", "),
      route_id: v.route_id,
      route_name: v.route_id ? (routeM.get(v.route_id)?.name as string) ?? null : null,
      town: (r?.locations as unknown as { name: string } | null)?.name ?? r?.billing_city ?? null,
      order: 0,
      status: v.status as FieldVisit["status"],
      checkin_at: v.checkin_at,
      checkout_at: v.checkout_at,
      geo_status: v.geo_status,
      distance_m: v.distance_m === null ? null : Number(v.distance_m),
      remarks: v.remarks,
      missed_reason: v.missed_reason,
      lat: r?.latitude ?? null,
      lng: r?.longitude ?? null,
      outstanding: Number(b?.outstanding ?? 0),
      overdue: Number(b?.overdue ?? 0),
      overdue_bills: (open ?? []).filter((i) => i.retailer_id === v.retailer_id).map((i) => ({ invoice_no: i.invoice_no, due_date: i.due_date, balance: Number(i.balance), days: Number(i.days_past_due) })),
      last_payment: p ? { date: p.payment_date, amount: Number(p.amount) } : null,
      last_order: o ? { date: o.created_at, amount: Number(o.grand_total) } : null,
      last_visit: visM.get(v.retailer_id)?.checkin_at ?? null,
      promise: pr ? { date: pr.promised_date, amount: Number(pr.amount) } : null,
    };
  });
  const key = (v: FieldVisit) => {
    const r = rMap.get(v.retailer_id);
    return [
      v.route_id ? Number(routeM.get(v.route_id)?.sort_order ?? 0) : 1e9,
      townSeq.get(`${v.route_id}:${r?.location_id}`) ?? 1e9,
      r?.route_sequence ?? 1e9,
    ];
  };
  list.sort((a, b) => {
    const ka = key(a), kb = key(b);
    return ka[0] - kb[0] || ka[1] - kb[1] || ka[2] - kb[2] || a.shop_name.localeCompare(b.shop_name);
  });
  list.forEach((v, i) => (v.order = i + 1));

  const monthStart = today.slice(0, 8) + "01";
  const [{ data: myPays }, { data: mySales }, { data: target }] = await Promise.all([
    supabase.from("payments").select("amount, payment_date").eq("collected_by", user.id).in("status", ["received", "cheque_pending"]).gte("payment_date", monthStart),
    supabase.from("orders").select("grand_total, status, updated_at, invoices(invoice_date)").eq("salesman_id", user.id).in("status", ["invoiced", "dispatched", "delivered"]),
    supabase.from("targets").select("*").eq("salesman_id", user.id).lte("period_start", today).gte("period_end", today).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const invDate = (o: { invoices: unknown }) => (o.invoices as { invoice_date: string } | null)?.invoice_date ?? "";
  const sales = (mySales ?? []).map((o) => ({ amount: Number(o.grand_total), date: invDate(o) }));
  const routeList = [...routeM.values()].sort((a, b) => Number(a.sort_order) - Number(b.sort_order)).map((r) => ({
    id: r.id as string, name: r.name as string, code: r.code as string | null,
    towns: (towns ?? []).filter((t) => t.route_id === r.id).map((t) => (t.locations as unknown as { name: string } | null)?.name ?? ""),
  }));

  return {
    date: today,
    routeNames: routeList.map((r) => r.name),
    routes: routeList,
    visits: list,
    rescheduled: (visits ?? []).length - live.length,
    collectedToday: (myPays ?? []).filter((p) => p.payment_date === today).reduce((t, p) => t + Number(p.amount), 0),
    soldToday: sales.filter((s) => s.date === today).reduce((t, s) => t + s.amount, 0),
    target: target
      ? {
          sales: Number(target.sales_target),
          collection: Number(target.collection_target),
          salesDone: sales.filter((s) => s.date >= target.period_start && s.date <= target.period_end).reduce((t, s) => t + s.amount, 0),
          collectionDone: (myPays ?? []).filter((p) => p.payment_date >= target.period_start && p.payment_date <= target.period_end).reduce((t, p) => t + Number(p.amount), 0),
          period: `${target.period_start} – ${target.period_end}`,
        }
      : null,
    shareLocation: !!me?.share_location,
    geofenceRadius: Number(settings?.geofence_radius_m ?? 200),
    loadedAt: new Date().toISOString(),
  };
}

export type VisitUpdate = {
  clientUuid: string;
  visitId: string | null;
  retailerId: string;
  action: "checkin" | "complete" | "missed" | "reschedule";
  remarks?: string;
  reason?: string;
  newDate?: string;
  photoPath?: string | null;
  lat?: number | null;
  lng?: number | null;
  accuracy?: number | null;
  at: string; // when it happened on the phone (may be earlier, if offline)
};

// Idempotent: every update carries a one-time id; replaying it (offline queue) changes nothing.
// The database decides: no "visited" without a check-in, reasons required, own visits only.
export async function saveVisit(u: VisitUpdate): Promise<{ ok?: boolean; visitId?: string; result?: Record<string, unknown>; error?: string }> {
  await requireRole("salesman", "manager", "super_admin");
  const supabase = await createClient();
  const lat = u.lat ?? null, lng = u.lng ?? null, acc = u.accuracy ?? null;
  const call =
    u.action === "checkin"
      ? supabase.rpc("visit_check_in", { p_visit: u.visitId, p_retailer: u.retailerId, p_lat: lat, p_lng: lng, p_accuracy: acc, p_at: u.at, p_client_uuid: u.clientUuid })
      : u.action === "complete"
        ? supabase.rpc("visit_check_out", { p_visit: u.visitId, p_retailer: u.retailerId, p_lat: lat, p_lng: lng, p_accuracy: acc, p_remarks: u.remarks ?? null, p_photo_path: u.photoPath ?? null, p_at: u.at, p_client_uuid: u.clientUuid })
        : u.action === "missed"
          ? supabase.rpc("visit_mark_missed", { p_visit: u.visitId, p_retailer: u.retailerId, p_reason: u.reason ?? "", p_remarks: u.remarks ?? null, p_at: u.at, p_client_uuid: u.clientUuid })
          : supabase.rpc("visit_reschedule", { p_visit: u.visitId, p_retailer: u.retailerId, p_new_date: u.newDate ?? null, p_reason: u.reason ?? "", p_at: u.at, p_client_uuid: u.clientUuid });
  const { data, error } = await call;
  if (error) return { error: error.message };
  revalidatePath("/routes");
  const result = data as Record<string, unknown>;
  return { ok: true, visitId: result.visit_id as string, result };
}

// Live location: only stored while the salesman has switched sharing on (his choice).
export async function setLocationSharing(on: boolean): Promise<{ ok?: boolean; error?: string }> {
  await requireRole("salesman");
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_location_sharing", { p_on: on });
  return error ? { error: error.message } : { ok: true };
}

export async function pingLocation(lat: number, lng: number, accuracy: number | null): Promise<{ ok?: boolean }> {
  await requireRole("salesman");
  const supabase = await createClient();
  const { data } = await supabase.rpc("record_location", { p_lat: lat, p_lng: lng, p_accuracy: accuracy, p_at: new Date().toISOString() });
  return { ok: data === true };
}

// Salesman saves a shop's location from the shop (only when none is saved yet).
export async function saveShopLocation(retailerId: string, lat: number, lng: number, accuracy: number | null): Promise<{ ok?: boolean; error?: string }> {
  await requireRole("salesman", "manager", "super_admin");
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_retailer_location", { p_retailer: retailerId, p_lat: lat, p_lng: lng, p_accuracy: accuracy });
  if (error) return { error: error.message };
  revalidatePath("/m/route");
  return { ok: true };
}

export async function saveTarget(input: { salesmanId: string; start: string; end: string; sales: number; collection: number }) {
  await requireRole("super_admin", "manager");
  if (!input.salesmanId || !input.start || !input.end) return { error: "Choose salesman and period." };
  const supabase = await createClient();
  const { data: me } = await supabase.auth.getUser();
  const { error } = await supabase.from("targets").insert({
    salesman_id: input.salesmanId,
    period_start: input.start,
    period_end: input.end,
    sales_target: input.sales || 0,
    collection_target: input.collection || 0,
    set_by: me.user?.id,
  });
  if (error) return { error: error.message };
  revalidatePath("/routes/targets");
  return { ok: true };
}
