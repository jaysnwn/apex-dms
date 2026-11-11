import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  AlertTriangle, Boxes, CalendarCheck, ClipboardList, Clock, HandCoins, IndianRupee, Package, PackagePlus, Receipt, Route as RouteIcon,
  ShoppingCart, Store, TrendingUp, Truck, Users, Wallet,
} from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/reports";
import { date, inr, qty } from "@/lib/format";
import { todayIST, addDays } from "@/lib/gst";
import { ROLE_LABELS } from "@/lib/roles";
import { Alert, Badge, Card, PageHeader } from "@/components/ui";
import { StatCard } from "@/components/stat-card";
import { ColumnChart, RankBars } from "@/components/charts";
import { SERIES } from "@/lib/chart-colors";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const { profile } = await requireRole();
  const { denied } = await searchParams;
  if (profile.role === "salesman" && !denied) redirect("/m"); // salesmen use the mobile app
  const firstName = profile.full_name.split(" ")[0] || "there";

  return (
    <>
      <PageHeader title={`Hello, ${firstName}`} description={`${ROLE_LABELS[profile.role]} · ${date(new Date().toISOString())}`} />
      {denied && <div className="mb-6"><Alert tone="amber">Your role does not have access to that page.</Alert></div>}
      {profile.role === "salesman" ? <SalesmanDash userId={profile.id} /> : profile.role === "warehouse" ? <WarehouseDash /> : <OfficeDash showProfit={profile.role !== "billing"} />}
    </>
  );
}

