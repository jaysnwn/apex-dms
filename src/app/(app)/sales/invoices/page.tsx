import Link from "next/link";
import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { date, inr, safeSearch } from "@/lib/format";
import { DUE_STATUS, ORDER_STATUS } from "@/lib/status";
import { Badge, Button, Card, Input, cn } from "@/components/ui";
import { Chip } from "@/components/chip";

export const metadata: Metadata = { title: "Invoices" };

const FILTERS = [
  { key: "", label: "All" },
  { key: "not_yet_due", label: "Not yet due" },
  { key: "due", label: "Due today" },
  { key: "overdue", label: "Overdue" },
  { key: "paid", label: "Paid" },
  { key: "cancelled", label: "Cancelled" },
];

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ q?: string; due?: string; from?: string; to?: string }> }) {
  await requireRole("super_admin", "manager", "billing", "salesman", "warehouse");
  const sp = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("invoices")
    .select("id, invoice_no, invoice_date, due_date, grand_total, status, retailer_snapshot, order_id, orders(status)")
    .order("invoice_date", { ascending: false })
    .order("invoice_no", { ascending: false })
    .limit(300);
  const term = safeSearch(sp.q);
  if (term) query = query.or(`invoice_no.ilike.%${term}%,retailer_snapshot->>shop_name.ilike.%${term}%`);
  if (sp.from) query = query.gte("invoice_date", sp.from);
  if (sp.to) query = query.lte("invoice_date", sp.to);
  if (sp.due === "cancelled") query = query.eq("status", "cancelled");
  const { data: invoices } = await query;
  const ids = (invoices ?? []).map((i) => i.id);
  const { data: balances } = ids.length
    ? await supabase.from("invoice_balances").select("invoice_id, balance, due_status, days_past_due").in("invoice_id", ids)
    : { data: [] };
  const bMap = new Map((balances ?? []).map((b) => [b.invoice_id as string, b]));
  let rows = invoices ?? [];
  if (sp.due && sp.due !== "cancelled") rows = rows.filter((i) => bMap.get(i.id)?.due_status === sp.due);

  const totals = rows.reduce(
    (t, i) => ({ amount: t.amount + (i.status === "issued" ? Number(i.grand_total) : 0), balance: t.balance + Math.max(0, Number(bMap.get(i.id)?.balance ?? 0)) }),
    { amount: 0, balance: 0 }
  );

  const href = (due: string) => {
    const n = new URLSearchParams();
    if (sp.q) n.set("q", sp.q);
    if (sp.from) n.set("from", sp.from);
    if (sp.to) n.set("to", sp.to);
    if (due) n.set("due", due);
    return `/sales/invoices?${n}`;
  };

  return (
    <>
      <form className="mb-3 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
        {sp.due && <input type="hidden" name="due" value={sp.due} />}
        <Input name="q" defaultValue={sp.q} placeholder="Invoice number or shop name" type="search" />
        <Input name="from" type="date" defaultValue={sp.from} aria-label="From" />
        <Input name="to" type="date" defaultValue={sp.to} aria-label="To" />
        <Button type="submit" variant="secondary">Search</Button>
      </form>
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => <Chip key={f.key} href={href(f.key)} active={(sp.due ?? "") === f.key}>{f.label}</Chip>)}
      </div>
      <div className="mb-3 text-sm text-slate-500">
        {rows.length} invoices · billed <span className="tabular font-medium text-slate-900">{inr(totals.amount, { decimals: false })}</span> · balance{" "}
        <span className="tabular font-medium text-slate-900">{inr(totals.balance, { decimals: false })}</span>
      </div>
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
            <tr>
              <th className="px-4 py-2.5">Invoice</th><th className="px-3 py-2.5">Retailer</th><th className="px-3 py-2.5">Due</th>
              <th className="hidden px-3 py-2.5 md:table-cell">Delivery</th><th className="px-3 py-2.5 text-right">Amount</th><th className="px-4 py-2.5 text-right">Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">No invoices match.</td></tr>}
            {rows.map((i) => {
              const b = bMap.get(i.id);
              const ds = i.status === "cancelled" ? DUE_STATUS.cancelled : DUE_STATUS[b?.due_status ?? "not_yet_due"];
              const snap = i.retailer_snapshot as { shop_name: string; billing_city?: string };
              const os = (i.orders as unknown as { status: string } | null)?.status;
              return (
                <tr key={i.id} className={cn("hover:bg-slate-50", b?.due_status === "overdue" && "bg-red-50/30")}>
                  <td className="px-4 py-2.5"><Link href={`/sales/invoices/${i.id}`} className="font-mono font-medium hover:underline">{i.invoice_no}</Link><div className="text-xs text-slate-500">{date(i.invoice_date)}</div></td>
                  <td className="px-3 py-2.5">{snap.shop_name}<div className="text-xs text-slate-500">{snap.billing_city}</div></td>
                  <td className="px-3 py-2.5">
                    <Badge tone={ds.tone}>{ds.label}{b?.due_status === "overdue" ? ` · ${b.days_past_due}d` : ""}</Badge>
                    <div className="text-xs text-slate-500">{date(i.due_date)}</div>
                  </td>
                  <td className="hidden px-3 py-2.5 md:table-cell">{os && i.status === "issued" && <Badge tone={ORDER_STATUS[os].tone}>{ORDER_STATUS[os].label}</Badge>}</td>
                  <td className="tabular px-3 py-2.5 text-right">{inr(i.grand_total)}</td>
                  <td className={cn("tabular px-4 py-2.5 text-right font-medium", Number(b?.balance ?? 0) > 0 ? (b?.due_status === "overdue" ? "text-red-700" : "text-slate-900") : "text-emerald-700")}>
                    {i.status === "cancelled" ? "—" : inr(Math.max(0, Number(b?.balance ?? 0)))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </>
  );
}
