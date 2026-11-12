import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MapPin, Pencil, Phone, ShoppingCart, Wallet } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { date, dateTime, inr } from "@/lib/format";
import { GST_STATES } from "@/lib/states";
import { DUE_STATUS, ORDER_STATUS, PAYMENT_METHOD, PAYMENT_STATUS, PROMISE_STATUS, RETAILER_CLASS, RETAILER_STATUS, VISIT_STATUS } from "@/lib/status";
import { todayIST } from "@/lib/gst";
import { Badge, Button, Card, Input, PageHeader, cn } from "@/components/ui";
import { Chip, LinkButton } from "@/components/chip";
import { DocButtons } from "@/components/doc-buttons";
import { PromiseForm } from "./promise-form";
import { allRows } from "@/lib/all-rows";
import { required } from "@/lib/required";

export const metadata: Metadata = { title: "Retailer" };

const TABS = [
  { k: "statement", label: "Statement" },
  { k: "invoices", label: "Invoices" },
  { k: "payments", label: "Payments" },
  { k: "orders", label: "Orders" },
  { k: "promises", label: "Promises" },
  { k: "visits", label: "Visits" },
  { k: "profile", label: "Profile" },
];

export default async function RetailerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; from?: string; to?: string }> }) {
  const { profile } = await requireRole();
  const { id } = await params;
  const sp = await searchParams;
  const tab = TABS.some((t) => t.k === sp.tab) ? sp.tab! : "statement";
  const supabase = await createClient();
  const { data: r } = await supabase.from("retailer_directory").select("*").eq("id", id).maybeSingle();
  if (!r) notFound();
  const { data: bal } = await supabase.from("retailer_balances").select("*").eq("retailer_id", id).maybeSingle();
  const role = profile.role;
  const canEdit = ["super_admin", "manager", "billing"].includes(role);
  const canSell = role !== "warehouse";
  const status = RETAILER_STATUS[required(r.status, "Retailer status")];
  const cls = r.classification ? RETAILER_CLASS[r.classification] : null;

  const summary = [
    { label: "Outstanding", value: Number(bal?.outstanding ?? 0), cls: "text-slate-900" },
    { label: "Not yet due", value: Number(bal?.not_yet_due ?? 0), cls: "text-emerald-700" },
    { label: "Due today", value: Number(bal?.due_today ?? 0), cls: "text-amber-700" },
    { label: "Overdue", value: Number(bal?.overdue ?? 0), cls: "text-red-700" },
    { label: "Total purchases", value: Number(bal?.total_invoiced ?? 0), cls: "text-slate-900" },
    { label: "Total paid", value: Number(bal?.total_received ?? 0), cls: "text-slate-900" },
  ];
  const creditUse = Number(r.credit_limit) > 0 ? Math.min(100, (Number(bal?.outstanding ?? 0) / Number(r.credit_limit)) * 100) : null;

  return (
    <>
      <PageHeader
        title={required(r.shop_name, "Shop name")}
        description={`${r.code}${r.owner_name ? ` · ${r.owner_name}` : ""}${r.billing_city ? ` · ${r.billing_city}` : ""}`}
        actions={
          <>
            <a href={`tel:${r.mobile}`} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium hover:bg-slate-50"><Phone className="size-4" /> <span className="hidden sm:inline">Call</span></a>
            {canSell && <LinkButton href={`/payments/new?retailer=${id}`}><Wallet className="size-4" /> <span className="hidden sm:inline">Payment</span></LinkButton>}
            {canSell && <LinkButton href={`/sales/new?retailer=${id}`} variant="primary"><ShoppingCart className="size-4" /> New order</LinkButton>}
            {canEdit && <LinkButton href={`/retailers/${id}/edit`}><Pencil className="size-4" /></LinkButton>}
          </>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Badge tone={status.tone}>{status.label}</Badge>
        {cls && <Badge tone={cls.tone}>{cls.label}</Badge>}
        <Badge>{r.credit_days} days credit</Badge>
        {r.route_name && <Badge tone="violet"><MapPin className="mr-1 size-3" />{r.route_name}</Badge>}
        {r.salesman_name && <Badge tone="teal">{r.salesman_name}</Badge>}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {summary.map((s) => (
          <Card key={s.label} className="p-4">
            <div className="text-xs text-slate-500">{s.label}</div>
            <div className={cn("tabular mt-1 text-lg font-semibold", s.value > 0 ? s.cls : "text-slate-400")}>{inr(s.value, { decimals: false })}</div>
          </Card>
        ))}
      </div>
      {creditUse !== null && (
        <Card className="mb-6 p-4">
          <div className="mb-1.5 flex justify-between text-sm"><span className="text-slate-500">Credit limit used</span><span className="tabular font-medium">{inr(bal?.outstanding ?? 0, { decimals: false })} of {inr(r.credit_limit, { decimals: false })}</span></div>
          <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
            <div className={cn("h-full rounded-full", creditUse >= 100 ? "bg-red-600" : creditUse >= 80 ? "bg-amber-500" : "bg-emerald-500")} style={{ width: `${creditUse}%` }} />
          </div>
        </Card>
      )}

      <div className="mb-5 flex flex-wrap gap-2">
        {TABS.map((t) => <Chip key={t.k} href={`/retailers/${id}?tab=${t.k}`} active={tab === t.k}>{t.label}</Chip>)}
      </div>

      {tab === "statement" && <Statement id={id} from={sp.from} to={sp.to} />}
      {tab === "invoices" && <Invoices id={id} />}
      {tab === "payments" && <Payments id={id} />}
      {tab === "orders" && <Orders id={id} />}
      {tab === "promises" && <Promises id={id} canAdd={canSell} />}
      {tab === "visits" && <Visits id={id} />}
      {tab === "profile" && (
        <Card className="max-w-3xl p-5">
          <dl className="space-y-2 text-sm">
            <Row k="Mobile" v={<a href={`tel:${r.mobile}`} className="hover:underline">{r.mobile}</a>} />
            {r.alt_mobile && <Row k="Alternate mobile" v={r.alt_mobile} />}
            <Row k="GSTIN" v={r.gstin ?? "Unregistered"} />
            <Row k="State" v={`${r.billing_state_code} · ${GST_STATES[required(r.billing_state_code, "Retailer state code")] ?? ""}`} />
            <Row k="Billing address" v={[r.billing_address, r.billing_city, r.billing_pincode].filter(Boolean).join(", ") || "—"} />
            <Row k="Delivery address" v={r.delivery_address || r.delivery_city ? [r.delivery_address, r.delivery_city, r.delivery_pincode].filter(Boolean).join(", ") : "Same as billing"} />
            <Row k="Credit limit" v={Number(r.credit_limit) > 0 ? inr(r.credit_limit) : "No limit"} />
            <Row k="Customer since" v={date(r.created_at)} />
            {r.classified_at && <Row k="Classified" v={dateTime(r.classified_at)} />}
          </dl>
          {r.notes && <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm whitespace-pre-line text-slate-600">{r.notes}</p>}
        </Card>
      )}
    </>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-slate-100 pb-2">
      <dt className="shrink-0 text-slate-500">{k}</dt>
      <dd className="text-right font-medium">{v}</dd>
    </div>
  );
}

async function Statement({ id, from: f, to: t }: { id: string; from?: string; to?: string }) {
  const supabase = await createClient();
  const to = t || todayIST();
  const from = f || new Date(Date.parse(to) - 90 * 864e5).toISOString().slice(0, 10);
  const [{ data: before }, { data: entries }] = await Promise.all([
    allRows(() => supabase.from("retailer_ledger").select("debit, credit").eq("retailer_id", id).lt("entry_date", from).order("entry_date").order("created_at").order("doc_id")),
    allRows(() => supabase.from("retailer_ledger").select("kind, doc_id, entry_date, doc_no, narration, debit, credit, created_at").eq("retailer_id", id).gte("entry_date", from).lte("entry_date", to).order("entry_date").order("created_at").order("doc_id")),
  ]);
  const opening = (before ?? []).reduce((s, e) => s + Number(e.debit) - Number(e.credit), 0);
  let running = opening;
  const href = (k: string, docId: string) => (k === "invoice" ? `/sales/invoices/${docId}` : k === "payment" ? `/payments/${docId}` : `/api/pdf/credit-note/${docId}`);
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-end lg:justify-between">
        <form className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="tab" value="statement" />
          <div><div className="mb-1 text-xs text-slate-500">From</div><Input type="date" name="from" defaultValue={from} /></div>
          <div><div className="mb-1 text-xs text-slate-500">To</div><Input type="date" name="to" defaultValue={to} /></div>
          <Button type="submit" variant="secondary">Show</Button>
        </form>
        <DocButtons kind="statement" id={id} query={`from=${from}&to=${to}`} label="Statement PDF" />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500">
            <tr><th className="px-4 py-2">Date</th><th className="px-3 py-2">Document</th><th className="px-3 py-2">Details</th><th className="px-3 py-2 text-right">Debit</th><th className="px-3 py-2 text-right">Credit</th><th className="px-4 py-2 text-right">Balance</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            <tr className="bg-slate-50/50"><td className="px-4 py-2 text-slate-500">{date(from)}</td><td></td><td className="px-3 py-2 font-medium">Opening balance</td><td></td><td></td><td className="tabular px-4 py-2 text-right font-medium">{inr(opening)}</td></tr>
            {(entries ?? []).map((e, i) => {
              running += Number(e.debit) - Number(e.credit);
              return (
                <tr key={i}>
                  <td className="px-4 py-2 whitespace-nowrap text-slate-500">{date(e.entry_date)}</td>
                  <td className="px-3 py-2"><Link href={href(required(e.kind, "Ledger entry kind"), required(e.doc_id, "Ledger entry document"))} className="font-mono text-xs hover:underline">{e.doc_no}</Link></td>
                  <td className="px-3 py-2 text-slate-600">{e.narration}</td>
                  <td className="tabular px-3 py-2 text-right">{Number(e.debit) ? inr(e.debit) : ""}</td>
                  <td className="tabular px-3 py-2 text-right text-emerald-700">{Number(e.credit) ? inr(e.credit) : ""}</td>
                  <td className="tabular px-4 py-2 text-right font-medium">{inr(running)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot><tr className="border-t-2 border-slate-200"><td colSpan={5} className="px-3 py-2.5 text-right font-semibold">Closing balance</td><td className="tabular px-4 py-2.5 text-right text-base font-semibold">{inr(running)}</td></tr></tfoot>
        </table>
      </div>
    </Card>
  );
}

async function Invoices({ id }: { id: string }) {
  const supabase = await createClient();
  const [{ data: invs }, { data: bals }] = await Promise.all([
    supabase.from("invoices").select("id, invoice_no, invoice_date, due_date, grand_total, status").eq("retailer_id", id).order("invoice_date", { ascending: false }).limit(200),
    allRows(() => supabase.from("invoice_balances").select("invoice_id, balance, due_status, days_past_due").eq("retailer_id", id).order("invoice_id")),
  ]);
  const b = new Map((bals ?? []).map((x) => [x.invoice_id as string, x]));
  return (
    <Card className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500"><tr><th className="px-4 py-2">Invoice</th><th className="px-3 py-2">Due</th><th className="px-3 py-2">Status</th><th className="px-3 py-2 text-right">Amount</th><th className="px-4 py-2 text-right">Balance</th></tr></thead>
        <tbody className="divide-y divide-slate-100">
          {(invs ?? []).length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">No invoices yet.</td></tr>}
          {(invs ?? []).map((i) => {
            const x = b.get(i.id);
            const st = i.status === "cancelled" ? DUE_STATUS.cancelled : DUE_STATUS[x?.due_status ?? "not_yet_due"];
            return (
              <tr key={i.id}>
                <td className="px-4 py-2"><Link href={`/sales/invoices/${i.id}`} className="font-mono text-xs font-medium hover:underline">{i.invoice_no}</Link><div className="text-xs text-slate-500">{date(i.invoice_date)}</div></td>
                <td className="px-3 py-2">{date(i.due_date)}</td>
                <td className="px-3 py-2"><Badge tone={st.tone}>{st.label}{x?.due_status === "overdue" ? ` · ${x.days_past_due}d` : ""}</Badge></td>
                <td className="tabular px-3 py-2 text-right">{inr(i.grand_total)}</td>
                <td className={cn("tabular px-4 py-2 text-right font-medium", Number(x?.balance ?? 0) > 0 ? "" : "text-emerald-700")}>{i.status === "cancelled" ? "—" : inr(Math.max(0, Number(x?.balance ?? 0)))}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

async function Payments({ id }: { id: string }) {
  const supabase = await createClient();
  const { data } = await supabase.from("payments").select("id, receipt_no, payment_date, amount, method, reference_no, status").eq("retailer_id", id).order("payment_date", { ascending: false }).limit(200);
  return (
    <Card className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500"><tr><th className="px-4 py-2">Receipt</th><th className="px-3 py-2">Mode</th><th className="px-3 py-2">Status</th><th className="px-4 py-2 text-right">Amount</th></tr></thead>
        <tbody className="divide-y divide-slate-100">
          {(data ?? []).length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-500">No payments yet.</td></tr>}
          {(data ?? []).map((p) => (
            <tr key={p.id}>
              <td className="px-4 py-2"><Link href={`/payments/${p.id}`} className="font-mono text-xs font-medium hover:underline">{p.receipt_no}</Link><div className="text-xs text-slate-500">{date(p.payment_date)}</div></td>
              <td className="px-3 py-2">{PAYMENT_METHOD[p.method]}{p.reference_no && <div className="text-xs text-slate-500">{p.reference_no}</div>}</td>
              <td className="px-3 py-2"><Badge tone={PAYMENT_STATUS[p.status].tone}>{PAYMENT_STATUS[p.status].label}</Badge></td>
              <td className="tabular px-4 py-2 text-right font-medium">{inr(p.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

async function Orders({ id }: { id: string }) {
  const supabase = await createClient();
  const { data } = await supabase.from("orders").select("id, order_no, created_at, status, grand_total").eq("retailer_id", id).order("created_at", { ascending: false }).limit(200);
  return (
    <Card className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500"><tr><th className="px-4 py-2">Order</th><th className="px-3 py-2">Status</th><th className="px-4 py-2 text-right">Amount</th></tr></thead>
        <tbody className="divide-y divide-slate-100">
          {(data ?? []).length === 0 && <tr><td colSpan={3} className="px-4 py-8 text-center text-slate-500">No orders yet.</td></tr>}
          {(data ?? []).map((o) => (
            <tr key={o.id}>
              <td className="px-4 py-2"><Link href={`/sales/orders/${o.id}`} className="font-mono text-xs font-medium hover:underline">{o.order_no}</Link><div className="text-xs text-slate-500">{dateTime(o.created_at)}</div></td>
              <td className="px-3 py-2"><Badge tone={ORDER_STATUS[o.status].tone}>{ORDER_STATUS[o.status].label}</Badge></td>
              <td className="tabular px-4 py-2 text-right font-medium">{inr(o.grand_total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

async function Promises({ id, canAdd }: { id: string; canAdd: boolean }) {
  const supabase = await createClient();
  const { data } = await supabase.from("payment_promises").select("id, promised_date, amount, status, remarks, created_at").eq("retailer_id", id).order("promised_date", { ascending: false });
  const today = todayIST();
  return (
    <div className="space-y-4">
      {canAdd && <Card className="p-4"><PromiseForm retailerId={id} /></Card>}
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500"><tr><th className="px-4 py-2">Promised for</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Remarks</th><th className="px-4 py-2 text-right">Amount</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {(data ?? []).length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-500">No promises.</td></tr>}
            {(data ?? []).map((p) => {
              const st = p.status === "open" && p.promised_date < today ? { label: "Missed", tone: "red" as const } : PROMISE_STATUS[p.status];
              return (
                <tr key={p.id}>
                  <td className="px-4 py-2">{date(p.promised_date)}</td>
                  <td className="px-3 py-2"><Badge tone={st.tone}>{st.label}</Badge></td>
                  <td className="px-3 py-2 text-slate-600">{p.remarks}</td>
                  <td className="tabular px-4 py-2 text-right font-medium">{inr(p.amount)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

async function Visits({ id }: { id: string }) {
  const supabase = await createClient();
  const [{ data }, { data: people }] = await Promise.all([
    supabase.from("visits").select("id, planned_date, status, checkin_at, remarks, missed_reason, salesman_id, latitude, longitude").eq("retailer_id", id).order("planned_date", { ascending: false }).limit(100),
    supabase.from("tenant_people").select("id, full_name"),
  ]);
  const u = new Map((people ?? []).map((p) => [p.id as string, p.full_name as string]));
  return (
    <Card className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500"><tr><th className="px-4 py-2">Date</th><th className="px-3 py-2">Salesman</th><th className="px-3 py-2">Status</th><th className="px-4 py-2">Remarks</th></tr></thead>
        <tbody className="divide-y divide-slate-100">
          {(data ?? []).length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-500">No visits recorded.</td></tr>}
          {(data ?? []).map((v) => (
            <tr key={v.id}>
              <td className="px-4 py-2">{date(v.planned_date)}{v.checkin_at && <div className="text-xs text-slate-500">{dateTime(v.checkin_at)}</div>}</td>
              <td className="px-3 py-2">{u.get(v.salesman_id)}</td>
              <td className="px-3 py-2"><Badge tone={VISIT_STATUS[v.status].tone}>{VISIT_STATUS[v.status].label}</Badge></td>
              <td className="px-4 py-2 text-slate-600">
                {v.remarks || v.missed_reason || "—"}
                {v.latitude && <a className="ml-2 text-xs text-accent-700 hover:underline" target="_blank" rel="noopener" href={`https://maps.google.com/?q=${v.latitude},${v.longitude}`}>map</a>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
