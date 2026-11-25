"use client";

import { forwardRef, useEffect, useRef, useState } from "react";
import * as m from "motion/react-m";
import { AnimatePresence } from "motion/react";
import { ImageOff, LayoutGrid, Minus, Plus, Repeat, Search, Trash2, X } from "lucide-react";
import { BarcodeScanButton } from "@/components/barcode-scanner";
import { Badge, Kbd, cn } from "@/components/ui";
import { inr, qty as fmtQty } from "@/lib/format";
import { duration, ease, spring } from "@/lib/motion";
import type { PickerProduct } from "./actions";
import type { BuilderLine } from "./billing-screen";

type LineCalc = { total: number };

// The invoice's product lines: one row per product with stock, quantity, rate, discount and
// amount. New rows slide in and glow briefly; removed rows fold away.
export function LinesTable({
  lines, calc, available, isManager, maxDisc, effDisc, flashId, onLine, onRemove,
}: {
  lines: BuilderLine[];
  calc: LineCalc[];
  available: (id: string, fallback: number) => number;
  isManager: boolean;
  maxDisc: number;
  effDisc: (l: BuilderLine) => number;
  flashId: { id: string; n: number } | null;
  onLine: (id: string, patch: Partial<BuilderLine>) => void;
  onRemove: (id: string) => void;
}) {
  // The row that was just added or topped up glows for a moment (Web Animations, so it replays every time).
  const bodyRef = useRef<HTMLTableSectionElement>(null);
  useEffect(() => {
    if (!flashId) return;
    const row = bodyRef.current?.querySelector<HTMLElement>(`[data-row="${CSS.escape(flashId.id)}"]`);
    if (!row || window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.motion === "reduce") return;
    row.animate([{ backgroundColor: "color-mix(in oklab, var(--blue-600) 16%, transparent)" }, { backgroundColor: "transparent" }], { duration: 1200, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });
  }, [flashId]);
  return (
    <>
    {/* Phones: one card per line */}
    <ul className="divide-y divide-line sm:hidden">
      <AnimatePresence initial={false}>
        {lines.map((l, i) => {
          const have = available(l.product.id, l.product.available);
          const short = l.qty > have;
          return (
            <m.li
              key={l.product.id}
              layout="position"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0, transition: { duration: duration.base, ease: ease.out } }}
              exit={{ opacity: 0, x: 24, transition: { duration: duration.fast, ease: ease.in } }}
              className={cn("px-4 py-3", short && "bg-red-50/70")}
            >
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-text">{l.product.name}</div>
                  <div className="text-xs text-text-2"><span className="font-mono">{l.product.sku}</span> · {inr(l.price ?? l.product.retailer_price)} · {have <= 0 ? "none in stock" : `${fmtQty(have)} in stock`}</div>
                  {short && <div className="mt-1.5"><Badge tone="red">Short by {fmtQty(l.qty - Math.max(have, 0))}</Badge></div>}
                </div>
                <button onClick={() => onRemove(l.product.id)} className="-mt-1 -mr-2 grid size-10 place-items-center rounded-full text-text-3 hover:bg-red-50 hover:text-red-700" aria-label={`Remove ${l.product.name}`}>
                  <Trash2 className="size-4" />
                </button>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <div className="inline-flex h-10 items-center rounded-full border border-field/55 bg-raised">
                  <button onClick={() => (l.qty <= 1 ? onRemove(l.product.id) : onLine(l.product.id, { qty: l.qty - 1 }))} className="grid size-10 place-items-center rounded-full text-text-2" aria-label={`One less ${l.product.name}`}><Minus className="size-4" /></button>
                  <input type="number" min={0} step="any" inputMode="decimal" value={l.qty || ""} onChange={(e) => onLine(l.product.id, { qty: Number(e.target.value) })} className="tabular h-9 w-12 bg-transparent text-center text-[15px] font-semibold text-text outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" aria-label={`Quantity of ${l.product.name}`} />
                  <button onClick={() => onLine(l.product.id, { qty: l.qty + 1 })} className="grid size-10 place-items-center rounded-full text-text-2" aria-label={`One more ${l.product.name}`}><Plus className="size-4" /></button>
                </div>
                <span className="tabular text-[15px] font-semibold text-text">{inr(calc[i]?.total ?? 0)}</span>
              </div>
            </m.li>
          );
        })}
      </AnimatePresence>
    </ul>
    <div className="hidden overflow-x-auto sm:block">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs font-medium text-text-2">
            <th scope="col" className="w-8 py-2.5 pl-4 font-medium">#</th>
            <th scope="col" className="py-2.5 pr-2 font-medium">Product</th>
            <th scope="col" className="hidden py-2.5 pr-2 font-medium md:table-cell">In stock</th>
            <th scope="col" className="py-2.5 pr-2 font-medium">Qty</th>
            <th scope="col" className="hidden py-2.5 pr-2 text-right font-medium sm:table-cell">Rate</th>
            {maxDisc > 0 && <th scope="col" className="hidden py-2.5 pr-2 text-right font-medium sm:table-cell">Disc %</th>}
            <th scope="col" className="py-2.5 pr-2 text-right font-medium">Amount</th>
            <th scope="col" className="w-10 py-2.5 pr-3"><span className="sr-only">Remove</span></th>
          </tr>
        </thead>
        <tbody ref={bodyRef}>
          <AnimatePresence initial={false}>
            {lines.map((l, i) => {
              const have = available(l.product.id, l.product.available);
              const short = l.qty > have;
              return (
                <m.tr
                  key={l.product.id}
                  layout="position"
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0, transition: { duration: duration.base, ease: ease.out } }}
                  exit={{ opacity: 0, x: 24, transition: { duration: duration.fast, ease: ease.in } }}
                  className={cn("border-b border-line align-top last:border-0", short && "bg-red-50/70")}
                  data-row={l.product.id}
                >
                  <td className="tabular py-3 pl-4 text-text-3">{i + 1}</td>
                  <td className="max-w-[18rem] py-3 pr-2">
                    <div className="font-medium text-text">{l.product.name}</div>
                    <div className="flex flex-wrap items-center gap-x-2 text-xs text-text-2">
                      <span className="font-mono">{l.product.sku}</span>
                      <span>{l.product.brand_name}</span>
                    </div>
                    {short && <div className="mt-1.5"><Badge tone="red">Short by {fmtQty(l.qty - Math.max(have, 0))}</Badge></div>}
                  </td>
                  <td className={cn("tabular hidden py-3 pr-2 md:table-cell", have <= 0 ? "font-medium text-red-700" : have < 10 ? "font-medium text-amber-700" : "text-text-2")}>
                    {have <= 0 ? "None" : fmtQty(have)}
                  </td>
                  <td className="py-2 pr-2">
                    <div className="inline-flex h-9 items-center rounded-full border border-field/55 bg-raised">
                      <button onClick={() => (l.qty <= 1 ? onRemove(l.product.id) : onLine(l.product.id, { qty: l.qty - 1 }))} className="grid size-9 place-items-center rounded-full text-text-2 hover:bg-sunken" aria-label={`One less ${l.product.name}`}>
                        <Minus className="size-3.5" />
                      </button>
                      <input
                        type="number" min={0} step="any" inputMode="decimal" value={l.qty || ""}
                        onChange={(e) => onLine(l.product.id, { qty: Number(e.target.value) })}
                        className="tabular h-8 w-12 bg-transparent text-center text-sm font-semibold text-text outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                        aria-label={`Quantity of ${l.product.name}`}
                      />
                      <button onClick={() => onLine(l.product.id, { qty: l.qty + 1 })} className="grid size-9 place-items-center rounded-full text-text-2 hover:bg-sunken" aria-label={`One more ${l.product.name}`}>
                        <Plus className="size-3.5" />
                      </button>
                    </div>
                  </td>
                  <td className="hidden py-3 pr-2 text-right sm:table-cell">
                    {isManager ? (
                      <input
                        type="number" min={0} step="0.01" value={l.price ?? l.product.retailer_price}
                        onChange={(e) => onLine(l.product.id, { price: e.target.value === "" ? null : Number(e.target.value) })}
                        className="tabular -my-1 h-8 w-24 rounded-[8px] border border-transparent bg-transparent px-2 text-right hover:border-field/55 focus:border-primary focus:bg-raised focus:outline-none"
                        aria-label={`Rate of ${l.product.name}`}
                      />
                    ) : (
                      <span className="tabular text-text">{inr(l.product.retailer_price)}</span>
                    )}
                    <div className="text-xs text-text-3">{l.product.retailer_price_mode === "inclusive" ? "incl." : "+"} {l.product.gst_rate}% GST</div>
                  </td>
                  {maxDisc > 0 && (
                    <td className="hidden py-3 pr-2 text-right sm:table-cell">
                      <input
                        type="number" min={0} max={maxDisc} step="0.5" value={l.discount || ""} placeholder="0"
                        onChange={(e) => onLine(l.product.id, { discount: Number(e.target.value) })}
                        className={cn("tabular -my-1 h-8 w-16 rounded-[8px] border border-transparent bg-transparent px-2 text-right hover:border-field/55 focus:border-primary focus:bg-raised focus:outline-none", effDisc(l) > maxDisc && "border-red-600 bg-red-50")}
                        aria-label={`Discount on ${l.product.name}`}
                      />
                    </td>
                  )}
                  <td className="tabular py-3 pr-2 text-right font-semibold text-text">{inr(calc[i]?.total ?? 0)}</td>
                  <td className="py-2 pr-3 text-right">
                    <button onClick={() => onRemove(l.product.id)} className="grid size-9 place-items-center rounded-full text-text-3 hover:bg-red-50 hover:text-red-700" aria-label={`Remove ${l.product.name}`}>
                      <Trash2 className="size-4" />
                    </button>
                  </td>
                </m.tr>
              );
            })}
          </AnimatePresence>
        </tbody>
      </table>
    </div>
    </>
  );
}

