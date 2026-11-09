"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle, Check, CheckCircle2, ChevronDown, Download, FileText, ImageOff, Keyboard, LayoutGrid, MessageCircle, Minus,
  Plus, Printer, Repeat, Search, ShoppingCart, Sparkles, Star, X,
} from "lucide-react";
import { Alert, Button, Input, Textarea, cn } from "@/components/ui";
import { Dialog } from "@/components/dialog";
import { BarcodeScanButton } from "@/components/barcode-scanner";
import { brandTone } from "@/lib/brand-style";
import { addDays, calcLine, todayIST } from "@/lib/gst";
import { date as fmtDate, inr, qty as fmtQty } from "@/lib/format";
import { shareOnWhatsApp } from "../share-actions";
import { BillingDetailsDialog, RetailerSelect, missingTaxDetails, rememberRetailer } from "./retailer-select";
import { loadBillingCatalogue, retailerUsuals, saveOrder, type PickerProduct, type PickerRetailer } from "./actions";
import { tenantKey } from "@/lib/supabase/client";

export type BuilderLine = { product: PickerProduct; qty: number; discount: number; price: number | null };
type Brand = { id: string; name: string; code: string };
type Method = "cash" | "upi" | "bank_transfer" | "cheque";

export type BillingProps = {
  role: string;
  companyState: string;
  maxSalesmanDiscount: number;
  billingMaxDiscount: number;
  brands: Brand[];
  defaultBrandId?: string;
  presetRetailer?: PickerRetailer;
  initial?: { orderId: string; orderNo: string; retailer: PickerRetailer; creditDays: number; notes: string; lines: BuilderLine[] };
  initialCatalogue?: { brandId: string; products: PickerProduct[]; categories: { id: string; name: string }[] };
};

const TERMS: { days: number; label: string }[] = [
  { days: 0, label: "Immediate / Cash" }, { days: 10, label: "10 days" }, { days: 15, label: "15 days" }, { days: 21, label: "21 days" }, { days: 30, label: "30 days" },
];
const METHODS: { k: Method; label: string }[] = [{ k: "cash", label: "Cash" }, { k: "upi", label: "UPI" }, { k: "bank_transfer", label: "Bank" }, { k: "cheque", label: "Cheque" }];
const r2 = (n: number) => Math.round(n * 100) / 100;
const norm = (s: string) => s.toLowerCase().replace(/[-_/.,()]+/g, " ");
const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
// drafts kept on this device, per business (tenant)
const ls = {
  get<T>(k: string, d: T): T { try { return JSON.parse(localStorage.getItem(tenantKey(k)) ?? "") as T; } catch { return d; } },
  set(k: string, v: unknown) { try { localStorage.setItem(tenantKey(k), JSON.stringify(v)); } catch { /* private mode */ } },
};

// "type c" matches "Type-C Cable", "65w" matches every 65W product; SKU / barcode exact hits come first.
function matches(p: PickerProduct, q: string) {
  const hay = norm(`${p.name} ${p.sku} ${p.barcode ?? ""} ${p.category_name ?? ""} ${p.description ?? ""}`);
  const compact = hay.replace(/\s+/g, "");
  return norm(q).split(/\s+/).filter(Boolean).every((w) => hay.includes(w) || compact.includes(w));
}

