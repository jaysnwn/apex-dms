"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast as notify } from "sonner";
import * as m from "motion/react-m";
import { ArrowLeft, Check, Pencil } from "lucide-react";
import { Alert, Badge, Button, Input, Kbd, cn } from "@/components/ui";
import { spring } from "@/lib/motion";
import { addDays, todayIST } from "@/lib/gst";
import { date as fmtDate, inr, qty as fmtQty } from "@/lib/format";
import { ShortStockBanner } from "../../short-stock-banner";
import { BillingDetailsDialog, missingTaxDetails, rememberRetailer } from "../../retailer-select";
import { confirmInvoiceDraft, type PickerRetailer } from "../../actions";
import { DocSteps } from "../../doc-steps";

type Method = "cash" | "upi" | "bank_transfer" | "cheque";
const METHODS: { k: Method; label: string }[] = [{ k: "cash", label: "Cash" }, { k: "upi", label: "UPI" }, { k: "bank_transfer", label: "Bank" }, { k: "cheque", label: "Cheque" }];
const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

export type DraftLine = {
  id: string; productId: string; name: string; sku: string; qty: number; available: number;
  unitPrice: number; priceMode: string; gstRate: number; discountPct: number; taxable: number; tax: number; total: number;
};

// Step 2 of billing: the quotation shown as the invoice it will become. Nothing is
// issued until Confirm invoice; leaving this page keeps the quotation as it was.
export function InvoiceDraft({
  orderId, orderNo, brandName, retailer: initialRetailer, igst, creditDays, notes, lines, taxable, tax, roundOff, grand, isManager,
}: {
  orderId: string; orderNo: string; brandName: string | null; retailer: PickerRetailer; igst: boolean; creditDays: number; notes: string | null;
  lines: DraftLine[]; taxable: number; tax: number; roundOff: number; grand: number; isManager: boolean;
}) {
  const router = useRouter();
  const [retailer, setRetailer] = useState(initialRetailer);
  const [paid, setPaid] = useState("");
  const [method, setMethod] = useState<Method>("cash");
  const [payRef, setPayRef] = useState("");
  const [overrideStock, setOverrideStock] = useState(false);
  const [overrideCredit, setOverrideCredit] = useState(false);
  const [editingDetails, setEditingDetails] = useState(false);
  const [error, setError] = useState<{ message: string; hint?: string } | null>(null);
  const [clientKey] = useState(newKey);
  const [pending, start] = useTransition();

  const today = todayIST();
  const due = addDays(today, creditDays);
  const paidNum = Math.min(Math.max(0, Number(paid) || 0), grand);
  const short = lines.filter((l) => l.qty > l.available).map((l) => ({ id: l.id, name: l.name, need: l.qty, have: l.available }));
  const overLimit = retailer.credit_limit > 0 && retailer.outstanding + grand - paidNum > retailer.credit_limit;
  const missing = missingTaxDetails(retailer, grand);
  const showCreditOverride = isManager && (overLimit || error?.hint === "CREDIT_LIMIT");
  const blocked = missing.length > 0 || (short.length > 0 && !overrideStock) || (showCreditOverride && !overrideCredit);
  const totalQty = lines.reduce((t, l) => t + l.qty, 0);

  function confirm() {
    if (blocked || pending) return;
    setError(null);
    start(async () => {
      const res = await confirmInvoiceDraft({
        orderId, overrideCredit, overrideStock, clientUuid: clientKey,
        payment: paidNum > 0 ? { amount: paidNum, method, reference: payRef } : null,
      });
      if (res.invoiceId) {
        rememberRetailer(retailer);
        if (res.error) notify.error(res.error);
        else notify.success(`Invoice ${res.invoiceNo ?? ""} confirmed${res.paid ? ` · ${inr(res.paid)} received` : ""}`);
        router.push(`/sales/invoices/${res.invoiceId}?new=1`);
        return;
      }
      setError({ message: res.error ?? "Could not confirm the invoice.", hint: res.hint });
      if (res.hint === "RETAILER_DETAILS") setEditingDetails(true);
      if (res.hint === "STOCK_SHORT") router.refresh();   // stock moved since this page loaded
    });
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); confirm(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const linkBtn = "inline-flex h-10 items-center gap-2 rounded-[var(--radius-control)] border border-line bg-surface px-4 text-sm font-medium text-text hover:bg-sunken";

  return (
    <div className="pb-28 xl:pb-6">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button className="h-10" disabled={blocked || pending} onClick={confirm}>
          <Check className="size-4" /> {pending ? "Confirming…" : "Confirm invoice"} <Kbd className="hidden border-on-fill/30 bg-on-fill/15 text-on-fill sm:inline-flex">Ctrl ↵</Kbd>
        </Button>
        <Link href={`/sales/orders/${orderId}`} className={linkBtn}><ArrowLeft className="size-4" /> Back to quotation</Link>
        <Link href={`/sales/orders/${orderId}/edit`} className="inline-flex h-10 items-center gap-2 rounded-[var(--radius-control)] px-3 text-sm font-medium text-text-2 hover:bg-sunken hover:text-text"><Pencil className="size-4" /> Edit quotation</Link>
        <DocSteps at={1} className="ml-auto hidden md:flex" />
      </div>

      <div className="rounded-[var(--radius-sheet)] border border-line bg-surface shadow-[var(--shadow-card)]">
        <div className="px-4 pt-5 pb-4 sm:px-6 sm:pt-6">
          <div className="mb-5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="text-[26px] font-semibold tracking-[-0.02em] text-text">Draft invoice</h2>
            <Badge tone="amber">Draft</Badge>
            <span className="text-[13px] text-text-2">
              From quotation <span className="font-mono font-medium text-text">{orderNo}</span>{brandName ? ` · ${brandName}` : ""} · the invoice number is given when you confirm
            </span>
          </div>

          <div className="grid gap-x-10 gap-y-4 lg:grid-cols-[1.25fr_1fr]">
            <div>
              <div className="mb-1.5 text-[13px] font-medium text-text">Bill to</div>
              <div className="rounded-[var(--radius-card)] border border-line bg-raised p-3.5">
                <div className="text-[15px] font-semibold text-text">{retailer.shop_name}</div>
                <div className="mt-0.5 text-[13px] text-text-2">
                  {[retailer.code, retailer.gstin ? `GSTIN ${retailer.gstin}` : "Unregistered", igst ? "IGST" : "CGST + SGST"].filter(Boolean).join(" · ")}
                </div>
                {(retailer.billing_address || retailer.billing_city) && (
                  <div className="mt-1 text-[13px] text-text-2">{[retailer.billing_address, retailer.billing_city, retailer.billing_pincode].filter(Boolean).join(", ")}</div>
                )}
              </div>
              {missing.length > 0 && (
                <div className="mt-2"><Alert tone="amber">A GST invoice to this shop needs its <b>{missing.join(" and ")}</b>. <button type="button" onClick={() => setEditingDetails(true)} className="font-semibold underline underline-offset-2">Add now</button></Alert></div>
              )}
            </div>
            <dl className="grid content-start grid-cols-[auto_1fr] items-center gap-x-6 gap-y-3 text-sm">
              <dt className="text-[13px] font-medium text-text">Invoice date</dt>
              <dd className="tabular text-text">{fmtDate(today)} <span className="text-text-3">· today</span></dd>
              <dt className="text-[13px] font-medium text-text">Payment terms</dt>
              <dd className="text-text">{creditDays === 0 ? "Immediate payment" : `${creditDays} days`}</dd>
              <dt className="text-[13px] font-medium text-text">Due date</dt>
              <dd className="tabular font-medium text-text">{fmtDate(due)}</dd>
            </dl>
          </div>
        </div>

        {(short.length > 0 || showCreditOverride || (overLimit && !isManager)) && (
          <div className="space-y-3 border-t border-line px-3 py-4 sm:px-5">
            <ShortStockBanner lines={short} isManager={isManager} override={overrideStock} onOverride={setOverrideStock} />
            {overLimit && !isManager && (
              <Alert>Over credit limit: outstanding {inr(retailer.outstanding, { decimals: false })} + this invoice is above the limit of {inr(retailer.credit_limit, { decimals: false })}. Take a payment now, or ask a manager to confirm it.</Alert>
            )}
            {showCreditOverride && (
              <label className="flex cursor-pointer items-start gap-2.5 rounded-[var(--radius-card)] border border-red-600/40 bg-red-50 p-3 text-[13px] text-red-950">
                <input type="checkbox" checked={overrideCredit} onChange={(e) => setOverrideCredit(e.target.checked)} className="mt-0.5 size-4 accent-red-600" />
                <span>
                  <span className="font-semibold">Over credit limit.</span> Outstanding {inr(retailer.outstanding, { decimals: false })} + this invoice is above {inr(retailer.credit_limit, { decimals: false })}. Tick to allow it (recorded).
                </span>
              </label>
            )}
          </div>
        )}

        {/* Lines, read-only: change them with Edit quotation */}
        <div className="overflow-x-auto border-t border-line">
          <table className="w-full text-sm">
            <thead className="text-left text-xs font-medium text-text-2">
              <tr className="border-b border-line">
                <th scope="col" className="px-4 py-2.5 sm:px-6">Product</th>
                <th scope="col" className="px-3 py-2.5 text-right">Qty</th>
                <th scope="col" className="hidden px-3 py-2.5 text-right sm:table-cell">In stock</th>
                <th scope="col" className="px-3 py-2.5 text-right">Rate</th>
                <th scope="col" className="hidden px-3 py-2.5 text-right md:table-cell">Disc.</th>
                <th scope="col" className="hidden px-3 py-2.5 text-right md:table-cell">Taxable</th>
                <th scope="col" className="hidden px-3 py-2.5 text-right md:table-cell">GST</th>
                <th scope="col" className="px-4 py-2.5 text-right sm:px-6">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {lines.map((l) => {
                const isShort = l.qty > l.available;
                return (
                  <tr key={l.id} className={cn(isShort && "bg-red-50")}>
                    <td className="px-4 py-2.5 sm:px-6"><div className="font-medium text-text">{l.name}</div><div className="font-mono text-xs text-text-3">{l.sku}</div></td>
                    <td className="tabular px-3 py-2.5 text-right font-medium">{fmtQty(l.qty)}</td>
                    <td className={cn("tabular hidden px-3 py-2.5 text-right sm:table-cell", isShort ? "font-semibold text-red-700" : "text-text-2")}>{fmtQty(Math.max(l.available, 0))}</td>
                    <td className="tabular px-3 py-2.5 text-right">{inr(l.unitPrice)}<div className="text-xs text-text-3">{l.priceMode === "inclusive" ? "incl." : "+"} {l.gstRate}%</div></td>
                    <td className="tabular hidden px-3 py-2.5 text-right md:table-cell">{l.discountPct > 0 ? `${l.discountPct}%` : "—"}</td>
                    <td className="tabular hidden px-3 py-2.5 text-right md:table-cell">{inr(l.taxable)}</td>
                    <td className="tabular hidden px-3 py-2.5 text-right md:table-cell">{inr(l.tax)}</td>
                    <td className="tabular px-4 py-2.5 text-right font-medium sm:px-6">{inr(l.total)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="grid gap-6 border-t border-line px-4 py-5 sm:px-6 lg:grid-cols-[1fr_20rem] lg:items-start">
          <section aria-labelledby="pay-h" className="space-y-3">
            <h3 id="pay-h" className="text-sm font-semibold text-text">Payment received now</h3>
            <div className="flex flex-wrap items-center gap-2">
              <Input type="number" min={0} step="1" value={paid} placeholder="0" onChange={(e) => setPaid(e.target.value)} className="tabular h-10 w-40 text-right font-semibold" aria-label="Amount received now" />
              {paidNum < grand && <button type="button" onClick={() => setPaid(String(grand))} className="text-[13px] font-medium text-primary-text hover:underline">Paid in full ({inr(grand, { decimals: false })})</button>}
            </div>
            {paidNum > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <div role="radiogroup" aria-label="Payment method" className="flex rounded-full bg-sunken p-1">
                  {METHODS.map((mm) => (
                    <button key={mm.k} role="radio" aria-checked={method === mm.k} type="button" onClick={() => setMethod(mm.k)}
                      className={cn("relative h-8 rounded-full px-3 text-[13px] font-medium", method === mm.k ? "text-text" : "text-text-2")}>
                      {method === mm.k && <m.span layoutId="draft-method" className="absolute inset-0 rounded-full bg-raised shadow-[var(--shadow-card)]" transition={spring.snappy} />}
                      <span className="relative">{mm.label}</span>
                    </button>
                  ))}
                </div>
                {method !== "cash" && <Input value={payRef} onChange={(e) => setPayRef(e.target.value)} placeholder={method === "cheque" ? "Cheque no." : "UTR / reference"} className="h-9 w-48" aria-label="Payment reference" />}
              </div>
            )}
            {notes && <p className="rounded-[var(--radius-control)] bg-sunken p-3 text-[13px] text-text-2"><span className="font-medium text-text">Note: </span>{notes}</p>}
          </section>

          <dl className="tabular space-y-1.5 text-sm">
            <div className="flex justify-between gap-3"><dt className="text-text-2">{lines.length} product{lines.length === 1 ? "" : "s"} · {fmtQty(totalQty)} qty</dt><dd /></div>
            <div className="flex justify-between gap-3"><dt className="text-text-2">Taxable value</dt><dd className="font-medium">{inr(taxable)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-text-2">{igst ? "IGST" : "CGST + SGST"}</dt><dd className="font-medium">{inr(tax)}</dd></div>
            {roundOff !== 0 && <div className="flex justify-between gap-3"><dt className="text-text-2">Round off</dt><dd className="font-medium">{roundOff < 0 ? `− ${inr(-roundOff)}` : `+ ${inr(roundOff)}`}</dd></div>}
            <div className="flex items-baseline justify-between border-t border-line pt-2.5"><dt className="font-semibold text-text">Total</dt><dd className="text-2xl font-semibold tracking-[-0.02em] text-text">{inr(grand)}</dd></div>
            {paidNum > 0 && <div className="flex justify-between gap-3"><dt className="text-text-2">Received now</dt><dd className="font-medium text-green-700">− {inr(paidNum)}</dd></div>}
            <div className="flex justify-between gap-3"><dt className="text-text-2">Balance due {fmtDate(due)}</dt><dd className="font-semibold text-text">{inr(grand - paidNum)}</dd></div>
          </dl>
        </div>

        {error && <div className="px-4 pb-5 sm:px-6"><div key={error.message} className="nudge"><Alert>{error.message}</Alert></div></div>}
        <p className="border-t border-line px-4 py-3 text-xs text-text-3 sm:px-6">Confirming gives the invoice its number. Stock leaves the warehouse when the order is dispatched.</p>
      </div>

      {/* Phone: total + confirm, frosted */}
      <div className="glass fixed inset-x-0 bottom-16 z-30 flex items-center gap-3 border-t border-line/70 px-4 py-2.5 xl:hidden">
        <div className="min-w-0 flex-1">
          <div className="text-xs text-text-2">Draft invoice · {retailer.shop_name}</div>
          <div className="tabular text-lg font-semibold text-text">{inr(grand)}</div>
        </div>
        <Button className="h-11" disabled={blocked || pending} onClick={confirm}>{pending ? "Confirming…" : "Confirm invoice"}</Button>
      </div>

      {editingDetails && (
        <BillingDetailsDialog retailer={retailer} onClose={() => setEditingDetails(false)}
          onSaved={(r) => { setRetailer(r); rememberRetailer(r); setEditingDetails(false); setError(null); router.refresh(); }} />
      )}
    </div>
  );
}
