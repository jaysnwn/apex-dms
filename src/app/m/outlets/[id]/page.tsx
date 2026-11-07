import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, FileText, MapPin, MessageCircle, Navigation, Phone, ShoppingCart } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { date, inr } from "@/lib/format";
import { ORDER_STATUS, RETAILER_CLASS } from "@/lib/status";
import { Badge, cn } from "@/components/ui";
import { CollectButton } from "./collect-button";

export const metadata: Metadata = { title: "Outlet" };

export default async function OutletPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("salesman", "manager", "super_admin");
  const { id } = await params;
  const supabase = await createClient();
  const { data: r } = await supabase
    .from("retailers")
    .select("id, code, shop_name, owner_name, mobile, alt_mobile, gstin, billing_address, billing_city, billing_pincode, credit_days, credit_limit, status, classification, latitude, longitude, routes(name)")
    .eq("id", id)
    .maybeSingle();
  if (!r) notFound();
  const [{ data: bal }, { data: bills }, { data: orders }, { data: pays }, { data: promise }] = await Promise.all([
    supabase.from("retailer_balances").select("outstanding, overdue").eq("retailer_id", id).maybeSingle(),
    supabase.from("invoice_balances").select("invoice_id, invoice_no, invoice_date, due_date, balance, days_past_due").eq("retailer_id", id).gt("balance", 0).order("due_date"),
    supabase.from("orders").select("id, order_no, status, grand_total, created_at").eq("retailer_id", id).order("created_at", { ascending: false }).limit(5),
    supabase.from("payments").select("receipt_no, payment_date, amount, method, status").eq("retailer_id", id).order("payment_date", { ascending: false }).limit(3),
    supabase.from("payment_promises").select("promised_date, amount").eq("retailer_id", id).eq("status", "open").order("promised_date").limit(1).maybeSingle(),
  ]);
  const outstanding = Number(bal?.outstanding ?? 0);
  const overdue = Number(bal?.overdue ?? 0);
  const cls = r.classification ? RETAILER_CLASS[r.classification] : null;
  const map = r.latitude != null && r.longitude != null
    ? `https://www.google.com/maps/dir/?api=1&destination=${r.latitude},${r.longitude}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([r.shop_name, r.billing_address, r.billing_city].filter(Boolean).join(" "))}`;

  return (
    <div className="space-y-4">
      <Link href="/m/outlets" className="flex items-center gap-1 px-1 text-sm font-medium text-slate-600"><ArrowLeft className="size-4" /> Outlets</Link>

      <section className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-200/70">
        <div className="bg-gradient-to-br from-violet-600 to-violet-800 p-5 text-white">
          <div className="text-xs text-violet-200">{r.code}{(r.routes as unknown as { name: string } | null)?.name ? ` · ${(r.routes as unknown as { name: string }).name}` : ""}</div>
          <h1 className="text-2xl leading-tight font-bold">{r.shop_name}</h1>
          <p className="text-sm text-violet-100">{[r.owner_name, r.billing_city].filter(Boolean).join(" · ")}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {cls && <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-medium">{cls.label}</span>}
            {r.status !== "active" && <span className="rounded-full bg-amber-400 px-2 py-0.5 text-xs font-semibold text-amber-950">{r.status === "on_hold" ? "On hold" : r.status}</span>}
          </div>
        </div>
        <div className="grid grid-cols-4 divide-x divide-slate-100 text-xs font-semibold">
          <a href={`tel:${r.mobile}`} className="flex flex-col items-center gap-1 py-3 text-slate-700 active:bg-slate-50"><Phone className="size-5 text-sky-600" /> Call</a>
          <a href={`https://wa.me/91${r.mobile}`} target="_blank" rel="noopener" className="flex flex-col items-center gap-1 py-3 text-slate-700 active:bg-slate-50"><MessageCircle className="size-5 text-[#25D366]" /> WhatsApp</a>
          <a href={map} target="_blank" rel="noopener" className="flex flex-col items-center gap-1 py-3 text-slate-700 active:bg-slate-50"><Navigation className="size-5 text-violet-600" /> Directions</a>
          <a href={`/api/pdf/statement/${r.id}`} target="_blank" rel="noopener" className="flex flex-col items-center gap-1 py-3 text-slate-700 active:bg-slate-50"><FileText className="size-5 text-slate-500" /> Statement</a>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3">
        <Link href={`/m/order?retailer=${r.id}`} className={cn("flex h-14 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-accent-500 to-accent-600 font-bold text-white shadow-md shadow-accent-500/30 active:scale-[0.98]", r.status === "blocked" && "pointer-events-none opacity-50")}>
          <ShoppingCart className="size-5" /> Take order
        </Link>
        <CollectButton retailerId={r.id} shop={r.shop_name} outstanding={outstanding} overdue={overdue} />
      </div>

      <section className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70">
          <div className="text-xs text-slate-500">Outstanding</div>
          <div className="tabular text-xl font-bold">{inr(outstanding, { decimals: false })}</div>
          <div className="text-[11px] text-slate-400">{r.credit_days} days credit{Number(r.credit_limit) > 0 ? ` · limit ${inr(r.credit_limit, { decimals: false })}` : ""}</div>
        </div>
        <div className={cn("rounded-2xl p-4 shadow-sm ring-1", overdue > 0 ? "bg-red-50 ring-red-200" : "bg-emerald-50 ring-emerald-200")}>
          <div className={cn("text-xs", overdue > 0 ? "text-red-700" : "text-emerald-700")}>Overdue</div>
          <div className={cn("tabular text-xl font-bold", overdue > 0 ? "text-red-700" : "text-emerald-700")}>{inr(overdue, { decimals: false })}</div>
          <div className="text-[11px] text-slate-500">{overdue > 0 ? "collect today" : "nothing overdue"}</div>
        </div>
      </section>

      {promise && <p className="rounded-2xl bg-amber-50 p-3 text-sm text-amber-900">Promised to pay {inr(promise.amount, { decimals: false })} on {date(promise.promised_date)}</p>}

      {(bills ?? []).length > 0 && (
        <section className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70">
          <h2 className="px-4 pt-3 pb-1 text-sm font-semibold">Unpaid bills</h2>
          <ul className="divide-y divide-slate-100">
            {(bills ?? []).map((b) => {
              const late = Number(b.days_past_due) > 0;
              return (
                <li key={b.invoice_id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span><span className="font-mono text-xs">{b.invoice_no.split("/").pop()}</span><span className="block text-xs text-slate-500">due {date(b.due_date)}</span></span>
                  <span className="text-right"><span className="tabular block font-semibold">{inr(b.balance, { decimals: false })}</span>{late ? <Badge tone="red">{b.days_past_due} days late</Badge> : <Badge tone="blue">Not yet due</Badge>}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70">
        <h2 className="px-4 pt-3 pb-1 text-sm font-semibold">Recent orders</h2>
        {(orders ?? []).length === 0 ? <p className="px-4 pb-3 text-sm text-slate-500">No orders yet.</p> : (
          <ul className="divide-y divide-slate-100">
            {(orders ?? []).map((o) => {
              const st = o.status === "quotation" ? { label: "With office", tone: "violet" as const } : ORDER_STATUS[o.status];
              return (
                <li key={o.id}><Link href={`/m/orders/${o.id}`} className="flex items-center justify-between px-4 py-2.5 text-sm active:bg-slate-50">
                  <span>{date(o.created_at)}<span className="block font-mono text-xs text-slate-500">{o.order_no.split("/").pop()}</span></span>
                  <span className="text-right"><span className="tabular block font-semibold">{inr(o.grand_total, { decimals: false })}</span><Badge tone={st.tone}>{st.label}</Badge></span>
                </Link></li>
              );
            })}
          </ul>
        )}
      </section>

      {(pays ?? []).length > 0 && (
        <section className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70">
          <h2 className="px-4 pt-3 pb-1 text-sm font-semibold">Last payments</h2>
          <ul className="divide-y divide-slate-100">
            {(pays ?? []).map((p) => (
              <li key={p.receipt_no} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span>{date(p.payment_date)}<span className="block text-xs text-slate-500 capitalize">{p.method.replace("_", " ")}{p.status === "cheque_pending" ? " · cheque not cleared" : p.status === "bounced" ? " · bounced" : ""}</span></span>
                <span className={cn("tabular font-semibold", p.status === "bounced" ? "text-red-600 line-through" : "text-emerald-700")}>{inr(p.amount, { decimals: false })}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-2xl bg-white p-4 text-sm shadow-sm ring-1 ring-slate-200/70">
        <div className="flex items-start gap-2 text-slate-600"><MapPin className="mt-0.5 size-4 shrink-0" /> {[r.billing_address, r.billing_city, r.billing_pincode].filter(Boolean).join(", ") || "No address"}</div>
        <div className="mt-1 text-slate-600">Mobile {r.mobile}{r.alt_mobile ? ` · ${r.alt_mobile}` : ""}</div>
        {r.gstin && <div className="mt-1 font-mono text-xs text-slate-500">GSTIN {r.gstin}</div>}
      </section>
    </div>
  );
}
