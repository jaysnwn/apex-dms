"use client";

import { toast as notify } from "sonner";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, Check, CheckCircle2, Download, FileText, Keyboard, LayoutGrid, MessageCircle, Plus, Printer } from "lucide-react";
import * as m from "motion/react-m";
import { AnimatePresence } from "motion/react";
import { Alert, Badge, Button, Input, Kbd, Select, Textarea, cn } from "@/components/ui";
import { duration, ease, spring } from "@/lib/motion";
import { AddProductRow, LinesTable, QuickAdd } from "./bill-lines";
import { CatalogView } from "./catalog-view";
import { ShortStockBanner } from "./short-stock-banner";
import { Dialog } from "@/components/dialog";
import { brandTone } from "@/lib/brand-style";
import { addDays, calcLine, todayIST } from "@/lib/gst";
import { date as fmtDate, inr, qty as fmtQty } from "@/lib/format";
import { shareOnWhatsApp } from "@/lib/share-actions";
import { BillingDetailsDialog, RetailerSelect, missingTaxDetails, rememberRetailer } from "./retailer-select";
import { loadBillingCatalogue, retailerUsuals, saveOrder, type PickerProduct, type PickerRetailer, type SavedDoc } from "./actions";
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

  // Catalogue filter only ("" = all brands). The cart takes products of every
  // brand; saving splits it into one quotation / invoice per brand.
  const [brandId, setBrandId] = useState(brands.length === 1 ? brands[0].id : (defaultBrandId ?? ""));
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
  const [q, setQ] = useState("");
  const [browse, setBrowse] = useState(false);
  const [tab, setTab] = useState<"lines" | "payment">("lines");
  const [flashId, setFlashId] = useState<{ id: string; n: number } | null>(null);
  const [toast, setToast] = useState<{ text: string; warn?: boolean } | null>(null);
  const [usuals, setUsuals] = useState<Awaited<ReturnType<typeof retailerUsuals>> | null>(null);
  const [favs, setFavs] = useState<string[]>([]);
  const [recentProducts, setRecentProducts] = useState<string[]>([]);
  const [reviewing, setReviewing] = useState(false);
  const [editingDetails, setEditingDetails] = useState(false);
  const [overrideStock, setOverrideStock] = useState(false);
  const [overrideCredit, setOverrideCredit] = useState(false);
  const [error, setError] = useState<{ message: string; hint?: string } | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [savedOrderId, setSavedOrderId] = useState<string | null>(initial?.orderId ?? null);
  const [clientKey, setClientKey] = useState(newKey);
  const [pending, start] = useTransition();
  const searchRef = useRef<HTMLInputElement>(null);
  const retailerRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // ---- brand catalogue (photos, stock, categories) ---------------------------
  const reloadCatalogue = useCallback(async (id: string) => {
    setCatalogue(null);
    setCatalogue(await loadBillingCatalogue(id || null));
  }, []);
  useEffect(() => {
    if (preloaded.current) preloaded.current = false;   // already loaded on the server
    else reloadCatalogue(brandId);
    setFavs(ls.get(`apex.fav.${brandId || "all"}`, []));
    setRecentProducts(ls.get(`apex.recentProducts.${brandId || "all"}`, []));
  }, [brandId, reloadCatalogue]);
  useEffect(() => {
    setUsuals(null);
    if (retailer) retailerUsuals(retailer.id, brandId || null).then(setUsuals);
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
  // One invoice per brand, each rounded on its own.
  const split = [...lines.reduce((m, l, i) => {
    const k = l.product.brand_id;
    const g = m.get(k) ?? { id: k, name: l.product.brand_name, code: brands.find((b) => b.id === k)?.code ?? null, items: 0, exact: 0 };
    g.items += 1; g.exact += calc[i].taxable + calc[i].tax;
    return m.set(k, g);
  }, new Map<string, { id: string; name: string; code: string | null; items: number; exact: number }>()).values()]
    .map((g) => ({ ...g, total: Math.round(g.exact) }));
  const grand = split.length > 1 ? split.reduce((t, g) => t + g.total, 0) : Math.round(taxable + tax);
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
  const shortInfo = shortLines.map((l) => ({ id: l.product.id, name: l.product.name, need: l.qty, have: byId.get(l.product.id)?.available ?? l.product.available }));
  // Bring every short line down to what is in stock (lines with nothing in stock are removed).
  const useAvailable = () =>
    setLines((p) => p.flatMap((l) => {
      const have = byId.get(l.product.id)?.available ?? l.product.available;
      if (l.qty <= have) return [l];
      return have > 0 ? [{ ...l, qty: have }] : [];
    }));
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
    setFlashId({ id: p.id, n: Date.now() });
    flash(now > p.available ? `${p.name} × ${fmtQty(now)} — only ${fmtQty(p.available)} in stock` : `Added ${p.name} · × ${fmtQty(now)}`, now > p.available);
  };
  const setLine = (id: string, patch: Partial<BuilderLine>) => setLines((p) => p.map((l) => (l.product.id === id ? { ...l, ...patch } : l)));
  const removeLine = (id: string) => setLines((p) => p.filter((l) => l.product.id !== id));
  const toggleFav = (id: string) => setFavs((f) => { const n = f.includes(id) ? f.filter((x) => x !== id) : [id, ...f].slice(0, 24); ls.set(`apex.fav.${brandId || "all"}`, n); return n; });

  function chooseRetailer(r: PickerRetailer | null) {
    setRetailer(r);
    if (r && !initial) { setDays(r.credit_days); setCustom(!TERMS.some((t) => t.days === r.credit_days)); }
  }
  // Clearing is instant and can be undone from the toast (no "are you sure?").
  function clearCart() {
    if (!lines.length) return;
    const before = { lines, overall, paid };
    setLines([]); setOverall(""); setPaid("");
    notify("Cart cleared", { action: { label: "Undo", onClick: () => { setLines(before.lines); setOverall(before.overall); setPaid(before.paid); } } });
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
        ls.set(`apex.recentProducts.${brandId || "all"}`, [...new Set([...lines.map((l) => l.product.id), ...recentProducts])].slice(0, 16));
        rememberRetailer(retailer!);
        setReviewing(false);
        setDone({ invoiceId: res.invoiceId, invoiceNo: res.invoiceNo ?? "", total: grand, paid: res.paid ?? 0, due, shop: retailer!.shop_name, docs: (res.docs ?? []).filter((d) => d.invoiceId) });
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
    setDone(null); setRetailer(null); setLines([]); setOverall(""); setPaid(""); setPayRef(""); setNotes(""); setTab("lines");
    setSavedOrderId(null); setClientKey(newKey()); setOverrideStock(false); setOverrideCredit(false); setError(null); setQ("");
    reloadCatalogue(brandId);
    setTimeout(() => retailerRef.current?.focus(), 50);
  }

  // ---- keyboard shortcuts -----------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement).tagName);
      if (e.key === "/" && !typing) { e.preventDefault(); setTab("lines"); setTimeout(() => searchRef.current?.focus(), 0); }
      else if (e.key === "F2" && !browse) { e.preventDefault(); setBrowse(true); }   // the catalogue closes itself
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
  const pick = (ids: string[]) => ids.map((id) => byId.get(id)).filter(Boolean) as PickerProduct[];
  const usualProducts = pick(usuals?.usual.map((u) => u.product_id) ?? []);
  const favProducts = pick(favs);
  const recentProds = pick(recentProducts).filter((p) => !usualProducts.some((u) => u.id === p.id)).slice(0, 8);



  // ---- done screen --------------------------------------------------------------
  if (done) return <DonePanel done={done} onNew={newInvoice} error={error?.message} />;

  const termValue = custom ? "custom" : String(days);
  const steps = ["Draft", "Invoice", "Dispatched", "Delivered"];
  const canInvoice = isOffice;
  const openReview = () => { const v = validate(); if (v) setError({ message: v }); else { setError(null); setReviewing(true); } };

  return (
    <div className="pb-28 xl:pb-6">
      {/* Action bar: primary actions on the left, where the document stands on the right */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {canInvoice ? (
          <Button className="h-10" disabled={pending || !lines.length || !retailer} onClick={openReview}>
            <FileText className="size-4" /> Generate invoice <Kbd className="hidden border-on-fill/30 bg-on-fill/15 text-on-fill sm:inline-flex">Ctrl ↵</Kbd>
          </Button>
        ) : (
          <Button className="h-10" disabled={pending || !lines.length || !retailer} onClick={() => submit(false)}>{pending ? "Saving…" : "Send quotation to office"}</Button>
        )}
        {canInvoice && <Button variant="secondary" className="h-10" disabled={pending || !lines.length || !retailer} onClick={() => submit(false)}>{savedOrderId ? "Save draft" : "Save as draft"}</Button>}
        <Button variant="secondary" className="h-10" onClick={() => setBrowse(true)}><LayoutGrid className="size-4" /> Catalogue</Button>
        {lines.length > 0 && <Button variant="ghost" className="h-10" onClick={clearCart}>Clear</Button>}
        <ol aria-label="Status" className="ml-auto hidden items-center rounded-full border border-line bg-surface p-1 md:flex">
          {steps.map((s, i) => (
            <li key={s} aria-current={i === 0 ? "step" : undefined} className={cn("rounded-full px-3.5 py-1.5 text-[13px]", i === 0 ? "bg-primary-soft font-semibold text-primary-text" : "text-text-3")}>{s}</li>
          ))}
        </ol>
      </div>

      <div className="rounded-[var(--radius-sheet)] border border-line bg-surface shadow-[var(--shadow-card)]">
        {/* Document head */}
        <div className="px-4 pt-5 pb-4 sm:px-6 sm:pt-6">
          <div className="mb-5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="text-[26px] font-semibold tracking-[-0.02em] text-text">{initial ? <span className="font-mono text-[22px]">{initial.orderNo}</span> : "New invoice"}</h2>
            {initial && <Badge tone="violet">Draft</Badge>}
            {split.length > 1 && <span className="text-[13px] text-text-2">Becomes {split.length} invoices, one per brand</span>}
          </div>

          <div className="grid gap-x-10 gap-y-4 lg:grid-cols-[1.25fr_1fr]">
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[13px] font-medium text-text">Retailer</span>
                <Kbd>F4</Kbd>
              </div>
              <RetailerSelect ref={retailerRef} value={retailer} onChange={chooseRetailer} canEditDetails={isOffice} companyState={companyState} />
              {missing.length > 0 && (
                <div className="mt-2"><Alert tone="amber">A GST invoice to this shop needs its <b>{missing.join(" and ")}</b>. <button type="button" onClick={() => setEditingDetails(true)} className="font-semibold underline underline-offset-2">Add now</button></Alert></div>
              )}
              {overLimit && (
                <div className="mt-2"><Alert>Over credit limit: outstanding {inr(retailer!.outstanding, { decimals: false })} + this bill is above the limit of {inr(retailer!.credit_limit, { decimals: false })}.</Alert></div>
              )}
            </div>

            <dl className="grid grid-cols-[auto_1fr] items-center gap-x-6 gap-y-3 text-sm">
              <dt className="text-[13px] font-medium text-text">Invoice date</dt>
              <dd className="tabular text-text">{fmtDate(today)} <span className="text-text-3">· today</span></dd>

              <dt className="text-[13px] font-medium text-text"><label htmlFor="terms">Payment terms</label></dt>
              <dd className="flex flex-wrap items-center gap-2">
                <Select id="terms" value={termValue} className="h-9 w-auto min-w-40"
                  onChange={(e) => { if (e.target.value === "custom") setCustom(true); else { setCustom(false); setDays(Number(e.target.value)); } }}>
                  {TERMS.map((t) => <option key={t.days} value={String(t.days)}>{t.label}</option>)}
                  <option value="custom">Custom…</option>
                </Select>
                {custom && (
                  <span className="flex items-center gap-1.5 text-text-2">
                    <Input type="number" min={0} max={365} value={days} onChange={(e) => setDays(Math.max(0, Math.min(365, Number(e.target.value) || 0)))} className="h-9 w-20" aria-label="Credit days" /> days
                  </span>
                )}
              </dd>

              <dt className="text-[13px] font-medium text-text"><label htmlFor="due">Due date</label></dt>
              <dd className="flex flex-wrap items-center gap-2">
                <Input id="due" type="date" min={today} value={due} className="h-9 w-44"
                  onChange={(e) => { if (!e.target.value) return; setCustom(true); setDays(Math.max(0, Math.round((Date.parse(e.target.value) - Date.parse(today)) / 864e5))); }} />
                <span className="text-xs text-text-2"><b className="tabular font-medium text-text">{fmtDate(due)}</b> · {days === 0 ? "pay now" : `${days} days`}{retailer && retailer.credit_days !== days ? ` · shop default ${retailer.credit_days}` : ""}</span>
              </dd>
            </dl>
          </div>
        </div>

        {/* Tabs: products / payment & note */}
        <div role="tablist" aria-label="Invoice sections" className="flex gap-1 border-b border-line px-3 sm:px-5">
          {(["lines", "payment"] as const).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
              className={cn("relative flex h-11 items-center gap-2 px-3 text-sm font-medium transition-colors", tab === t ? "text-text" : "text-text-2 hover:text-text")}>
              {t === "lines" ? "Products" : isOffice ? "Payment & note" : "Note"}
              {t === "lines" && lines.length > 0 && <span className="tabular min-w-5 rounded-full bg-primary-soft px-1.5 text-center text-xs leading-5 text-primary-text">{lines.length}</span>}
              {tab === t && <m.span layoutId="bill-tab" className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" transition={spring.snappy} />}
            </button>
          ))}
        </div>

        {tab === "lines" ? (
          <div>
            {shortInfo.length > 0 && (
              <div className="px-3 pt-4 sm:px-5">
                <ShortStockBanner lines={shortInfo} isManager={isMgr} override={overrideStock} onOverride={setOverrideStock} onUseAvailable={useAvailable} onSaveDraft={isOffice ? () => submit(false) : undefined} />
              </div>
            )}
            {lines.length > 0 ? (
              <LinesTable
                lines={lines} calc={calc} available={(id, fb) => byId.get(id)?.available ?? fb} isManager={isMgr} maxDisc={maxDisc}
                effDisc={effDisc} flashId={flashId} onLine={setLine} onRemove={removeLine}
              />
            ) : (
              <div className="px-6 pt-8 pb-4 text-center">
                <p className="text-[15px] font-medium text-text">No products yet</p>
                <p className="mt-1 text-sm text-text-2">Type below to add a product, or open the catalogue to pick from photos.</p>
              </div>
            )}
            <AddProductRow
              ref={searchRef} q={q} setQ={setQ} results={results} loading={!catalogue} inCart={inCart} brandName={brand?.name}
              onAdd={(p) => add(p)} onEnterExact={() => { const t = term.toLowerCase(); const hit = products.find((p) => p.sku.toLowerCase() === t || p.barcode === term); if (hit) { add(hit); setQ(""); return true; } return false; }}
              onCatalog={() => setBrowse(true)}
              onScan={(code) => { const p = products.find((x) => x.barcode === code || x.sku.toLowerCase() === code.toLowerCase()); if (p) add(p); else setQ(code); }}
              onRepeat={usuals?.last ? repeatLast : undefined}
              repeatLabel={usuals?.last ? `Repeat ${usuals.last.invoice_no} (${fmtDate(usuals.last.invoice_date)})` : undefined}
            />
            {(usualProducts.length > 0 || favProducts.length > 0) && (
              <div className="grid gap-4 border-t border-line px-4 py-4 sm:px-5 lg:grid-cols-2">
                <QuickAdd title={retailer ? `${retailer.shop_name} usually buys` : "Usually bought"} products={usualProducts} inCart={inCart} onAdd={(p) => add(p)} />
                <QuickAdd title="Favourites" products={favProducts} inCart={inCart} onAdd={(p) => add(p)} />
              </div>
            )}
          </div>
        ) : (
          <div className="grid gap-6 px-4 py-5 sm:px-6 lg:grid-cols-2">
            {isOffice && (
              <section aria-labelledby="pay-h" className="space-y-3">
                <h3 id="pay-h" className="text-sm font-semibold text-text">Paid now</h3>
                <div className="flex items-center gap-2">
                  <Input type="number" min={0} step="1" value={paid} placeholder="0" onChange={(e) => setPaid(e.target.value)} className="tabular h-10 w-40 text-right font-semibold" aria-label="Amount paid now" />
                  {grand > 0 && paidNum < grand && <button type="button" onClick={() => setPaid(String(grand))} className="text-[13px] font-medium text-primary-text hover:underline">Paid in full ({inr(grand, { decimals: false })})</button>}
                </div>
                {paidNum > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <div role="radiogroup" aria-label="Payment method" className="flex rounded-full bg-sunken p-1">
                      {METHODS.map((mm) => (
                        <button key={mm.k} role="radio" aria-checked={method === mm.k} type="button" onClick={() => setMethod(mm.k)}
                          className={cn("relative h-8 rounded-full px-3 text-[13px] font-medium", method === mm.k ? "text-text" : "text-text-2")}>
                          {method === mm.k && <m.span layoutId="bill-method" className="absolute inset-0 rounded-full bg-raised shadow-[var(--shadow-card)]" transition={spring.snappy} />}
                          <span className="relative">{mm.label}</span>
                        </button>
                      ))}
                    </div>
                    {method !== "cash" && <Input value={payRef} onChange={(e) => setPayRef(e.target.value)} placeholder={method === "cheque" ? "Cheque no." : "UTR / reference"} className="h-9 w-48" />}
                  </div>
                )}
                <p className="text-sm text-text-2">Balance due {days ? `by ${fmtDate(due)}` : "today"}: <b className="tabular text-text">{inr(grand - paidNum)}</b></p>
              </section>
            )}
            <section aria-labelledby="note-h" className="space-y-2">
              <h3 id="note-h" className="text-sm font-semibold text-text">Note on invoice</h3>
              <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Printed on the invoice (optional)" />
            </section>
          </div>
        )}

        {/* Totals */}
        <div className="flex flex-col gap-4 border-t border-line px-4 py-5 sm:px-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="text-[13px] text-text-2">
            {lines.length} product{lines.length === 1 ? "" : "s"} · {fmtQty(totalQty)} qty
            {split.length > 1 && (
              <div className="mt-2 space-y-0.5">
                {split.map((g) => <div key={g.id} className="tabular flex gap-3"><span className={cn("inline-block size-2 translate-y-1.5 rounded-full", brandTone(g.code).dot)} /><span className="w-28">{g.name}</span><b className="text-text">{inr(g.total)}</b></div>)}
              </div>
            )}
          </div>
          <dl className="tabular w-full space-y-1.5 text-sm lg:w-80">
            <Row k="Subtotal" v={inr(subtotal)} />
            {maxDisc > 0 && (
              <div className="flex items-center justify-between gap-3">
                <dt className="text-text-2"><label htmlFor="overall">Discount on whole bill</label></dt>
                <dd className="flex items-center gap-1"><input id="overall" type="number" min={0} max={maxDisc} step="0.5" value={overall} placeholder="0" onChange={(e) => setOverall(e.target.value)} className="tabular h-8 w-16 rounded-[8px] border border-field/55 bg-raised px-2 text-right focus:border-primary focus:outline-none" />%</dd>
              </div>
            )}
            {discount > 0 && <Row k="Discount" v={`− ${inr(discount)}`} tone="green" />}
            <Row k="Taxable value" v={inr(taxable)} />
            {byRate.map(([rate, g]) => igst
              ? <Row key={rate} k={`IGST ${rate}%`} v={inr(g.tax)} />
              : <Row key={rate} k={`CGST ${rate / 2}% + SGST ${rate / 2}%`} v={inr(g.tax)} />)}
            {roundOff !== 0 && <Row k="Round off" v={roundOff < 0 ? `− ${inr(-roundOff)}` : `+ ${inr(roundOff)}`} />}
            <div className="flex items-baseline justify-between border-t border-line pt-2.5">
              <dt className="font-semibold text-text">Total</dt>
              <AnimatePresence mode="popLayout" initial={false}>
                <m.dd key={grand} className="text-2xl font-semibold tracking-[-0.02em] text-text" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0, transition: { duration: duration.fast, ease: ease.out } }} exit={{ opacity: 0, y: -8, transition: { duration: duration.instant } }}>
                  {inr(grand)}
                </m.dd>
              </AnimatePresence>
            </div>
          </dl>
        </div>
        {error && <div className="px-4 pb-5 sm:px-6"><div key={error.message} className="nudge"><Alert>{error.message}</Alert></div></div>}
      </div>

      <p className="mt-3 hidden items-center gap-1.5 text-xs text-text-3 lg:flex"><Keyboard className="size-3.5" /> F4 retailer · / add product · F2 catalogue · Ctrl ↵ invoice</p>

      {/* Phone: total + main action, frosted */}
      {lines.length > 0 && (
        <div className="glass fixed inset-x-0 bottom-16 z-30 flex items-center gap-3 border-t border-line/70 px-4 py-2.5 xl:hidden">
          <div className="min-w-0 flex-1">
            <div className="text-xs text-text-2">{lines.length} product{lines.length === 1 ? "" : "s"} · {fmtQty(totalQty)} qty</div>
            <div className="tabular text-lg font-semibold text-text">{inr(grand)}</div>
          </div>
          {canInvoice
            ? <Button className="h-11" disabled={pending || !retailer} onClick={openReview}>Generate invoice</Button>
            : <Button className="h-11" disabled={pending || !retailer} onClick={() => submit(false)}>Send to office</Button>}
        </div>
      )}

      <AnimatePresence>
        {toast && (
          <m.div
            key={toast.text}
            role="status"
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: spring.snappy }}
            exit={{ opacity: 0, y: 8, transition: { duration: duration.instant } }}
            className={cn("pointer-events-none fixed bottom-36 left-1/2 z-[55] flex -translate-x-1/2 items-center gap-2 rounded-full px-4 py-2 text-sm font-medium shadow-[var(--shadow-raised)] xl:bottom-8", toast.warn ? "bg-amber-600 text-on-fill" : "bg-neutral-900 text-on-fill")}
          >
            {toast.warn ? <AlertTriangle className="size-4" /> : <Check className="size-4" />} {toast.text}
          </m.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {browse && (
          <CatalogView
            onClose={() => setBrowse(false)}
            products={catalogue?.products ?? null}
            categories={catalogue?.categories ?? []}
            brands={brands} brandId={brandId} onBrand={setBrandId}
            inCart={inCart} onAdd={(p, n) => add(p, n ?? 1)} onQty={(p, n) => (n <= 0 ? removeLine(p.id) : setLine(p.id, { qty: n }))}
            favs={favs} onFav={toggleFav} usual={usualProducts} recent={recentProds}
            shop={retailer?.shop_name ?? null} lineCount={lines.length} totalQty={totalQty} total={grand} match={matches}
          />
        )}
      </AnimatePresence>
      {reviewing && retailer && (
        <Dialog title="Invoice summary" onClose={() => setReviewing(false)}>
          <div className="space-y-3 text-sm">
            <div className="flex items-start justify-between gap-3 rounded-xl bg-slate-50 p-3">
              <div>
                <div className="font-semibold">{retailer.shop_name}</div>
                <div className="text-xs text-slate-500">{retailer.gstin ? `GSTIN ${retailer.gstin}` : "Unregistered"} · {igst ? "IGST" : "CGST + SGST"}</div>
              </div>
              <span className="flex flex-wrap justify-end gap-1">{split.map((g) => <span key={g.id} className={cn("rounded-md px-2 py-0.5 text-xs font-bold", brandTone(g.code).solid)}>{g.name}</span>)}</span>
            </div>
            {split.length > 1 && (
              <div className="rounded-lg bg-sky-50 p-3 text-sky-900 ring-1 ring-sky-200">
                <div className="mb-1 font-semibold">This bill becomes {split.length} invoices — one per brand, each with its own number:</div>
                {split.map((g) => <div key={g.id} className="tabular flex justify-between"><span>{g.name} · {g.items} product{g.items === 1 ? "" : "s"}</span><b>{inr(g.total)}</b></div>)}
              </div>
            )}
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
            <ShortStockBanner lines={shortInfo} isManager={isMgr} override={overrideStock} onOverride={setOverrideStock} />
            {overLimit && isMgr && (
              <label className="flex items-center gap-2 rounded-lg bg-red-50 p-3 font-semibold text-red-800"><input type="checkbox" checked={overrideCredit} onChange={(e) => setOverrideCredit(e.target.checked)} className="size-4" /> Allow over credit limit (recorded)</label>
            )}
            {error && <Alert>{error.message}</Alert>}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" onClick={() => setReviewing(false)}>Back</Button>
              <Button className="bg-primary hover:bg-primary-hover" autoFocus
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


function Row({ k, v, tone }: { k: string; v: string; tone?: "green" }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-slate-500">{k}</dt>
      <dd className={cn("font-medium", tone === "green" && "text-emerald-700")}>{v}</dd>
    </div>
  );
}

type Done = { invoiceId: string; invoiceNo: string; total: number; paid: number; due: string; shop: string; docs: SavedDoc[] };

// After the invoice: print, download, WhatsApp, next bill.
function DonePanel({ done, onNew, error }: { done: Done; onNew: () => void; error?: string }) {
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
      <h1 className="mt-3 text-2xl font-bold">{done.docs.length > 1 ? `${done.docs.length} invoices created` : `Invoice ${done.invoiceNo} created`}</h1>
      <p className="mt-1 text-slate-600">{done.shop} · <b className="tabular">{inr(done.total)}</b>{done.paid > 0 ? ` · paid ${inr(done.paid)}` : ""} · {done.total - done.paid > 0 ? `balance due ${fmtDate(done.due)}` : "fully paid"}</p>
      {error && <div className="mt-3 text-left"><Alert>{error}</Alert></div>}
      {done.docs.length > 1 && (
        <ul className="mt-5 divide-y divide-slate-100 rounded-xl bg-surface text-left ring-1 ring-slate-200">
          {done.docs.map((d) => (
            <li key={d.invoiceId} className="flex flex-wrap items-center gap-2 p-3">
              <div className="min-w-0 flex-1"><div className="font-semibold">{d.brandName}</div><div className="font-mono text-xs text-slate-500">{d.invoiceNo}</div></div>
              <span className="tabular font-semibold">{inr(d.total)}</span>
              <a href={`/api/pdf/invoice/${d.invoiceId}`} target="_blank" rel="noopener" className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-on-fill">Print</a>
              <a href={`/api/pdf/invoice/${d.invoiceId}?download=1`} className="rounded-lg px-3 py-1.5 text-sm font-semibold ring-1 ring-slate-300">PDF</a>
              <Link href={`/sales/invoices/${d.invoiceId}`} className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100">Open</Link>
            </li>
          ))}
        </ul>
      )}
      <div className={cn("mt-6 grid gap-3 sm:grid-cols-3", done.docs.length > 1 && "hidden")}>
        <a href={pdf} target="_blank" rel="noopener" className="flex h-14 items-center justify-center gap-2 rounded-xl bg-primary font-semibold text-on-fill hover:bg-primary-hover"><Printer className="size-5" /> Print</a>
        <a href={`${pdf}?download=1`} className="flex h-14 items-center justify-center gap-2 rounded-xl bg-surface font-semibold ring-1 ring-slate-300 hover:bg-slate-50"><Download className="size-5" /> PDF</a>
        <button type="button" disabled={sharing} onClick={() => start(async () => { setShareError(null); const r = await shareOnWhatsApp("invoice", done.invoiceId, ""); if (r.url) window.open(r.url, "_blank", "noopener"); else setShareError(r.error ?? "Could not share"); })}
          className="flex h-14 items-center justify-center gap-2 rounded-xl bg-[#25D366] font-semibold text-on-fill hover:bg-[#1ebe5b] disabled:opacity-60"><MessageCircle className="size-5" /> {sharing ? "Preparing…" : "WhatsApp"}</button>
      </div>
      {shareError && <p className="mt-2 text-sm text-red-700">{shareError}</p>}
      <div className="mt-4 flex flex-col justify-center gap-2 sm:flex-row">
        <Button className="h-12 bg-primary px-6 text-base font-bold hover:bg-primary-hover" onClick={onNew}><Plus className="size-5" /> New invoice</Button>
        <Link href={`/sales/invoices/${done.invoiceId}`} className="flex h-12 items-center justify-center rounded-lg px-4 text-sm font-medium text-slate-600 hover:bg-slate-100">Open invoice</Link>
      </div>
      <p className="mt-3 text-xs text-slate-400">Ctrl+Enter starts the next invoice.</p>
    </div>
  );
}