export function BillingScreen({ role, companyState, maxSalesmanDiscount, billingMaxDiscount, brands, defaultBrandId, presetRetailer, initial, initialCatalogue }: BillingProps) {
  const router = useRouter();
  const isOffice = role === "super_admin" || role === "manager" || role === "billing";
  const isMgr = role === "super_admin" || role === "manager";
  const maxDisc = isMgr ? 100 : role === "billing" ? billingMaxDiscount : maxSalesmanDiscount;

  const [brandId, setBrandId] = useState(initial?.lines[0]?.product.brand_id ?? defaultBrandId ?? brands[0]?.id ?? "");
  const brand = brands.find((b) => b.id === brandId);
  const [catalogue, setCatalogue] = useState<{ products: PickerProduct[]; categories: { id: string; name: string }[] } | null>(
    initialCatalogue && initialCatalogue.brandId === brandId ? initialCatalogue : null);
  const preloaded = useRef(!!initialCatalogue && initialCatalogue.brandId === brandId);
  const [retailer, setRetailer] = useState<PickerRetailer | null>(initial?.retailer ?? presetRetailer ?? null);
  const startDays = initial?.creditDays ?? presetRetailer?.credit_days ?? 15;
  const [days, setDays] = useState(startDays);
  const [custom, setCustom] = useState(!TERMS.some((t) => t.days === startDays));
  const [lines, setLines] = useState<BuilderLine[]>(initial?.lines ?? []);
  const [overall, setOverall] = useState("");
  const [paid, setPaid] = useState("");
  const [method, setMethod] = useState<Method>("cash");
  const [payRef, setPayRef] = useState("");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [showNotes, setShowNotes] = useState(!!initial?.notes);
  const [q, setQ] = useState("");
  const [browse, setBrowse] = useState(false);
  const [cat, setCat] = useState<string>("all");
  const [toast, setToast] = useState<{ text: string; warn?: boolean } | null>(null);
  const [usuals, setUsuals] = useState<Awaited<ReturnType<typeof retailerUsuals>> | null>(null);
  const [favs, setFavs] = useState<string[]>([]);
  const [recentProducts, setRecentProducts] = useState<string[]>([]);
  const [reviewing, setReviewing] = useState(false);
  const [editingDetails, setEditingDetails] = useState(false);
  const [overrideStock, setOverrideStock] = useState(false);
  const [overrideCredit, setOverrideCredit] = useState(false);
  const [error, setError] = useState<{ message: string; hint?: string } | null>(null);
  const [done, setDone] = useState<{ invoiceId: string; invoiceNo: string; total: number; paid: number; due: string; shop: string } | null>(null);
  const [savedOrderId, setSavedOrderId] = useState<string | null>(initial?.orderId ?? null);
  const [clientKey, setClientKey] = useState(newKey);
  const [pending, start] = useTransition();
  const searchRef = useRef<HTMLInputElement>(null);
  const retailerRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // ---- brand catalogue (photos, stock, categories) ---------------------------
  const reloadCatalogue = useCallback(async (id: string) => {
    setCatalogue(null);
    setCatalogue(await loadBillingCatalogue(id));
  }, []);
  useEffect(() => {
    if (!brandId) return;
    if (preloaded.current) preloaded.current = false;   // already loaded on the server
    else reloadCatalogue(brandId);
    setFavs(ls.get(`apex.fav.${brandId}`, []));
    setRecentProducts(ls.get(`apex.recentProducts.${brandId}`, []));
    setCat("all");
  }, [brandId, reloadCatalogue]);
  useEffect(() => {
    setUsuals(null);
    if (retailer && brandId) retailerUsuals(retailer.id, brandId).then(setUsuals);
  }, [retailer, brandId]);
  const byId = useMemo(() => new Map((catalogue?.products ?? []).map((p) => [p.id, p])), [catalogue]);

  // ---- cart maths ---------------------------------------------------------------
  const overallPct = Math.min(100, Math.max(0, Number(overall) || 0));
  const effDisc = (l: BuilderLine) => r2(100 * (1 - (1 - (l.discount || 0) / 100) * (1 - overallPct / 100)));
  const igst = !!retailer && retailer.billing_state_code !== companyState;
  const calc = lines.map((l) => calcLine(l.qty || 0, l.price ?? l.product.retailer_price, l.product.retailer_price_mode, effDisc(l), l.product.gst_rate));
  const subtotal = r2(calc.reduce((t, c) => t + c.gross, 0));
  const discount = r2(calc.reduce((t, c) => t + c.discount, 0));
  const taxable = r2(calc.reduce((t, c) => t + c.taxable, 0));
  const tax = r2(calc.reduce((t, c) => t + c.tax, 0));
  const grand = Math.round(taxable + tax);
  const roundOff = r2(grand - (taxable + tax));
  const byRate = [...lines.reduce((m, l, i) => {
    const g = m.get(l.product.gst_rate) ?? { taxable: 0, tax: 0 };
    g.taxable += calc[i].taxable; g.tax += calc[i].tax;
    return m.set(l.product.gst_rate, g);
  }, new Map<number, { taxable: number; tax: number }>()).entries()].sort(([a], [b]) => a - b);
  const totalQty = lines.reduce((t, l) => t + (l.qty || 0), 0);
  const paidNum = Math.min(Math.max(0, Number(paid) || 0), grand);
  const today = todayIST();
  const due = addDays(today, days || 0);
  const shortLines = lines.filter((l) => l.qty > (byId.get(l.product.id)?.available ?? l.product.available));
  const discTooHigh = lines.some((l) => effDisc(l) > maxDisc + 0.001);
  const overLimit = !!retailer && retailer.credit_limit > 0 && retailer.outstanding + grand - paidNum > retailer.credit_limit;
  const missing = retailer ? missingTaxDetails(retailer, grand) : [];
  const inCart = useMemo(() => new Map(lines.map((l) => [l.product.id, l.qty])), [lines]);

  // ---- actions ------------------------------------------------------------------
  const flash = (text: string, warn = false) => {
    clearTimeout(toastTimer.current);
    setToast({ text, warn });
    toastTimer.current = setTimeout(() => setToast(null), 1400);
  };
  const add = (p: PickerProduct, n = 1) => {
    const now = (inCart.get(p.id) ?? 0) + n;
    setLines((prev) => {
      const i = prev.findIndex((l) => l.product.id === p.id);
      if (i >= 0) return prev.map((l, j) => (j === i ? { ...l, qty: l.qty + n, product: p } : l));
      return [...prev, { product: p, qty: n, discount: 0, price: null }];
    });
    flash(now > p.available ? `${p.name} × ${fmtQty(now)} — only ${fmtQty(p.available)} in stock` : `Added ${p.name} · × ${fmtQty(now)}`, now > p.available);
  };
  const setLine = (id: string, patch: Partial<BuilderLine>) => setLines((p) => p.map((l) => (l.product.id === id ? { ...l, ...patch } : l)));
  const removeLine = (id: string) => setLines((p) => p.filter((l) => l.product.id !== id));
  const toggleFav = (id: string) => setFavs((f) => { const n = f.includes(id) ? f.filter((x) => x !== id) : [id, ...f].slice(0, 24); ls.set(`apex.fav.${brandId}`, n); return n; });

  function switchBrand(id: string) {
    if (id === brandId) return;
    if (lines.length && !confirm(`The cart has ${brand?.name} products. One invoice is for one brand — clear the cart and switch to ${brands.find((b) => b.id === id)?.name}?`)) return;
    setLines([]); setBrandId(id); setSavedOrderId(null); setClientKey(newKey());
  }
  function chooseRetailer(r: PickerRetailer | null) {
    setRetailer(r);
    if (r && !initial) { setDays(r.credit_days); setCustom(!TERMS.some((t) => t.days === r.credit_days)); }
  }
  function clearCart() {
    if (lines.length && !confirm("Remove all products from the cart?")) return;
    setLines([]); setOverall(""); setPaid("");
  }
  function repeatLast() {
    if (!usuals?.last) return;
    let missingCount = 0;
    for (const l of usuals.last.lines) { const p = byId.get(l.product_id); if (p) add(p, l.qty); else missingCount++; }
    flash(`Repeated ${usuals.last.invoice_no}${missingCount ? ` (${missingCount} product(s) no longer sold)` : ""}`);
  }

  function validate(): string | null {
    if (!retailer) return "Choose the retailer first.";
    if (!lines.length) return "Add at least one product.";
    if (lines.some((l) => !(l.qty > 0))) return "Every product needs a quantity above zero.";
    if (discTooHigh) return `Discount can be at most ${maxDisc}% for your role.`;
    if (days < 0 || days > 365) return "Credit period must be 0–365 days.";
    return null;
  }
  function submit(confirmInvoice: boolean) {
    const v = validate();
    if (v) return setError({ message: v });
    setError(null);
    start(async () => {
      const res = await saveOrder({
        orderId: savedOrderId, retailerId: retailer!.id, creditDays: days, notes,
        lines: lines.map((l) => ({ product_id: l.product.id, qty: l.qty, discount_pct: effDisc(l), unit_price: isMgr && l.price !== null ? l.price : null })),
        clientUuid: clientKey, confirm: confirmInvoice, overrideCredit, overrideStock,
        payment: confirmInvoice && paidNum > 0 ? { amount: paidNum, method, reference: payRef } : null,
      });
      if (res.orderId) setSavedOrderId(res.orderId);
      if (res.invoiceId) {
        ls.set(`apex.recentProducts.${brandId}`, [...new Set([...lines.map((l) => l.product.id), ...recentProducts])].slice(0, 16));
        rememberRetailer(retailer!);
        setReviewing(false);
        setDone({ invoiceId: res.invoiceId, invoiceNo: res.invoiceNo ?? "", total: grand, paid: res.paid ?? 0, due, shop: retailer!.shop_name });
        if (res.error) setError({ message: res.error });
        return;
      }
      if (res.error) {
        setError({ message: res.orderId && confirmInvoice ? `Saved as draft, but not invoiced: ${res.error}` : res.error, hint: res.hint });
        if (res.hint === "RETAILER_DETAILS") setEditingDetails(true);
        return;
      }
      if (!confirmInvoice && res.orderId) router.push(`/sales/orders/${res.orderId}?saved=1`);
    });
  }
  function newInvoice() {
    setDone(null); setRetailer(null); setLines([]); setOverall(""); setPaid(""); setPayRef(""); setNotes(""); setShowNotes(false);
    setSavedOrderId(null); setClientKey(newKey()); setOverrideStock(false); setOverrideCredit(false); setError(null); setQ("");
    reloadCatalogue(brandId);
    setTimeout(() => retailerRef.current?.focus(), 50);
  }

  // ---- keyboard shortcuts -----------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement).tagName);
      if (e.key === "/" && !typing) { e.preventDefault(); searchRef.current?.focus(); }
      else if (e.key === "F2") { e.preventDefault(); setBrowse((b) => !b); }
      else if (e.key === "F4") { e.preventDefault(); retailerRef.current?.focus(); }
      else if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && isOffice && !done) { e.preventDefault(); const v = validate(); if (v) setError({ message: v }); else setReviewing(true); }
      else if (e.key === "Escape" && !typing) { setQ(""); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ---- product lists ----------------------------------------------------------
  const products = catalogue?.products ?? [];
  const term = q.trim();
  const results = term
    ? products.filter((p) => matches(p, term)).sort((a, b) => Number(b.sku.toLowerCase() === term.toLowerCase() || b.barcode === term) - Number(a.sku.toLowerCase() === term.toLowerCase() || a.barcode === term)).slice(0, 48)
    : [];
  const shown = browse ? products.filter((p) => cat === "all" || p.category_id === cat) : [];
  const pick = (ids: string[]) => ids.map((id) => byId.get(id)).filter(Boolean) as PickerProduct[];
  const usualProducts = pick(usuals?.usual.map((u) => u.product_id) ?? []);
  const favProducts = pick(favs);
  const recentProds = pick(recentProducts).filter((p) => !usualProducts.some((u) => u.id === p.id)).slice(0, 8);
  const tone = brandTone(brand?.code);

  function onSearchKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      const exact = products.find((p) => p.sku.toLowerCase() === term.toLowerCase() || p.barcode === term);
      const hit = exact ?? (results.length === 1 ? results[0] : null);
      if (hit) { add(hit); setQ(""); }
    }
  }

  // ---- done screen --------------------------------------------------------------
  if (done) return <DonePanel done={done} onNew={newInvoice} error={error?.message} />;

  return (
    <div className="pb-24 xl:pb-0">
      {/* Step 1: brand */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="text-sm font-semibold text-slate-500">Billing for</span>
        <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
          {brands.map((b) => {
            const t = brandTone(b.code), on = b.id === brandId;
            return (
              <button key={b.id} type="button" onClick={() => switchBrand(b.id)}
                className={cn("flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition", on ? `${t.solid} shadow` : "text-slate-600 hover:bg-white")}>
                <span className={cn("size-2 rounded-full", on ? "bg-white" : t.dot)} /> {b.name}
              </button>
            );
          })}
        </div>
        {initial && <span className="text-sm text-slate-500">Editing draft <b className="font-mono">{initial.orderNo}</b></span>}
        <span className="ml-auto hidden items-center gap-1.5 text-xs text-slate-400 lg:flex"><Keyboard className="size-3.5" /> F4 retailer · / search · F2 catalogue · Ctrl+Enter invoice</span>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_400px]">
        <div className="min-w-0 space-y-4">
          {/* Step 2: retailer + Step 3: terms */}
          <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <RetailerSelect ref={retailerRef} value={retailer} onChange={chooseRetailer} canEditDetails={isOffice} companyState={companyState} />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="mr-1 text-sm font-semibold text-slate-600">Payment terms</span>
              {TERMS.map((t) => (
                <button key={t.days} type="button" onClick={() => { setDays(t.days); setCustom(false); }}
                  className={cn("rounded-lg border px-3 py-1.5 text-sm font-semibold", !custom && days === t.days ? "border-ink-900 bg-ink-900 text-white" : "border-slate-300 bg-white hover:border-slate-400")}>
                  {t.label}
                </button>
              ))}
              <button type="button" onClick={() => setCustom(true)} className={cn("rounded-lg border px-3 py-1.5 text-sm font-semibold", custom ? "border-ink-900 bg-ink-900 text-white" : "border-slate-300 bg-white hover:border-slate-400")}>Custom</button>
              {custom && (
                <span className="flex items-center gap-1.5 text-sm">
                  <Input type="number" min={0} max={365} value={days} onChange={(e) => setDays(Math.max(0, Math.min(365, Number(e.target.value) || 0)))} className="h-9 w-20" aria-label="Credit days" />
                  days or due
                  <Input type="date" min={today} value={due} onChange={(e) => e.target.value && setDays(Math.round((Date.parse(e.target.value) - Date.parse(today)) / 864e5))} className="h-9 w-40" aria-label="Due date" />
                </span>
              )}
              <span className="ml-auto rounded-lg bg-amber-50 px-3 py-1.5 text-sm text-amber-900 ring-1 ring-amber-200">
                Due <b>{fmtDate(due)}</b>{days === 0 ? " · pay now" : ` · ${days} days`}
                {retailer && retailer.credit_days !== days && <span className="text-amber-700"> (shop default {retailer.credit_days})</span>}
              </span>
            </div>
          </section>

          {/* Step 4: products */}
          <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-slate-400" />
                <Input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onSearchKey}
                  placeholder={`Search ${brand?.name ?? ""} products: name, SKU, 65W, Type C, category…`} className="h-12 pl-10 text-base" autoComplete="off" />
                {q && <button onClick={() => setQ("")} className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700" aria-label="Clear search"><X className="size-4" /></button>}
              </div>
              <BarcodeScanButton label="Scan" onDetected={(code) => { const p = products.find((x) => x.barcode === code || x.sku.toLowerCase() === code.toLowerCase()); if (p) add(p); else setQ(code); }} />
              <button type="button" onClick={() => setBrowse((b) => !b)}
                className={cn("flex h-12 items-center justify-center gap-2 rounded-lg px-4 text-sm font-bold tracking-wide transition", browse ? "bg-ink-900 text-white" : `${tone.solid} hover:opacity-90`)}>
                <LayoutGrid className="size-4" /> {browse ? "CLOSE CATALOGUE" : "BROWSE PRODUCT CATALOGUE"}
              </button>
            </div>

            {!catalogue ? (
              <p className="py-10 text-center text-sm text-slate-500">Loading {brand?.name} catalogue…</p>
            ) : term ? (
              <ProductArea title={`${results.length} match${results.length === 1 ? "" : "es"} for “${term}”`} products={results} inCart={inCart} favs={favs} onAdd={add} onFav={toggleFav} empty="Nothing matches. Try fewer letters, the SKU, or a category name." />
            ) : browse ? (
              <>
                <div className="no-scrollbar -mx-1 mt-4 flex gap-1.5 overflow-x-auto px-1 pb-1">
                  {[{ id: "all", name: "All" }, ...catalogue.categories].map((c) => {
                    const n = c.id === "all" ? products.length : products.filter((p) => p.category_id === c.id).length;
                    return (
                      <button key={c.id} type="button" onClick={() => setCat(c.id)}
                        className={cn("shrink-0 rounded-full px-4 py-1.5 text-sm font-bold tracking-wide uppercase", cat === c.id ? "bg-ink-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200")}>
                        {c.name} <span className="font-normal opacity-60">{n}</span>
                      </button>
                    );
                  })}
                </div>
                <ProductArea products={shown} inCart={inCart} favs={favs} onAdd={add} onFav={toggleFav} empty="No products in this category." />
              </>
            ) : (
              <div className="mt-4 space-y-4">
                {retailer && usuals && (usualProducts.length > 0 || usuals.last) && (
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-700"><Sparkles className="size-4 text-violet-500" /> {retailer.shop_name} usually buys</h3>
                      {usuals.last && (
                        <button onClick={repeatLast} className="flex items-center gap-1.5 rounded-lg bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-800 hover:bg-violet-100">
                          <Repeat className="size-3.5" /> Repeat last invoice ({usuals.last.invoice_no}, {fmtDate(usuals.last.invoice_date)})
                        </button>
                      )}
                    </div>
                    <ProductStrip products={usualProducts} inCart={inCart} onAdd={add} />
                  </div>
                )}
                {favProducts.length > 0 && (<div><h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-700"><Star className="size-4 fill-amber-400 text-amber-400" /> Favourites</h3><ProductStrip products={favProducts} inCart={inCart} onAdd={add} /></div>)}
                {recentProds.length > 0 && (<div><h3 className="mb-2 text-sm font-semibold text-slate-700">Recently billed</h3><ProductStrip products={recentProds} inCart={inCart} onAdd={add} /></div>)}
                {!usualProducts.length && !favProducts.length && !recentProds.length && (
                  <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
                    Type to search, scan a barcode, or press <b>Browse product catalogue</b> and click products to add them.
                  </p>
                )}
              </div>
            )}
          </section>
        </div>

        {/* Cart: always visible on the right on desktop */}
        <aside id="cart" className="xl:sticky xl:top-4 xl:self-start">
          <div className="flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 xl:max-h-[calc(100dvh-9rem)]">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <span className="flex items-center gap-2 font-semibold"><ShoppingCart className="size-5" /> Cart
                <span className="rounded-full bg-ink-900 px-2 py-0.5 text-xs text-white">{lines.length} items · {fmtQty(totalQty)} qty</span>
              </span>
              {lines.length > 0 && <button onClick={clearCart} className="text-xs font-medium text-slate-500 hover:text-red-600">Clear</button>}
            </div>

            <div className="min-h-24 flex-1 overflow-y-auto">
              {lines.length === 0 ? (
                <p className="p-6 text-center text-sm text-slate-400">Click a product to add it here.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {lines.map((l, i) => {
                    const avail = byId.get(l.product.id)?.available ?? l.product.available;
                    const short = l.qty > avail;
                    return (
                      <li key={l.product.id} className={cn("px-4 py-2.5", short && "bg-red-50/60")}>
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium">{l.product.name}</div>
                            <div className="text-[11px] text-slate-500">
                              <span className="font-mono">{l.product.sku}</span> ·{" "}
                              {isMgr ? (
                                <input type="number" min={0} step="0.01" value={l.price ?? l.product.retailer_price} onChange={(e) => setLine(l.product.id, { price: e.target.value === "" ? null : Number(e.target.value) })}
                                  className="tabular w-16 rounded border border-slate-200 px-1" aria-label={`Price of ${l.product.name}`} />
                              ) : inr(l.product.retailer_price)}
                              {l.product.retailer_price_mode === "inclusive" ? " incl." : " + "}{l.product.gst_rate}% GST
                            </div>
                          </div>
                          <button onClick={() => removeLine(l.product.id)} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-red-600" aria-label={`Remove ${l.product.name}`}><X className="size-4" /></button>
                        </div>
                        <div className="mt-1.5 flex items-center gap-2">
                          <div className="flex items-center rounded-lg ring-1 ring-slate-300">
                            <button onClick={() => (l.qty <= 1 ? removeLine(l.product.id) : setLine(l.product.id, { qty: l.qty - 1 }))} className="grid size-8 place-items-center text-slate-600 hover:bg-slate-100" aria-label="Less"><Minus className="size-4" /></button>
                            <input type="number" min={0} step="any" inputMode="decimal" value={l.qty || ""} onChange={(e) => setLine(l.product.id, { qty: Number(e.target.value) })}
                              className="tabular h-8 w-14 border-x border-slate-200 text-center text-sm font-semibold outline-none" aria-label={`Quantity of ${l.product.name}`} />
                            <button onClick={() => setLine(l.product.id, { qty: l.qty + 1 })} className="grid size-8 place-items-center text-slate-600 hover:bg-slate-100" aria-label="More"><Plus className="size-4" /></button>
                          </div>
                          {maxDisc > 0 && (
                            <label className="flex items-center gap-1 text-[11px] text-slate-500">
                              <input type="number" min={0} max={maxDisc} step="0.5" value={l.discount || ""} placeholder="0" onChange={(e) => setLine(l.product.id, { discount: Number(e.target.value) })}
                                className={cn("tabular h-8 w-12 rounded border border-slate-200 px-1 text-center text-xs", effDisc(l) > maxDisc && "border-red-400 bg-red-50")} aria-label={`Discount on ${l.product.name}`} />%
                            </label>
                          )}
                          <span className="tabular ml-auto text-sm font-semibold">{inr(calc[i].total)}</span>
                        </div>
                        {short && <div className="mt-1 flex items-center gap-1 text-[11px] font-medium text-red-700"><AlertTriangle className="size-3" /> Only {fmtQty(avail)} in stock</div>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-3 text-sm">
              <dl className="tabular space-y-1">
                <Row k="Subtotal" v={inr(subtotal)} />
                {maxDisc > 0 && (
                  <div className="flex items-center justify-between">
                    <dt className="text-slate-500">Overall discount</dt>
                    <dd className="flex items-center gap-1"><input type="number" min={0} max={maxDisc} step="0.5" value={overall} placeholder="0" onChange={(e) => setOverall(e.target.value)} className="tabular h-7 w-14 rounded border border-slate-300 bg-white px-1 text-right" aria-label="Overall discount percent" />%</dd>
                  </div>
                )}
                {discount > 0 && <Row k="Discount" v={`− ${inr(discount)}`} tone="green" />}
                <Row k="Taxable value" v={inr(taxable)} />
                {byRate.map(([rate, g]) => igst
                  ? <Row key={rate} k={`IGST ${rate}% on ${inr(g.taxable, { decimals: false })}`} v={inr(g.tax)} />
                  : <Row key={rate} k={`CGST ${rate / 2}% + SGST ${rate / 2}%`} v={inr(g.tax)} />)}
                {roundOff !== 0 && <Row k="Round off" v={roundOff < 0 ? `− ${inr(-roundOff)}` : `+ ${inr(roundOff)}`} />}
              </dl>
              <div className="mt-2 flex items-baseline justify-between border-t border-slate-200 pt-2">
                <span className="font-semibold">Grand total</span>
                <span className="tabular text-2xl font-bold">{inr(grand)}</span>
              </div>
              {isOffice && (
                <div className="mt-2 rounded-xl bg-white p-2.5 ring-1 ring-slate-200">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-600">Amount paid now</span>
                    <input type="number" min={0} step="1" value={paid} placeholder="0" onChange={(e) => setPaid(e.target.value)} className="tabular h-8 w-28 rounded border border-slate-300 px-2 text-right font-semibold" aria-label="Amount paid" />
                  </div>
                  {paidNum > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {METHODS.map((m) => <button key={m.k} type="button" onClick={() => setMethod(m.k)} className={cn("rounded-md px-2.5 py-1 text-xs font-semibold", method === m.k ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-700")}>{m.label}</button>)}
                      {method !== "cash" && <input value={payRef} onChange={(e) => setPayRef(e.target.value)} placeholder={method === "cheque" ? "Cheque no." : "UTR / ref."} className="h-7 flex-1 rounded border border-slate-300 px-2 text-xs" />}
                    </div>
                  )}
                  <div className="mt-1.5 flex items-center justify-between">
                    <span className="text-slate-600">Balance due {days ? `by ${fmtDate(due)}` : "today"}</span>
                    <span className="tabular font-bold text-red-700">{inr(grand - paidNum)}</span>
                  </div>
                  {days === 0 && paidNum === 0 && grand > 0 && <button type="button" onClick={() => setPaid(String(grand))} className="mt-1 text-xs font-semibold text-emerald-700 hover:underline">Paid in full ({inr(grand, { decimals: false })})</button>}
                </div>
              )}
              {overLimit && <p className="mt-2 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs text-red-800">Over credit limit: outstanding {inr(retailer!.outstanding, { decimals: false })} + this bill vs limit {inr(retailer!.credit_limit, { decimals: false })}.</p>}
              <button type="button" onClick={() => setShowNotes((s) => !s)} className="mt-2 flex items-center gap-1 text-xs font-medium text-slate-500"><ChevronDown className={cn("size-3.5 transition", showNotes && "rotate-180")} /> Note on invoice</button>
              {showNotes && <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1 text-sm" />}
              {error && <div className="mt-2"><Alert>{error.message}</Alert></div>}
              <div className="mt-3 grid gap-2">
                {isOffice ? (
                  <Button className="h-12 bg-emerald-600 text-base font-bold tracking-wide hover:bg-emerald-700" disabled={pending || !lines.length || !retailer}
                    onClick={() => { const v = validate(); if (v) setError({ message: v }); else { setError(null); setReviewing(true); } }}>
                    <FileText className="size-5" /> GENERATE INVOICE
                  </Button>
                ) : (
                  <Button className="h-12 text-base font-bold" disabled={pending} onClick={() => submit(false)}>{pending ? "Saving…" : "Send quotation to office"}</Button>
                )}
                {isOffice && <Button variant="secondary" disabled={pending} onClick={() => submit(false)}>{savedOrderId ? "Save draft" : "Save as draft (quotation)"}</Button>}
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* Phone: cart summary bar */}
      {lines.length > 0 && (
        <a href="#cart" className="fixed inset-x-3 bottom-3 z-30 flex items-center justify-between rounded-2xl bg-ink-900 px-4 py-3 text-white shadow-xl xl:hidden">
          <span className="flex items-center gap-2 text-sm"><ShoppingCart className="size-5" /> {lines.length} items · {fmtQty(totalQty)} qty</span>
          <span className="tabular text-lg font-bold">{inr(grand)}</span>
        </a>
      )}

      {toast && (
        <div className={cn("pointer-events-none fixed bottom-20 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white shadow-lg xl:bottom-6", toast.warn ? "bg-amber-600" : "bg-emerald-600")}>
          {toast.warn ? <AlertTriangle className="size-4" /> : <Check className="size-4" />} {toast.text}
        </div>
      )}

      {reviewing && retailer && (
        <Dialog title="Invoice summary" onClose={() => setReviewing(false)}>
          <div className="space-y-3 text-sm">
            <div className="flex items-start justify-between gap-3 rounded-xl bg-slate-50 p-3">
              <div>
                <div className="font-semibold">{retailer.shop_name}</div>
                <div className="text-xs text-slate-500">{retailer.gstin ? `GSTIN ${retailer.gstin}` : "Unregistered"} · {igst ? "IGST" : "CGST + SGST"}</div>
              </div>
              <span className={cn("rounded-md px-2 py-0.5 text-xs font-bold", tone.solid)}>{brand?.name}</span>
            </div>
            <dl className="tabular space-y-1">
              <Row k={`${lines.length} products · ${fmtQty(totalQty)} qty`} v="" />
              <Row k="Taxable value" v={inr(taxable)} />
              <Row k="GST" v={inr(tax)} />
              {discount > 0 && <Row k="Discount given" v={inr(discount)} tone="green" />}
              <div className="flex justify-between border-t border-slate-200 pt-1 text-base font-bold"><dt>Grand total</dt><dd>{inr(grand)}</dd></div>
              {paidNum > 0 && <Row k={`Paid now (${METHODS.find((m) => m.k === method)?.label})`} v={inr(paidNum)} tone="green" />}
              <Row k={`Balance due ${fmtDate(due)} (${days ? `${days} days` : "immediate"})`} v={inr(grand - paidNum)} />
            </dl>
            {missing.length > 0 && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900">
                A GST invoice to this shop needs its <b>{missing.join(" and ")}</b>.
                <Button size="sm" className="mt-2 block" onClick={() => setEditingDetails(true)}>Complete details now</Button>
              </div>
            )}
            {shortLines.length > 0 && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-800">
                Not enough stock: {shortLines.map((l) => l.product.name).join(", ")}.
                {isMgr ? (
                  <label className="mt-2 flex items-center gap-2 font-semibold"><input type="checkbox" checked={overrideStock} onChange={(e) => setOverrideStock(e.target.checked)} className="size-4" /> Invoice anyway (back-order; goods are dispatched when stock arrives)</label>
                ) : <p className="mt-1">Reduce the quantity, or save a draft and ask a manager.</p>}
              </div>
            )}
            {overLimit && isMgr && (
              <label className="flex items-center gap-2 rounded-lg bg-red-50 p-3 font-semibold text-red-800"><input type="checkbox" checked={overrideCredit} onChange={(e) => setOverrideCredit(e.target.checked)} className="size-4" /> Allow over credit limit (recorded)</label>
            )}
            {error && <Alert>{error.message}</Alert>}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" onClick={() => setReviewing(false)}>Back</Button>
              <Button className="bg-emerald-600 hover:bg-emerald-700" autoFocus
                disabled={pending || missing.length > 0 || (shortLines.length > 0 && !overrideStock) || (overLimit && !overrideCredit && isMgr)}
                onClick={() => submit(true)}>
                {pending ? "Generating…" : "Confirm & generate invoice"}
              </Button>
            </div>
            <p className="text-xs text-slate-400">The invoice number is given now. Stock leaves the warehouse when the order is dispatched.</p>
          </div>
        </Dialog>
      )}
      {editingDetails && retailer && (
        <BillingDetailsDialog retailer={retailer} onClose={() => setEditingDetails(false)} onSaved={(r) => { setRetailer(r); rememberRetailer(r); setEditingDetails(false); setError(null); }} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
function ProductArea({ title, products, inCart, favs, onAdd, onFav, empty }: { title?: string; products: PickerProduct[]; inCart: Map<string, number>; favs: string[]; onAdd: (p: PickerProduct) => void; onFav: (id: string) => void; empty: string }) {
  return (
    <div className="mt-4">
      {title && <div className="mb-2 text-xs font-medium text-slate-500">{title}</div>}
      {products.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">{empty}</p> : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
          {products.map((p) => <ProductCard key={p.id} p={p} qty={inCart.get(p.id) ?? 0} fav={favs.includes(p.id)} onAdd={onAdd} onFav={onFav} />)}
        </div>
      )}
    </div>
  );
}

// The whole card adds one unit; the star only marks a favourite.
function ProductCard({ p, qty, fav, onAdd, onFav }: { p: PickerProduct; qty: number; fav: boolean; onAdd: (p: PickerProduct) => void; onFav: (id: string) => void }) {
  const out = p.available <= 0;
  return (
    <div role="button" tabIndex={0} onClick={() => onAdd(p)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onAdd(p); } }}
      className={cn("group relative flex cursor-pointer flex-col overflow-hidden rounded-xl border bg-white text-left transition select-none hover:-translate-y-0.5 hover:shadow-md active:scale-[0.98]",
        qty > 0 ? "border-emerald-500 ring-2 ring-emerald-500/20" : "border-slate-200 hover:border-slate-300")}>
      <div className="relative aspect-square bg-slate-50">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {p.image_url ? <img src={p.image_url} alt="" className="size-full object-contain p-3" loading="lazy" draggable={false} /> : <div className="grid size-full place-items-center text-slate-300"><ImageOff className="size-8" /></div>}
        {qty > 0 && <span className="tabular absolute top-2 left-2 rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-bold text-white shadow">× {fmtQty(qty)}</span>}
        <button type="button" onClick={(e) => { e.stopPropagation(); onFav(p.id); }} aria-label={fav ? "Remove favourite" : "Mark favourite"}
          className={cn("absolute top-1.5 right-1.5 rounded-full p-1.5 transition", fav ? "text-amber-400" : "text-slate-300 opacity-0 group-hover:opacity-100 hover:text-amber-400")}>
          <Star className={cn("size-4", fav && "fill-amber-400")} />
        </button>
      </div>
      <div className="flex flex-1 flex-col p-2.5">
        <div className="line-clamp-2 min-h-[2.5rem] text-sm leading-tight font-medium">{p.name}</div>
        <div className="mt-0.5 truncate font-mono text-[11px] text-slate-500">{p.sku}</div>
        <div className="mt-auto flex items-end justify-between gap-1 pt-2">
          <div>
            <div className="tabular text-sm font-bold">{inr(p.retailer_price)}</div>
            <div className={cn("text-[11px] font-semibold", out ? "text-red-600" : p.available < 10 ? "text-amber-700" : "text-emerald-700")}>{out ? "Out of stock" : `${fmtQty(p.available)} in stock`}</div>
          </div>
          <span className="grid size-9 place-items-center rounded-full bg-ink-900 text-white shadow transition group-hover:bg-emerald-600" aria-hidden><ShoppingCart className="size-4" /></span>
        </div>
      </div>
    </div>
  );
}

function ProductStrip({ products, inCart, onAdd }: { products: PickerProduct[]; inCart: Map<string, number>; onAdd: (p: PickerProduct) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {products.map((p) => (
        <button key={p.id} type="button" onClick={() => onAdd(p)} className={cn("flex items-center gap-2 rounded-xl border bg-white py-1.5 pr-3 pl-1.5 text-left text-xs hover:border-emerald-400 hover:bg-emerald-50", inCart.get(p.id) ? "border-emerald-400" : "border-slate-200")}>
          <span className="grid size-8 place-items-center overflow-hidden rounded-lg bg-slate-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {p.image_url ? <img src={p.image_url} alt="" className="size-full object-cover" /> : <Plus className="size-4 text-slate-400" />}
          </span>
          <span className="max-w-40"><span className="line-clamp-1 font-semibold">{p.name}</span><span className="tabular text-slate-500">{inr(p.retailer_price, { decimals: false })} · {fmtQty(p.available)} left</span></span>
          {inCart.get(p.id) ? <span className="tabular rounded-full bg-emerald-600 px-1.5 text-white">× {fmtQty(inCart.get(p.id)!)}</span> : null}
        </button>
      ))}
    </div>
  );
}

function Row({ k, v, tone }: { k: string; v: string; tone?: "green" }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-slate-500">{k}</dt>
      <dd className={cn("font-medium", tone === "green" && "text-emerald-700")}>{v}</dd>
    </div>
  );
}

// After the invoice: print, download, WhatsApp, next bill.
function DonePanel({ done, onNew, error }: { done: { invoiceId: string; invoiceNo: string; total: number; paid: number; due: string; shop: string }; onNew: () => void; error?: string }) {
  const [sharing, start] = useTransition();
  const [shareError, setShareError] = useState<string | null>(null);
  const pdf = `/api/pdf/invoice/${done.invoiceId}`;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); onNew(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onNew]);
  return (
    <div className="mx-auto max-w-xl py-6 text-center">
      <CheckCircle2 className="mx-auto size-20 text-emerald-500" />
      <h1 className="mt-3 text-2xl font-bold">Invoice {done.invoiceNo} created</h1>
      <p className="mt-1 text-slate-600">{done.shop} · <b className="tabular">{inr(done.total)}</b>{done.paid > 0 ? ` · paid ${inr(done.paid)}` : ""} · {done.total - done.paid > 0 ? `balance due ${fmtDate(done.due)}` : "fully paid"}</p>
      {error && <div className="mt-3 text-left"><Alert>{error}</Alert></div>}
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <a href={pdf} target="_blank" rel="noopener" className="flex h-14 items-center justify-center gap-2 rounded-xl bg-ink-900 font-semibold text-white hover:bg-ink-800"><Printer className="size-5" /> Print</a>
        <a href={`${pdf}?download=1`} className="flex h-14 items-center justify-center gap-2 rounded-xl bg-white font-semibold ring-1 ring-slate-300 hover:bg-slate-50"><Download className="size-5" /> PDF</a>
        <button type="button" disabled={sharing} onClick={() => start(async () => { setShareError(null); const r = await shareOnWhatsApp("invoice", done.invoiceId, ""); if (r.url) window.open(r.url, "_blank", "noopener"); else setShareError(r.error ?? "Could not share"); })}
          className="flex h-14 items-center justify-center gap-2 rounded-xl bg-[#25D366] font-semibold text-white hover:bg-[#1ebe5b] disabled:opacity-60"><MessageCircle className="size-5" /> {sharing ? "Preparing…" : "WhatsApp"}</button>
      </div>
      {shareError && <p className="mt-2 text-sm text-red-700">{shareError}</p>}
      <div className="mt-4 flex flex-col justify-center gap-2 sm:flex-row">
        <Button className="h-12 bg-emerald-600 px-6 text-base font-bold hover:bg-emerald-700" onClick={onNew}><Plus className="size-5" /> New invoice</Button>
        <Link href={`/sales/invoices/${done.invoiceId}`} className="flex h-12 items-center justify-center rounded-lg px-4 text-sm font-medium text-slate-600 hover:bg-slate-100">Open invoice</Link>
      </div>
      <p className="mt-3 text-xs text-slate-400">Ctrl+Enter starts the next invoice.</p>
    </div>
  );
}
