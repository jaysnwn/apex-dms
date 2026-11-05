import Link from "next/link";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { date, dateTime, inr, qty } from "@/lib/format";
import { ORDER_STATUS } from "@/lib/status";
import { Alert, Badge, Card, cn } from "@/components/ui";
import { loadOrder } from "../../data";
import { OrderActions } from "./order-actions";

export const metadata: Metadata = { title: "Order" };

export default async function OrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const { user, profile } = await requireRole("super_admin", "manager", "billing", "salesman");
  const { id } = await params;
  const { saved } = await searchParams;
  const data = await loadOrder(id);
  if (!data) notFound();
  const { order, builderLines, retailer, invoice } = data;
  if (invoice && order.status !== "cancelled") redirect(`/sales/invoices/${invoice.id}`);

  const isOffice = ["super_admin", "manager", "billing"].includes(profile.role);
  const isQuote = order.status === "quotation";
  const st = ORDER_STATUS[order.status];
  const short = builderLines.filter((l) => l.qty > l.product.available);

  return (
    <div className="max-w-5xl space-y-6">
      {saved && <Alert tone="green">Quotation saved. {isOffice ? "Confirm it when the retailer agrees." : "The office will confirm it into an invoice."}</Alert>}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-mono text-lg font-semibold">{order.order_no}</h2>
            <Badge tone={st.tone}>{st.label}</Badge>
          </div>
          <p className="text-sm text-slate-500">Created {dateTime(order.created_at)} · {order.credit_days} days credit</p>
          {order.cancel_reason && <p className="mt-1 text-sm text-red-700">Cancelled: {order.cancel_reason}</p>}
        </div>
        {isQuote && (
          <OrderActions
            orderId={id}
            canConfirm={isOffice}
            canOverride={profile.role === "super_admin" || profile.role === "manager"}
            canEdit={isOffice || order.created_by === user.id}
          />
        )}
      </div>

      {isQuote && short.length > 0 && (
        <Alert>
          Not enough stock for: {short.map((l) => `${l.product.name} (need ${qty(l.qty)}, have ${qty(l.product.available)})`).join("; ")}. This quotation cannot be invoiced yet.
        </Alert>
      )}

      <Card className="p-5">
        <div className="text-sm text-slate-500">Retailer</div>
        {retailer ? (
          <Link href={`/retailers/${retailer.id}`} className="text-lg font-semibold hover:underline">{retailer.shop_name}</Link>
        ) : "—"}
        <div className="text-sm text-slate-500">{retailer && [retailer.code, retailer.mobile, retailer.billing_city].filter(Boolean).join(" · ")}</div>
        {order.notes && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{order.notes}</p>}
      </Card>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
            <tr>
              <th className="px-4 py-2.5">Product</th>
              <th className="px-3 py-2.5 text-right">Qty</th>
              <th className="px-3 py-2.5 text-right">Price</th>
              <th className="px-3 py-2.5 text-right">Disc.</th>
              <th className="px-3 py-2.5 text-right">Taxable</th>
              <th className="px-3 py-2.5 text-right">GST</th>
              <th className="px-4 py-2.5 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.lines.map((l, i) => {
              const b = builderLines[i];
              return (
                <tr key={l.id} className={cn(isQuote && b && b.qty > b.product.available && "bg-red-50/50")}>
                  <td className="px-4 py-2.5">
                    <div className="font-medium">{b?.product.name}</div>
                    <div className="font-mono text-xs text-slate-500">{b?.product.sku}</div>
                  </td>
                  <td className="tabular px-3 py-2.5 text-right">{qty(l.qty)}</td>
                  <td className="tabular px-3 py-2.5 text-right">{inr(l.unit_price)}<div className="text-[11px] text-slate-400">{l.price_mode === "inclusive" ? "incl." : "+"} {Number(l.gst_rate)}%</div></td>
                  <td className="tabular px-3 py-2.5 text-right">{Number(l.discount_pct) > 0 ? `${Number(l.discount_pct)}%` : "—"}</td>
                  <td className="tabular px-3 py-2.5 text-right">{inr(l.taxable_value)}</td>
                  <td className="tabular px-3 py-2.5 text-right">{inr(l.tax_amount)}</td>
                  <td className="tabular px-4 py-2.5 text-right font-medium">{inr(l.line_total)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="tabular border-t border-slate-200 text-sm">
            <tr><td colSpan={6} className="px-3 py-1.5 text-right text-slate-500">Taxable value</td><td className="px-4 py-1.5 text-right">{inr(order.taxable_total)}</td></tr>
            <tr><td colSpan={6} className="px-3 py-1.5 text-right text-slate-500">GST</td><td className="px-4 py-1.5 text-right">{inr(order.tax_total)}</td></tr>
            {Number(order.round_off) !== 0 && <tr><td colSpan={6} className="px-3 py-1.5 text-right text-slate-500">Round off</td><td className="px-4 py-1.5 text-right">{inr(order.round_off)}</td></tr>}
            <tr><td colSpan={6} className="px-3 py-2 text-right font-semibold">Total</td><td className="px-4 py-2 text-right text-lg font-semibold">{inr(order.grand_total)}</td></tr>
          </tfoot>
        </table>
      </Card>
      <p className="text-xs text-slate-400">Due date is set when invoiced: invoice date + {order.credit_days} days (e.g. {date(new Date(Date.now() + order.credit_days * 864e5).toISOString())} if invoiced today).</p>
    </div>
  );
}