// "Add a product" row under the lines: type to search (name, SKU, barcode, 65W…), arrows
// to move, Enter to add. Exact SKU or barcode adds straight away. Plus Catalogue, Scan and
// Repeat last invoice.
export const AddProductRow = forwardRef<HTMLInputElement, {
  q: string;
  setQ: (q: string) => void;
  results: PickerProduct[];
  loading: boolean;
  inCart: Map<string, number>;
  onAdd: (p: PickerProduct) => void;
  onEnterExact: () => boolean;
  onCatalog: () => void;
  onScan: (code: string) => void;
  repeatLabel?: string;
  onRepeat?: () => void;
  brandName?: string;
}>(function AddProductRow({ q, setQ, results, loading, inCart, onAdd, onEnterExact, onCatalog, onScan, repeatLabel, onRepeat, brandName }, ref) {
  const [hi, setHi] = useState(0);
  const open = q.trim().length > 0;
  useEffect(() => setHi(0), [q]);

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, Math.max(results.length - 1, 0))); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
    else if (e.key === "Enter") {
      e.preventDefault();
      if (onEnterExact()) return;
      const p = results[hi];
      if (p) { onAdd(p); setQ(""); }
    } else if (e.key === "Escape") { e.preventDefault(); setQ(""); }
  }

  return (
    <div className="border-t border-line px-3 py-3 sm:px-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-[18px] -translate-y-1/2 text-text-3" aria-hidden />
          <input
            ref={ref}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            role="combobox"
            aria-expanded={open}
            aria-controls="add-product-list"
            aria-autocomplete="list"
            aria-activedescendant={open && results[hi] ? `add-opt-${results[hi].id}` : undefined}
            placeholder={`Add a product${brandName ? ` (${brandName})` : ""}: name, SKU, barcode, 65W…`}
            autoComplete="off"
            className="h-11 w-full rounded-[var(--radius-control)] border border-dashed border-field/70 bg-transparent pr-16 pl-10 text-[15px] text-text outline-none placeholder:text-text-3 hover:border-field focus:border-solid focus:border-primary focus:bg-raised focus:ring-4 focus:ring-primary/15"
          />
          {q ? (
            <button onClick={() => setQ("")} aria-label="Clear" className="absolute top-1/2 right-2 grid size-7 -translate-y-1/2 place-items-center rounded-full text-text-2 hover:bg-sunken"><X className="size-4" /></button>
          ) : (
            <Kbd className="absolute top-1/2 right-3 -translate-y-1/2">/</Kbd>
          )}

          <AnimatePresence>
            {open && (
              <m.ul
                id="add-product-list"
                role="listbox"
                initial={{ opacity: 0, y: -4, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: duration.fast, ease: ease.out } }}
                exit={{ opacity: 0, y: -4, transition: { duration: duration.instant } }}
                className="absolute inset-x-0 top-full z-30 mt-1.5 max-h-80 origin-top overflow-y-auto rounded-[var(--radius-card)] border border-line bg-raised p-1.5 shadow-[var(--shadow-raised)]"
              >
                {loading ? (
                  <li className="px-3 py-6 text-center text-sm text-text-2">Loading products…</li>
                ) : results.length === 0 ? (
                  <li className="px-3 py-6 text-center text-sm text-text-2">Nothing matches. Try fewer letters or the SKU.</li>
                ) : (
                  results.slice(0, 12).map((p, i) => {
                    const n = inCart.get(p.id) ?? 0;
                    return (
                      <li
                        key={p.id}
                        id={`add-opt-${p.id}`}
                        role="option"
                        aria-selected={i === hi}
                        onMouseEnter={() => setHi(i)}
                        onMouseDown={(e) => { e.preventDefault(); onAdd(p); setQ(""); }}
                        className={cn("flex cursor-pointer items-center gap-3 rounded-[var(--radius-control)] px-2.5 py-2", i === hi && "bg-sunken")}
                      >
                        <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-sunken">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          {p.image_url ? <img src={p.image_url} alt="" className="size-full object-contain p-0.5" /> : <ImageOff className="size-4 text-text-3" aria-hidden />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-text">{p.name}</span>
                          <span className="block truncate text-xs text-text-2"><span className="font-mono">{p.sku}</span> · {p.brand_name}</span>
                        </span>
                        <span className="text-right">
                          <span className="tabular block text-sm font-semibold text-text">{inr(p.retailer_price)}</span>
                          <span className={cn("block text-xs", p.available <= 0 ? "text-red-700" : p.available < 10 ? "text-amber-700" : "text-text-2")}>
                            {p.available <= 0 ? "Out of stock" : `${fmtQty(p.available)} in stock`}
                          </span>
                        </span>
                        {n > 0 && <span className="tabular rounded-full bg-primary-soft px-2 py-0.5 text-xs font-semibold text-primary-text">× {fmtQty(n)}</span>}
                      </li>
                    );
                  })
                )}
              </m.ul>
            )}
          </AnimatePresence>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={onCatalog} className="flex h-11 items-center gap-2 rounded-[var(--radius-control)] border border-line bg-surface px-3.5 text-sm font-medium text-text hover:border-field/60 hover:bg-sunken">
            <LayoutGrid className="size-4" /> Catalogue <Kbd>F2</Kbd>
          </button>
          <BarcodeScanButton label="Scan" onDetected={onScan} />
          {onRepeat && (
            <button onClick={onRepeat} title={repeatLabel} className="flex h-11 items-center gap-2 rounded-[var(--radius-control)] px-3 text-sm font-medium text-primary-text hover:bg-primary-soft">
              <Repeat className="size-4" /> <span className="hidden xl:inline">Repeat last bill</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
});

// Quick-add chips: what this shop usually buys, favourites.
export function QuickAdd({ title, products, inCart, onAdd }: { title: string; products: PickerProduct[]; inCart: Map<string, number>; onAdd: (p: PickerProduct) => void }) {
  if (!products.length) return null;
  return (
    <div>
      <div className="mb-2 text-xs font-medium text-text-2">{title}</div>
      <div className="flex flex-wrap gap-1.5">
        {products.slice(0, 10).map((p) => {
          const n = inCart.get(p.id) ?? 0;
          return (
            <m.button
              key={p.id}
              onClick={() => onAdd(p)}
              whileTap={{ scale: 0.96 }}
              transition={spring.snappy}
              className={cn("flex h-9 items-center gap-1.5 rounded-full border pr-3 pl-1.5 text-[13px]", n ? "border-primary/40 bg-primary-soft text-primary-text" : "border-line bg-surface text-text hover:border-field/60")}
            >
              <span className="grid size-6 place-items-center rounded-full bg-sunken"><Plus className="size-3.5" /></span>
              <span className="max-w-44 truncate">{p.name}</span>
              {n > 0 && <span className="tabular font-semibold">× {fmtQty(n)}</span>}
            </m.button>
          );
        })}
      </div>
    </div>
  );
}
