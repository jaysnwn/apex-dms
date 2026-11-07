import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type ColType = "text" | "money" | "num" | "pct" | "date" | "int";
export type Column = { key: string; label: string; type?: ColType };
export type ReportResult = { columns: Column[]; rows: Record<string, string | number | null>[]; totals?: Record<string, number>; note?: string };
export type ReportFilters = { from: string; to: string; brand?: string; salesman?: string; route?: string };

export type ReportDef = {
  key: string;
  title: string;
  description: string;
  group: "Sales" | "Money" | "Stock" | "Purchases" | "Team";
  roles: string[];
  filters: ("brand" | "salesman" | "route")[];
  run: (sb: SupabaseClient, f: ReportFilters) => Promise<ReportResult>;
};

// PostgREST returns at most 1000 rows per request; page through everything.
type Builder = { range: (a: number, b: number) => PromiseLike<{ data: unknown[] | null; error: unknown }> };
export async function fetchAll<T>(make: () => Builder): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await make().range(from, from + 999);
    if (error) throw error;
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
    if (from > 200000) break;
  }
  return out;
}

const OFFICE = ["super_admin", "manager", "billing"];
const MGMT = ["super_admin", "manager"];

type SaleRow = {
  line_id: string; invoice_id: string; invoice_no: string; invoice_date: string; retailer_id: string; retailer_code: string; shop_name: string;
  route_id: string | null; route_name: string | null; salesman_id: string | null; salesman_name: string | null; product_id: string;
  product_name: string; sku: string; brand_id: string; brand_name: string; qty: number; taxable_value: number; tax: number; line_total: number;
};

async function sales(sb: SupabaseClient, f: ReportFilters) {
  return fetchAll<SaleRow>(() => {
    let q = sb.from("sales_register").select("*").gte("invoice_date", f.from).lte("invoice_date", f.to).order("invoice_date");
    if (f.brand) q = q.eq("brand_id", f.brand);
    if (f.salesman) q = q.eq("salesman_id", f.salesman);
    if (f.route) q = q.eq("route_id", f.route);
    return q;
  });
}

function group<T>(rows: T[], key: (r: T) => string, init: (r: T) => Record<string, string | number | null>, add: (acc: Record<string, string | number | null>, r: T) => void) {
  const m = new Map<string, Record<string, string | number | null>>();
  for (const r of rows) {
    const k = key(r);
    if (!m.has(k)) m.set(k, init(r));
    add(m.get(k)!, r);
  }
  return [...m.values()];
}

const n = (v: unknown) => Number(v ?? 0);
const sum = (rows: Record<string, unknown>[], keys: string[]) => Object.fromEntries(keys.map((k) => [k, rows.reduce((t, r) => t + n(r[k]), 0)]));

function salesBy(dim: "brand" | "product" | "retailer" | "salesman") {
  return async (sb: SupabaseClient, f: ReportFilters): Promise<ReportResult> => {
    const rows = await sales(sb, f);
    const keyOf = { brand: (r: SaleRow) => r.brand_id, product: (r: SaleRow) => r.product_id, retailer: (r: SaleRow) => r.retailer_id, salesman: (r: SaleRow) => r.salesman_id ?? "none" }[dim];
    const g = group(rows, keyOf, (r) => ({
      name: dim === "brand" ? r.brand_name : dim === "product" ? r.product_name : dim === "retailer" ? r.shop_name : r.salesman_name ?? "Office (no salesman)",
      extra: dim === "product" ? r.sku : dim === "retailer" ? r.retailer_code : dim === "brand" ? null : null,
      invoices: 0, qty: 0, taxable: 0, tax: 0, total: 0, _inv: "",
    }), (a, r) => {
      if (!String(a._inv).includes(r.invoice_id)) { a.invoices = n(a.invoices) + 1; a._inv = `${a._inv},${r.invoice_id}`; }
      a.qty = n(a.qty) + n(r.qty); a.taxable = n(a.taxable) + n(r.taxable_value); a.tax = n(a.tax) + n(r.tax); a.total = n(a.total) + n(r.line_total);
    }).map(({ _inv, ...rest }) => (void _inv, rest)).sort((x, y) => n(y.total) - n(x.total));
    const grand = g.reduce((t, r) => t + n(r.total), 0);
    for (const r of g) r.share = grand ? (n(r.total) / grand) * 100 : 0;
    const label = { brand: "Brand", product: "Product", retailer: "Retailer", salesman: "Salesman" }[dim];
    const columns: Column[] = [
      { key: "name", label },
      ...(dim === "product" ? [{ key: "extra", label: "Model / SKU" }] : dim === "retailer" ? [{ key: "extra", label: "Retailer ID" }] : []),
      { key: "invoices", label: "Invoices", type: "int" },
      { key: "qty", label: "Qty", type: "num" },
      { key: "taxable", label: "Taxable value", type: "money" },
      { key: "tax", label: "GST", type: "money" },
      { key: "total", label: "Sales incl. GST", type: "money" },
      { key: "share", label: "Share", type: "pct" },
    ];
    return { columns, rows: g, totals: { ...sum(g, ["qty", "taxable", "tax", "total"]), share: 100 } };
  };
}

