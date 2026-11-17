"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as m from "motion/react-m";
import { AnimatePresence } from "motion/react";
import { ArrowLeft, ImageOff, Minus, Plus, Search, ShoppingCart, Sparkles, Star, X } from "lucide-react";
import { BarcodeScanButton } from "@/components/barcode-scanner";
import { Kbd, cn, pressable } from "@/components/ui";
import { inr, qty as fmtQty } from "@/lib/format";
import { brandTone } from "@/lib/brand-style";
import { duration, ease, spring, staggerDelay } from "@/lib/motion";
import type { PickerProduct } from "./actions";

type Brand = { id: string; name: string; code: string };

export type CatalogProps = {
  onClose: () => void;
  products: PickerProduct[] | null; // null while the brand's catalogue loads
  categories: { id: string; name: string }[];
  brands: Brand[];
  brandId: string;
  onBrand: (id: string) => void;
  inCart: Map<string, number>;
  onAdd: (p: PickerProduct, n?: number) => void;
  onQty: (p: PickerProduct, qty: number) => void;
  favs: string[];
  onFav: (id: string) => void;
  usual: PickerProduct[];
  recent: PickerProduct[];
  shop: string | null;
  lineCount: number;
  totalQty: number;
  total: number;
  match: (p: PickerProduct, q: string) => boolean;
};

type Filter = { kind: "all" } | { kind: "cat"; id: string } | { kind: "usual" } | { kind: "fav" } | { kind: "recent" } | { kind: "cart" };

