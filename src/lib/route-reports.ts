import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReportDef, ReportFilters, ReportResult } from "./reports";

// Route performance from the visit, order, invoice and payment records.
// Sales, collections and outstanding are attributed to the retailer's CURRENT route and
// town; visits keep the route and salesman they were made on.
const MGMT = ["super_admin", "manager"];
const n = (v: unknown) => Number(v ?? 0);
const UUID = /^[0-9a-f-]{36}$/i;

async function pageAll<T>(make: () => { range: (a: number, b: number) => PromiseLike<{ data: unknown[] | null; error: unknown }> }) {
  const out: T[] = [];
  for (let from = 0; from <= 200000; from += 1000) {
    const { data, error } = await make().range(from, from + 999);
    if (error) throw error;
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

type Dim = "route" | "salesman" | "town" | "week" | "month";
const weekStart = (d: string) => {
  const t = new Date(d.slice(0, 10) + "T00:00:00Z");
  const dow = (t.getUTCDay() + 6) % 7;
  return new Date(t.getTime() - dow * 864e5).toISOString().slice(0, 10);
};

function routePerformance(dim: Dim): ReportDef["run"] {
  return async (sb: SupabaseClient, f: ReportFilters): Promise<ReportResult> => {
    const route = f.route && UUID.test(f.route) ? f.route : null;
    const salesman = f.salesman && UUID.test(f.salesman) ? f.salesman : null;
    const [visits, retailers, orders, invoices, payments, balances, outlets, routes, locs, people] = await Promise.all([
      pageAll<{ retailer_id: string; route_id: string | null; salesman_id: string; status: string; planned_date: string; checkin_at: string | null }>(() => {
        let q = sb.from("visits").select("retailer_id, route_id, salesman_id, status, planned_date, checkin_at").gte("planned_date", f.from).lte("planned_date", f.to).not("status", "in", "(rescheduled,cancelled)");
        if (route) q = q.eq("route_id", route);
        if (salesman) q = q.eq("salesman_id", salesman);
        return q;
      }),
      pageAll<{ id: string; route_id: string | null; location_id: string | null; created_at: string }>(() => sb.from("retailers").select("id, route_id, location_id, created_at")),
      pageAll<{ retailer_id: string; salesman_id: string | null; created_at: string }>(() => sb.from("orders").select("retailer_id, salesman_id, created_at").neq("status", "cancelled").gte("created_at", f.from).lte("created_at", f.to + "T23:59:59+05:30")),
      pageAll<{ retailer_id: string; grand_total: number; invoice_date: string; orders: { salesman_id: string | null } | null }>(() => sb.from("invoices").select("retailer_id, grand_total, invoice_date, orders(salesman_id)").eq("status", "issued").gte("invoice_date", f.from).lte("invoice_date", f.to)),
      pageAll<{ retailer_id: string; collected_by: string | null; amount: number; payment_date: string }>(() => sb.from("payments").select("retailer_id, collected_by, amount, payment_date").in("status", ["received", "cheque_pending"]).gte("payment_date", f.from).lte("payment_date", f.to)),
      pageAll<{ retailer_id: string; outstanding: number }>(() => sb.from("retailer_balances").select("retailer_id, outstanding")),
      pageAll<{ route_id: string; retailer_id: string }>(() => sb.from("route_outlets").select("route_id, retailer_id").eq("is_active", true)),
      sb.from("routes").select("id, name, code"),
      sb.from("locations").select("id, name"),
      sb.from("tenant_people").select("id, full_name"),
    ]);
    const rt = new Map(retailers.map((r) => [r.id, r]));
    const rName = new Map((routes.data ?? []).map((r) => [r.id as string, `${r.name}${r.code ? ` (${r.code})` : ""}`]));
    const lName = new Map((locs.data ?? []).map((l) => [l.id as string, l.name as string]));
    const pName = new Map((people.data ?? []).map((p) => [p.id as string, p.full_name as string]));
    const keep = (retailerId: string, who: string | null) =>
      (!route || rt.get(retailerId)?.route_id === route) && (!salesman || who === salesman);

    const keyOf = (retailerId: string, who: string | null, day: string, visitRoute?: string | null): string | null => {
      const r = rt.get(retailerId);
      switch (dim) {
        case "route": return (visitRoute !== undefined ? visitRoute : r?.route_id) ?? "none";
        case "salesman": return who ?? "none";
        case "town": return r?.location_id ?? "none";
        case "week": return weekStart(day);
        case "month": return day.slice(0, 7);
      }
    };
    const label = (k: string) => {
      if (k === "none") return dim === "route" ? "No route" : dim === "town" ? "No town" : "Office / none";
      if (dim === "route") return rName.get(k) ?? "Route";
      if (dim === "salesman") return pName.get(k) ?? "—";
      if (dim === "town") return lName.get(k) ?? "Town";
      if (dim === "week") return `Week of ${k}`;
      return k;
    };
    type Acc = { name: string; outlets: Set<string>; planned: number; done: number; missed: number; orders: number; sales: number; collected: number; outstanding: number; created: number; plannedOutlets: Set<string>; visitedOutlets: Set<string>; last: string | null };
    const m = new Map<string, Acc>();
    const acc = (k: string) => {
      if (!m.has(k)) m.set(k, { name: label(k), outlets: new Set(), planned: 0, done: 0, missed: 0, orders: 0, sales: 0, collected: 0, outstanding: 0, created: 0, plannedOutlets: new Set(), visitedOutlets: new Set(), last: null });
      return m.get(k)!;
    };

    for (const v of visits) {
      const a = acc(keyOf(v.retailer_id, v.salesman_id, v.planned_date, v.route_id)!);
      a.planned += 1;
      a.plannedOutlets.add(v.retailer_id);
      if (v.status === "completed") { a.done += 1; a.visitedOutlets.add(v.retailer_id); if (v.checkin_at && (!a.last || v.checkin_at > a.last)) a.last = v.checkin_at; }
      if (v.status === "missed") a.missed += 1;
    }
    for (const o of orders) if (keep(o.retailer_id, o.salesman_id)) acc(keyOf(o.retailer_id, o.salesman_id, o.created_at)!).orders += 1;
    for (const i of invoices) { const who = i.orders?.salesman_id ?? null; if (keep(i.retailer_id, who)) acc(keyOf(i.retailer_id, who, i.invoice_date)!).sales += n(i.grand_total); }
    for (const p of payments) if (keep(p.retailer_id, p.collected_by)) acc(keyOf(p.retailer_id, p.collected_by, p.payment_date)!).collected += n(p.amount);
    if (dim === "route" || dim === "town") {
      for (const o of outlets) {
        if (route && o.route_id !== route) continue;
        const k = dim === "route" ? o.route_id : rt.get(o.retailer_id)?.location_id ?? "none";
        if (!salesman) acc(k).outlets.add(o.retailer_id); else if (m.has(k)) m.get(k)!.outlets.add(o.retailer_id);
      }
      for (const b of balances) {
        const r = rt.get(b.retailer_id);
        if (!r || (route && r.route_id !== route)) continue;
        const k = dim === "route" ? r.route_id ?? "none" : r.location_id ?? "none";
        if (m.has(k)) m.get(k)!.outstanding += n(b.outstanding);
      }
      for (const r of retailers) {
        if (r.created_at.slice(0, 10) < f.from || r.created_at.slice(0, 10) > f.to || (route && r.route_id !== route)) continue;
        const k = dim === "route" ? r.route_id ?? "none" : r.location_id ?? "none";
        if (m.has(k) || !salesman) acc(k).created += 1;
      }
    }

    const rows = [...m.values()].map((a) => ({
      name: a.name,
      outlets: dim === "route" || dim === "town" ? a.outlets.size : a.plannedOutlets.size,
      planned: a.planned, done: a.done, missed: a.missed,
      pct: a.planned ? (a.done / a.planned) * 100 : null,
      not_visited: [...a.plannedOutlets].filter((x) => !a.visitedOutlets.has(x)).length,
      orders: a.orders, sales: a.sales, collected: a.collected,
      outstanding: dim === "route" || dim === "town" ? a.outstanding : null,
      created: dim === "route" || dim === "town" ? a.created : null,
      last: a.last ? a.last.slice(0, 10) : null,
    })).sort((x, y) => (dim === "week" || dim === "month" ? String(x.name).localeCompare(String(y.name)) : y.planned - x.planned || y.sales - x.sales));
    const sum = (k: keyof (typeof rows)[number]) => rows.reduce((t, r) => t + n(r[k]), 0);
    const totals: Record<string, number> = { outlets: sum("outlets"), planned: sum("planned"), done: sum("done"), missed: sum("missed"), not_visited: sum("not_visited"), orders: sum("orders"), sales: sum("sales"), collected: sum("collected") };
    if (totals.planned) totals.pct = (totals.done / totals.planned) * 100;
    if (dim === "route" || dim === "town") { totals.outstanding = sum("outstanding"); totals.created = sum("created"); }
    const head = { route: "Route", salesman: "Salesman", town: "Town", week: "Week", month: "Month" }[dim];
    return {
      columns: [
        { key: "name", label: head },
        { key: "outlets", label: dim === "route" || dim === "town" ? "Outlets assigned" : "Outlets planned", type: "int" },
        { key: "planned", label: "Planned visits", type: "int" },
        { key: "done", label: "Completed", type: "int" },
        { key: "missed", label: "Missed", type: "int" },
        { key: "pct", label: "Completion %", type: "pct" },
        { key: "not_visited", label: "Outlets not visited", type: "int" },
        { key: "orders", label: "Orders", type: "int" },
        { key: "sales", label: "Sales (invoiced)", type: "money" },
        { key: "collected", label: "Collections", type: "money" },
        ...(dim === "route" || dim === "town" ? [{ key: "outstanding", label: "Outstanding now", type: "money" as const }, { key: "created", label: "New retailers", type: "int" as const }] : []),
        { key: "last", label: "Last visit", type: "date" },
      ],
      rows,
      totals,
      note: "Visits keep the route and salesman they were made on. Orders, sales, collections and outstanding follow the retailer's current route and town. “Outlets not visited” = planned in the period with no completed visit.",
    };
  };
}

export const ROUTE_REPORTS: ReportDef[] = [
  { key: "route-performance", title: "Route-wise performance", description: "Visits planned vs done, orders, sales, collections and outstanding per route.", group: "Routes", roles: MGMT, filters: ["route", "salesman"], run: routePerformance("route") },
  { key: "route-salesman", title: "Salesman visit performance", description: "Planned vs completed visits, missed, orders, sales and collections per salesman.", group: "Routes", roles: MGMT, filters: ["route", "salesman"], run: routePerformance("salesman") },
  { key: "route-town", title: "Town-wise performance", description: "Outlets, visits, sales and outstanding per town / village.", group: "Routes", roles: MGMT, filters: ["route", "salesman"], run: routePerformance("town") },
  { key: "route-weekly", title: "Visits by week", description: "Weekly visit completion, orders, sales and collections.", group: "Routes", roles: MGMT, filters: ["route", "salesman"], run: routePerformance("week") },
  { key: "route-monthly", title: "Visits by month", description: "Monthly visit completion, orders, sales and collections.", group: "Routes", roles: MGMT, filters: ["route", "salesman"], run: routePerformance("month") },
];