type PurchaseRow = {
  line_id: string; purchase_id: string; purchase_no: string; supplier_bill_no: string; supplier_bill_date: string; supplier_id: string;
  supplier_name: string; product_id: string; product_name: string; sku: string; brand_id: string; brand_name: string;
  qty: number; taxable_value: number; tax: number; line_total: number;
};

async function purchases(sb: SupabaseClient, f: ReportFilters) {
  return fetchAll<PurchaseRow>(() => {
    let q = sb.from("purchase_register").select("*").gte("supplier_bill_date", f.from).lte("supplier_bill_date", f.to).order("supplier_bill_date");
    if (f.brand) q = q.eq("brand_id", f.brand);
    return q;
  });
}

const PURCHASE_REPORTS: ReportDef[] = [
  {
    key: "purchase-register", title: "Purchase register", description: "Every supplier bill with taxable value and input GST.", group: "Purchases", roles: OFFICE, filters: [],
    run: async (sb, f) => {
      const [rows, heads] = await Promise.all([
        purchases(sb, f),
        fetchAll<{ id: string; other_charges: number; round_off: number; grand_total: number; cgst_total: number; sgst_total: number; igst_total: number; due_date: string }>(() =>
          sb.from("purchases").select("id, other_charges, round_off, grand_total, cgst_total, sgst_total, igst_total, due_date").eq("status", "received").gte("supplier_bill_date", f.from).lte("supplier_bill_date", f.to)),
      ]);
      const hMap = new Map(heads.map((h) => [h.id, h]));
      const g = group(rows, (r) => r.purchase_id, (r) => {
        const h = hMap.get(r.purchase_id);
        return {
          date: r.supplier_bill_date, bill: r.supplier_bill_no, purchase: r.purchase_no, supplier: r.supplier_name, qty: 0, taxable: 0,
          cgst: n(h?.cgst_total), sgst: n(h?.sgst_total), igst: n(h?.igst_total), other: n(h?.other_charges) + n(h?.round_off), total: n(h?.grand_total), due: h?.due_date ?? null,
        };
      }, (a, r) => { a.qty = n(a.qty) + n(r.qty); a.taxable = n(a.taxable) + n(r.taxable_value); });
      return {
        columns: [
          { key: "date", label: "Bill date", type: "date" }, { key: "bill", label: "Supplier bill" }, { key: "purchase", label: "Our ref." }, { key: "supplier", label: "Supplier" },
          { key: "qty", label: "Qty", type: "num" }, { key: "taxable", label: "Taxable value", type: "money" }, { key: "cgst", label: "CGST", type: "money" },
          { key: "sgst", label: "SGST", type: "money" }, { key: "igst", label: "IGST", type: "money" }, { key: "other", label: "Other / round off", type: "money" },
          { key: "total", label: "Bill total", type: "money" }, { key: "due", label: "Due", type: "date" },
        ],
        rows: g,
        totals: sum(g, ["qty", "taxable", "cgst", "sgst", "igst", "other", "total"]),
      };
    },
  },
  {
    key: "product-purchases", title: "Product-wise purchases", description: "Quantity and value bought per product and supplier.", group: "Purchases", roles: OFFICE, filters: ["brand"],
    run: async (sb, f) => {
      const rows = await purchases(sb, f);
      const g = group(rows, (r) => `${r.product_id}|${r.supplier_id}`, (r) => ({ name: r.product_name, sku: r.sku, brand: r.brand_name, supplier: r.supplier_name, qty: 0, taxable: 0, avg: 0, total: 0 }),
        (a, r) => { a.qty = n(a.qty) + n(r.qty); a.taxable = n(a.taxable) + n(r.taxable_value); a.total = n(a.total) + n(r.line_total); })
        .map((r): Record<string, string | number | null> => ({ ...r, avg: n(r.qty) ? n(r.taxable) / n(r.qty) : 0 }))
        .sort((x, y) => n(y.total) - n(x.total));
      return {
        columns: [
          { key: "name", label: "Product" }, { key: "sku", label: "Model / SKU" }, { key: "brand", label: "Brand" }, { key: "supplier", label: "Supplier" },
          { key: "qty", label: "Qty bought", type: "num" }, { key: "avg", label: "Avg. net cost", type: "money" }, { key: "taxable", label: "Taxable value", type: "money" }, { key: "total", label: "Incl. GST", type: "money" },
        ],
        rows: g,
        totals: sum(g, ["qty", "taxable", "total"]),
      };
    },
  },
  {
    key: "supplier-payables", title: "Supplier payables ageing", description: "What we owe each supplier, by days past due (as of today).", group: "Purchases", roles: OFFICE, filters: [],
    run: async (sb) => {
      const [bal, sup] = await Promise.all([
        fetchAll<{ supplier_id: string; due_date: string; balance: number; days_overdue: number }>(() => sb.from("purchase_balances").select("supplier_id, due_date, balance, days_overdue").gt("balance", 0)),
        sb.from("suppliers").select("id, name"),
      ]);
      const names = new Map((sup.data ?? []).map((s) => [s.id as string, s.name as string]));
      const today = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
      const g = group(bal, (b) => b.supplier_id, (b) => ({ name: names.get(b.supplier_id) ?? "—", bills: 0, not_due: 0, b0: 0, b16: 0, b31: 0, b45: 0, total: 0 }), (a, b) => {
        const v = n(b.balance); const d = n(b.days_overdue);
        a.bills = n(a.bills) + 1; a.total = n(a.total) + v;
        const k = b.due_date >= today ? "not_due" : d <= 15 ? "b0" : d <= 30 ? "b16" : d <= 45 ? "b31" : "b45";
        a[k] = n(a[k]) + v;
      }).sort((x, y) => n(y.total) - n(x.total));
      return {
        columns: [
          { key: "name", label: "Supplier" }, { key: "bills", label: "Bills", type: "int" }, { key: "not_due", label: "Not yet due", type: "money" },
          { key: "b0", label: "0–15", type: "money" }, { key: "b16", label: "16–30", type: "money" }, { key: "b31", label: "31–45", type: "money" },
          { key: "b45", label: "45+", type: "money" }, { key: "total", label: "Total payable", type: "money" },
        ],
        rows: g,
        totals: sum(g, ["bills", "not_due", "b0", "b16", "b31", "b45", "total"]),
        note: "Date filters do not apply: this is the position today.",
      };
    },
  },
];

