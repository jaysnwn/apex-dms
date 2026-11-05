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
  status: "planned" | "completed" | "missed";
  checkin_at: string | null;
  remarks: string | null;
  missed_reason: string | null;
  outstanding: number;
  overdue: number;
  overdue_bills: { invoice_no: string; due_date: string; balance: number; days: number }[];
  last_payment: { date: string; amount: number } | null;
  last_order: { date: string; amount: number } | null;
  promise: { date: string; amount: number } | null;
};

export type FieldDay = {
  date: string;
  routeNames: string[];
  visits: FieldVisit[];
  collectedToday: number;
  soldToday: number;
  target: { sales: number; collection: number; salesDone: number; collectionDone: number; period: string } | null;
  loadedAt: string;
};

// Everything the salesman needs for today's route, in one payload (cached on the phone).
export async function fieldToday(): Promise<FieldDay> {
  const { user } = await requireRole("salesman", "manager", "super_admin");
  const supabase = await createClient();
  const today = todayIST();

  const [{ data: plans }, { data: visits }] = await Promise.all([
    supabase.from("route_plans").select("id, route_id, routes(name)").eq("salesman_id", user.id).eq("plan_date", today),
    supabase.from("visits").select("id, retailer_id, status, checkin_at, remarks, missed_reason").eq("salesman_id", user.id).eq("planned_date", today),
  ]);
  const retailerIds = [...new Set((visits ?? []).map((v) => v.retailer_id as string))];

  const [{ data: rs }, { data: bal }, { data: open }, { data: pays }, { data: ords }, { data: proms }] = await Promise.all([
    retailerIds.length ? supabase.from("retailers").select("id, code, shop_name, owner_name, mobile, billing_address, billing_city, route_sequence").in("id", retailerIds) : Promise.resolve({ data: [] }),
    retailerIds.length ? supabase.from("retailer_balances").select("retailer_id, outstanding, overdue").in("retailer_id", retailerIds) : Promise.resolve({ data: [] }),
    retailerIds.length ? supabase.from("invoice_balances").select("retailer_id, invoice_no, due_date, balance, days_past_due").in("retailer_id", retailerIds).gt("balance", 0).gte("days_past_due", 0).order("due_date") : Promise.resolve({ data: [] }),
    retailerIds.length ? supabase.from("payments").select("retailer_id, payment_date, amount").in("retailer_id", retailerIds).eq("status", "received").order("payment_date", { ascending: false }) : Promise.resolve({ data: [] }),
    retailerIds.length ? supabase.from("orders").select("retailer_id, created_at, grand_total").in("retailer_id", retailerIds).neq("status", "cancelled").order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
    retailerIds.length ? supabase.from("payment_promises").select("retailer_id, promised_date, amount").in("retailer_id", retailerIds).eq("status", "open").order("promised_date") : Promise.resolve({ data: [] }),
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

  const list: FieldVisit[] = (visits ?? []).map((v) => {
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
      status: v.status,
      checkin_at: v.checkin_at,
      remarks: v.remarks,
      missed_reason: v.missed_reason,
      outstanding: Number(b?.outstanding ?? 0),
      overdue: Number(b?.overdue ?? 0),
      overdue_bills: (open ?? []).filter((i) => i.retailer_id === v.retailer_id).map((i) => ({ invoice_no: i.invoice_no, due_date: i.due_date, balance: Number(i.balance), days: Number(i.days_past_due) })),
      last_payment: p ? { date: p.payment_date, amount: Number(p.amount) } : null,
      last_order: o ? { date: o.created_at, amount: Number(o.grand_total) } : null,
      promise: pr ? { date: pr.promised_date, amount: Number(pr.amount) } : null,
    };
  });
  list.sort((a, b) => (rMap.get(a.retailer_id)?.route_sequence ?? 999) - (rMap.get(b.retailer_id)?.route_sequence ?? 999) || a.shop_name.localeCompare(b.shop_name));

  const monthStart = today.slice(0, 8) + "01";
  const [{ data: myPays }, { data: mySales }, { data: target }] = await Promise.all([
    supabase.from("payments").select("amount, payment_date").eq("collected_by", user.id).in("status", ["received", "cheque_pending"]).gte("payment_date", monthStart),
    supabase.from("orders").select("grand_total, status, updated_at, invoices(invoice_date)").eq("salesman_id", user.id).in("status", ["invoiced", "dispatched", "delivered"]),
    supabase.from("targets").select("*").eq("salesman_id", user.id).lte("period_start", today).gte("period_end", today).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const invDate = (o: { invoices: unknown }) => (o.invoices as { invoice_date: string } | null)?.invoice_date ?? "";
  const sales = (mySales ?? []).map((o) => ({ amount: Number(o.grand_total), date: invDate(o) }));

  return {
    date: today,
    routeNames: (plans ?? []).map((p) => (p.routes as unknown as { name: string } | null)?.name ?? "Route"),
    visits: list,
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
    loadedAt: new Date().toISOString(),
  };
}

export type VisitUpdate = {
  clientUuid: string;
  visitId: string | null;
  retailerId: string;
  action: "checkin" | "complete" | "missed";
  remarks?: string;
  reason?: string;
  lat?: number | null;
  lng?: number | null;
  accuracy?: number | null;
  at: string; // when it happened on the phone (may be earlier, if offline)
};

// Idempotent: replaying the same update (offline queue) changes nothing extra.
export async function saveVisit(u: VisitUpdate): Promise<{ ok?: boolean; visitId?: string; error?: string }> {
  const { user } = await requireRole("salesman", "manager", "super_admin");
  const supabase = await createClient();
  let visitId = u.visitId;

  if (!visitId) {
    const { data: existing } = await supabase.from("visits").select("id").eq("client_uuid", u.clientUuid).maybeSingle();
    if (existing) visitId = existing.id;
    else {
      const { data, error } = await supabase
        .from("visits")
        .insert({ retailer_id: u.retailerId, salesman_id: user.id, planned_date: u.at.slice(0, 10), client_uuid: u.clientUuid })
        .select("id")
        .single();
      if (error) return { error: error.message };
      visitId = data.id;
    }
  }

  const patch: Record<string, unknown> = {};
  if (u.lat != null && u.lng != null) Object.assign(patch, { latitude: u.lat, longitude: u.lng, gps_accuracy_m: u.accuracy ?? null });
  if (u.action === "complete") Object.assign(patch, { status: "completed", checkout_at: u.at, remarks: u.remarks || null });
  if (u.action === "missed") Object.assign(patch, { status: "missed", missed_reason: u.reason || "Not given", remarks: u.remarks || null });

  if (Object.keys(patch).length) {
    const { error } = await supabase.from("visits").update(patch).eq("id", visitId!);
    if (error) return { error: error.message };
  }
  // Keep the first check-in time (also set when a visit is closed without checking in).
  const { error: ciErr } = await supabase.from("visits").update({ checkin_at: u.at }).eq("id", visitId!).is("checkin_at", null);
  if (ciErr) return { error: ciErr.message };
  revalidatePath("/routes");
  return { ok: true, visitId: visitId! };
}

export async function planRoute(input: { routeId: string; salesmanId: string; date: string; notes?: string }) {
  await requireRole("super_admin", "manager");
  const supabase = await createClient();
  const { error } = await supabase.rpc("plan_route", { p_route_id: input.routeId, p_salesman_id: input.salesmanId, p_date: input.date, p_notes: input.notes || null });
  if (error) return { error: error.message };
  revalidatePath("/routes");
  return { ok: true };
}

export async function planWeek(input: { routeId: string; salesmanId: string; startDate: string; weekdays: number[]; weeks: number }) {
  await requireRole("super_admin", "manager");
  const supabase = await createClient();
  let count = 0;
  const start = new Date(input.startDate + "T00:00:00Z");
  for (let i = 0; i < input.weeks * 7; i++) {
    const d = new Date(start.getTime() + i * 864e5);
    if (!input.weekdays.includes(d.getUTCDay())) continue;
    const { error } = await supabase.rpc("plan_route", { p_route_id: input.routeId, p_salesman_id: input.salesmanId, p_date: d.toISOString().slice(0, 10), p_notes: null });
    if (error) return { error: error.message, count };
    count++;
  }
  revalidatePath("/routes");
  return { ok: true, count };
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