// Full-screen product catalogue (F2): search, brand and category on the side, product cards
// with price and stock. "Add" turns into − qty + so a whole order can be built here.
export function CatalogView(p: CatalogProps) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>({ kind: "all" });
  const searchRef = useRef<HTMLInputElement>(null);

  // Focus the search and stop the page behind from scrolling, once.
  useEffect(() => {
    searchRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Esc clears the search first, then closes; F2 closes.
  const closeRef = useRef(p.onClose);
  closeRef.current = p.onClose;
  const qRef = useRef(q);
  qRef.current = q;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" && e.key !== "F2") return;
      e.preventDefault();
      if (e.key === "Escape" && qRef.current) setQ("");
      else closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const all = useMemo(() => p.products ?? [], [p.products]);
  const { usual, favs, recent, inCart, match } = p;
  const list = useMemo(() => {
    let base: PickerProduct[] = all;
    if (filter.kind === "cat") base = all.filter((x) => x.category_id === filter.id);
    else if (filter.kind === "usual") base = usual;
    else if (filter.kind === "fav") base = all.filter((x) => favs.includes(x.id));
    else if (filter.kind === "recent") base = recent;
    else if (filter.kind === "cart") base = all.filter((x) => inCart.has(x.id));
    const term = q.trim();
    return term ? base.filter((x) => match(x, term)) : base;
  }, [all, filter, q, usual, favs, recent, inCart, match]);

  const counts = useMemo(() => {
    const c = new Map<string, number>();
    for (const x of all) if (x.category_id) c.set(x.category_id, (c.get(x.category_id) ?? 0) + 1);
    return c;
  }, [all]);

  const side: { key: string; label: string; n: number; f: Filter; icon?: React.ReactNode }[] = [
    { key: "all", label: "All products", n: all.length, f: { kind: "all" } },
    ...(p.lineCount ? [{ key: "cart", label: "In this invoice", n: p.lineCount, f: { kind: "cart" } as Filter, icon: <ShoppingCart className="size-3.5" /> }] : []),
    ...(p.usual.length ? [{ key: "usual", label: p.shop ? `${p.shop} usually buys` : "Usually bought", n: p.usual.length, f: { kind: "usual" } as Filter, icon: <Sparkles className="size-3.5" /> }] : []),
    ...(p.favs.length ? [{ key: "fav", label: "Favourites", n: p.favs.length, f: { kind: "fav" } as Filter, icon: <Star className="size-3.5" /> }] : []),
    ...(p.recent.length ? [{ key: "recent", label: "Recently billed", n: p.recent.length, f: { kind: "recent" } as Filter }] : []),
    ...p.categories.map((c) => ({ key: c.id, label: c.name, n: counts.get(c.id) ?? 0, f: { kind: "cat", id: c.id } as Filter })),
  ];
  const isOn = (f: Filter) => f.kind === filter.kind && (f.kind !== "cat" || (filter.kind === "cat" && f.id === filter.id));

  function onSearchKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const term = q.trim().toLowerCase();
    const exact = all.find((x) => x.sku.toLowerCase() === term || x.barcode === q.trim());
    const hit = exact ?? (list.length === 1 ? list[0] : null);
    if (hit) {
      p.onAdd(hit);
      setQ("");
    }
  }

  return (
    <m.div
      role="dialog"
      aria-modal="true"
      aria-label="Product catalogue"
      className="fixed inset-0 z-50 flex flex-col bg-bg"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0, transition: { duration: duration.base, ease: ease.out } }}
      exit={{ opacity: 0, y: 16, transition: { duration: duration.fast, ease: ease.in } }}
    >
      {/* Top: back, search, scan */}
      <header className="glass sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-line/70 px-3 py-2.5 sm:gap-3 sm:px-5">
        <button onClick={p.onClose} className={cn("flex h-10 items-center gap-2 rounded-[var(--radius-control)] bg-primary px-3.5 text-sm font-medium text-on-fill hover:bg-primary-hover", pressable)}>
          <ArrowLeft className="size-4" /> <span className="hidden sm:inline">Back to invoice</span><span className="sm:hidden">Back</span>
        </button>
        <label className="relative order-last w-full sm:order-none sm:w-auto sm:flex-1 sm:max-w-xl">
          <span className="sr-only">Search products</span>
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-[18px] -translate-y-1/2 text-text-3" aria-hidden />
          <input
            ref={searchRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onSearchKey}
            placeholder="Search name, SKU, barcode, 65W, Type C…"
            autoComplete="off"
            className="h-11 w-full rounded-full border border-field/55 bg-raised pr-10 pl-10 text-[15px] text-text outline-none placeholder:text-text-3 focus:border-primary focus:ring-4 focus:ring-primary/15"
          />
          {q && (
            <button onClick={() => setQ("")} aria-label="Clear search" className="absolute top-1/2 right-2 grid size-7 -translate-y-1/2 place-items-center rounded-full text-text-2 hover:bg-sunken">
              <X className="size-4" />
            </button>
          )}
        </label>
        <BarcodeScanButton
          label="Scan"
          onDetected={(code) => {
            const hit = all.find((x) => x.barcode === code || x.sku.toLowerCase() === code.toLowerCase());
            if (hit) p.onAdd(hit);
            else setQ(code);
          }}
        />
        <span className="ml-auto hidden items-center gap-2 text-[13px] text-text-2 md:flex">
          <span className="tabular">{list.length} of {all.length}</span>
          <Kbd>Esc</Kbd>
        </span>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Side: invoice so far, brand, categories */}
        <aside className="hidden w-80 shrink-0 flex-col gap-5 overflow-y-auto border-r border-line bg-surface p-4 lg:flex">
          <Summary {...p} />
          {p.brands.length > 1 && <BrandSwitch {...p} />}
          <nav aria-label="Categories">
            <div className="mb-1.5 px-2 text-[12px] font-medium text-text-2">Show</div>
            <ul className="space-y-0.5">
              {side.map((s) => (
                <li key={s.key}>
                  <button
                    onClick={() => setFilter(s.f)}
                    aria-current={isOn(s.f) ? "true" : undefined}
                    className={cn(
                      "relative flex h-9 w-full items-center gap-2 rounded-full px-3 text-left text-[13.5px] transition-colors",
                      isOn(s.f) ? "font-semibold text-primary-text" : "text-text-2 hover:bg-sunken hover:text-text"
                    )}
                  >
                    {isOn(s.f) && <m.span layoutId="catalog-side" className="absolute inset-0 rounded-full bg-primary-soft" transition={spring.snappy} />}
                    <span className="relative flex min-w-0 flex-1 items-center gap-2 truncate">{s.icon}{s.label}</span>
                    <span className="tabular relative text-xs text-text-3">{s.n}</span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        </aside>

        <div className="min-w-0 flex-1 overflow-y-auto">
          {/* Phone/tablet: filters as chips */}
          <div className="no-scrollbar flex gap-1.5 overflow-x-auto px-3 pt-3 lg:hidden">
            {p.brands.length > 1 &&
              [{ id: "", name: "All brands", code: "" }, ...p.brands].map((b) => (
                <button key={b.id || "all"} onClick={() => p.onBrand(b.id)} className={cn("h-8 shrink-0 rounded-full border px-3 text-[13px] font-medium", p.brandId === b.id ? "border-transparent bg-primary-soft text-primary-text" : "border-line bg-surface text-text-2")}>
                  {b.name}
                </button>
              ))}
            {side.map((s) => (
              <button key={s.key} onClick={() => setFilter(s.f)} className={cn("h-8 shrink-0 rounded-full border px-3 text-[13px] font-medium", isOn(s.f) ? "border-transparent bg-primary-soft text-primary-text" : "border-line bg-surface text-text-2")}>
                {s.label} <span className="opacity-60">{s.n}</span>
              </button>
            ))}
          </div>

          {p.products === null ? (
            <div className="grid gap-3 p-3 sm:grid-cols-2 sm:p-5 2xl:grid-cols-3" aria-busy="true">
              {Array.from({ length: 9 }, (_, i) => <div key={i} className="skeleton h-36 rounded-[var(--radius-card)]" />)}
            </div>
          ) : list.length === 0 ? (
            <div className="px-6 py-20 text-center">
              <p className="text-[15px] font-medium text-text">Nothing matches</p>
              <p className="mt-1 text-sm text-text-2">Try fewer letters, the SKU, or another category.</p>
            </div>
          ) : (
            <ul className="grid gap-3 p-3 pb-28 sm:grid-cols-2 sm:p-5 lg:pb-8 2xl:grid-cols-3">
              {list.map((x, i) => (
                <ProductTile key={x.id} p={x} qty={p.inCart.get(x.id) ?? 0} fav={p.favs.includes(x.id)} index={i} onAdd={p.onAdd} onQty={p.onQty} onFav={p.onFav} />
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Phone: running total + back */}
      <div className="glass fixed inset-x-0 bottom-0 z-10 flex items-center gap-3 border-t border-line/70 px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))] lg:hidden">
        <div className="min-w-0 flex-1">
          <div className="text-xs text-text-2">{p.lineCount} product{p.lineCount === 1 ? "" : "s"} · {fmtQty(p.totalQty)} qty</div>
          <div className="tabular text-lg font-semibold text-text">{inr(p.total)}</div>
        </div>
        <button onClick={p.onClose} className={cn("h-11 rounded-[var(--radius-control)] bg-primary px-5 text-sm font-semibold text-on-fill", pressable)}>Done</button>
      </div>
    </m.div>
  );
}

function Summary({ shop, lineCount, totalQty, total }: CatalogProps) {
  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-raised p-3.5">
      <div className="truncate text-[13px] text-text-2">{shop ?? "No retailer chosen yet"}</div>
      <div className="mt-1 flex items-baseline justify-between gap-2">
        <span className="text-[13px] text-text-2">{lineCount} product{lineCount === 1 ? "" : "s"} · {fmtQty(totalQty)} qty</span>
      </div>
      <div className="mt-1 flex items-baseline justify-between">
        <span className="text-sm font-medium text-text">Total</span>
        <AnimatePresence mode="popLayout" initial={false}>
          <m.span key={total} className="tabular text-xl font-semibold text-text" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0, transition: { duration: duration.fast } }} exit={{ opacity: 0, y: -6, transition: { duration: duration.instant } }}>
            {inr(total)}
          </m.span>
        </AnimatePresence>
      </div>
    </div>
  );
}

function BrandSwitch({ brands, brandId, onBrand }: CatalogProps) {
  const opts = [{ id: "", name: "All", code: "" }, ...brands];
  return (
    <div>
      <div className="mb-1.5 px-2 text-[12px] font-medium text-text-2">Brand</div>
      <div role="radiogroup" aria-label="Brand" className="flex rounded-full bg-sunken p-1">
        {opts.map((b) => {
          const on = brandId === b.id;
          return (
            <button key={b.id || "all"} role="radio" aria-checked={on} onClick={() => onBrand(b.id)} className={cn("relative flex h-8 flex-1 items-center justify-center gap-1.5 rounded-full px-2 text-[12.5px] font-medium whitespace-nowrap", on ? "text-text" : "text-text-2 hover:text-text")}>
              {on && <m.span layoutId="catalog-brand" className="absolute inset-0 rounded-full bg-raised shadow-[var(--shadow-card)]" transition={spring.snappy} />}
              {b.code && <span className={cn("relative size-2 rounded-full", brandTone(b.code).dot)} />}
              <span className="relative">{b.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ProductTile({ p, qty, fav, index, onAdd, onQty, onFav }: { p: PickerProduct; qty: number; fav: boolean; index: number; onAdd: (p: PickerProduct, n?: number) => void; onQty: (p: PickerProduct, q: number) => void; onFav: (id: string) => void }) {
  const out = p.available <= 0;
  const low = !out && p.available < 10;
  const short = qty > p.available;
  return (
    <m.li
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0, transition: { duration: duration.base, ease: ease.out, delay: staggerDelay(Math.min(index, 12)) } }}
      className={cn(
        "group relative flex gap-3 rounded-[var(--radius-card)] border bg-surface p-3.5 shadow-[var(--shadow-card)] transition-[border-color,box-shadow] duration-[160ms]",
        qty > 0 ? (short ? "border-red-600/50 ring-2 ring-red-600/15" : "border-primary/50 ring-2 ring-primary/15") : "border-line hover:border-field/40"
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start gap-1.5">
          <h3 className="line-clamp-2 text-[15px] leading-snug font-semibold text-text">{p.name}</h3>
          <button
            onClick={() => onFav(p.id)}
            aria-label={fav ? `Remove ${p.name} from favourites` : `Add ${p.name} to favourites`}
            className={cn("-mt-0.5 -mr-1 ml-auto grid size-7 shrink-0 place-items-center rounded-full transition", fav ? "text-amber-500" : "text-text-3 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-amber-500")}
          >
            <Star className={cn("size-4", fav && "fill-current")} />
          </button>
        </div>
        <div className="mt-0.5 truncate font-mono text-xs text-text-2">{p.sku}</div>
        <div className="mt-2 flex items-baseline gap-1.5">
          <span className="tabular text-base font-semibold text-text">{inr(p.retailer_price)}</span>
          <span className="text-xs text-text-3">{p.retailer_price_mode === "inclusive" ? "incl. GST" : `+ ${p.gst_rate}% GST`}</span>
        </div>
        <div className={cn("mt-0.5 text-[13px]", out ? "font-medium text-red-700" : low ? "font-medium text-amber-700" : "text-text-2")}>
          {out ? "Out of stock" : <><span className="tabular font-semibold">{fmtQty(p.available)}</span> available</>}
        </div>
        <div className="mt-auto flex items-end justify-between gap-2 pt-3">
          <span className="text-xs text-text-3">{p.brand_name}</span>
          <AnimatePresence mode="popLayout" initial={false}>
            {qty > 0 ? (
              <m.div
                key="stepper"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1, transition: spring.snappy }}
                exit={{ opacity: 0, scale: 0.9, transition: { duration: duration.instant } }}
                className="flex h-10 items-center rounded-full border border-primary/40 bg-primary-soft"
              >
                <button onClick={() => onQty(p, qty - 1)} aria-label={`One less ${p.name}`} className="grid size-10 place-items-center rounded-full text-primary-text hover:bg-primary/10">
                  <Minus className="size-4" />
                </button>
                <AnimatePresence mode="popLayout" initial={false}>
                  <m.span key={qty} className="tabular min-w-8 text-center text-sm font-semibold text-primary-text" initial={{ y: 8, opacity: 0 }} animate={{ y: 0, opacity: 1, transition: spring.snappy }} exit={{ y: -8, opacity: 0, transition: { duration: duration.instant } }}>
                    {fmtQty(qty)}
                  </m.span>
                </AnimatePresence>
                <button onClick={() => onAdd(p)} aria-label={`One more ${p.name}`} className="grid size-10 place-items-center rounded-full text-primary-text hover:bg-primary/10">
                  <Plus className="size-4" />
                </button>
              </m.div>
            ) : (
              <m.button
                key="add"
                onClick={() => onAdd(p)}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1, transition: spring.snappy }}
                exit={{ opacity: 0, scale: 0.9, transition: { duration: duration.instant } }}
                className={cn("flex h-10 items-center gap-1.5 rounded-full border border-line bg-raised px-4 text-sm font-medium text-text hover:border-primary/50 hover:text-primary-text", pressable)}
              >
                <ShoppingCart className="size-4" /> Add
              </m.button>
            )}
          </AnimatePresence>
        </div>
      </div>
      <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-[10px] bg-sunken sm:size-24">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {p.image_url ? <img src={p.image_url} alt="" className="size-full object-contain p-1.5" loading="lazy" draggable={false} /> : <ImageOff className="size-6 text-text-3" aria-hidden />}
      </div>
    </m.li>
  );
}