// ---------------------------------------------------------------------------
async function OfficeDash({ showProfit }: { showProfit: boolean }) {
  const supabase = await createClient();
  const today = todayIST();
  const monthStart = today.slice(0, 8) + "01";
  const since = [monthStart, addDays(today, -29)].sort()[0];

  const [invs, sales, pays, balances, valuation, stock, counts, pendingDispatch, cheques, promises, expenses, salesmen, visits, costs, payables, toReceive] = await Promise.all([
    fetchAll<{ invoice_date: string; grand_total: number; orders: { salesman_id: string | null } | null }>(() => supabase.from("invoices").select("invoice_date, grand_total, orders(salesman_id)").eq("status", "issued").gte("invoice_date", since)),
    fetchAll<{ line_id: string; brand_name: string; retailer_id: string; shop_name: string; taxable_value: number; line_total: number }>(() => supabase.from("sales_register").select("line_id, brand_name, retailer_id, shop_name, taxable_value, line_total").gte("invoice_date", monthStart)),
    fetchAll<{ amount: number; collected_by: string | null; payment_date: string }>(() => supabase.from("payments").select("amount, collected_by, payment_date").in("status", ["received", "cheque_pending"]).gte("payment_date", monthStart)),
    fetchAll<{ outstanding: number; overdue: number; due_today: number }>(() => supabase.from("retailer_balances").select("outstanding, overdue, due_today")),
    fetchAll<{ stock_value: number; on_hand: number }>(() => supabase.from("inventory_valuation").select("stock_value, on_hand")),
    fetchAll<{ product_id: string; available: number; min_stock_qty: number; is_low: boolean }>(() => supabase.from("product_stock").select("product_id, available, min_stock_qty, is_low").eq("is_low", true)),
    supabase.from("retailers").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", "invoiced"),
    supabase.from("payments").select("amount").eq("status", "cheque_pending"),
    supabase.from("payment_promises").select("id, amount, promised_date, retailers(shop_name)").eq("status", "open").lte("promised_date", today).order("promised_date").limit(6),
    supabase.from("expenses").select("amount, approved_amount, status").gte("expense_date", monthStart).in("status", ["submitted", "approved"]),
    supabase.from("profiles").select("id, full_name").eq("role", "salesman").eq("is_active", true),
    supabase.from("visits").select("salesman_id, status").gte("planned_date", monthStart).lte("planned_date", today),
    showProfit ? fetchAll<{ line_id: string; cost: number }>(() => supabase.from("sales_costs").select("line_id, cost")) : Promise.resolve([]),
    fetchAll<{ balance: number; due_date: string }>(() => supabase.from("purchase_balances").select("balance, due_date").gt("balance", 0)),
    supabase.from("purchases").select("id", { count: "exact", head: true }).eq("status", "ordered"),
  ]);
  const { data: unverified } = await supabase.from("payments").select("amount").is("verified_at", null).in("status", ["received", "cheque_pending"]);
  const toVerify = (unverified ?? []).reduce((t, p) => t + Number(p.amount), 0);
  const payable = payables.reduce((t, b) => t + Number(b.balance), 0);
  const payableOverdue = payables.filter((b) => b.due_date < today).reduce((t, b) => t + Number(b.balance), 0);

  const sumN = <T,>(rows: T[], f: (r: T) => number) => rows.reduce((t, r) => t + f(r), 0);
  const todaySales = sumN(invs.filter((i) => i.invoice_date === today), (i) => Number(i.grand_total));
  const monthSales = sumN(invs.filter((i) => i.invoice_date >= monthStart), (i) => Number(i.grand_total));
  const monthCollected = sumN(pays, (p) => Number(p.amount));
  const outstanding = sumN(balances, (b) => Number(b.outstanding));
  const overdue = sumN(balances, (b) => Number(b.overdue));
  const invValue = sumN(valuation, (v) => Number(v.stock_value));
  const invUnits = sumN(valuation, (v) => Number(v.on_hand));
  const monthExpenses = sumN(expenses.data ?? [], (e) => Number(e.approved_amount ?? e.amount));
  const costMap = new Map(costs.map((c) => [c.line_id, Number(c.cost)]));
  const taxable = sumN(sales, (s) => Number(s.taxable_value));
  const cost = sumN(sales, (s) => costMap.get(s.line_id) ?? 0);
  const profit = taxable - cost;

  // last 30 days sales
  const days: { label: string; value: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = addDays(today, -i);
    days.push({ label: new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" }), value: sumN(invs.filter((x) => x.invoice_date === d), (x) => Number(x.grand_total)) });
  }
  const byBrand = new Map<string, number>();
  for (const s of sales) byBrand.set(s.brand_name, (byBrand.get(s.brand_name) ?? 0) + Number(s.line_total));
  const byRetailer = new Map<string, { name: string; v: number }>();
  for (const s of sales) byRetailer.set(s.retailer_id, { name: s.shop_name, v: (byRetailer.get(s.retailer_id)?.v ?? 0) + Number(s.line_total) });

  const team = (salesmen.data ?? []).map((s) => {
    const vs = (visits.data ?? []).filter((v) => v.salesman_id === s.id && v.status !== "rescheduled" && v.status !== "cancelled");
    return {
      name: s.full_name as string,
      sold: sumN(invs.filter((i) => i.invoice_date >= monthStart && i.orders?.salesman_id === s.id), (i) => Number(i.grand_total)),
      collected: sumN(pays.filter((p) => p.collected_by === s.id), (p) => Number(p.amount)),
      planned: vs.length,
      done: vs.filter((v) => v.status === "completed").length,
    };
  }).sort((a, b) => b.sold - a.sold);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Today's sales" value={inr(todaySales, { decimals: false })} icon={ShoppingCart} tone="blue" href="/sales/invoices" />
        <StatCard label="This month's sales" value={inr(monthSales, { decimals: false })} icon={TrendingUp} tone="violet" href="/reports/brand-sales" />
        <StatCard label="Collected this month" value={inr(monthCollected, { decimals: false })} icon={Wallet} tone="green" href="/payments" />
        <StatCard label="Collections to verify" value={inr(toVerify, { decimals: false })} icon={HandCoins} tone={toVerify > 0 ? "amber" : "slate"} alert={toVerify > 0} hint={`${(unverified ?? []).length} payment(s) with salesmen`} href="/payments/verify" />
        <StatCard label="Total outstanding" value={inr(outstanding, { decimals: false })} icon={IndianRupee} tone="orange" href="/payments/outstanding" />
        <StatCard label="Overdue" value={inr(overdue, { decimals: false })} icon={AlertTriangle} tone="red" alert={overdue > 0} href="/payments/outstanding" />
        <StatCard label="Inventory value" value={inr(invValue, { decimals: false })} icon={Boxes} tone="teal" hint={`${qty(invUnits)} units`} href="/reports/stock-valuation" />
        <StatCard label="Pending dispatch" value={String(pendingDispatch.count ?? 0)} icon={Truck} tone={(pendingDispatch.count ?? 0) > 0 ? "amber" : "slate"} href="/dispatch" />
        <StatCard label="Low-stock items" value={String(stock.length)} icon={Package} tone={stock.length > 0 ? "red" : "slate"} alert={stock.length > 0} href="/stock?low=1" />
        <StatCard label="Payable to suppliers" value={inr(payable, { decimals: false })} icon={PackagePlus} tone={payableOverdue > 0 ? "red" : "violet"} alert={payableOverdue > 0} hint={payableOverdue > 0 ? `${inr(payableOverdue, { decimals: false })} overdue` : "nothing overdue"} href="/purchases/payables" />
        <StatCard label="Purchase orders to receive" value={String(toReceive.count ?? 0)} icon={ClipboardList} tone={(toReceive.count ?? 0) > 0 ? "amber" : "slate"} href="/purchases/orders" />
        <StatCard label="Active retailers" value={String(counts.count ?? 0)} icon={Store} tone="violet" href="/retailers" />
        <StatCard label="Active salesmen" value={String((salesmen.data ?? []).length)} icon={Users} tone="blue" href="/routes" />
        <StatCard label="Expenses this month" value={inr(monthExpenses, { decimals: false })} icon={Receipt} tone="amber" href="/expenses?tab=all" />
        {showProfit ? (
          <StatCard label="Gross profit (month)" value={inr(profit, { decimals: false })} icon={TrendingUp} tone={profit >= 0 ? "green" : "red"} hint={taxable ? `${((profit / taxable) * 100).toFixed(1)}% margin` : undefined} href="/reports/gross-profit" />
        ) : (
          <StatCard label="Cheques not cleared" value={inr(sumN(cheques.data ?? [], (c) => Number(c.amount)), { decimals: false })} icon={Clock} tone="amber" href="/payments?status=cheque_pending&from=2000-01-01" />
        )}
      </div>

      <Card className="p-5">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="font-semibold">Sales, last 30 days</h2>
          <span className="text-sm text-slate-500">Invoice totals incl. GST</span>
        </div>
        <ColumnChart data={days} />
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-4 font-semibold">Brand-wise sales this month</h2>
          <RankBars data={[...byBrand.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 8)} color={SERIES[1]} />
        </Card>
        <Card className="p-5">
          <h2 className="mb-4 font-semibold">Top retailers this month</h2>
          <RankBars data={[...byRetailer.values()].sort((a, b) => b.v - a.v).slice(0, 8).map((r) => ({ label: r.name, value: r.v }))} color={SERIES[2]} />
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card className="overflow-x-auto">
          <div className="flex items-center justify-between border-b border-slate-100 p-4"><h2 className="font-semibold">Salesman performance (month)</h2><Link href="/routes" className="text-sm text-accent-700 hover:underline">Routes</Link></div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500"><tr><th className="px-4 py-2">Salesman</th><th className="px-3 py-2 text-right">Sales</th><th className="px-3 py-2 text-right">Collected</th><th className="px-4 py-2 text-right">Visits</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {team.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-500">No salesmen yet.</td></tr>}
              {team.map((t) => (
                <tr key={t.name}>
                  <td className="px-4 py-2 font-medium">{t.name}</td>
                  <td className="tabular px-3 py-2 text-right">{inr(t.sold, { decimals: false })}</td>
                  <td className="tabular px-3 py-2 text-right text-emerald-700">{inr(t.collected, { decimals: false })}</td>
                  <td className="tabular px-4 py-2 text-right">{t.done}/{t.planned} {t.planned > 0 && <Badge tone={t.done / t.planned >= 0.9 ? "green" : t.done / t.planned >= 0.6 ? "amber" : "red"}>{Math.round((t.done / t.planned) * 100)}%</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card className="p-5">
          <h2 className="mb-3 flex items-center gap-2 font-semibold"><CalendarCheck className="size-4 text-amber-600" /> Payment promises due</h2>
          {(promises.data ?? []).length === 0 ? <p className="text-sm text-slate-500">None due today.</p> : (
            <ul className="space-y-2 text-sm">
              {(promises.data ?? []).map((p) => (
                <li key={p.id} className="flex justify-between gap-2">
                  <span className="truncate">{(p.retailers as unknown as { shop_name: string })?.shop_name}<span className="block text-xs text-slate-500">{date(p.promised_date)}</span></span>
                  <span className="tabular font-medium">{inr(p.amount, { decimals: false })}</span>
                </li>
              ))}
            </ul>
          )}
          <Link href="/payments/promises" className="mt-3 inline-block text-sm text-accent-700 hover:underline">All promises</Link>
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
async function WarehouseDash() {
  const supabase = await createClient();
  const today = todayIST();
  const [pending, transit, low, counts, moves, inbound] = await Promise.all([
    supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", "invoiced"),
    supabase.from("dispatches").select("id", { count: "exact", head: true }).eq("status", "dispatched"),
    supabase.from("product_stock").select("product_id, available, min_stock_qty").eq("is_low", true).limit(12),
    supabase.from("stock_counts").select("id", { count: "exact", head: true }).in("status", ["draft", "submitted"]),
    supabase.from("stock_movements").select("id", { count: "exact", head: true }).gte("created_at", `${today}T00:00:00+05:30`),
    supabase.from("purchase_receipts").select("purchase_id").eq("status", "ordered"),
  ]);
  const inboundCount = new Set((inbound.data ?? []).map((r) => r.purchase_id as string)).size;
  const ids = (low.data ?? []).map((l) => l.product_id);
  const { data: names } = ids.length ? await supabase.from("catalog").select("id, name, sku").in("id", ids) : { data: [] };
  const n = new Map((names ?? []).map((p) => [p.id as string, p]));
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Waiting to dispatch" value={String(pending.count ?? 0)} icon={Truck} tone={(pending.count ?? 0) > 0 ? "amber" : "slate"} href="/dispatch" />
        <StatCard label="Goods to receive" value={String(inboundCount)} icon={PackagePlus} tone={inboundCount > 0 ? "amber" : "slate"} href="/purchases/receive" />
        <StatCard label="On the way" value={String(transit.count ?? 0)} icon={Truck} tone="teal" href="/dispatch?tab=transit" />
        <StatCard label="Low-stock items" value={String((low.data ?? []).length)} icon={Package} tone="red" alert={(low.data ?? []).length > 0} href="/stock?low=1" />
        <StatCard label="Open stock counts" value={String(counts.count ?? 0)} icon={ClipboardList} tone="violet" href="/stock/counts" hint={`${moves.count ?? 0} stock entries today`} />
      </div>
      <Card className="overflow-hidden">
        <div className="border-b border-slate-100 p-4 font-semibold">Low stock — reorder soon</div>
        {(low.data ?? []).length === 0 ? <p className="p-6 text-center text-sm text-slate-500">All products above minimum stock.</p> : (
          <ul className="divide-y divide-slate-100 text-sm">
            {(low.data ?? []).map((l) => (
              <li key={l.product_id} className="flex justify-between px-4 py-2.5">
                <Link href={`/products/${l.product_id}`} className="hover:underline">{n.get(l.product_id)?.name}<span className="ml-1 font-mono text-xs text-slate-500">{n.get(l.product_id)?.sku}</span></Link>
                <span className="tabular font-semibold text-red-700">{qty(l.available)} <span className="font-normal text-slate-400">/ min {qty(l.min_stock_qty)}</span></span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
async function SalesmanDash({ userId }: { userId: string }) {
  const supabase = await createClient();
  const today = todayIST();
  const monthStart = today.slice(0, 8) + "01";
  const [visits, bal, pays, invs, quotes, target] = await Promise.all([
    supabase.from("visits").select("status").eq("salesman_id", userId).eq("planned_date", today),
    supabase.from("retailer_balances").select("outstanding, overdue"),
    supabase.from("payments").select("amount").eq("collected_by", userId).in("status", ["received", "cheque_pending"]).gte("payment_date", monthStart),
    supabase.from("invoices").select("grand_total, orders!inner(salesman_id)").eq("status", "issued").eq("orders.salesman_id", userId).gte("invoice_date", monthStart),
    supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", "quotation").eq("created_by", userId),
    supabase.from("targets").select("*").eq("salesman_id", userId).lte("period_start", today).gte("period_end", today).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const v = (visits.data ?? []).filter((x) => x.status !== "rescheduled" && x.status !== "cancelled");
  const done = v.filter((x) => x.status === "completed" || x.status === "missed").length;
  const sumN = (rows: { amount?: number; grand_total?: number; outstanding?: number; overdue?: number }[] | null, k: "amount" | "grand_total" | "outstanding" | "overdue") => (rows ?? []).reduce((t, r) => t + Number(r[k] ?? 0), 0);
  const sold = sumN(invs.data, "grand_total");
  const collected = sumN(pays.data, "amount");

  return (
    <div className="space-y-6">
      <Link href="/routes/today" className="block">
        <Card className="overflow-hidden">
          <div className="flex items-center gap-4 bg-gradient-to-br from-ink-900 to-ink-700 p-5 text-white">
            <span className="grid size-12 place-items-center rounded-xl bg-accent-500 text-ink-900"><RouteIcon className="size-6" /></span>
            <div className="flex-1">
              <div className="text-lg font-semibold">Today&apos;s route</div>
              <div className="text-sm text-slate-300">{v.length ? `${done} of ${v.length} visits done` : "No visits planned today"}</div>
            </div>
            <span className="text-sm font-medium text-accent-500">Open →</span>
          </div>
        </Card>
      </Link>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="My sales this month" value={inr(sold, { decimals: false })} icon={TrendingUp} tone="blue" />
        <StatCard label="Collected this month" value={inr(collected, { decimals: false })} icon={Wallet} tone="green" />
        <StatCard label="Outstanding on my routes" value={inr(sumN(bal.data, "outstanding"), { decimals: false })} icon={IndianRupee} tone="orange" href="/payments/outstanding" />
        <StatCard label="Overdue on my routes" value={inr(sumN(bal.data, "overdue"), { decimals: false })} icon={AlertTriangle} tone="red" alert={sumN(bal.data, "overdue") > 0} href="/payments/outstanding" />
      </div>
      {target.data && (
        <Card className="p-5">
          <h2 className="mb-3 font-semibold">My target · {date(target.data.period_start)} – {date(target.data.period_end)}</h2>
          {[["Sales", sold, Number(target.data.sales_target)], ["Collection", collected, Number(target.data.collection_target)]].map(([l, d, g]) => {
            const pct = Number(g) > 0 ? Math.min(100, (Number(d) / Number(g)) * 100) : 0;
            return (
              <div key={String(l)} className="mb-3">
                <div className="mb-1 flex justify-between text-sm"><span>{l}</span><span className="tabular">{inr(Number(d), { decimals: false })} / {inr(Number(g), { decimals: false })}</span></div>
                <div className="h-2.5 rounded-full bg-slate-100"><div className="h-2.5 rounded-full" style={{ width: `${pct}%`, background: pct >= 100 ? "#1baf7a" : SERIES[0] }} /></div>
              </div>
            );
          })}
        </Card>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <Link href="/sales/new"><Card className="p-4 hover:border-slate-300"><ShoppingCart className="mb-2 size-5 text-sky-600" /><div className="font-medium">New order</div></Card></Link>
        <Link href="/sales/quotations"><Card className="p-4 hover:border-slate-300"><ClipboardList className="mb-2 size-5 text-violet-600" /><div className="font-medium">My quotations</div><div className="text-sm text-slate-500">{quotes.count ?? 0} waiting for office</div></Card></Link>
        <Link href="/expenses"><Card className="p-4 hover:border-slate-300"><Receipt className="mb-2 size-5 text-amber-600" /><div className="font-medium">Add expense</div></Card></Link>
      </div>
    </div>
  );
}
