"use client";

import * as m from "motion/react-m";
import { AnimatePresence } from "motion/react";
import { PackageX } from "lucide-react";
import { Button } from "@/components/ui";
import { qty as fmtQty } from "@/lib/format";
import { duration, ease } from "@/lib/motion";

export type ShortLine = { id: string; name: string; need: number; have: number };

// Shown the moment a line asks for more than is in stock. Orders ship in full, so
// the invoice can't go out until every line is covered: the banner says which items,
// by how much, and what to do. It slides in with one attention pulse, then stays still.
// On a quotation it warns (the quote can still be saved); on the invoice draft it
// blocks Confirm unless a manager chooses "invoice anyway".
export function ShortStockBanner({
  lines,
  isManager,
  override,
  onOverride,
  onUseAvailable,
  onSaveDraft,
  compact,
  stage = "invoice",
}: {
  lines: ShortLine[];
  isManager: boolean;
  override?: boolean;
  onOverride?: (v: boolean) => void;
  onUseAvailable?: () => void;
  onSaveDraft?: () => void;
  compact?: boolean;
  stage?: "quote" | "invoice";
}) {
  const quote = stage === "quote";
  const n = lines.length;
  return (
    <AnimatePresence initial={false}>
      {n > 0 && (
        <m.div
          key="short"
          role="alert"
          aria-live="assertive"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0, transition: { duration: duration.base, ease: ease.out } }}
          exit={{ opacity: 0, y: -4, transition: { duration: duration.fast, ease: ease.in } }}
          className="attention-pulse rounded-[var(--radius-card)] border border-red-600/60 bg-red-50 p-3.5 text-sm"
        >
          <div className="flex items-start gap-2.5">
            <PackageX className="mt-0.5 size-5 shrink-0 text-red-600" aria-hidden />
            <div className="min-w-0">
              <p className="font-semibold text-red-900">
                {n} item{n === 1 ? " is" : "s are"} short
              </p>
              <p className="text-[13px] text-red-900/80">
                {quote
                  ? <>You can save this quotation, but orders ship in full, so it can’t be invoiced until {n === 1 ? "it is" : "they are"} in stock.</>
                  : <>Orders ship in full, so this invoice can’t go out until {n === 1 ? "it is" : "they are"} in stock.</>}
              </p>
            </div>
          </div>
          <table className="mt-2.5 w-full text-[13px]">
            <thead>
              <tr className="text-left text-xs text-red-900/70">
                <th scope="col" className="py-1 font-medium">Product</th>
                <th scope="col" className="py-1 text-right font-medium">Need</th>
                <th scope="col" className="py-1 text-right font-medium">Have</th>
                <th scope="col" className="py-1 text-right font-medium">Short</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-red-600/15">
              {lines.slice(0, compact ? 4 : 20).map((l) => (
                <tr key={l.id}>
                  <td className="py-1.5 pr-2 break-words text-red-950">{l.name}</td>
                  <td className="tabular py-1.5 text-right text-red-900/80">{fmtQty(l.need)}</td>
                  <td className="tabular py-1.5 text-right text-red-900/80">{fmtQty(Math.max(l.have, 0))}</td>
                  <td className="tabular py-1.5 text-right font-bold text-red-700">{fmtQty(l.need - Math.max(l.have, 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {compact && lines.length > 4 && <p className="mt-1 text-xs text-red-900/70">and {lines.length - 4} more</p>}
          {quote ? null : isManager ? (
            <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-[var(--radius-control)] bg-raised p-2.5 text-[13px] text-text">
              <input type="checkbox" checked={!!override} onChange={(e) => onOverride?.(e.target.checked)} className="mt-0.5 size-4 accent-red-600" />
              <span>
                <span className="font-semibold">Invoice anyway as a back-order.</span> Goods are dispatched only when all stock arrives. This is recorded.
              </span>
            </label>
          ) : (
            <p className="mt-2 text-[13px] text-red-900/80">Edit the quotation to reduce the quantities, or ask a manager to confirm it.</p>
          )}
          {(onUseAvailable || onSaveDraft) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {onUseAvailable && <Button size="sm" variant="secondary" onClick={onUseAvailable}>Use what’s in stock</Button>}
              {onSaveDraft && !isManager && <Button size="sm" variant="secondary" onClick={onSaveDraft}>Save draft for a manager</Button>}
            </div>
          )}
        </m.div>
      )}
    </AnimatePresence>
  );
}
