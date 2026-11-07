"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle, ArrowLeft, Check, ChevronRight, CloudOff, MapPin, MessageCircle, PackageX, Plus, RefreshCw, Search, Send, ShoppingCart, Store, Trash2, X,
} from "lucide-react";
import { cn } from "@/components/ui";
import { calcLine, orderTotals } from "@/lib/gst";
import { inr } from "@/lib/format";
import type { CatalogueItem, Outlet } from "../data";
import { loadCatalogue, submitQuotation } from "../actions";
import { addToOutbox, cacheGet, cacheSet } from "../outbox";
import { Sheet, Stepper } from "../ui";

type Catalogue = { items: CatalogueItem[]; maxDiscount: number; loadedAt: string };
type Cart = Record<string, { qty: number; discount: number }>;

const CAT_KEY = "apex-m-catalogue";
const OUT_KEY = "apex-m-outlets";
const DRAFT_KEY = "apex-m-draft";
const CREDIT = [0, 7, 15, 30];

export function OrderFlow({ initialOutlets, initialCatalogue, presetRetailer }: { initialOutlets: Outlet[] | null; initialCatalogue: Catalogue | null; presetRetailer?: string }) {
  const router = useRouter();
  const [outlets, setOutlets] = useState<Outlet[]>(initialOutlets ?? []);
  const [cat, setCat] = useState<Catalogue | null>(initialCatalogue);
  const [outletId, setOutletId] = useState<string | null>(presetRetailer ?? null);
  const [cart, setCart] = useState<Cart>({});
  const [reviewing, setReviewing] = useState(false);
  const [done, setDone] = useState<{ orderNo?: string; total: number; offline: boolean; shop: string; mobile: string; lines: string[] } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const restored = useRef(false);

  // Data: server copy when online, phone cache when offline.
  useEffect(() => {
    if (initialCatalogue) cacheSet(CAT_KEY, initialCatalogue);
    else setCat(cacheGet<Catalogue>(CAT_KEY));
    if (initialOutlets) cacheSet(OUT_KEY, initialOutlets);
    else setOutlets(cacheGet<Outlet[]>(OUT_KEY) ?? []);
  }, [initialCatalogue, initialOutlets]);

  // Keep an unfinished order if the app is closed by mistake.
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const d = cacheGet<{ outletId: string; cart: Cart }>(DRAFT_KEY);
    if (d && (!presetRetailer || d.outletId === presetRetailer) && Object.keys(d.cart).length) {
      setOutletId(d.outletId);
      setCart(d.cart);
    }
  }, [presetRetailer]);
  useEffect(() => {
    if (outletId && Object.keys(cart).length) cacheSet(DRAFT_KEY, { outletId, cart });
  }, [outletId, cart]);

  const outlet = outlets.find((o) => o.id === outletId) ?? null;
  const items = useMemo(() => cat?.items ?? [], [cat]);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const cartLines = Object.entries(cart).filter(([, l]) => l.qty > 0).map(([id, l]) => ({ item: byId.get(id)!, ...l })).filter((l) => l.item);
  const calc = cartLines.map((l) => calcLine(l.qty, l.item.price, l.item.price_mode, l.discount, l.item.gst_rate));
  const totals = orderTotals(calc, false);
  const grand = Math.round(totals.taxable + totals.tax);
  const units = cartLines.reduce((t, l) => t + l.qty, 0);

  function setQty(id: string, qty: number) {
    setCart((c) => {
      const next = { ...c };
      if (qty <= 0) delete next[id];
      else next[id] = { qty, discount: c[id]?.discount ?? 0 };
      return next;
    });
  }

  async function refreshStock() {
    setRefreshing(true);
    try {
      const fresh = await loadCatalogue();
      setCat(fresh);
      cacheSet(CAT_KEY, fresh);
    } catch {
      /* offline */
    }
    setRefreshing(false);
  }

  function clearDraft() {
    setCart({});
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
  }

  if (done) return <Done result={done} onNew={() => { setDone(null); setOutletId(null); }} onHome={() => router.push("/m")} />;

  // ----------------------------- Step 1: outlet -----------------------------
  if (!outlet) {
    return <PickOutlet outlets={outlets} onPick={(id) => { setOutletId(id); if (cacheGet<{ outletId: string }>(DRAFT_KEY)?.outletId !== id) setCart({}); }} />;
  }

  // ---------------------------- Step 2: products ----------------------------
  return (
    <div className={cn(units > 0 && "pb-24")}>
      <button onClick={() => { if (!units || confirm("Change outlet? Products added so far will be cleared.")) { clearDraft(); setOutletId(null); } }}
        className="mb-3 flex w-full items-center gap-3 rounded-2xl bg-white p-3 text-left shadow-sm ring-1 ring-slate-200/70 active:bg-slate-50">
        <span className="grid size-10 place-items-center rounded-xl bg-violet-100 text-violet-700"><Store className="size-5" /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-medium text-slate-500 uppercase">Order for</span>
          <span className="block truncate font-semibold">{outlet.shop_name}</span>
          <span className="block truncate text-xs text-slate-500">{[outlet.city, outlet.overdue > 0 ? `overdue ${inr(outlet.overdue, { decimals: false })}` : null].filter(Boolean).join(" · ")}</span>
        </span>
        <span className="text-xs font-medium text-sky-700">Change</span>
      </button>
      {outlet.status === "on_hold" && (
        <p className="mb-3 flex items-start gap-2 rounded-2xl bg-amber-50 p-3 text-sm text-amber-900"><AlertTriangle className="mt-0.5 size-4 shrink-0" /> This outlet is on hold. You can send the quotation, but the office must release the account before invoicing.</p>
      )}

      {!cat ? (
        <div className="rounded-2xl bg-white p-6 text-center text-sm text-slate-500">No product list on this phone yet. Connect to the internet once to download it.</div>
      ) : (
        <Catalogue items={items} cart={cart} setQty={setQty} loadedAt={cat.loadedAt} onRefresh={refreshStock} refreshing={refreshing} />
      )}

      {/* Cart bar */}
      {units > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(76px+env(safe-area-inset-bottom))] z-30 mx-auto max-w-md px-3">
          <button onClick={() => setReviewing(true)} className="flex w-full items-center gap-3 rounded-2xl bg-ink-900 p-3 pl-4 text-white shadow-xl active:scale-[0.99]">
            <span className="relative grid size-10 place-items-center rounded-xl bg-white/10">
              <ShoppingCart className="size-5" />
              <span className="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full bg-accent-500 text-[11px] font-bold">{cartLines.length}</span>
            </span>
            <span className="flex-1 text-left">
              <span className="tabular block text-lg leading-tight font-bold">{inr(grand, { decimals: false })}</span>
              <span className="block text-xs text-slate-300">{units} unit{units === 1 ? "" : "s"} · incl. GST</span>
            </span>
            <span className="flex items-center gap-1 rounded-xl bg-accent-500 px-4 py-2.5 font-semibold">Review <ChevronRight className="size-4" /></span>
          </button>
        </div>
      )}

      {reviewing && (
        <Review
          outlet={outlet}
          lines={cartLines}
          calc={calc}
          totals={{ ...totals, grand }}
          maxDiscount={cat?.maxDiscount ?? 5}
          setQty={setQty}
          setDiscount={(id, d) => setCart((c) => ({ ...c, [id]: { ...c[id], discount: d } }))}
          onClose={() => setReviewing(false)}
          onSent={(r) => { clearDraft(); setReviewing(false); setDone(r); router.refresh(); }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
function PickOutlet({ outlets, onPick }: { outlets: Outlet[]; onPick: (id: string) => void }) {
  const [q, setQ] = useState("");
  const t = q.trim().toLowerCase();
  const match = (o: Outlet) => !t || [o.shop_name, o.owner_name, o.city, o.mobile, o.code].some((x) => x?.toLowerCase().includes(t));
  const today = outlets.filter((o) => o.onRouteToday && match(o));
  const rest = outlets.filter((o) => !o.onRouteToday && match(o));
  return (
    <div>
      <h1 className="mb-1 px-1 text-xl font-bold">New order</h1>
      <p className="mb-3 px-1 text-sm text-slate-500">Step 1 of 3 · Which outlet?</p>
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-slate-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search shop, owner, village or mobile" className="h-13 w-full rounded-2xl border border-slate-200 bg-white pr-4 pl-12 text-base shadow-sm outline-none focus:border-accent-500 focus:ring-4 focus:ring-accent-500/15" />
      </div>
      <Link href="/m/outlets/new?then=order" className="mb-4 flex items-center gap-3 rounded-2xl border-2 border-dashed border-violet-300 bg-violet-50/60 p-3 text-violet-800 active:bg-violet-100">
        <span className="grid size-10 place-items-center rounded-xl bg-violet-600 text-white"><Plus className="size-5" /></span>
        <span className="font-semibold">New outlet (not in the list)</span>
      </Link>
      {today.length > 0 && <Group title="On today's route" icon={MapPin} list={today} onPick={onPick} />}
      <Group title={today.length ? "All my outlets" : "My outlets"} icon={Store} list={rest} onPick={onPick} />
      {outlets.length === 0 && <p className="rounded-2xl bg-white p-6 text-center text-sm text-slate-500">No outlets assigned to you yet. Add one above or ask your manager.</p>}
    </div>
  );
}

function Group({ title, icon: Icon, list, onPick }: { title: string; icon: typeof Store; list: Outlet[]; onPick: (id: string) => void }) {
  if (!list.length) return null;
  return (
    <section className="mb-4">
      <h2 className="mb-2 flex items-center gap-1.5 px-1 text-xs font-semibold tracking-wide text-slate-500 uppercase"><Icon className="size-3.5" /> {title} · {list.length}</h2>
      <ul className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70">
        {list.slice(0, 200).map((o) => {
          const blocked = o.status === "blocked";
          return (
            <li key={o.id} className="border-b border-slate-100 last:border-0">
              <button disabled={blocked} onClick={() => onPick(o.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-slate-50 disabled:opacity-50">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-slate-100 text-sm font-bold text-slate-600">{o.shop_name.slice(0, 1).toUpperCase()}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{o.shop_name}</span>
                  <span className="block truncate text-xs text-slate-500">{[o.owner_name, o.city].filter(Boolean).join(" · ")}</span>
                </span>
                {blocked ? <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">Blocked</span>
                  : o.status === "on_hold" ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">On hold</span>
                  : o.overdue > 0 ? <span className="tabular rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">Due {inr(o.overdue, { decimals: false })}</span>
                  : <ChevronRight className="size-5 text-slate-300" />}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
function Catalogue({ items, cart, setQty, loadedAt, onRefresh, refreshing }: {
  items: CatalogueItem[]; cart: Cart; setQty: (id: string, q: number) => void; loadedAt: string; onRefresh: () => void; refreshing: boolean;
}) {
  const [q, setQ] = useState("");
  const [brand, setBrand] = useState<string>("all");
  const inStock = items.filter((i) => i.available > 0);
  const hidden = items.length - inStock.length;
  const brands = [...new Map(inStock.map((i) => [i.brand_id, i.brand_name])).entries()];
  const t = q.trim().toLowerCase();
  const list = inStock.filter((i) => (brand === "all" || i.brand_id === brand) && (!t || i.name.toLowerCase().includes(t) || i.sku.toLowerCase().includes(t) || (i.category ?? "").toLowerCase().includes(t)));
  const mins = Math.round((Date.now() - Date.parse(loadedAt)) / 60000);

  return (
    <div>
      <div className="sticky top-[68px] z-20 -mx-3 bg-slate-50/95 px-3 pt-1 pb-2 backdrop-blur">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search product or model" className="h-12 w-full rounded-2xl border border-slate-200 bg-white pr-10 pl-12 text-base shadow-sm outline-none focus:border-accent-500 focus:ring-4 focus:ring-accent-500/15" />
          {q && <button onClick={() => setQ("")} className="absolute top-1/2 right-3 -translate-y-1/2 text-slate-400" aria-label="Clear"><X className="size-5" /></button>}
        </div>
        <div className="no-scrollbar mt-2 flex gap-2 overflow-x-auto">
          {[["all", "All"] as [string, string], ...brands].map(([id, name]) => (
            <button key={id} onClick={() => setBrand(id)} className={cn("shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold", brand === id ? "bg-ink-900 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200")}>
              {name}
            </button>
          ))}
        </div>
      </div>
      <p className="mb-2 flex items-center justify-between px-1 text-[11px] text-slate-500">
        <span>Step 2 of 3 · Only items in stock are shown</span>
        <button onClick={onRefresh} className="flex items-center gap-1 font-medium text-sky-700"><RefreshCw className={cn("size-3", refreshing && "animate-spin")} /> {mins < 1 ? "stock just now" : `stock ${mins} min ago`}</button>
      </p>

      <ul className="space-y-2">
        {list.map((i) => {
          const qty = cart[i.id]?.qty ?? 0;
          return (
            <li key={i.id} className={cn("flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm ring-1 transition", qty ? "ring-2 ring-accent-500" : "ring-slate-200/70")}>
              {i.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={i.image_url} alt="" className="size-16 shrink-0 rounded-xl bg-slate-100 object-cover" loading="lazy" />
              ) : (
                <span className="grid size-16 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-slate-100 to-slate-200 text-lg font-bold text-slate-500">{i.brand_name.slice(0, 2).toUpperCase()}</span>
              )}
              <div className="min-w-0 flex-1">
                <div className="line-clamp-2 text-sm leading-snug font-semibold">{i.name}</div>
                <div className="truncate text-[11px] text-slate-500">{i.brand_name} · {i.sku}</div>
                <div className="mt-1 flex items-center gap-2">
                  <span className="tabular text-base font-bold">{inr(i.price, { decimals: i.price % 1 !== 0 })}</span>
                  <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold", i.available <= 5 ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800")}>{i.available} in stock</span>
                </div>
                {i.mrp > 0 && <div className="tabular text-[10px] text-slate-400">MRP {inr(i.mrp, { decimals: false })} · {i.price_mode === "inclusive" ? "incl." : "+"} GST</div>}
              </div>
              <div className="shrink-0">
                {qty === 0 ? (
                  <button onClick={() => setQty(i.id, 1)} className="h-10 rounded-xl bg-accent-500 px-4 text-sm font-bold text-white shadow-sm active:scale-95">ADD</button>
                ) : (
                  <Stepper value={qty} max={i.available} onChange={(v) => setQty(i.id, v)} />
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {list.length === 0 && <p className="rounded-2xl bg-white p-6 text-center text-sm text-slate-500">No product in stock matches “{q}”.</p>}
      {hidden > 0 && <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-slate-400"><PackageX className="size-3.5" /> {hidden} out-of-stock product{hidden === 1 ? "" : "s"} hidden</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
type Line = { item: CatalogueItem; qty: number; discount: number };

function Review({ outlet, lines, calc, totals, maxDiscount, setQty, setDiscount, onClose, onSent }: {
  outlet: Outlet; lines: Line[]; calc: ReturnType<typeof calcLine>[]; totals: ReturnType<typeof orderTotals> & { grand: number }; maxDiscount: number;
  setQty: (id: string, q: number) => void; setDiscount: (id: string, d: number) => void; onClose: () => void;
  onSent: (r: { orderNo?: string; total: number; offline: boolean; shop: string; mobile: string; lines: string[] }) => void;
}) {
  const [credit, setCredit] = useState<number>(outlet.credit_days);
  const [notes, setNotes] = useState("");
  const [showDisc, setShowDisc] = useState(lines.some((l) => l.discount > 0));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const uuid = useRef(crypto.randomUUID());
  const credits = [...new Set([...CREDIT, outlet.credit_days])].sort((a, b) => a - b);

  async function send() {
    setError(null);
    if (!lines.length) return setError("Add at least one product.");
    if (lines.some((l) => l.discount > maxDiscount)) return setError(`Discount can be at most ${maxDiscount}%.`);
    const data = {
      clientUuid: uuid.current,
      retailerId: outlet.id,
      creditDays: credit,
      notes,
      lines: lines.map((l) => ({ product_id: l.item.id, qty: l.qty, discount_pct: l.discount })),
    };
    const summary = lines.map((l) => `${l.item.name} × ${l.qty}`);
    setBusy(true);
    if (!navigator.onLine) {
      addToOutbox({ id: uuid.current, kind: "order", data, shop: outlet.shop_name, total: totals.grand, at: new Date().toISOString() });
      setBusy(false);
      return onSent({ total: totals.grand, offline: true, shop: outlet.shop_name, mobile: outlet.mobile, lines: summary });
    }
    try {
      const res = await submitQuotation(data);
      setBusy(false);
      if (res.error) return setError(res.error);
      onSent({ orderNo: res.orderNo, total: res.total ?? totals.grand, offline: false, shop: outlet.shop_name, mobile: outlet.mobile, lines: summary });
    } catch {
      // Network dropped while sending: keep it on the phone, it will be sent later.
      addToOutbox({ id: uuid.current, kind: "order", data, shop: outlet.shop_name, total: totals.grand, at: new Date().toISOString() });
      setBusy(false);
      onSent({ total: totals.grand, offline: true, shop: outlet.shop_name, mobile: outlet.mobile, lines: summary });
    }
  }

  return (
    <Sheet
      title="Review order"
      onClose={onClose}
      footer={
        <>
          {error && <p className="mb-2 rounded-xl bg-red-50 p-2.5 text-sm text-red-800">{error}</p>}
          <button disabled={busy || !lines.length} onClick={send} className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-accent-500 to-accent-600 text-lg font-bold text-white shadow-lg shadow-accent-500/30 active:scale-[0.99] disabled:opacity-60">
            <Send className="size-5" /> {busy ? "Sending…" : `Send quotation · ${inr(totals.grand, { decimals: false })}`}
          </button>
          <p className="mt-2 text-center text-[11px] text-slate-500">This goes to the office as a quotation. The office confirms the invoice.</p>
        </>
      }
    >
      <p className="mb-3 text-sm text-slate-500">Step 3 of 3 · <span className="font-semibold text-slate-800">{outlet.shop_name}</span></p>
      <ul className="divide-y divide-slate-100 rounded-2xl ring-1 ring-slate-200">
        {lines.map((l, idx) => (
          <li key={l.item.id} className="p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm leading-snug font-semibold">{l.item.name}</div>
                <div className="tabular text-xs text-slate-500">{inr(l.item.price)} × {l.qty}{l.discount ? ` − ${l.discount}%` : ""}</div>
              </div>
              <div className="tabular text-right font-semibold">{inr(calc[idx].total)}</div>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <Stepper value={l.qty} max={l.item.available} onChange={(v) => setQty(l.item.id, v)} />
              {showDisc && (
                <label className="flex items-center gap-1 text-xs text-slate-500">
                  Disc.
                  <input type="number" inputMode="decimal" min={0} max={maxDiscount} step="0.5" value={l.discount || ""} onChange={(e) => setDiscount(l.item.id, Math.max(0, Number(e.target.value) || 0))}
                    className={cn("tabular h-10 w-16 rounded-xl border px-2 text-center text-sm", l.discount > maxDiscount ? "border-red-400 bg-red-50" : "border-slate-300")} />%
                </label>
              )}
              <button onClick={() => setQty(l.item.id, 0)} className="ml-auto grid size-10 place-items-center rounded-xl text-slate-400 active:bg-red-50 active:text-red-600" aria-label="Remove"><Trash2 className="size-5" /></button>
            </div>
          </li>
        ))}
      </ul>
      {!showDisc && maxDiscount > 0 && <button onClick={() => setShowDisc(true)} className="mt-2 text-sm font-medium text-sky-700">+ Give discount (max {maxDiscount}%)</button>}

      <div className="mt-4">
        <div className="mb-1.5 text-sm font-medium text-slate-700">Payment terms</div>
        <div className="grid grid-cols-4 gap-2">
          {credits.map((d) => (
            <button key={d} onClick={() => setCredit(d)} className={cn("h-11 rounded-xl text-sm font-semibold", credit === d ? "bg-ink-900 text-white" : "bg-white ring-1 ring-slate-300")}>
              {d === 0 ? "Cash" : `${d} days`}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-4">
        <div className="mb-1.5 text-sm font-medium text-slate-700">Note for office <span className="font-normal text-slate-400">(optional)</span></div>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="e.g. Deliver before Saturday" className="w-full rounded-xl border border-slate-300 p-3 text-base outline-none focus:border-accent-500" />
      </div>

      <dl className="tabular mt-4 space-y-1 rounded-2xl bg-slate-50 p-3 text-sm">
        <div className="flex justify-between"><dt className="text-slate-500">Value before GST</dt><dd>{inr(totals.taxable)}</dd></div>
        {totals.discount > 0 && <div className="flex justify-between text-emerald-700"><dt>Discount given</dt><dd>− {inr(totals.discount)}</dd></div>}
        <div className="flex justify-between"><dt className="text-slate-500">GST</dt><dd>{inr(totals.tax)}</dd></div>
        <div className="flex justify-between border-t border-slate-200 pt-1 text-base font-bold"><dt>Total</dt><dd>{inr(totals.grand, { decimals: false })}</dd></div>
      </dl>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
function Done({ result, onNew, onHome }: { result: { orderNo?: string; total: number; offline: boolean; shop: string; mobile: string; lines: string[] }; onNew: () => void; onHome: () => void }) {
  const text = `Order from ${result.shop}${result.orderNo ? ` (${result.orderNo})` : ""}:\n${result.lines.map((l) => `• ${l}`).join("\n")}\nTotal ${inr(result.total, { decimals: false })} incl. GST\n— APEX TRADING CO.`;
  return (
    <div className="pt-6 text-center">
      <span className={cn("mx-auto grid size-24 place-items-center rounded-full text-white shadow-lg", result.offline ? "bg-amber-500 shadow-amber-500/30" : "bg-emerald-500 shadow-emerald-500/30")}>
        {result.offline ? <CloudOff className="size-12" /> : <Check className="size-14" strokeWidth={3} />}
      </span>
      <h1 className="mt-5 text-2xl font-bold">{result.offline ? "Saved on phone" : "Order sent!"}</h1>
      <p className="mt-1 text-slate-600">{result.shop} · <span className="tabular font-semibold">{inr(result.total, { decimals: false })}</span></p>
      {result.orderNo && <p className="mt-1 font-mono text-sm text-slate-500">{result.orderNo}</p>}
      <p className="mx-auto mt-3 max-w-xs text-sm text-slate-500">
        {result.offline ? "No internet right now. It will be sent to the office automatically when you are back online." : "The office will check stock and credit and make the invoice."}
      </p>
      <div className="mx-auto mt-6 grid max-w-xs gap-3">
        <a href={`https://wa.me/91${result.mobile}?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener" className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-[#25D366] font-semibold text-white">
          <MessageCircle className="size-5" /> Send summary to shop
        </a>
        <button onClick={onNew} className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-accent-500 font-semibold text-white"><Plus className="size-5" /> Another order</button>
        <button onClick={onHome} className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-white font-semibold ring-1 ring-slate-300"><ArrowLeft className="size-5" /> Home</button>
      </div>
    </div>
  );
}
