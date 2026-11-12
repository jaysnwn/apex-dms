import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { CheckCircle2, Pencil, Wallet } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { date, dateTime, inr, qty } from "@/lib/format";
import { todayIST } from "@/lib/gst";
import { DUE_STATUS, PAYMENT_METHOD, PURCHASE_STATUS } from "@/lib/status";
import { GST_STATES } from "@/lib/states";
import { Alert, Badge, Card, cn } from "@/components/ui";
import { LinkButton } from "@/components/chip";
import { DocButtons } from "@/components/doc-buttons";
import { CancelPurchaseButton, ReceiveButton } from "../purchase-actions";
import { ReturnButton } from "./return-button";
import { billStatus } from "../data";

export const metadata: Metadata = { title: "Purchase" };

export default async function PurchasePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; received?: string }> }) {
  const { profile } = await requireRole("super_admin", "manager", "billing");
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: p } = await supabase.from("purchases").select("*, suppliers(id, name, code, gstin, state_code, city, mobile), warehouses(name)").eq("id", id).maybeSingle();
  if (!p) notFound();
  const [{ data: lines }, { data: allocs }, { data: bal }, { data: people }, { data: returns }] = await Promise.all([
    supabase.from("purchase_lines").select("*, products(name, sku, unit_code, hsn_code)").eq("purchase_id", id).order("line_no"),
    supabase.from("supplier_payment_allocations").select("amount, is_auto, supplier_payments(id, payment_no, payment_date, method, reference_no, status)").eq("purchase_id", id),
    supabase.from("purchase_balances").select("balance, days_overdue").eq("purchase_id", id).maybeSingle(),
    supabase.from("tenant_people").select("id, full_name"),
    supabase.from("purchase_returns").select("id, return_no, return_date, reason, grand_total, purchase_return_lines(purchase_line_id, qty)").eq("purchase_id", id).order("created_at"),
  ]);
  const returnedQty = new Map<string, number>();
  for (const r of returns ?? []) for (const l of (r.purchase_return_lines as { purchase_line_id: string; qty: number }[]) ?? []) returnedQty.set(l.purchase_line_id, (returnedQty.get(l.purchase_line_id) ?? 0) + Number(l.qty));
  const returnedTotal = (returns ?? []).reduce((t, r) => t + Number(r.grand_total), 0);
  const s = p.suppliers as unknown as { id: string; name: string; code: string; gstin: string | null; state_code: string | null; city: string | null; mobile: string | null };
  const uMap = new Map((people ?? []).map((u) => [u.id as string, u.full_name as string]));
  const st = PURCHASE_STATUS[p.status];
  const received = p.status === "received";
  const balance = Number(bal?.balance ?? 0);
  const due = received ? DUE_STATUS[billStatus(balance, p.due_date, todayIST())] : null;
  const isMgr = profile.role === "super_admin" || profile.role === "manager";
  const live = (allocs ?? []).filter((a) => (a.supplier_payments as unknown as { status: string }).status === "paid");

  return (
    <>
      {sp.saved && <div className="mb-4"><Alert tone="green">Purchase order saved. Send it to {s.name} with the PDF or WhatsApp button.</Alert></div>}
      {sp.received && <div className="mb-4"><Alert tone="green">Goods received and added to stock.</Alert></div>}

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-mono text-lg font-semibold">{p.purchase_no}</h2>
            <Badge tone={st.tone}>{st.label}</Badge>
            {due && <Badge tone={due.tone}>{due.label}{billStatus(balance, p.due_date, todayIST()) === "overdue" ? ` · ${bal?.days_overdue}d` : ""}</Badge>}
          </div>
          <p className="mt-1 text-sm text-slate-600">
            <Link href={`/purchases/suppliers/${s.id}`} className="font-semibold text-slate-900 hover:underline">{s.name}</Link>
            {s.gstin && <> · GSTIN <span className="font-mono">{s.gstin}</span></>}
            {s.state_code && <> · {GST_STATES[s.state_code] ?? s.state_code}</>}
          </p>
          <p className="text-sm text-slate-500">
            Ordered {date(p.order_date)}{p.expected_date && !received ? ` · expected ${date(p.expected_date)}` : ""} · to {(p.warehouses as unknown as { name: string }).name}
          </p>
          {received && (
            <p className="mt-1 flex items-center gap-1.5 text-sm text-emerald-800">
              <CheckCircle2 className="size-4" /> Bill <span className="font-mono font-semibold">{p.supplier_bill_no}</span> dated {date(p.supplier_bill_date)} · received {date(p.received_date)}
              {p.received_by && ` by ${uMap.get(p.received_by) ?? ""}`} · due {date(p.due_date)}
            </p>
          )}
          {p.status === "cancelled" && <p className="mt-1 text-sm text-slate-500">Cancelled {dateTime(p.cancelled_at)}: {p.cancel_reason}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {p.status === "ordered" && (
            <>
              <ReceiveButton purchaseId={p.id} purchaseNo={p.purchase_no} creditDays={Number(p.credit_days)} showCostOption />
              <LinkButton href={`/purchases/${p.id}/edit`} variant="secondary"><Pencil className="size-4" /> Edit</LinkButton>
            </>
          )}
          {received && balance > 0 && (
            <LinkButton href={`/purchases/payments/new?supplier=${s.id}&bill=${p.id}`} className="bg-emerald-600 text-white hover:bg-emerald-700"><Wallet className="size-4" /> Pay this bill</LinkButton>
          )}
          {received && (
            <ReturnButton purchaseId={p.id} lines={(lines ?? []).map((l) => {
              const pr = l.products as unknown as { name: string; sku: string; unit_code: string };
              return { id: l.id, name: pr.name, sku: pr.sku, unit: pr.unit_code, bought: Number(l.qty), returned: returnedQty.get(l.id) ?? 0, lineTotal: Number(l.line_total) };
            })} />
          )}
          {(p.status === "ordered" || (received && isMgr && !(returns ?? []).length)) && <CancelPurchaseButton purchaseId={p.id} received={received} />}
        </div>
      </div>

      {p.status !== "cancelled" && (
        <div className="mb-4"><DocButtons kind="purchase-order" id={p.id} label={received ? "Purchase PDF" : "Purchase order PDF"} /></div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
              <tr>
                <th className="px-4 py-2.5">Product</th><th className="px-3 py-2.5 text-right">Qty</th><th className="px-3 py-2.5 text-right">Cost</th>
                <th className="px-3 py-2.5 text-right">Disc.</th><th className="px-3 py-2.5 text-right">Taxable</th><th className="px-3 py-2.5 text-right">GST</th><th className="px-4 py-2.5 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(lines ?? []).map((l) => {
                const pr = l.products as unknown as { name: string; sku: string; unit_code: string; hsn_code: string | null };
                return (
                  <tr key={l.id}>
                    <td className="px-4 py-2.5"><div className="font-medium">{pr.name}</div><div className="font-mono text-xs text-slate-500">{pr.sku}{pr.hsn_code ? ` · HSN ${pr.hsn_code}` : ""}</div></td>
                    <td className="tabular px-3 py-2.5 text-right">{qty(l.qty)} {pr.unit_code}</td>
                    <td className="tabular px-3 py-2.5 text-right">{inr(l.unit_cost)}<div className="text-[11px] text-slate-400">{l.cost_mode === "inclusive" ? "incl. GST" : "+ GST"}</div></td>
                    <td className="tabular px-3 py-2.5 text-right">{Number(l.discount_pct) ? `${Number(l.discount_pct)}%` : "—"}</td>
                    <td className="tabular px-3 py-2.5 text-right">{inr(l.taxable_value)}</td>
                    <td className="tabular px-3 py-2.5 text-right">{inr(Number(l.cgst) + Number(l.sgst) + Number(l.igst))}<div className="text-[11px] text-slate-400">{Number(l.gst_rate)}%</div></td>
                    <td className="tabular px-4 py-2.5 text-right font-semibold">{inr(l.line_total)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {p.notes && <p className="border-t border-slate-100 px-4 py-3 text-sm text-slate-600">Notes: {p.notes}</p>}
        </Card>

        <div className="space-y-6">
          <Card className="overflow-hidden">
            <div className={cn("px-5 py-4 text-white", received ? "bg-gradient-to-br from-emerald-700 to-emerald-900" : "bg-gradient-to-br from-fuchsia-700 to-fuchsia-900")}>
              <div className="text-sm opacity-80">{received ? "Bill total" : "Order total"}</div>
              <div className="tabular text-2xl font-semibold">{inr(p.grand_total)}</div>
              {returnedTotal > 0 && <div className="text-sm opacity-90">Returned − {inr(returnedTotal)}</div>}
              {received && <div className="text-sm opacity-90">Balance to pay {inr(balance)}</div>}
            </div>
            <dl className="tabular space-y-1.5 p-5 text-sm">
              <R k="Subtotal" v={inr(p.subtotal)} />
              {Number(p.discount_total) > 0 && <R k="Discount" v={`− ${inr(p.discount_total)}`} />}
              <R k="Taxable value" v={inr(p.taxable_total)} />
              {p.is_igst ? <R k="IGST" v={inr(p.igst_total)} /> : (<><R k="CGST" v={inr(p.cgst_total)} /><R k="SGST" v={inr(p.sgst_total)} /></>)}
              {Number(p.other_charges) > 0 && <R k="Other charges" v={inr(p.other_charges)} />}
              {Number(p.round_off) !== 0 && <R k="Round off" v={inr(p.round_off)} />}
            </dl>
          </Card>

          {(returns ?? []).length > 0 && (
            <Card className="p-5">
              <h3 className="mb-2 font-semibold">Returned to supplier</h3>
              <ul className="divide-y divide-slate-100 text-sm">
                {(returns ?? []).map((r) => (
                  <li key={r.id} className="flex justify-between gap-3 py-2">
                    <span><span className="font-mono text-xs font-medium">{r.return_no}</span><span className="block text-xs text-slate-500">{date(r.return_date)} · {r.reason}</span></span>
                    <span className="tabular font-semibold text-rose-700">− {inr(r.grand_total)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {received && (
            <Card className="p-5">
              <h3 className="mb-2 font-semibold">Payments applied</h3>
              {live.length === 0 ? (
                <p className="text-sm text-slate-500">Nothing paid yet.</p>
              ) : (
                <ul className="divide-y divide-slate-100 text-sm">
                  {live.map((a, i) => {
                    const sp2 = a.supplier_payments as unknown as { id: string; payment_no: string; payment_date: string; method: string; reference_no: string | null };
                    return (
                      <li key={i} className="flex justify-between py-2">
                        <span><Link href={`/purchases/payments/${sp2.id}`} className="font-mono text-xs font-medium hover:underline">{sp2.payment_no}</Link><span className="block text-xs text-slate-500">{date(sp2.payment_date)} · {PAYMENT_METHOD[sp2.method]}{a.is_auto ? " · auto" : ""}</span></span>
                        <span className="tabular font-semibold text-emerald-700">{inr(a.amount)}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function R({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between"><dt className="text-slate-500">{k}</dt><dd className="font-medium">{v}</dd></div>;
}
