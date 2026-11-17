import Link from "next/link";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { date, dateTime, inr, qty } from "@/lib/format";
import { ORDER_STATUS } from "@/lib/status";
import { Alert, Badge, cn } from "@/components/ui";
import { builderOptions, loadOrder } from "../../data";
import { OrderActions } from "./order-actions";
import { InvoiceDraft } from "./invoice-draft";
import { DocSteps } from "../../doc-steps";
import { ShortStockBanner } from "../../short-stock-banner";
import { DocButtons } from "@/components/doc-buttons";

export const metadata: Metadata = { title: "Quotation" };

// Billing runs in three steps: quotation (saved on the billing screen) → invoice
// draft (?step=invoice, office only) → Confirm invoice. This page is the first two.
export default async function OrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; step?: string }> }) {
  const { user, profile } = await requireRole("super_admin", "manager", "billing", "salesman");
  const { id } = await params;
  const { saved, step } = await searchParams;
  const data = await loadOrder(id);
  if (!data) notFound();
  const { order, builderLines, retailer, invoice } = data;
  if (invoice && order.status !== "cancelled") redirect(`/sales/invoices/${invoice.id}`);

  const isOffice = ["super_admin", "manager", "billing"].includes(profile.role);
  const isManager = profile.role === "super_admin" || profile.role === "manager";
  const isQuote = order.status === "quotation";
  const st = ORDER_STATUS[order.status];
  const short = builderLines
    .map((b, i) => ({ id: data.lines[i]?.id ?? b.product.id, name: b.product.name, need: b.qty, have: b.product.available }))
    .filter((l) => l.need > l.have);
  const brandName = builderLines[0]?.product.brand_name || null;

  // ---- Step 2: invoice draft ----
  if (step === "invoice") {
    if (!isQuote || !isOffice || !retailer) redirect(`/sales/orders/${id}`);
    const { companyState } = await builderOptions();
    return (
      <InvoiceDraft
        orderId={id} orderNo={order.order_no} brandName={brandName} retailer={retailer}
        igst={retailer.billing_state_code !== companyState} creditDays={order.credit_days} notes={order.notes}
        isManager={isManager}
        taxable={Number(order.taxable_total)} tax={Number(order.tax_total)} roundOff={Number(order.round_off)} grand={Number(order.grand_total)}
        lines={data.lines.map((l, i) => ({
          id: l.id, productId: l.product_id, name: builderLines[i]?.product.name ?? "Product", sku: builderLines[i]?.product.sku ?? "",
          qty: Number(l.qty), available: builderLines[i]?.product.available ?? 0,
          unitPrice: Number(l.unit_price), priceMode: l.price_mode, gstRate: Number(l.gst_rate), discountPct: Number(l.discount_pct),
          taxable: Number(l.taxable_value), tax: Number(l.tax_amount), total: Number(l.line_total),
        }))}
      />
    );
  }

  // ---- Step 1: the quotation ----
  return (
    <div className="space-y-4 pb-6">
      {saved && (
        <Alert tone="green">
          Quotation {order.order_no} saved. {isOffice ? "When the retailer agrees, choose Create invoice to check the invoice draft and confirm it." : "The office will turn it into an invoice."}
        </Alert>
      )}

      {isQuote && (
        <div className="flex flex-wrap items-start gap-3">
          <OrderActions orderId={id} canInvoice={isOffice} canEdit={isOffice || order.created_by === user.id} />
          <DocSteps at={0} className="ml-auto hidden md:flex" />
        </div>
      )}

      <div className="rounded-[var(--radius-sheet)] border border-line bg-surface shadow-[var(--shadow-card)]">
        <div className="px-4 pt-5 pb-4 sm:px-6 sm:pt-6">
          <div className="mb-5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="font-mono text-[22px] font-semibold tracking-[-0.01em] text-text">{order.order_no}</h2>
            <Badge tone={st.tone}>{st.label}</Badge>
            {brandName && <span className="text-[13px] text-text-2">{brandName}</span>}
          </div>
          {order.cancel_reason && <p className="mb-4 text-sm text-red-700">Cancelled: {order.cancel_reason}</p>}

          <div className="grid gap-x-10 gap-y-4 lg:grid-cols-[1.25fr_1fr]">
            <div>
              <div className="mb-1.5 text-[13px] font-medium text-text">Retailer</div>
              <div className="rounded-[var(--radius-card)] border border-line bg-raised p-3.5">
                {retailer ? <Link href={`/retailers/${retailer.id}`} className="text-[15px] font-semibold text-text hover:underline">{retailer.shop_name}</Link> : "—"}
                <div className="mt-0.5 text-[13px] text-text-2">{retailer && [retailer.code, retailer.mobile, retailer.billing_city].filter(Boolean).join(" · ")}</div>
              </div>
            </div>
            <dl className="grid content-start grid-cols-[auto_1fr] items-center gap-x-6 gap-y-3 text-sm">
              <dt className="text-[13px] font-medium text-text">Quotation date</dt>
              <dd className="tabular text-text">{dateTime(order.created_at)}</dd>
              <dt className="text-[13px] font-medium text-text">Payment terms</dt>
              <dd className="text-text">{order.credit_days === 0 ? "Immediate payment" : `${order.credit_days} days`}</dd>
              <dt className="text-[13px] font-medium text-text">Due date</dt>
              <dd className="text-xs text-text-2">Set when invoiced · <span className="tabular">{date(new Date(Date.now() + order.credit_days * 864e5).toISOString())}</span> if invoiced today</dd>
            </dl>
          </div>
        </div>

        {isQuote && short.length > 0 && (
          <div className="border-t border-line px-3 py-4 sm:px-5">
            <ShortStockBanner stage="quote" lines={short} isManager={isManager} />
          </div>
        )}

        <div className="overflow-x-auto border-t border-line">
          <table className="w-full text-sm">
            <thead className="text-left text-xs font-medium text-text-2">
              <tr className="border-b border-line">
                <th scope="col" className="px-4 py-2.5 sm:px-6">Product</th>
                <th scope="col" className="px-3 py-2.5 text-right">Qty</th>
                <th scope="col" className="px-3 py-2.5 text-right">Price</th>
                <th scope="col" className="hidden px-3 py-2.5 text-right md:table-cell">Disc.</th>
                <th scope="col" className="hidden px-3 py-2.5 text-right md:table-cell">Taxable</th>
                <th scope="col" className="hidden px-3 py-2.5 text-right md:table-cell">GST</th>
                <th scope="col" className="px-4 py-2.5 text-right sm:px-6">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.lines.map((l, i) => {
                const b = builderLines[i];
                return (
                  <tr key={l.id} className={cn(isQuote && b && b.qty > b.product.available && "bg-red-50")}>
                    <td className="px-4 py-2.5 sm:px-6">
                      <div className="font-medium text-text">{b?.product.name}</div>
                      <div className="font-mono text-xs text-text-3">{b?.product.sku}</div>
                    </td>
                    <td className="tabular px-3 py-2.5 text-right">{qty(l.qty)}</td>
                    <td className="tabular px-3 py-2.5 text-right">{inr(l.unit_price)}<div className="text-xs text-text-3">{l.price_mode === "inclusive" ? "incl." : "+"} {Number(l.gst_rate)}%</div></td>
                    <td className="tabular hidden px-3 py-2.5 text-right md:table-cell">{Number(l.discount_pct) > 0 ? `${Number(l.discount_pct)}%` : "—"}</td>
                    <td className="tabular hidden px-3 py-2.5 text-right md:table-cell">{inr(l.taxable_value)}</td>
                    <td className="tabular hidden px-3 py-2.5 text-right md:table-cell">{inr(l.tax_amount)}</td>
                    <td className="tabular px-4 py-2.5 text-right font-medium sm:px-6">{inr(l.line_total)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-4 border-t border-line px-4 py-5 sm:px-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            {isQuote && <DocButtons kind="quotation" id={id} label="Quotation PDF" />}
            {order.notes && <p className="max-w-md rounded-[var(--radius-control)] bg-sunken p-3 text-[13px] text-text-2"><span className="font-medium text-text">Note: </span>{order.notes}</p>}
          </div>
          <dl className="tabular w-full space-y-1.5 text-sm lg:w-80">
            <div className="flex justify-between gap-3"><dt className="text-text-2">Taxable value</dt><dd className="font-medium">{inr(order.taxable_total)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-text-2">GST</dt><dd className="font-medium">{inr(order.tax_total)}</dd></div>
            {Number(order.round_off) !== 0 && <div className="flex justify-between gap-3"><dt className="text-text-2">Round off</dt><dd className="font-medium">{inr(order.round_off)}</dd></div>}
            <div className="flex items-baseline justify-between border-t border-line pt-2.5"><dt className="font-semibold text-text">Total</dt><dd className="text-2xl font-semibold tracking-[-0.02em] text-text">{inr(order.grand_total)}</dd></div>
          </dl>
        </div>
      </div>
    </div>
  );
}
