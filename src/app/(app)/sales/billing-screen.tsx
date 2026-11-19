"use client";

import { toast as notify } from "sonner";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, CloudOff, FileText, Keyboard, LayoutGrid, Loader2, XCircle } from "lucide-react";
import * as m from "motion/react-m";
import { AnimatePresence } from "motion/react";
import { Alert, Badge, Button, Input, Kbd, Select, Textarea, cn } from "@/components/ui";
import { duration, ease, spring } from "@/lib/motion";
import { AddProductRow, LinesTable, QuickAdd } from "./bill-lines";
import { CatalogView } from "./catalog-view";
import { ShortStockBanner } from "./short-stock-banner";
import { brandTone } from "@/lib/brand-style";
import { addDays, calcLine, todayIST } from "@/lib/gst";
import { date as fmtDate, inr, qty as fmtQty } from "@/lib/format";
import { BillingDetailsDialog, RetailerSelect, missingTaxDetails, rememberRetailer } from "./retailer-select";
import { cancelQuotation, loadBillingCatalogue, retailerUsuals, saveOrder, type PickerProduct, type PickerRetailer, type SaveResult } from "./actions";
import { askConfirm } from "@/components/confirm";
import { DocSteps } from "./doc-steps";
import { tenantKey } from "@/lib/supabase/client";

