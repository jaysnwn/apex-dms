import Link from "next/link";
import type { Metadata } from "next";
import { Banknote, CalendarClock, CalendarRange, Wallet } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { date, inr } from "@/lib/format";
import { DUE_STATUS, RETAILER_CLASS } from "@/lib/status";
import { Badge, Button, Card, Select, cn } from "@/components/ui";
import { Chip } from "@/components/chip";
import { StatCard } from "@/components/stat-card";
import { allRows } from "@/lib/all-rows";
import { required } from "@/lib/required";
import { todayIST } from "@/lib/gst";
import { DUE_KEYS, dueWindows, type DueKey } from "@/lib/due-windows";

export const metadata: Metadata = { title: "Outstanding" };

export default async function OutstandingPage({ searchParams }: { searchParams: Promise<{ view?: string; route?: string; salesman?: string; bucket?: string; due?: string }> }) {
  const { profile } = await requireRole("super_admin", "manager", "billing", "salesman");
  const sp = await searchParams;
  const supabase = await createClient();
  const isOffice = profile.role !== "salesman";

  const today = todayIST();
  const monthStart = today.slice(0, 8) + "01";
  const [{ data: bal }, { data: dir }, { data: routes }, { data: salesmen }, { data: openInv }, { data: paidThisMonth }] = await Promise.all([
    allRows(() => supabase.from("retailer_balances").select("*").gt("outstanding", 0).order("retailer_id")),
    allRows(() => supabase.from("retailer_directory").select("id, route_id, route_name, salesman_id, salesman_name, mobile, classification, billing_city").order("id")),
    supabase.from("routes").select("id, name").order("name"),
    isOffice ? supabase.from("tenant_people").select("id, full_name").eq("role", "salesman").order("full_name") : Promise.resolve({ data: [] }),
    // every open bill: the due-date filters (today / this week / this month) and the invoice-wise view
    allRows(() => supabase.from("invoice_balances").select("invoice_id, invoice_no, retailer_id, invoice_date, due_date, balance, due_status, days_past_due, ageing_bucket").gt("balance", 0).order("due_date").order("invoice_id")),
    // money received this month (cheques not yet cleared included, bounced / cancelled not)
    allRows(() => supabase.from("payments").select("id, retailer_id, amount").in("status", ["received", "cheque_pending"]).gte("payment_date", monthStart).lte("payment_date", today).order("id")),
  ]);
  const dMap = new Map((dir ?? []).map((d) => [d.id as string, d]));
  // retailer_balances reads FROM retailers and left-joins the invoice
  // balances, so retailer_id is the retailer's own primary key.
  let rows = (bal ?? []).map((b) => {
    const retailerId = required(b.retailer_id, "Retailer of an outstanding balance");
    return { ...b, retailer_id: retailerId, d: dMap.get(retailerId) };
  });
  if (sp.route) rows = rows.filter((r) => r.d?.route_id === sp.route);
  if (sp.salesman) rows = rows.filter((r) => r.d?.salesman_id === sp.salesman);
  const bucketKey = { "0-15": "overdue_0_15", "16-30": "overdue_16_30", "31-45": "overdue_31_45", "45+": "overdue_45_plus" } as const;
  if (sp.bucket && sp.bucket in bucketKey) rows = rows.filter((r) => Number(r[bucketKey[sp.bucket as keyof typeof bucketKey]]) > 0);
  rows.sort((a, b) => Number(b.overdue) - Number(a.overdue) || Number(b.outstanding) - Number(a.outstanding));

  // Open bills of the shops in view (route / salesman / ageing filters applied).
  const inView = new Set(rows.map((r) => r.retailer_id));
  const openBills: { invoice_id: string; invoice_no: string; retailer_id: string; invoice_date: string; due_date: string; balance: number; due_status: string; days_past_due: number; ageing_bucket: string | null }[] =
    (openInv ?? [])
      .filter((i) => i.retailer_id !== null && inView.has(i.retailer_id))
      .map((i) => ({
        ...i,
        invoice_id: required(i.invoice_id, "Invoice id"),
        invoice_no: required(i.invoice_no, "Invoice number"),
        retailer_id: required(i.retailer_id, "Retailer of an invoice"),
        invoice_date: required(i.invoice_date, "Invoice date"),
        due_date: required(i.due_date, "Invoice due date"),
        due_status: required(i.due_status, "Invoice due status"),
        balance: Number(i.balance),
        days_past_due: Number(i.days_past_due),
      }));

  // When is it due: overdue, today, this week (to Sunday), this month (to month end).
  const win = dueWindows(today);
  const dueKey = (DUE_KEYS as string[]).includes(sp.due ?? "") ? (sp.due as DueKey) : null;
  const dueSum = (k: DueKey) => openBills.filter((i) => win.test[k](i.due_date)).reduce((s, i) => s + i.balance, 0);
  const dueCount = (k: DueKey) => new Set(openBills.filter((i) => win.test[k](i.due_date)).map((i) => i.retailer_id)).size;
  const allShops = rows;   // the cards at the top always show every due, whatever the due filter
  const dueByShop = new Map<string, number>();
  if (dueKey) {
    for (const i of openBills) if (win.test[dueKey](i.due_date)) dueByShop.set(i.retailer_id, (dueByShop.get(i.retailer_id) ?? 0) + i.balance);
    rows = rows.filter((r) => dueByShop.has(r.retailer_id)).sort((a, b) => (dueByShop.get(b.retailer_id) ?? 0) - (dueByShop.get(a.retailer_id) ?? 0));
  }
  const invoiceRows = dueKey ? openBills.filter((i) => win.test[dueKey](i.due_date)) : openBills;
  const t = (k: string) => allShops.reduce((s, r) => s + Number((r as Record<string, unknown>)[k] ?? 0), 0);
  const daysToGo = (due: string) => {
    const n = Math.round((Date.parse(due + "T00:00:00Z") - Date.parse(today + "T00:00:00Z")) / 864e5);
    return n === 1 ? "Due tomorrow" : `Due in ${n} days`;
  };
  const shortDate = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
  const DUE_FILTERS: { k: DueKey; label: string; hint: string; tone: string }[] = [
    { k: "overdue", label: "Overdue", hint: "before today", tone: "text-red-700" },
    { k: "today", label: "Due today", hint: shortDate(win.today), tone: "text-amber-700" },
    { k: "week", label: "Due this week", hint: `to Sun ${shortDate(win.weekEnd)}`, tone: "text-orange-700" },
    { k: "month", label: "Due this month", hint: `to ${shortDate(win.monthEnd)}`, tone: "text-sky-700" },
  ];
  const dueLabel = DUE_FILTERS.find((f) => f.k === dueKey)?.label;
  // Cards: total = overdue + due this month (today → month end) + not due (after this month).
  const notDueAfterMonth = openBills.filter((i) => i.due_date > win.monthEnd).reduce((s, i) => s + i.balance, 0);
  const notDueShops = new Set(openBills.filter((i) => i.due_date > win.monthEnd).map((i) => i.retailer_id)).size;
  const overdueNow = dueSum("overdue");
  // Per shop, split the same way as the cards (never overlapping): overdue,
  // due this month (today → month end), not due (after this month).
  const split = new Map<string, { overdue: number; month: number; later: number }>();
  for (const i of openBills) {
    const v = split.get(i.retailer_id) ?? { overdue: 0, month: 0, later: 0 };
    if (win.test.overdue(i.due_date)) v.overdue += i.balance;
    else if (i.due_date <= win.monthEnd) v.month += i.balance;
    else v.later += i.balance;
    split.set(i.retailer_id, v);
  }
  // Payments from shops in view (route / salesman filters), whether or not they still owe anything.
  const shopFits = (id: string | null) => {
    const d = id ? dMap.get(id) : undefined;
    return !!d && (!sp.route || d.route_id === sp.route) && (!sp.salesman || d.salesman_id === sp.salesman);
  };
  const received = (paidThisMonth ?? []).filter((p) => shopFits(p.retailer_id as string | null));
  const receivedSum = received.reduce((s, p) => s + Number(p.amount), 0);
  const monthName = new Date(monthStart + "T00:00:00Z").toLocaleDateString("en-IN", { month: "long", timeZone: "UTC" });
  const shopName = new Map(rows.map((r) => [r.retailer_id as string, r.shop_name as string]));

  const qs = (patch: Record<string, string | undefined>) => {
    const n = new URLSearchParams();
    for (const [k, v] of Object.entries({ view: sp.view, route: sp.route, salesman: sp.salesman, bucket: sp.bucket, due: sp.due, ...patch })) if (v) n.set(k, v);
    return `/payments/outstanding?${n}`;
  };

  const buckets = [
    { k: "0-15", label: "0–15 days", v: t("overdue_0_15"), cls: "bg-amber-400" },
    { k: "16-30", label: "16–30 days", v: t("overdue_16_30"), cls: "bg-orange-500" },
    { k: "31-45", label: "31–45 days", v: t("overdue_31_45"), cls: "bg-red-500" },
    { k: "45+", label: "45+ days", v: t("overdue_45_plus"), cls: "bg-red-800" },
  ];
  const overdueTotal = buckets.reduce((s, b) => s + b.v, 0);

  return (
    <>
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total outstanding" value={inr(t("outstanding"), { decimals: false })} icon={Wallet} tone="blue" alert={overdueNow > 0}
          hint={`${allShops.length} retailers${overdueNow > 0 ? ` · ${inr(overdueNow, { decimals: false })} overdue` : " · nothing overdue"}`} />
        <StatCard label="Due this month" value={inr(dueSum("month"), { decimals: false })} icon={CalendarRange} tone="amber"
          hint={`today to ${shortDate(win.monthEnd)} · ${dueCount("month")} retailers`} href={qs({ due: "month" })} />
        <StatCard label="Not due" value={inr(notDueAfterMonth, { decimals: false })} icon={CalendarClock} tone="green"
          hint={`due after ${shortDate(win.monthEnd)} · ${notDueShops} retailers`} />
        <StatCard label="Payments received" value={inr(receivedSum, { decimals: false })} icon={Banknote} tone="violet"
          hint={`${monthName} · ${received.length} payment${received.length === 1 ? "" : "s"}`} href={`/payments?from=${monthStart}&to=${today}`} />
      </div>

      <Card className="mb-6 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">When is it due</h2>
          {dueKey && <Link href={qs({ due: undefined })} className="text-sm text-slate-500 hover:underline">Show all dues</Link>}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {DUE_FILTERS.map((f) => (
            <Link key={f.k} href={qs({ due: dueKey === f.k ? undefined : f.k })} aria-current={dueKey === f.k ? "true" : undefined}
              className={cn("rounded-lg border p-2.5", dueKey === f.k ? "border-ink-900 bg-slate-50" : "border-slate-200 hover:border-slate-300")}>
              <div className="text-xs text-slate-500">{f.label} <span className="text-slate-400">· {f.hint}</span></div>
              <div className={cn("tabular font-semibold", dueSum(f.k) > 0 ? f.tone : "text-slate-400")}>{inr(dueSum(f.k), { decimals: false })}</div>
              <div className="text-xs text-slate-400">{dueCount(f.k)} retailer{dueCount(f.k) === 1 ? "" : "s"}</div>
            </Link>
          ))}
        </div>
      </Card>

      <Card className="mb-6 p-5">
        <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">Overdue ageing</h2><span className="tabular text-sm text-slate-500">{inr(overdueTotal, { decimals: false })}</span></div>
        <div className="flex h-4 overflow-hidden rounded-full bg-slate-100">
          {buckets.map((b) => overdueTotal > 0 && b.v > 0 ? <div key={b.k} className={b.cls} style={{ width: `${(b.v / overdueTotal) * 100}%` }} title={`${b.label}: ${inr(b.v)}`} /> : null)}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {buckets.map((b) => (
            <Link key={b.k} href={qs({ bucket: sp.bucket === b.k ? undefined : b.k })} className={cn("rounded-lg border p-2.5", sp.bucket === b.k ? "border-ink-900" : "border-slate-200 hover:border-slate-300")}>
              <div className="flex items-center gap-1.5 text-xs text-slate-500"><span className={cn("size-2.5 rounded-full", b.cls)} /> {b.label}</div>
              <div className="tabular font-semibold">{inr(b.v, { decimals: false })}</div>
            </Link>
          ))}
        </div>
      </Card>

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="flex gap-2">
          <Chip href={qs({ view: undefined })} active={sp.view !== "invoices"}>Retailer-wise</Chip>
          <Chip href={qs({ view: "invoices" })} active={sp.view === "invoices"}>Invoice-wise</Chip>
        </div>
        <form className="flex flex-1 flex-wrap gap-2 lg:justify-end">
          {sp.view && <input type="hidden" name="view" value={sp.view} />}
          {sp.bucket && <input type="hidden" name="bucket" value={sp.bucket} />}
          {dueKey && <input type="hidden" name="due" value={dueKey} />}
          <Select name="route" defaultValue={sp.route ?? ""} className="w-44" aria-label="Route">
            <option value="">All routes</option>
            {(routes ?? []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
          {isOffice && (
            <Select name="salesman" defaultValue={sp.salesman ?? ""} className="w-44" aria-label="Salesman">
              <option value="">All salesmen</option>
              {(salesmen ?? []).map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
            </Select>
          )}
          <Button type="submit" variant="secondary">Filter</Button>
        </form>
      </div>

      {sp.view === "invoices" ? (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
              <tr><th className="px-4 py-2.5">Invoice</th><th className="px-3 py-2.5">Retailer</th><th className="px-3 py-2.5">Due date</th><th className="px-3 py-2.5">Status</th><th className="px-4 py-2.5 text-right">Balance</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {invoiceRows.map((i) => {
                const st = DUE_STATUS[i.due_status];
                return (
                  <tr key={i.invoice_id} className={cn(i.due_status === "overdue" && "bg-red-50/30")}>
                    <td className="px-4 py-2.5"><Link href={`/sales/invoices/${i.invoice_id}`} className="font-mono text-xs font-medium hover:underline">{i.invoice_no}</Link><div className="text-xs text-slate-500">{date(i.invoice_date)}</div></td>
                    <td className="px-3 py-2.5"><Link href={`/retailers/${i.retailer_id}`} className="hover:underline">{shopName.get(i.retailer_id)}</Link></td>
                    <td className="px-3 py-2.5">{date(i.due_date)}</td>
                    <td className="px-3 py-2.5"><Badge tone={st.tone}>{i.due_status === "not_yet_due" ? daysToGo(i.due_date) : `${st.label}${i.due_status === "overdue" ? ` · ${i.days_past_due}d` : ""}`}</Badge></td>
                    <td className="tabular px-4 py-2.5 text-right font-semibold">{inr(i.balance)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
              <tr>
                <th className="px-4 py-2.5">Retailer</th><th className="px-3 py-2.5 text-right">Outstanding</th>
                {dueKey ? (
                  <th className="px-3 py-2.5 text-right">{dueLabel}</th>
                ) : (
                  <>
                    <th className="px-3 py-2.5 text-right">Overdue</th>
                    <th className="px-3 py-2.5 text-right">Due this month <span className="font-normal text-slate-400">to {shortDate(win.monthEnd)}</span></th>
                    <th className="px-3 py-2.5 text-right">Not due <span className="font-normal text-slate-400">after {shortDate(win.monthEnd)}</span></th>
                  </>
                )}
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length === 0 && <tr><td colSpan={dueKey ? 4 : 6} className="px-4 py-10 text-center text-slate-500">{dueKey ? `Nothing ${dueLabel?.toLowerCase()}.` : "Nothing outstanding. 🎉"}</td></tr>}
              {rows.map((r) => {
                const cls = r.d?.classification ? RETAILER_CLASS[r.d.classification] : null;
                const cell = (v: unknown, tone: string) => <td className={cn("tabular px-3 py-2.5 text-right", Number(v) > 0 ? tone : "text-slate-300")}>{Number(v) > 0 ? inr(v as number, { decimals: false }) : "—"}</td>;
                return (
                  <tr key={r.retailer_id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5">
                      <Link href={`/retailers/${r.retailer_id}`} className="font-medium hover:underline">{r.shop_name}</Link>
                      <div className="text-xs text-slate-500">{r.code} · {r.d?.route_name ?? "No route"}{r.d?.salesman_name ? ` · ${r.d.salesman_name}` : ""}</div>
                      {cls && <Badge tone={cls.tone}>{cls.label}</Badge>}
                    </td>
                    <td className="tabular px-3 py-2.5 text-right font-semibold">{inr(r.outstanding, { decimals: false })}</td>
                    {dueKey ? cell(dueByShop.get(r.retailer_id), "font-semibold text-ink-900") : (
                      <>
                        {cell(split.get(r.retailer_id)?.overdue, "text-red-700 font-semibold")}
                        {cell(split.get(r.retailer_id)?.month, "text-amber-700 font-medium")}
                        {cell(split.get(r.retailer_id)?.later, "text-emerald-700")}
                      </>
                    )}
                    <td className="px-4 py-2.5 text-right"><Link href={`/payments/new?retailer=${r.retailer_id}`} className="text-xs font-medium text-emerald-700 hover:underline">Collect</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
