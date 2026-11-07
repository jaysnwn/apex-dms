import "server-only";

import { createClient } from "@/lib/supabase/server";
import { addDays, todayIST } from "@/lib/gst";
import { signProductImages } from "@/lib/images";

export type SupabaseServer = Awaited<ReturnType<typeof createClient>>;

// ---------------------------------------------------------------------------
// Home: monthly target, today, recent orders
// ---------------------------------------------------------------------------
export type HomeData = {
  today: string;
  target: { start: string; end: string; sales: number; collection: number } | null;
  period: { start: string; end: string };
  achieved: number;          // invoiced sales in the period (confirmed by office)
  pendingQuotes: { count: number; value: number }; // waiting for office
  collected: number;         // collected in the period
  daysLeft: number;
  today_: { quotes: number; quoteValue: number; collected: number; visitsDone: number; visitsTotal: number; routeNames: string[] };
  nextVisit: { retailer_id: string; shop_name: string; city: string | null } | null;
  recent: { id: string; order_no: string; status: string; grand_total: number; created_at: string; shop_name: string }[];
  expensesPending: number;
};

export async function getHome(supabase: SupabaseServer, userId: string): Promise<HomeData> {
  const today = todayIST();
  const monthStart = today.slice(0, 8) + "01";
  const monthEnd = addDays(addDays(monthStart, 32).slice(0, 8) + "01", -1);

  const { data: t } = await supabase
    .from("targets")
    .select("period_start, period_end, sales_target, collection_target")
    .eq("salesman_id", userId)
    .lte("period_start", today)
    .gte("period_end", today)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const start = (t?.period_start as string) ?? monthStart;
  const end = (t?.period_end as string) ?? monthEnd;

  const [inv, quotes, pays, visits, plans, recent, exp] = await Promise.all([
    supabase.from("invoices").select("grand_total, orders!inner(salesman_id)").eq("orders.salesman_id", userId).eq("status", "issued").gte("invoice_date", start).lte("invoice_date", end),
    supabase.from("orders").select("grand_total, created_at").eq("salesman_id", userId).eq("status", "quotation"),
    supabase.from("payments").select("amount, payment_date").eq("collected_by", userId).in("status", ["received", "cheque_pending"]).gte("payment_date", start < monthStart ? start : monthStart),
    supabase.from("visits").select("retailer_id, status").eq("salesman_id", userId).eq("planned_date", today),
    supabase.from("route_plans").select("routes(name)").eq("salesman_id", userId).eq("plan_date", today),
    supabase.from("orders").select("id, order_no, status, grand_total, created_at, retailers(shop_name)").eq("salesman_id", userId).order("created_at", { ascending: false }).limit(5),
    supabase.from("expenses").select("id", { count: "exact", head: true }).eq("salesman_id", userId).eq("status", "submitted"),
  ]);

  const sum = (rows: { grand_total?: number; amount?: number }[] | null, k: "grand_total" | "amount") => (rows ?? []).reduce((s, r) => s + Number(r[k] ?? 0), 0);
  const todaysQuotes = (quotes.data ?? []).filter((q) => isToday(q.created_at as string, today));
  const v = visits.data ?? [];
  const pending = v.filter((x) => x.status === "planned");
  let nextVisit: HomeData["nextVisit"] = null;
  if (pending.length) {
    const { data: rs } = await supabase.from("retailers").select("id, shop_name, billing_city, route_sequence").in("id", pending.map((p) => p.retailer_id as string));
    const first = (rs ?? []).sort((a, b) => (a.route_sequence ?? 999) - (b.route_sequence ?? 999))[0];
    if (first) nextVisit = { retailer_id: first.id, shop_name: first.shop_name, city: first.billing_city };
  }
  // Orders created today that were already invoiced also count as today's orders.
  const { data: todayAll } = await supabase.from("orders").select("grand_total, created_at").eq("salesman_id", userId).neq("status", "cancelled").gte("created_at", `${today}T00:00:00+05:30`);

  return {
    today,
    target: t ? { start, end, sales: Number(t.sales_target), collection: Number(t.collection_target) } : null,
    period: { start, end },
    achieved: sum(inv.data as { grand_total: number }[] | null, "grand_total"),
    pendingQuotes: { count: (quotes.data ?? []).length, value: sum(quotes.data as { grand_total: number }[] | null, "grand_total") },
    collected: (pays.data ?? []).filter((p) => p.payment_date >= start && p.payment_date <= end).reduce((s, p) => s + Number(p.amount), 0),
    daysLeft: Math.max(0, Math.round((Date.parse(end) - Date.parse(today)) / 864e5) + 1),
    today_: {
      quotes: (todayAll ?? []).length || todaysQuotes.length,
      quoteValue: sum(todayAll as { grand_total: number }[] | null, "grand_total"),
      collected: (pays.data ?? []).filter((p) => p.payment_date === today).reduce((s, p) => s + Number(p.amount), 0),
      visitsDone: v.filter((x) => x.status !== "planned").length,
      visitsTotal: v.length,
      routeNames: (plans.data ?? []).map((p) => (p.routes as unknown as { name: string } | null)?.name ?? "Route"),
    },
    nextVisit,
    recent: (recent.data ?? []).map((o) => ({
      id: o.id, order_no: o.order_no, status: o.status, grand_total: Number(o.grand_total), created_at: o.created_at,
      shop_name: (o.retailers as unknown as { shop_name: string } | null)?.shop_name ?? "",
    })),
    expensesPending: exp.count ?? 0,
  };
}