export type BuilderLine = { product: PickerProduct; qty: number; discount: number; price: number | null };
type Brand = { id: string; name: string; code: string };

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
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [q, setQ] = useState("");
  const [browse, setBrowse] = useState(false);
  const [tab, setTab] = useState<"lines" | "note">("lines");
  const [flashId, setFlashId] = useState<{ id: string; n: number } | null>(null);
  const [toast, setToast] = useState<{ text: string; warn?: boolean } | null>(null);
  const [usuals, setUsuals] = useState<Awaited<ReturnType<typeof retailerUsuals>> | null>(null);
  const [favs, setFavs] = useState<string[]>([]);
  const [recentProducts, setRecentProducts] = useState<string[]>([]);
  const [editingDetails, setEditingDetails] = useState(false);
  const [error, setError] = useState<{ message: string; hint?: string } | null>(null);
  // Auto-save: once there is a retailer and a product, the cart is saved as a real
  // quotation (one per brand) and every change updates the same quotation(s).
  const initialBrand = initial?.lines[0]?.product.brand_id;
  const [saved, setSaved] = useState<Record<string, { orderId: string; orderNo?: string }>>(
    initial && initialBrand ? { [initialBrand]: { orderId: initial.orderId, orderNo: initial.orderNo } } : {});
  const savedRef = useRef(saved);
  savedRef.current = saved;
  const [autoState, setAutoState] = useState<{ s: "idle" | "saving" | "saved" | "error" | "waiting"; msg?: string }>({ s: initial ? "saved" : "idle" });
  const inFlight = useRef<Promise<SaveResult | null> | null>(null);
  const retries = useRef(0);
  const [clientKey] = useState(newKey);
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
  const overLimit = !!retailer && retailer.credit_limit > 0 && retailer.outstanding + grand > retailer.credit_limit;
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
    const before = { lines, overall };
    setLines([]); setOverall("");
    notify("Products cleared", { action: { label: "Undo", onClick: () => { setLines(before.lines); setOverall(before.overall); } } });
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
  // ---- saving ----------------------------------------------------------------
  const payloadLines = lines.map((l) => ({ product_id: l.product.id, qty: l.qty, discount_pct: effDisc(l), unit_price: isMgr && l.price !== null ? l.price : null }));
  const sig = retailer && lines.length ? JSON.stringify([retailer.id, days, notes, payloadLines]) : null;
  const sigRef = useRef(sig);
  sigRef.current = sig;
  // What was last saved. Opening an existing quotation counts as saved, so it isn't
  // re-saved (and re-priced) just by being opened.
  const lastSig = useRef<string | null>(initial ? sig : null);
  const ready = !!sig && validate() === null;

  // Save the cart as it is now. Quotations of brands no longer in the cart are cancelled.
  const persist = useCallback(async (): Promise<SaveResult | null> => {
    while (inFlight.current) await inFlight.current;   // one save at a time
    const mySig = sig;
    if (!mySig || !retailer) return null;
    if (sigRef.current !== mySig) return null;          // the cart changed meanwhile; the newer save handles it
    const run = (async () => {
      setAutoState({ s: "saving" });
      const map = Object.fromEntries(Object.entries(savedRef.current).map(([b, v]) => [b, v.orderId]));
      let res: SaveResult;
      try {
        res = await saveOrder({ orderIds: map, retailerId: retailer.id, creditDays: days, notes, lines: payloadLines, clientUuid: clientKey, confirm: false });
      } catch {
        // No connection: say so and try again a few times on its own.
        const n = (retries.current += 1);
        setAutoState({ s: "error", msg: n <= 3 ? "no connection, trying again…" : "no connection. It will save when you next change something." });
        if (n <= 3) setTimeout(() => { if (sigRef.current === mySig) void persistRef.current(); }, 4000 * n);
        return { error: "No connection. The quotation will be saved when the connection is back." };
      }
      retries.current = 0;
      const next = { ...savedRef.current };
      for (const d of res.docs ?? []) next[d.brandId] = { orderId: d.orderId, orderNo: d.orderNo };
      if (!res.error) {
        const inCart = new Set((res.docs ?? []).map((d) => d.brandId));
        for (const [b, v] of Object.entries(next)) {
          if (inCart.has(b)) continue;
          await cancelQuotation(v.orderId, "All its products were removed while editing");
          delete next[b];
        }
      }
      setSaved(next);
      savedRef.current = next;
      if (res.error) { setAutoState({ s: "error", msg: res.error }); return res; }
      lastSig.current = mySig;
      setAutoState({ s: "saved" });
      // The address now points at the saved quotation, so Back, Refresh and links return to it.
      const first = Object.values(next)[0];
      if (first && window.location.pathname !== `/sales/orders/${first.orderId}/edit`) {
        window.history.replaceState(window.history.state, "", `/sales/orders/${first.orderId}/edit`);
      }
      return res;
    })();
    inFlight.current = run;
    try { return await run; } finally { inFlight.current = null; }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the cart of this render; sig changes whenever it does
  }, [sig, retailer, days, notes, clientKey]);

  // Auto-save shortly after the last change.
  useEffect(() => {
    if (!sig) { setAutoState(Object.keys(savedRef.current).length ? { s: "waiting", msg: "it needs a retailer and at least one product. The last saved version is kept." } : { s: "idle" }); return; }
    if (sig === lastSig.current) return;
    if (!ready) { setAutoState({ s: "waiting", msg: validate() ?? undefined }); return; }
    const t = setTimeout(() => { void persist(); }, 900);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when the cart changes
  }, [sig, ready]);

  // Leaving with a change not yet saved: save it on the way out (in-app links), and ask
  // the browser to hold on if the tab is being closed.
  const dirty = !!sig && ready && sig !== lastSig.current;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const persistRef = useRef(persist);
  persistRef.current = persist;
  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => { if (dirtyRef.current) { void persistRef.current(); e.preventDefault(); } };
    window.addEventListener("beforeunload", onUnload);
    return () => { window.removeEventListener("beforeunload", onUnload); if (dirtyRef.current) void persistRef.current(); };
  }, []);

  // "Save quotation": save now and open it.
  function submit() {
    const v = validate();
    if (v) return setError({ message: v });
    setError(null);
    start(async () => {
      const res = sig === lastSig.current && !inFlight.current ? { docs: Object.values(savedRef.current) } : await persist();
      if (!res || "error" in res && res.error) {
        const r = res as SaveResult | null;
        setError({ message: r?.error ?? "Could not save the quotation.", hint: r?.hint });
        if (r?.hint === "RETAILER_DETAILS") setEditingDetails(true);
        return;
      }
      ls.set(`apex.recentProducts.${brandId || "all"}`, [...new Set([...lines.map((l) => l.product.id), ...recentProducts])].slice(0, 16));
      rememberRetailer(retailer!);
      const docs = Object.values(savedRef.current);
      // A cart with two brands is two quotations (one per brand).
      if (docs.length > 1) router.push(`/sales/quotations?saved=${docs.map((d) => d.orderNo).filter(Boolean).join(",")}`);
      else if (docs[0]) router.push(`/sales/orders/${docs[0].orderId}?saved=1`);
    });
  }

  async function cancelAll() {
    const docs = Object.values(savedRef.current);
    if (!docs.length) return;
    const ok = await askConfirm(`Cancel quotation ${docs.map((d) => d.orderNo).filter(Boolean).join(" and ")}? It stays in the list as cancelled.`, { confirmLabel: "Cancel quotation", danger: true });
    if (!ok) return;
    while (inFlight.current) await inFlight.current;
    for (const d of docs) await cancelQuotation(d.orderId, "Cancelled while making it");
    lastSig.current = sigRef.current;   // nothing left to save
    router.push("/sales/quotations");
  }

  // ---- keyboard shortcuts -----------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement).tagName);
      if (e.key === "/" && !typing) { e.preventDefault(); setTab("lines"); setTimeout(() => searchRef.current?.focus(), 0); }
      else if (e.key === "F2" && !browse) { e.preventDefault(); setBrowse(true); }   // the catalogue closes itself
      else if (e.key === "F4") { e.preventDefault(); retailerRef.current?.focus(); }
      else if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !pending) { e.preventDefault(); submit(); }
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



  const termValue = custom ? "custom" : String(days);
  const saveLabel = isOffice ? "Save quotation" : "Send quotation to office";

  return (
    <div className="pb-28 xl:pb-6">
      {/* Action bar: primary actions on the left, where the document stands on the right */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button className="h-10" disabled={pending || !lines.length || !retailer} onClick={submit}>
          <FileText className="size-4" /> {pending ? "Saving…" : saveLabel} <Kbd className="hidden border-on-fill/30 bg-on-fill/15 text-on-fill sm:inline-flex">Ctrl ↵</Kbd>
        </Button>
        <Button variant="secondary" className="h-10" onClick={() => setBrowse(true)}><LayoutGrid className="size-4" /> Catalogue</Button>
        {lines.length > 0 && <Button variant="ghost" className="h-10" onClick={clearCart}>Clear</Button>}
        {Object.keys(saved).length > 0 && <Button variant="ghost" className="h-10 text-text-2" onClick={cancelAll}><XCircle className="size-4" /> Cancel quotation</Button>}
        <DocSteps at={0} className="ml-auto hidden md:flex" />
      </div>
      <p className="mb-4 -mt-1 text-[13px] text-text-2">
        {isOffice
          ? "Saved automatically once it has a retailer and a product. Then open it and choose Create invoice."
          : "Saved automatically once it has a shop and a product. The office turns it into an invoice."}
      </p>

      <div className="rounded-[var(--radius-sheet)] border border-line bg-surface shadow-[var(--shadow-card)]">
        {/* Document head */}
        <div className="px-4 pt-5 pb-4 sm:px-6 sm:pt-6">
          <div className="mb-5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="text-[26px] font-semibold tracking-[-0.02em] text-text">
              {Object.keys(saved).length ? <span className="font-mono text-[22px]">{Object.values(saved).map((d) => d.orderNo).filter(Boolean).join(" + ")}</span> : "New quotation"}
            </h2>
            <Badge tone="violet">Quotation</Badge>
            <AutoSaveStatus state={autoState} />
            {split.length > 1 && <span className="text-[13px] text-text-2">{split.length} quotations, one per brand</span>}
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

            <dl className="grid content-start grid-cols-[auto_1fr] items-center gap-x-6 gap-y-3 text-sm">
              <dt className="text-[13px] font-medium text-text">Quotation date</dt>
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

              <dt className="text-[13px] font-medium text-text">Due date</dt>
              <dd className="text-xs text-text-2">
                <b className="tabular font-medium text-text">{days === 0 ? "On the invoice date" : `${days} days after the invoice date`}</b>
                {" · "}{fmtDate(due)} if invoiced today{retailer && retailer.credit_days !== days ? ` · shop default ${retailer.credit_days} days` : ""}
              </dd>
            </dl>
          </div>
        </div>

        {/* Tabs: products / payment & note */}
        <div role="tablist" aria-label="Quotation sections" className="flex gap-1 border-b border-line px-3 sm:px-5">
          {(["lines", "note"] as const).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
              className={cn("relative flex h-11 items-center gap-2 px-3 text-sm font-medium transition-colors", tab === t ? "text-text" : "text-text-2 hover:text-text")}>
              {t === "lines" ? "Products" : "Note"}
              {t === "lines" && lines.length > 0 && <span className="tabular min-w-5 rounded-full bg-primary-soft px-1.5 text-center text-xs leading-5 text-primary-text">{lines.length}</span>}
              {tab === t && <m.span layoutId="bill-tab" className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" transition={spring.snappy} />}
            </button>
          ))}
        </div>

        {tab === "lines" ? (
          <div>
            {shortInfo.length > 0 && (
              <div className="px-3 pt-4 sm:px-5">
                <ShortStockBanner stage="quote" lines={shortInfo} isManager={isMgr} onUseAvailable={useAvailable} />
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
          <div className="max-w-2xl px-4 py-5 sm:px-6">
            <section aria-labelledby="note-h" className="space-y-2">
              <h3 id="note-h" className="text-sm font-semibold text-text">Note</h3>
              <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Printed on the quotation and the invoice (optional)" />
              <p className="text-xs text-text-2">Payment received at the counter is entered on the invoice draft, when you confirm the invoice.</p>
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

      <p className="mt-3 hidden items-center gap-1.5 text-xs text-text-3 lg:flex"><Keyboard className="size-3.5" /> F4 retailer · / add product · F2 catalogue · Ctrl ↵ save quotation</p>

      {/* Phone: total + main action, frosted */}
      {lines.length > 0 && (
        <div className="glass fixed inset-x-0 bottom-16 z-30 flex items-center gap-3 border-t border-line/70 px-4 py-2.5 xl:hidden">
          <div className="min-w-0 flex-1">
            <div className="text-xs text-text-2">{lines.length} product{lines.length === 1 ? "" : "s"} · {fmtQty(totalQty)} qty</div>
            <div className="tabular text-lg font-semibold text-text">{inr(grand)}</div>
          </div>
          <Button className="h-11" disabled={pending || !retailer} onClick={submit}>{pending ? "Saving…" : isOffice ? "Save quotation" : "Send to office"}</Button>
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

// Where auto-save stands, next to the quotation's title.
function AutoSaveStatus({ state }: { state: { s: "idle" | "saving" | "saved" | "error" | "waiting"; msg?: string } }) {
  if (state.s === "idle") return null;
  const look = {
    saving: { icon: <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />, text: "Saving…", cls: "text-text-2" },
    saved: { icon: <Check className="size-3.5" aria-hidden />, text: "Saved", cls: "text-green-700" },
    error: { icon: <CloudOff className="size-3.5" aria-hidden />, text: `Not saved: ${state.msg ?? "try again"}`, cls: "text-red-700" },
    waiting: { icon: <CloudOff className="size-3.5" aria-hidden />, text: state.msg ? `Not saved yet: ${state.msg}` : "Not saved yet", cls: "text-amber-800" },
  }[state.s];
  return <span role="status" className={cn("inline-flex items-center gap-1 text-[13px] font-medium", look.cls)}>{look.icon}{look.text}</span>;
}
