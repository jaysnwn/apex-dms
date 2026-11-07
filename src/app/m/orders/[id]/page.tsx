import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, CheckCircle2, Circle } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { date, dateTime, inr, qty } from "@/lib/format";
import { cn } from "@/components/ui";
import { ShareQuote } from "../../share-quote";

export const metadata: Metadata = { title: "Order" };

const STEPS = [
  { k: "quotation", label: "Sent to office" },
  { k: "invoiced", label: "Invoice made" },
  { k: "dispatched", label: "Dispatched" },
  { k: "delivered", label: "Delivered" },
];

export default async function MyOrderPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("salesman", "manager", "super_admin");
  const { id } = await params;
  const supabase = await createClient();
  const { data: o } = await supabase.from("orders").select("*, retailers(id, shop_name, mobile, billing_city)").eq("id", id).maybeSingle();
  if (!o) notFound();
  const [{ data: lines }, { data: inv }] = await Promise.all([
    supabase.from("order_lines").select("product_id, qty, unit_price, discount_pct, line_total").eq("order_id", id).order("line_no"),
    supabase.from("invoices").select("id, invoice_no, invoice_date, due_date").eq("order_id", id).maybeSingle(),
  ]);
  const r = o.retailers as unknown as { id: string; shop_name: string; mobile: string; billing_city: string | null };
  // Product names via the catalogue view (salesmen cannot read the products table).
  const pids = [...new Set((lines ?? []).map((l) => l.product_id as string))];
  const { data: prods } = pids.length ? await supabase.from("catalog").select("id, name, sku, unit_code").in("id", pids) : { data: [] };
  const pMap = new Map((prods ?? []).map((p) => [p.id as string, p as { name: string; sku: string; unit_code: string }]));
  const prod = (pid: string) => pMap.get(pid) ?? { name: "Product", sku: "", unit_code: "PCS" };
  const reached = STEPS.findIndex((s) => s.k === o.status);
  const text = `Order ${o.order_no} for ${r.shop_name}:\n${(lines ?? []).map((l) => `• ${prod(l.product_id).name} × ${qty(l.qty)}`).join("\n")}\nTotal ${inr(o.grand_total, { decimals: false })} incl. GST\n— APEX TRADING CO.`;

  return (
    <div className="space-y-4">
      <Link href="/m/orders" className="flex items-center gap-1 px-1 text-sm font-medium text-slate-600"><ArrowLeft className="size-4" /> My orders</Link>
      <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70">
        <div className="font-mono text-xs text-slate-500">{o.order_no}</div>
        <Link href={`/m/outlets/${r.id}`} className="text-xl font-bold hover:underline">{r.shop_name}</Link>
        <div className="text-sm text-slate-500">{dateTime(o.created_at)} · {o.credit_days === 0 ? "Cash" : `${o.credit_days} days credit`}</div>
        <div className="tabular mt-2 text-3xl font-bold">{inr(o.grand_total, { decimals: false })}</div>
        {o.status === "cancelled" ? (
          <p className="mt-3 rounded-xl bg-slate-100 p-3 text-sm text-slate-600">Cancelled{o.cancel_reason ? `: ${o.cancel_reason}` : ""}</p>
        ) : (
          <ol className="mt-4 space-y-2">
            {STEPS.map((s, i) => (
              <li key={s.k} className={cn("flex items-center gap-2 text-sm", i <= reached ? "font-semibold text-emerald-700" : "text-slate-400")}>
                {i <= reached ? <CheckCircle2 className="size-5" /> : <Circle className="size-5" />} {s.label}
                {s.k === "invoiced" && inv && <span className="font-mono text-xs font-normal text-slate-500">· {inv.invoice_no.split("/").pop()} · due {date(inv.due_date)}</span>}
              </li>
            ))}
          </ol>
        )}
      </section>
      <section className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70">
        <ul className="divide-y divide-slate-100">
          {(lines ?? []).map((l, i) => {
            const p = prod(l.product_id);
            return (
              <li key={i} className="flex items-start justify-between gap-3 px-4 py-3 text-sm">
                <span className="min-w-0"><span className="block font-medium">{p.name}</span><span className="tabular text-xs text-slate-500">{qty(l.qty)} {p.unit_code} × {inr(l.unit_price)}{Number(l.discount_pct) ? ` − ${Number(l.discount_pct)}%` : ""}</span></span>
                <span className="tabular font-semibold">{inr(l.line_total)}</span>
              </li>
            );
          })}
        </ul>
        {o.notes && <p className="border-t border-slate-100 px-4 py-3 text-sm text-slate-600">Note: {o.notes}</p>}
      </section>
      {o.status !== "cancelled" && <ShareQuote orderId={o.id} orderNo={o.order_no} mobile={r.mobile} fallbackText={text} />}
    </div>
  );
}