function isToday(ts: string, today: string) {
  return new Date(new Date(ts).getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10) === today;
}

// ---------------------------------------------------------------------------
// Outlets assigned to this salesman (RLS already limits a salesman to his own)
// ---------------------------------------------------------------------------
export type Outlet = {
  id: string; code: string; shop_name: string; owner_name: string | null; mobile: string; city: string | null; address: string | null;
  route_id: string | null; route_name: string | null; credit_days: number; credit_limit: number; status: string; classification: string | null;
  latitude: number | null; longitude: number | null; outstanding: number; overdue: number; onRouteToday: boolean;
};

export async function getOutlets(supabase: SupabaseServer, userId: string): Promise<Outlet[]> {
  const today = todayIST();
  const [{ data: rs }, { data: bal }, { data: visits }] = await Promise.all([
    supabase.from("retailers")
      .select("id, code, shop_name, owner_name, mobile, billing_city, billing_address, route_id, route_sequence, credit_days, credit_limit, status, classification, latitude, longitude, routes(name)")
      .neq("status", "inactive")
      .order("shop_name")
      .limit(2000),
    supabase.from("retailer_balances").select("retailer_id, outstanding, overdue"),
    supabase.from("visits").select("retailer_id").eq("salesman_id", userId).eq("planned_date", today),
  ]);
  const bMap = new Map((bal ?? []).map((b) => [b.retailer_id as string, b]));
  const onRoute = new Set((visits ?? []).map((v) => v.retailer_id as string));
  return (rs ?? []).map((r) => ({
    id: r.id, code: r.code, shop_name: r.shop_name, owner_name: r.owner_name, mobile: r.mobile, city: r.billing_city, address: r.billing_address,
    route_id: r.route_id, route_name: (r.routes as unknown as { name: string } | null)?.name ?? null,
    credit_days: Number(r.credit_days), credit_limit: Number(r.credit_limit), status: r.status, classification: r.classification,
    latitude: r.latitude == null ? null : Number(r.latitude), longitude: r.longitude == null ? null : Number(r.longitude),
    outstanding: Number(bMap.get(r.id)?.outstanding ?? 0), overdue: Number(bMap.get(r.id)?.overdue ?? 0),
    onRouteToday: onRoute.has(r.id),
  }));
}

// ---------------------------------------------------------------------------
// Catalogue with live stock (available = on hand − reserved for invoices)
// ---------------------------------------------------------------------------
export type CatalogueItem = {
  id: string; name: string; sku: string; brand_id: string; brand_name: string; category: string | null; unit_code: string;
  price: number; price_mode: "inclusive" | "exclusive"; mrp: number; gst_rate: number; available: number; image_url: string | null;
};

export async function getCatalogue(supabase: SupabaseServer): Promise<{ items: CatalogueItem[]; maxDiscount: number; loadedAt: string }> {
  const [{ data: rows }, { data: stock }, { data: co }] = await Promise.all([
    supabase.from("catalog")
      .select("id, name, sku, brand_id, brand_name, category_name, unit_code, retailer_price, retailer_price_mode, mrp, gst_rate, image_path")
      .eq("is_active", true)
      .order("brand_name").order("name")
      .limit(3000),
    supabase.from("product_stock").select("product_id, available"),
    supabase.from("company_settings").select("salesman_max_discount").eq("id", 1).maybeSingle(),
  ]);
  const sMap = new Map((stock ?? []).map((s) => [s.product_id as string, Number(s.available)]));
  const urls = await signProductImages(supabase, (rows ?? []).map((r) => r.image_path));
  return {
    items: (rows ?? []).map((r) => ({
      id: r.id, name: r.name, sku: r.sku, brand_id: r.brand_id, brand_name: r.brand_name, category: r.category_name, unit_code: r.unit_code,
      price: Number(r.retailer_price), price_mode: r.retailer_price_mode, mrp: Number(r.mrp), gst_rate: Number(r.gst_rate),
      available: Math.max(0, sMap.get(r.id) ?? 0), image_url: r.image_path ? urls.get(r.image_path) ?? null : null,
    })),
    maxDiscount: Number(co?.salesman_max_discount ?? 5),
    loadedAt: new Date().toISOString(),
  };
}