export const REPORTS: ReportDef[] = [
  { key: "brand-sales", title: "Brand-wise sales", description: "Sales by brand with share of total.", group: "Sales", roles: [...OFFICE, "warehouse"], filters: ["salesman", "route"], run: salesBy("brand") },
  { key: "product-sales", title: "Product-wise sales", description: "Quantity and value sold per product.", group: "Sales", roles: [...OFFICE, "warehouse"], filters: ["brand", "salesman", "route"], run: salesBy("product") },
  { key: "retailer-sales", title: "Retailer-wise sales", description: "Who buys the most, and how often.", group: "Sales", roles: [...OFFICE, "salesman"], filters: ["brand", "salesman", "route"], run: salesBy("retailer") },
  {
    key: "salesman-incentives", title: "Salesman incentives", description: "Incentive criteria and amount per salesman for the month of the From date.", group: "Team", roles: MGMT, filters: [],
    run: async (sb, f) => {
      const month = f.from.slice(0, 8) + "01";
      const [{ data: people }, { data: payouts }] = await Promise.all([
        sb.from("profiles").select("id, full_name, is_active").eq("role", "salesman").order("full_name"),
        sb.from("incentive_payouts").select("*").eq("month", month),
      ]);
      const pMap = new Map((payouts ?? []).map((p) => [p.salesman_id as string, p]));
      const rows: Record<string, string | number | null>[] = [];
      for (const sm of (people ?? []).filter((x) => x.is_active || pMap.has(x.id))) {
        const p = pMap.get(sm.id);
        const j = p ? (p.detail as Record<string, unknown>) : ((await sb.rpc("salesman_incentive", { p_salesman: sm.id, p_month: month })).data as Record<string, unknown> | null);
        if (!j) continue;
        rows.push({
          name: sm.full_name, net_sales: n(j.net_sales), billed_shops: n(j.billed_shops), smart_shops: n(j.smart_shops),
          due: n(j.collection_due), collected: n(j.collected), collection: n(j.collection_pct),
          sales_earned: n(j.sales_earned), billed_earned: n(j.billed_earned), smart_earned: n(j.smart_earned), collection_earned: n(j.collection_earned),
          total: n(j.total), status: p ? (p.status === "paid" ? "Paid" : "Approved") : j.is_final ? "To approve" : "Provisional",
        });
      }
      return {
        columns: [
          { key: "name", label: "Salesman" }, { key: "net_sales", label: "Sales ex GST", type: "money" }, { key: "billed_shops", label: "Shops billed", type: "int" },
          { key: "smart_shops", label: "Smart shops", type: "int" }, { key: "due", label: "Due this month", type: "money" }, { key: "collected", label: "Collected", type: "money" },
          { key: "collection", label: "Collection %", type: "pct" }, { key: "sales_earned", label: "Sales ₹", type: "money" }, { key: "billed_earned", label: "Billed ₹", type: "money" },
          { key: "smart_earned", label: "Smart ₹", type: "money" }, { key: "collection_earned", label: "Collection ₹", type: "money" }, { key: "total", label: "Incentive", type: "money" },
          { key: "status", label: "Status" },
        ],
        rows,
        totals: sum(rows, ["net_sales", "due", "collected", "sales_earned", "billed_earned", "smart_earned", "collection_earned", "total"]),
        note: `Month: ${month.slice(0, 7)} (taken from the From date).`,
      };
    },
  },
  { key: "salesman-sales", title: "Salesman-wise sales", description: "Invoiced sales per salesman.", group: "Team", roles: MGMT, filters: ["brand", "route"], run: salesBy("salesman") },
  {
    key: "route-performance", title: "Route-wise performance", description: "Sales, collections and visit completion per route.", group: "Team", roles: MGMT, filters: [],
    run: async (sb, f) => {
      const [rows, pays, visits, routes, retailers] = await Promise.all([
        sales(sb, f),
        fetchAll<{ retailer_id: string; amount: number }>(() => sb.from("payments").select("retailer_id, amount").in("status", ["received", "cheque_pending"]).gte("payment_date", f.from).lte("payment_date", f.to)),
        fetchAll<{ retailer_id: string; status: string }>(() => sb.from("visits").select("retailer_id, status").gte("planned_date", f.from).lte("planned_date", f.to)),
        sb.from("routes").select("id, name"),
        fetchAll<{ id: string; route_id: string | null }>(() => sb.from("retailers").select("id, route_id")),
      ]);
      const routeOf = new Map(retailers.map((r) => [r.id, r.route_id ?? "none"]));
      const out = new Map<string, Record<string, string | number | null>>();
      const get = (id: string) => {
        if (!out.has(id)) out.set(id, { name: (routes.data ?? []).find((r) => r.id === id)?.name ?? "No route", retailers: 0, sales: 0, collected: 0, planned: 0, visited: 0, missed: 0, completion: 0 });
        return out.get(id)!;
      };
      for (const r of retailers) { const g = get(r.route_id ?? "none"); g.retailers = n(g.retailers) + 1; }
      for (const s of rows) { const g = get(routeOf.get(s.retailer_id) ?? "none"); g.sales = n(g.sales) + n(s.line_total); }
      for (const p of pays) { const g = get(routeOf.get(p.retailer_id) ?? "none"); g.collected = n(g.collected) + n(p.amount); }
      for (const v of visits) {
        const g = get(routeOf.get(v.retailer_id) ?? "none");
        g.planned = n(g.planned) + 1;
        if (v.status === "completed") g.visited = n(g.visited) + 1;
        if (v.status === "missed") g.missed = n(g.missed) + 1;
      }
      const list = [...out.values()].map((g): Record<string, string | number | null> => ({ ...g, completion: n(g.planned) ? (n(g.visited) / n(g.planned)) * 100 : 0 }));
      list.sort((a, b) => n(b.sales) - n(a.sales));
      return {
        columns: [
          { key: "name", label: "Route" }, { key: "retailers", label: "Retailers", type: "int" }, { key: "sales", label: "Sales", type: "money" },
          { key: "collected", label: "Collected", type: "money" }, { key: "planned", label: "Visits planned", type: "int" }, { key: "visited", label: "Visited", type: "int" },
          { key: "missed", label: "Missed", type: "int" }, { key: "completion", label: "Completion", type: "pct" },
        ],
        rows: list,
        totals: sum(list, ["retailers", "sales", "collected", "planned", "visited", "missed"]),
      };
    },
  },
  {
    key: "invoice-ageing", title: "Invoice ageing", description: "Unpaid invoices by days past due (as of today).", group: "Money", roles: [...OFFICE, "salesman"], filters: ["salesman", "route"],
    run: async (sb, f) => {
      const [bal, dir] = await Promise.all([
        fetchAll<{ invoice_no: string; retailer_id: string; invoice_date: string; due_date: string; balance: number; days_past_due: number; ageing_bucket: string | null; due_status: string }>(() =>
          sb.from("invoice_balances").select("invoice_no, retailer_id, invoice_date, due_date, balance, days_past_due, ageing_bucket, due_status").gt("balance", 0).order("due_date")),
        fetchAll<{ id: string; shop_name: string; route_id: string | null; salesman_id: string | null; route_name: string | null }>(() => sb.from("retailer_directory").select("id, shop_name, route_id, salesman_id, route_name")),
      ]);
      const d = new Map(dir.map((r) => [r.id, r]));
      const rows = bal
        .filter((b) => (!f.route || d.get(b.retailer_id)?.route_id === f.route) && (!f.salesman || d.get(b.retailer_id)?.salesman_id === f.salesman))
        .map((b) => ({
          invoice_no: b.invoice_no, shop: d.get(b.retailer_id)?.shop_name ?? "", route: d.get(b.retailer_id)?.route_name ?? "", invoice_date: b.invoice_date, due_date: b.due_date,
          days: Math.max(0, n(b.days_past_due)), bucket: b.due_status === "not_yet_due" ? "Not yet due" : b.ageing_bucket ? `${b.ageing_bucket} days` : "Due today",
          not_due: b.due_status === "not_yet_due" ? n(b.balance) : 0,
          b0: b.ageing_bucket === "0-15" ? n(b.balance) : 0, b16: b.ageing_bucket === "16-30" ? n(b.balance) : 0,
          b31: b.ageing_bucket === "31-45" ? n(b.balance) : 0, b45: b.ageing_bucket === "45+" ? n(b.balance) : 0, balance: n(b.balance),
        }));
      return {
        columns: [
          { key: "invoice_no", label: "Invoice" }, { key: "shop", label: "Retailer" }, { key: "route", label: "Route" }, { key: "due_date", label: "Due", type: "date" },
          { key: "days", label: "Days overdue", type: "int" }, { key: "not_due", label: "Not yet due", type: "money" }, { key: "b0", label: "0–15", type: "money" },
          { key: "b16", label: "16–30", type: "money" }, { key: "b31", label: "31–45", type: "money" }, { key: "b45", label: "45+", type: "money" }, { key: "balance", label: "Balance", type: "money" },
        ],
        rows,
        totals: sum(rows, ["not_due", "b0", "b16", "b31", "b45", "balance"]),
        note: "Ageing is always as of today; the date range does not apply.",
      };
    },
  },
  {
    key: "payment-collection", title: "Payment collection", description: "Payments received by date, mode and collector.", group: "Money", roles: [...OFFICE, "salesman"], filters: ["salesman"],
    run: async (sb, f) => {
      const [pays, people] = await Promise.all([
        fetchAll<{ receipt_no: string; payment_date: string; amount: number; method: string; status: string; reference_no: string | null; collected_by: string | null; retailers: { shop_name: string } | null }>(() => {
          let q = sb.from("payments").select("receipt_no, payment_date, amount, method, status, reference_no, collected_by, retailers(shop_name)").gte("payment_date", f.from).lte("payment_date", f.to).order("payment_date");
          if (f.salesman) q = q.eq("collected_by", f.salesman);
          return q;
        }),
        sb.from("profiles").select("id, full_name"),
      ]);
      const u = new Map((people.data ?? []).map((p) => [p.id as string, p.full_name as string]));
      const M: Record<string, string> = { cash: "Cash", upi: "UPI", bank_transfer: "Bank transfer", cheque: "Cheque" };
      const S: Record<string, string> = { received: "Received", cheque_pending: "Cheque not cleared", bounced: "Bounced", cancelled: "Cancelled" };
      const rows = pays.map((p) => ({
        date: p.payment_date, receipt: p.receipt_no, shop: p.retailers?.shop_name ?? "", method: M[p.method], reference: p.reference_no, status: S[p.status],
        collected_by: p.collected_by ? u.get(p.collected_by) ?? "" : "", amount: p.status === "bounced" || p.status === "cancelled" ? 0 : n(p.amount),
      }));
      return {
        columns: [
          { key: "date", label: "Date", type: "date" }, { key: "receipt", label: "Receipt" }, { key: "shop", label: "Retailer" }, { key: "method", label: "Mode" },
          { key: "reference", label: "Reference" }, { key: "collected_by", label: "Collected by" }, { key: "status", label: "Status" }, { key: "amount", label: "Amount", type: "money" },
        ],
        rows,
        totals: sum(rows, ["amount"]),
        note: "Bounced and cancelled payments are listed with amount 0.",
      };
    },
  },
  {
    key: "stock-valuation", title: "Stock valuation", description: "Units on hand and value at weighted average cost (now).", group: "Stock", roles: OFFICE, filters: ["brand"],
    run: async (sb, f) => {
      const val = await fetchAll<{ name: string; sku: string; brand_id: string; brand_name: string; on_hand: number; avg_cost: number; stock_value: number }>(() => {
        let q = sb.from("inventory_valuation").select("name, sku, brand_id, brand_name, on_hand, avg_cost, stock_value").order("name");
        if (f.brand) q = q.eq("brand_id", f.brand);
        return q;
      });
      const rows = val.map((v) => ({ name: v.name, sku: v.sku, brand: v.brand_name, on_hand: n(v.on_hand), avg_cost: n(v.avg_cost), value: n(v.stock_value) })).sort((a, b) => b.value - a.value);
      return {
        columns: [{ key: "name", label: "Product" }, { key: "sku", label: "Model / SKU" }, { key: "brand", label: "Brand" }, { key: "on_hand", label: "On hand", type: "num" }, { key: "avg_cost", label: "Avg. cost", type: "money" }, { key: "value", label: "Stock value", type: "money" }],
        rows,
        totals: sum(rows, ["on_hand", "value"]),
        note: "Valuation is as of now; the date range does not apply. Costs exclude GST.",
      };
    },
  },
  {
    key: "stock-movement", title: "Stock movement", description: "Opening, in, out and closing per product for the period.", group: "Stock", roles: [...OFFICE, "warehouse"], filters: ["brand"],
    run: async (sb, f) => {
      const [moves, cat] = await Promise.all([
        fetchAll<{ product_id: string; movement_type: string; qty: number; created_at: string }>(() => sb.from("stock_movements").select("product_id, movement_type, qty, created_at").lte("created_at", `${f.to}T23:59:59+05:30`)),
        fetchAll<{ id: string; name: string; sku: string; brand_id: string; brand_name: string }>(() => sb.from("catalog").select("id, name, sku, brand_id, brand_name")),
      ]);
      const start = Date.parse(`${f.from}T00:00:00+05:30`);
      const m = new Map<string, Record<string, number>>();
      for (const mv of moves) {
        const g = m.get(mv.product_id) ?? { opening: 0, received: 0, dispatched: 0, transfers: 0, adjustments: 0, damaged: 0, returns: 0, closing: 0 };
        const q = n(mv.qty);
        if (Date.parse(mv.created_at) < start) g.opening += q;
        else if (mv.movement_type === "stock_in" || mv.movement_type === "opening") g.received += q;
        else if (mv.movement_type === "dispatch" || mv.movement_type === "dispatch_reversal") g.dispatched += q;
        else if (mv.movement_type.startsWith("transfer")) g.transfers += q;
        else if (mv.movement_type === "damage") g.damaged += q;
        else if (mv.movement_type === "credit_note_return") g.returns += q;
        else g.adjustments += q;
        g.closing += q;
        m.set(mv.product_id, g);
      }
      const rows = cat
        .filter((c) => (!f.brand || c.brand_id === f.brand) && m.has(c.id))
        .map((c) => ({ name: c.name, sku: c.sku, brand: c.brand_name, ...m.get(c.id)! }))
        .sort((a, b) => String(a.name).localeCompare(String(b.name)));
      return {
        columns: [
          { key: "name", label: "Product" }, { key: "sku", label: "Model / SKU" }, { key: "opening", label: "Opening", type: "num" }, { key: "received", label: "Stock in", type: "num" },
          { key: "dispatched", label: "Dispatched", type: "num" }, { key: "returns", label: "Returns", type: "num" }, { key: "transfers", label: "Transfers (net)", type: "num" },
          { key: "adjustments", label: "Adjust. & counts", type: "num" }, { key: "damaged", label: "Damaged", type: "num" }, { key: "closing", label: "Closing", type: "num" },
        ],
        rows,
        totals: sum(rows, ["opening", "received", "dispatched", "returns", "transfers", "adjustments", "damaged", "closing"]),
      };
    },
  },
  {
    key: "expenses", title: "Expense report", description: "Salesman expenses by category (approved and reimbursed).", group: "Team", roles: [...OFFICE], filters: ["salesman"],
    run: async (sb, f) => {
      const [ex, people] = await Promise.all([
        fetchAll<{ salesman_id: string; category: string; amount: number; status: string }>(() => {
          let q = sb.from("expenses").select("salesman_id, category, amount, status").gte("expense_date", f.from).lte("expense_date", f.to);
          if (f.salesman) q = q.eq("salesman_id", f.salesman);
          return q;
        }),
        sb.from("profiles").select("id, full_name"),
      ]);
      const u = new Map((people.data ?? []).map((p) => [p.id as string, p.full_name as string]));
      const cats = ["fuel", "food", "parking", "accommodation", "travel", "other"];
      const g = group(ex.filter((e) => e.status !== "rejected"), (e) => e.salesman_id, (e) => ({ name: u.get(e.salesman_id) ?? "", ...Object.fromEntries(cats.map((c) => [c, 0])), pending: 0, total: 0 }), (a, e) => {
        a[e.category] = n(a[e.category]) + n(e.amount);
        a.total = n(a.total) + n(e.amount);
        if (e.status === "submitted") a.pending = n(a.pending) + n(e.amount);
      });
      return {
        columns: [{ key: "name", label: "Salesman" }, ...cats.map((c) => ({ key: c, label: c[0].toUpperCase() + c.slice(1), type: "money" as const })), { key: "pending", label: "Awaiting approval", type: "money" }, { key: "total", label: "Total", type: "money" }],
        rows: g.sort((a, b) => n(b.total) - n(a.total)),
        totals: sum(g, [...cats, "pending", "total"]),
        note: "Rejected expenses are excluded.",
      };
    },
  },
  {
    key: "payment-behaviour", title: "Retailer payment behaviour", description: "On-time payment, average days to pay, overdue and bounces.", group: "Money", roles: OFFICE, filters: ["route", "salesman"],
    run: async (sb, f) => {
      const [invs, allocs, dir, bounced] = await Promise.all([
        fetchAll<{ id: string; retailer_id: string; invoice_date: string; due_date: string; grand_total: number }>(() => sb.from("invoices").select("id, retailer_id, invoice_date, due_date, grand_total").eq("status", "issued").gte("invoice_date", f.from).lte("invoice_date", f.to)),
        fetchAll<{ invoice_id: string; amount: number; payments: { payment_date: string; status: string } | null }>(() => sb.from("payment_allocations").select("invoice_id, amount, payments(payment_date, status)")),
        fetchAll<{ id: string; shop_name: string; code: string; route_id: string | null; salesman_id: string | null; classification: string | null }>(() => sb.from("retailer_directory").select("id, shop_name, code, route_id, salesman_id, classification")),
        fetchAll<{ retailer_id: string }>(() => sb.from("payments").select("retailer_id").eq("status", "bounced").gte("payment_date", f.from).lte("payment_date", f.to)),
      ]);
      const paid = new Map<string, { amount: number; last: string }>();
      for (const a of allocs) {
        if (a.payments?.status !== "received") continue;
        const p = paid.get(a.invoice_id) ?? { amount: 0, last: "" };
        p.amount += n(a.amount);
        if (a.payments.payment_date > p.last) p.last = a.payments.payment_date;
        paid.set(a.invoice_id, p);
      }
      const d = new Map(dir.map((r) => [r.id, r]));
      const CL: Record<string, string> = { star: "Star", average: "Average", needs_attention: "Needs attention", high_credit_risk: "High credit risk" };
      const today = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
      const g = group(invs.filter((i) => (!f.route || d.get(i.retailer_id)?.route_id === f.route) && (!f.salesman || d.get(i.retailer_id)?.salesman_id === f.salesman)), (i) => i.retailer_id,
        (i) => ({ name: d.get(i.retailer_id)?.shop_name ?? "", code: d.get(i.retailer_id)?.code ?? "", class: CL[d.get(i.retailer_id)?.classification ?? ""] ?? "—", invoices: 0, billed: 0, settled: 0, on_time: 0, _days: 0, avg_days: 0, overdue_now: 0, bounced: 0 }),
        (a, i) => {
          a.invoices = n(a.invoices) + 1;
          a.billed = n(a.billed) + n(i.grand_total);
          const p = paid.get(i.id);
          if (p && p.amount >= n(i.grand_total) - 0.5) {
            a.settled = n(a.settled) + 1;
            if (p.last <= i.due_date) a.on_time = n(a.on_time) + 1;
            a._days = n(a._days) + (Date.parse(p.last) - Date.parse(i.invoice_date)) / 864e5;
          } else if (i.due_date < today) a.overdue_now = n(a.overdue_now) + (n(i.grand_total) - (p?.amount ?? 0));
        });
      for (const r of g) {
        r.on_time_pct = n(r.settled) ? (n(r.on_time) / n(r.settled)) * 100 : 0;
        r.avg_days = n(r.settled) ? n(r._days) / n(r.settled) : 0;
        delete r._days;
      }
      for (const b of bounced) { const r = g.find((x) => x.code === d.get(b.retailer_id)?.code); if (r) r.bounced = n(r.bounced) + 1; }
      return {
        columns: [
          { key: "name", label: "Retailer" }, { key: "code", label: "ID" }, { key: "class", label: "Class" }, { key: "invoices", label: "Invoices", type: "int" },
          { key: "billed", label: "Billed", type: "money" }, { key: "settled", label: "Fully paid", type: "int" }, { key: "on_time_pct", label: "Paid on time", type: "pct" },
          { key: "avg_days", label: "Avg. days to pay", type: "num" }, { key: "overdue_now", label: "Overdue now", type: "money" }, { key: "bounced", label: "Bounced cheques", type: "int" },
        ],
        rows: g.sort((a, b) => n(b.overdue_now) - n(a.overdue_now)),
        note: "Based on invoices dated in the period.",
      };
    },
  },
  {
    key: "gross-profit", title: "Gross profit analysis", description: "Sales (taxable) minus cost of goods, by brand and product.", group: "Sales", roles: MGMT, filters: ["brand", "salesman", "route"],
    run: async (sb, f) => {
      const [rows, costs] = await Promise.all([sales(sb, f), fetchAll<{ line_id: string; cost: number }>(() => sb.from("sales_costs").select("line_id, cost"))]);
      const c = new Map(costs.map((x) => [x.line_id, n(x.cost)]));
      const g = group(rows, (r) => r.product_id, (r) => ({ brand: r.brand_name, name: r.product_name, sku: r.sku, qty: 0, revenue: 0, cost: 0, profit: 0, margin: 0 }), (a, r) => {
        a.qty = n(a.qty) + n(r.qty); a.revenue = n(a.revenue) + n(r.taxable_value); a.cost = n(a.cost) + (c.get(r.line_id) ?? 0);
      });
      for (const r of g) { r.profit = n(r.revenue) - n(r.cost); r.margin = n(r.revenue) ? (n(r.profit) / n(r.revenue)) * 100 : 0; }
      const t = sum(g, ["qty", "revenue", "cost", "profit"]);
      return {
        columns: [
          { key: "brand", label: "Brand" }, { key: "name", label: "Product" }, { key: "sku", label: "Model / SKU" }, { key: "qty", label: "Qty", type: "num" },
          { key: "revenue", label: "Sales (excl. GST)", type: "money" }, { key: "cost", label: "Cost", type: "money" }, { key: "profit", label: "Gross profit", type: "money" }, { key: "margin", label: "Margin", type: "pct" },
        ],
        rows: g.sort((a, b) => n(b.profit) - n(a.profit)),
        totals: { ...t, margin: t.revenue ? (t.profit / t.revenue) * 100 : 0 },
        note: "Cost is the weighted average purchase cost at the moment each invoice was issued. Credit notes are not deducted.",
      };
    },
  },
  ...PURCHASE_REPORTS,
];

export function reportByKey(key: string) {
  return REPORTS.find((r) => r.key === key);
}
