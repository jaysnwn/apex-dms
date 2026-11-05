"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, ImageOff, LayoutGrid, Plus, Search, Store, Trash2, UserPlus, X } from "lucide-react";
import { Alert, Badge, Button, Card, Input, Label, Textarea, cn } from "@/components/ui";
import { BarcodeScanButton } from "@/components/barcode-scanner";
import { addDays, calcLine, orderTotals, todayIST } from "@/lib/gst";
import { date as fmtDate, inr, qty as fmtQty } from "@/lib/format";
import {
  quickCreateRetailer,
  saveOrder,
  searchProducts,
  searchRetailers,
  type PickerProduct,
  type PickerRetailer,
} from "./actions";

export type BuilderLine = { product: PickerProduct; qty: number; discount: number; price: number | null };

type Props = {
  role: string;
  companyState: string;
  maxSalesmanDiscount: number;
  brands: { id: string; name: string }[];
  presetRetailer?: PickerRetailer;
  initial?: {
    orderId: string;
    orderNo: string;
    retailer: PickerRetailer;
    creditDays: number;
    notes: string;
    lines: BuilderLine[];
  };
};

const CREDIT = [10, 15, 20, 30];

export function OrderBuilder({ role, companyState, maxSalesmanDiscount, brands, initial, presetRetailer }: Props) {
  const router = useRouter();
  const isOffice = role === "super_admin" || role === "manager" || role === "billing";
  const canOverride = role === "super_admin" || role === "manager";
  const [retailer, setRetailer] = useState<PickerRetailer | null>(initial?.retailer ?? presetRetailer ?? null);
  const [lines, setLines] = useState<BuilderLine[]>(initial?.lines ?? []);
  const startDays = initial?.creditDays ?? presetRetailer?.credit_days ?? 15;
  const [creditDays, setCreditDays] = useState<number>(startDays);
  const [custom, setCustom] = useState(!CREDIT.includes(startDays));
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [error, setError] = useState<{ message: string; hint?: string } | null>(null);
  const [override, setOverride] = useState(false);
  const [pending, start] = useTransition();
  const [savedOrderId, setSavedOrderId] = useState<string | null>(initial?.orderId ?? null);
  const clientUuid = useRef<string>(typeof crypto !== "undefined" ? crypto.randomUUID() : "");

  const igst = !!retailer && retailer.billing_state_code !== companyState;
  const calc = lines.map((l) =>
    calcLine(l.qty || 0, l.price ?? l.product.retailer_price, l.product.retailer_price_mode, l.discount || 0, l.product.gst_rate)
  );
  const totals = orderTotals(calc, igst);
  const today = todayIST();
  const dueDate = addDays(today, creditDays || 0);
  const shortLines = lines.filter((l) => l.qty > l.product.available);

  function pickRetailer(r: PickerRetailer | null) {
    setRetailer(r);
    if (r && !initial) {
      setCreditDays(r.credit_days);
      setCustom(!CREDIT.includes(r.credit_days));
    }
  }

  function addProducts(items: { product: PickerProduct; qty: number }[]) {
    setLines((prev) => {
      const next = [...prev];
      for (const it of items) {
        const i = next.findIndex((l) => l.product.id === it.product.id);
        if (i >= 0) next[i] = { ...next[i], qty: next[i].qty + it.qty, product: it.product };
        else next.push({ product: it.product, qty: it.qty, discount: 0, price: null });
      }
      return next;
    });
  }

  const update = (i: number, patch: Partial<BuilderLine>) => setLines((p) => p.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  function submit(confirm: boolean) {
    setError(null);
    if (!retailer) return setError({ message: "Choose a retailer first." });
    if (lines.length === 0) return setError({ message: "Add at least one product." });
    if (lines.some((l) => !(l.qty > 0))) return setError({ message: "Every line needs a quantity above zero." });
    start(async () => {
      const res = await saveOrder({
        orderId: savedOrderId,
        retailerId: retailer.id,
        creditDays,
        notes,
        lines: lines.map((l) => ({
          product_id: l.product.id,
          qty: l.qty,
          discount_pct: l.discount || 0,
          unit_price: isOffice && l.price !== null ? l.price : null,
        })),
        clientUuid: clientUuid.current,
        confirm,
        overrideCredit: override,
      });
      if (res.invoiceId) return router.push(`/sales/invoices/${res.invoiceId}?new=1`);
      if (res.orderId) setSavedOrderId(res.orderId);
      if (res.error) {
        setError({
          message: res.orderId && !res.invoiceId && confirm ? `Saved as quotation, but not invoiced: ${res.error}` : res.error,
          hint: res.hint,
        });
        return;
      }
      if (res.orderId) router.push(`/sales/orders/${res.orderId}?saved=1`);
    });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
      <div className="space-y-6">
        {/* 1. Retailer */}
        <Card className="p-5">
          <StepTitle n={1} title="Retailer" />
          <RetailerSelect value={retailer} onChange={pickRetailer} />
        </Card>

        {/* 2. Products */}
        <Card className="p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <StepTitle n={2} title="Products" />
            <Button variant="secondary" size="sm" onClick={() => setCatalogOpen(true)}>
              <LayoutGrid className="size-4" /> Open catalogue
            </Button>
          </div>
          <ProductSearch onAdd={(p) => addProducts([{ product: p, qty: 1 }])} />

          {lines.length === 0 ? (
            <div className="mt-4 rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
              Search above, scan a barcode, or open the catalogue to add products.
            </div>
          ) : (
            <div className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-200">
              {lines.map((l, i) => {
                const c = calc[i];
                const short = l.qty > l.product.available;
                const discountTooHigh = !isOffice && l.discount > maxSalesmanDiscount;
                return (
                  <div key={l.product.id} className={cn("grid gap-3 p-3 sm:grid-cols-[1fr_auto]", short && "bg-red-50/50")}>
                    <div className="min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-medium">{l.product.name}</div>
                          <div className="text-xs text-slate-500">
                            {l.product.brand_name} · <span className="font-mono">{l.product.sku}</span> · {l.product.gst_rate}% GST
                          </div>
                        </div>
                        <button onClick={() => setLines((p) => p.filter((_, j) => j !== i))} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-red-600" aria-label="Remove line">
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                      <div className="mt-2 flex flex-wrap items-end gap-3">
                        <div>
                          <div className="mb-1 text-[11px] font-medium text-slate-500">Qty</div>
                          <Input type="number" min={0} step="any" inputMode="decimal" value={l.qty || ""} onChange={(e) => update(i, { qty: Number(e.target.value) })} className="tabular h-9 w-24" />
                        </div>
                        <div>
                          <div className="mb-1 text-[11px] font-medium text-slate-500">Price ({l.product.retailer_price_mode === "inclusive" ? "incl." : "+"} GST)</div>
                          {isOffice ? (
                            <Input type="number" min={0} step="0.01" value={l.price ?? l.product.retailer_price} onChange={(e) => update(i, { price: e.target.value === "" ? null : Number(e.target.value) })} className="tabular h-9 w-28" />
                          ) : (
                            <div className="tabular flex h-9 items-center text-sm">{inr(l.product.retailer_price)}</div>
                          )}
                        </div>
                        <div>
                          <div className="mb-1 text-[11px] font-medium text-slate-500">Disc. %</div>
                          <Input type="number" min={0} max={isOffice ? 100 : maxSalesmanDiscount} step="0.01" value={l.discount || ""} onChange={(e) => update(i, { discount: Number(e.target.value) })} className={cn("tabular h-9 w-20", discountTooHigh && "border-red-400")} />
                        </div>
                        <span className={cn("rounded-md px-2 py-1 text-xs font-semibold", short ? "bg-red-100 text-red-700" : "bg-emerald-50 text-emerald-700")}>
                          {short ? `Only ${fmtQty(l.product.available)} in stock` : `${fmtQty(l.product.available)} in stock`}
                        </span>
                      </div>
                    </div>
                    <div className="tabular text-right text-sm sm:min-w-32">
                      <div className="text-slate-500">Taxable {inr(c.taxable)}</div>
                      <div className="text-slate-500">GST {inr(c.tax)}</div>
                      <div className="text-base font-semibold">{inr(c.total)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {shortLines.length > 0 && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>
                Not enough stock for {shortLines.map((l) => l.product.name).join(", ")}. You can save a quotation, but it cannot be invoiced until stock arrives or quantities are reduced.
              </span>
            </div>
          )}
        </Card>
      </div>

      {/* 3. Terms & totals */}
      <div className="space-y-6 xl:sticky xl:top-6 xl:self-start">
        <Card className="p-5">
          <StepTitle n={3} title="Credit and notes" />
          <Label>Credit period</Label>
          <div className="flex flex-wrap gap-2">
            {CREDIT.map((d) => (
              <button key={d} type="button" onClick={() => { setCreditDays(d); setCustom(false); }}
                className={cn("rounded-lg border px-3 py-1.5 text-sm font-medium", !custom && creditDays === d ? "border-ink-900 bg-ink-900 text-white" : "border-slate-300 bg-white hover:border-slate-400")}>
                {d} days
              </button>
            ))}
            <button type="button" onClick={() => setCustom(true)}
              className={cn("rounded-lg border px-3 py-1.5 text-sm font-medium", custom ? "border-ink-900 bg-ink-900 text-white" : "border-slate-300 bg-white hover:border-slate-400")}>
              Custom
            </button>
            {custom && (
              <Input type="number" min={0} max={365} value={creditDays} onChange={(e) => setCreditDays(Number(e.target.value))} className="h-9 w-24" aria-label="Custom credit days" />
            )}
          </div>
          <p className="mt-2 text-sm text-slate-600">
            Due on <span className="font-semibold text-slate-900">{fmtDate(dueDate)}</span>
            <span className="text-slate-400"> if invoiced today</span>
          </p>
          <div className="mt-4">
            <Label htmlFor="notes" hint="optional">Order notes</Label>
            <Textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="bg-ink-900 px-5 py-4 text-white">
            <div className="text-sm text-slate-300">Invoice total</div>
            <div className="tabular text-3xl font-semibold tracking-tight">{inr(totals.grand)}</div>
            <div className="text-xs text-slate-400">{lines.length} product{lines.length === 1 ? "" : "s"} · {igst ? "IGST (out of state)" : "CGST + SGST"}</div>
          </div>
          <dl className="tabular space-y-1.5 p-5 text-sm">
            <Row k="Subtotal" v={inr(totals.subtotal)} />
            {totals.discount > 0 && <Row k="Discount" v={`− ${inr(totals.discount)}`} tone="green" />}
            <Row k="Taxable value" v={inr(totals.taxable)} />
            {igst ? <Row k="IGST" v={inr(totals.igst)} /> : (<><Row k="CGST" v={inr(totals.cgst)} /><Row k="SGST" v={inr(totals.sgst)} /></>)}
            {totals.roundOff !== 0 && <Row k="Round off" v={inr(totals.roundOff)} />}
          </dl>
          {retailer && retailer.credit_limit > 0 && (
            <div className={cn("mx-5 mb-4 rounded-lg px-3 py-2 text-xs", retailer.outstanding + totals.grand > retailer.credit_limit ? "bg-red-50 text-red-800" : "bg-slate-50 text-slate-600")}>
              Outstanding {inr(retailer.outstanding, { decimals: false })} + this order {inr(totals.grand, { decimals: false })} vs limit {inr(retailer.credit_limit, { decimals: false })}
            </div>
          )}
          <div className="space-y-2 border-t border-slate-100 p-5">
            {error && (
              <Alert>
                {error.message}
                {error.hint === "CREDIT_LIMIT" && canOverride && (
                  <label className="mt-2 flex items-center gap-2 font-medium">
                    <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} className="size-4" />
                    Override credit limit (recorded in the audit log)
                  </label>
                )}
              </Alert>
            )}
            {isOffice && (
              <Button className="w-full bg-accent-600 hover:bg-accent-700" disabled={pending} onClick={() => submit(true)}>
                <Check className="size-4" /> {pending ? "Working…" : "Confirm invoice"}
              </Button>
            )}
            <Button variant="secondary" className="w-full" disabled={pending} onClick={() => submit(false)}>
              {initial ? "Save quotation" : "Save as quotation"}
            </Button>
            <p className="text-center text-xs text-slate-400">
              {isOffice ? "Confirming creates the GST invoice and moves the order to Pending dispatch." : "The office confirms quotations into invoices."}
            </p>
          </div>
        </Card>
      </div>

      {catalogOpen && <CatalogueDialog brands={brands} onClose={() => setCatalogOpen(false)} onAdd={(items) => { addProducts(items); setCatalogOpen(false); }} />}
    </div>
  );
}

function StepTitle({ n, title }: { n: number; title: string }) {
  return (
    <h2 className="mb-3 flex items-center gap-2 font-semibold">
      <span className="grid size-6 place-items-center rounded-full bg-accent-100 text-xs font-bold text-accent-700">{n}</span>
      {title}
    </h2>
  );
}

function Row({ k, v, tone }: { k: string; v: string; tone?: "green" }) {
  return (
    <div className="flex justify-between">
      <dt className="text-slate-500">{k}</dt>
      <dd className={cn("font-medium", tone === "green" && "text-emerald-700")}>{v}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
export function RetailerSelect({ value, onChange }: { value: PickerRetailer | null; onChange: (r: PickerRetailer | null) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PickerRetailer[]>([]);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (value) return;
    const t = setTimeout(async () => {
      setResults(await searchRetailers(q));
    }, 200);
    return () => clearTimeout(t);
  }, [q, value]);

  if (value) {
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-center">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-violet-100 text-violet-700"><Store className="size-5" /></span>
        <div className="min-w-0 flex-1">
          <div className="font-medium">{value.shop_name} <span className="font-mono text-xs text-slate-500">{value.code}</span></div>
          <div className="text-sm text-slate-500">
            {[value.owner_name, value.mobile, value.billing_city].filter(Boolean).join(" · ")}
          </div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <Badge tone={value.overdue > 0 ? "red" : value.outstanding > 0 ? "amber" : "green"}>
              Outstanding {inr(value.outstanding, { decimals: false })}
            </Badge>
            {value.overdue > 0 && <Badge tone="red">Overdue {inr(value.overdue, { decimals: false })}</Badge>}
            {value.status !== "active" && <Badge tone="red">Account {value.status.replace("_", " ")}</Badge>}
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={() => onChange(null)}>Change</Button>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => setOpen(true)} placeholder="Search shop, owner, mobile or retailer ID" className="pl-9" />
        </div>
        <Button variant="secondary" onClick={() => setCreating(true)}>
          <UserPlus className="size-4" /> <span className="hidden sm:inline">New retailer</span>
        </Button>
      </div>
      {open && (
        <ul className="absolute z-20 mt-1 max-h-80 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {results.length === 0 ? (
            <li className="px-3 py-3 text-sm text-slate-500">
              No retailers found. <button className="font-medium text-accent-700 underline" onClick={() => setCreating(true)}>Create a new retailer</button>
            </li>
          ) : (
            results.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => { onChange(r); setOpen(false); }} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-slate-50">
                  <span className="min-w-0">
                    <span className="font-medium">{r.shop_name}</span>
                    <span className="block truncate text-xs text-slate-500">{r.code} · {r.mobile}{r.billing_city ? ` · ${r.billing_city}` : ""}</span>
                  </span>
                  {r.overdue > 0 ? <Badge tone="red">Overdue</Badge> : r.outstanding > 0 ? <Badge tone="amber">{inr(r.outstanding, { decimals: false })}</Badge> : null}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
      {creating && <QuickRetailerDialog onClose={() => setCreating(false)} onCreated={(r) => { onChange(r); setCreating(false); }} />}
    </div>
  );
}

function QuickRetailerDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (r: PickerRetailer) => void }) {
  const [form, setForm] = useState({ shop_name: "", owner_name: "", mobile: "", billing_city: "", gstin: "", billing_address: "" });
  const [error, setError] = useState<string | null>(null);
  const [similar, setSimilar] = useState<{ code: string; shop_name: string; city: string | null }[] | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function save(force = false) {
    setError(null);
    start(async () => {
      const res = await quickCreateRetailer({ ...form, force });
      if (res.retailer) onCreated(res.retailer);
      else if (res.similar) setSimilar(res.similar);
      else setError(res.error ?? "Could not create retailer");
    });
  }

  return (
    <Dialog title="New retailer" onClose={onClose}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><Label>Shop name</Label><Input value={form.shop_name} onChange={set("shop_name")} autoFocus /></div>
        <div><Label>Owner name</Label><Input value={form.owner_name} onChange={set("owner_name")} /></div>
        <div><Label>Mobile</Label><Input value={form.mobile} onChange={set("mobile")} inputMode="tel" maxLength={14} /></div>
        <div><Label>City / town</Label><Input value={form.billing_city} onChange={set("billing_city")} /></div>
        <div><Label hint="optional">GSTIN</Label><Input value={form.gstin} onChange={set("gstin")} maxLength={15} className="uppercase" /></div>
        <div className="sm:col-span-2"><Label hint="optional">Address</Label><Input value={form.billing_address} onChange={set("billing_address")} /></div>
      </div>
      {similar && (
        <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <div className="font-semibold">Similar retailers already exist:</div>
          <ul className="mt-1 list-disc pl-5">{similar.map((s) => <li key={s.code}>{s.shop_name} ({s.code}{s.city ? `, ${s.city}` : ""})</li>)}</ul>
          <Button size="sm" variant="secondary" className="mt-2" onClick={() => save(true)} disabled={pending}>It&apos;s a different shop — create anyway</Button>
        </div>
      )}
      {error && <div className="mt-4"><Alert>{error}</Alert></div>}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={() => save(false)} disabled={pending}>{pending ? "Saving…" : "Create and select"}</Button>
      </div>
      <p className="mt-3 text-xs text-slate-400">Credit terms can be set later on the retailer page. Default: 15 days.</p>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
function ProductSearch({ onAdd }: { onAdd: (p: PickerProduct) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PickerProduct[]>([]);
  const [open, setOpen] = useState(false);
  const addRef = useRef(onAdd);
  useEffect(() => {
    addRef.current = onAdd;
  }, [onAdd]);

  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      const r = await searchProducts(q);
      setResults(r);
      setOpen(true);
      // A scanned / typed barcode that matches exactly one product is added straight away.
      if (r.length === 1 && /^[0-9]{8,14}$/.test(q.trim())) { addRef.current(r[0]); setQ(""); setOpen(false); }
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="relative">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => results.length && setOpen(true)} placeholder="Add product: name, model number or barcode" className="pl-9" />
        </div>
        <BarcodeScanButton onDetected={(code) => setQ(code)} />
      </div>
      {open && results.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-80 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {results.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => { onAdd(p); setQ(""); setOpen(false); }} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-slate-50">
                <span className="min-w-0">
                  <span className="font-medium">{p.name}</span>
                  <span className="block truncate text-xs text-slate-500">{p.brand_name} · {p.sku} · {inr(p.retailer_price)}</span>
                </span>
                <span className={cn("shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold", p.available > 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700")}>
                  {fmtQty(p.available)} in stock
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CatalogueDialog({ brands, onClose, onAdd }: { brands: { id: string; name: string }[]; onClose: () => void; onAdd: (items: { product: PickerProduct; qty: number }[]) => void }) {
  const [brand, setBrand] = useState<string | undefined>();
  const [q, setQ] = useState("");
  const [items, setItems] = useState<PickerProduct[] | null>(null);
  const [picked, setPicked] = useState<Record<string, number>>({});

  useEffect(() => {
    setItems(null);
    const t = setTimeout(async () => setItems(await searchProducts(q, brand, true)), 250);
    return () => clearTimeout(t);
  }, [q, brand]);

  const chosen = useMemo(() => Object.entries(picked).filter(([, n]) => n > 0), [picked]);

  return (
    <Dialog title="Product catalogue" onClose={onClose} wide>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by name or model" />
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        <button onClick={() => setBrand(undefined)} className={cn("rounded-full border px-3 py-1 text-sm", !brand ? "border-ink-900 bg-ink-900 text-white" : "border-slate-300")}>All brands</button>
        {brands.map((b) => (
          <button key={b.id} onClick={() => setBrand(b.id)} className={cn("rounded-full border px-3 py-1 text-sm", brand === b.id ? "border-ink-900 bg-ink-900 text-white" : "border-slate-300")}>{b.name}</button>
        ))}
      </div>
      <div className="max-h-[55vh] overflow-y-auto">
        {items === null ? (
          <p className="p-6 text-center text-sm text-slate-500">Loading…</p>
        ) : items.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-500">No products.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {items.map((p) => {
              const n = picked[p.id] ?? 0;
              return (
                <div key={p.id} className={cn("overflow-hidden rounded-xl border bg-white", n > 0 ? "border-accent-500 ring-2 ring-accent-500/20" : "border-slate-200")}>
                  <button type="button" className="block w-full" onClick={() => setPicked((s) => ({ ...s, [p.id]: (s[p.id] ?? 0) + 1 }))}>
                    <div className="relative aspect-square bg-slate-50">
                      {p.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.image_url} alt={p.name} className="h-full w-full object-contain p-2" />
                      ) : (
                        <div className="grid h-full place-items-center text-slate-300"><ImageOff className="size-8" /></div>
                      )}
                      <span className={cn("absolute top-2 right-2 rounded-md px-1.5 py-0.5 text-[11px] font-semibold", p.available > 0 ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-700")}>
                        {fmtQty(p.available)}
                      </span>
                    </div>
                    <div className="p-2 text-left">
                      <div className="line-clamp-2 text-xs font-medium">{p.name}</div>
                      <div className="tabular text-xs text-slate-500">{inr(p.retailer_price)}</div>
                    </div>
                  </button>
                  <div className="flex items-center justify-between border-t border-slate-100 px-2 py-1.5">
                    <button className="grid size-7 place-items-center rounded-md border text-lg leading-none" onClick={() => setPicked((s) => ({ ...s, [p.id]: Math.max(0, (s[p.id] ?? 0) - 1) }))} aria-label="Less">−</button>
                    <input type="number" min={0} value={n || ""} placeholder="0" onChange={(e) => setPicked((s) => ({ ...s, [p.id]: Number(e.target.value) }))} className="tabular w-12 text-center text-sm outline-none" aria-label={`Qty ${p.name}`} />
                    <button className="grid size-7 place-items-center rounded-md border text-lg leading-none" onClick={() => setPicked((s) => ({ ...s, [p.id]: (s[p.id] ?? 0) + 1 }))} aria-label="More">+</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
        <span className="text-sm text-slate-500">{chosen.length} selected</span>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose}>Close</Button>
          <Button
            disabled={chosen.length === 0}
            onClick={() => onAdd(chosen.map(([id, n]) => ({ product: items!.find((p) => p.id === id)!, qty: n })).filter((x) => x.product))}
          >
            <Plus className="size-4" /> Add {chosen.length || ""} to order
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

export function Dialog({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4" role="dialog" aria-label={title}>
      <div className={cn("max-h-[95dvh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl", wide ? "max-w-5xl" : "max-w-lg")}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="Close"><X className="size-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
