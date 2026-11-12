"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, PackageCheck, Search, Trash2 } from "lucide-react";
import { Alert, Badge, Button, Card, Input, Label, Select, Textarea, cn } from "@/components/ui";
import { BarcodeScanButton } from "@/components/barcode-scanner";
import { addDays, calcLine, orderTotals, todayIST } from "@/lib/gst";
import { date as fmtDate, inr, qty as fmtQty } from "@/lib/format";
import { savePurchase, searchPurchaseProducts, type PickerSupplier, type PurchaseProduct } from "./actions";

type Mode = "inclusive" | "exclusive";
export type PurchaseBuilderLine = { product: PurchaseProduct; qty: number; cost: number; mode: Mode; discount: number };

type Props = {
  companyState: string;
  suppliers: PickerSupplier[];
  warehouses: { id: string; name: string; brand_id: string }[];
  brands: { id: string; name: string }[];
  defaultBrandId?: string;
  presetSupplierId?: string;
  initial?: {
    purchaseId: string;
    purchaseNo: string;
    supplierId: string;
    warehouseId: string;
    orderDate: string;
    expectedDate: string | null;
    creditDays: number;
    otherCharges: number;
    notes: string;
    lines: PurchaseBuilderLine[];
  };
};

const CREDIT = [0, 15, 30, 45, 60];

export function PurchaseBuilder({ companyState, suppliers, warehouses, brands, defaultBrandId, initial, presetSupplierId }: Props) {
  const router = useRouter();
  const [supplierId, setSupplierId] = useState(initial?.supplierId ?? presetSupplierId ?? (suppliers.length === 1 ? suppliers[0].id : ""));
  const presetBrand = suppliers.find((s) => s.id === presetSupplierId)?.brand_id ?? defaultBrandId;
  const [warehouseId, setWarehouseId] = useState(initial?.warehouseId ?? (warehouses.find((w) => w.brand_id === presetBrand) ?? warehouses[0])?.id ?? "");
  // A purchase belongs to the brand of the warehouse the goods arrive at.
  const brandId = warehouses.find((w) => w.id === warehouseId)?.brand_id;
  const brandName = brands.find((b) => b.id === brandId)?.name ?? "";
  const [orderDate, setOrderDate] = useState(initial?.orderDate ?? todayIST());
  const [expectedDate, setExpectedDate] = useState(initial?.expectedDate ?? "");
  const supplier = suppliers.find((s) => s.id === supplierId) ?? null;
  const [creditDays, setCreditDays] = useState<number>(initial?.creditDays ?? supplier?.credit_days ?? 30);
  const [otherCharges, setOtherCharges] = useState(initial?.otherCharges ? String(initial.otherCharges) : "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [lines, setLines] = useState<PurchaseBuilderLine[]>(initial?.lines ?? []);
  const [receiveNow, setReceiveNow] = useState(false);
  const [billNo, setBillNo] = useState("");
  const [billDate, setBillDate] = useState(todayIST());
  const [updateCost, setUpdateCost] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(initial?.purchaseId ?? null);
  const [pending, start] = useTransition();

  const igst = !!supplier?.state_code && supplier.state_code !== companyState;
  const calc = lines.map((l) => calcLine(l.qty || 0, l.cost || 0, l.mode, l.discount || 0, l.product.gst_rate));
  const t = orderTotals(calc, igst);
  const other = Number(otherCharges) || 0;
  const exact = Math.round((t.taxable + t.tax + other) * 100) / 100;
  const grand = Math.round(exact);
  const roundOff = Math.round((grand - exact) * 100) / 100;

  function chooseSupplier(id: string) {
    setSupplierId(id);
    const s = suppliers.find((x) => x.id === id);
    if (s && !initial) setCreditDays(s.credit_days);
    // a brand's supplier → that brand's warehouse (while nothing is on the purchase yet)
    if (s?.brand_id && !lines.length && s.brand_id !== brandId) {
      const w = warehouses.find((x) => x.brand_id === s.brand_id);
      if (w) setWarehouseId(w.id);
    }
    if (s && !initial && !expectedDate) setExpectedDate(addDays(orderDate, s.lead_days ?? 8));
  }
  function chooseWarehouse(id: string) {
    const next = warehouses.find((w) => w.id === id);
    if (lines.length && next && next.brand_id !== brandId) {
      setError(`This purchase already has ${brandName} products. A ${brands.find((b) => b.id === next.brand_id)?.name} warehouse needs a separate purchase.`);
      return;
    }
    setError(null);
    setWarehouseId(id);
  }

  function add(p: PurchaseProduct, qty = 1) {
    setLines((prev) => {
      const i = prev.findIndex((l) => l.product.id === p.id);
      if (i >= 0) return prev.map((l, j) => (j === i ? { ...l, qty: l.qty + qty } : l));
      return [...prev, { product: p, qty, cost: p.purchase_cost, mode: p.purchase_cost_mode, discount: 0 }];
    });
  }
  const update = (i: number, patch: Partial<PurchaseBuilderLine>) => setLines((p) => p.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  function submit(receive: boolean) {
    setError(null);
    if (!supplierId) return setError("Choose a supplier.");
    if (!warehouseId) return setError("Choose the warehouse.");
    if (lines.length === 0) return setError("Add at least one product.");
    if (lines.some((l) => !(l.qty > 0))) return setError("Every line needs a quantity above zero.");
    if (lines.some((l) => !(l.cost >= 0) || Number.isNaN(l.cost))) return setError("Every line needs a purchase cost.");
    if (receive && !billNo.trim()) return setError("Enter the supplier's bill number.");
    start(async () => {
      const res = await savePurchase({
        purchaseId: savedId,
        supplierId,
        warehouseId,
        orderDate,
        expectedDate: expectedDate || null,
        creditDays,
        otherCharges: other,
        notes,
        lines: lines.map((l) => ({ product_id: l.product.id, qty: l.qty, unit_cost: l.cost, cost_mode: l.mode, discount_pct: l.discount || 0 })),
        receive: receive ? { billNo, billDate, updateCost } : null,
      });
      if (res.id) setSavedId(res.id);
      if (res.error) return setError(res.error);
      router.push(`/purchases/${res.id}?${res.received ? "received" : "saved"}=1`);
    });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
      <div className="space-y-6">
        <Card className="p-5">
          <StepTitle n={1} title="Supplier and warehouse" />
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="supplier">Supplier</Label>
              <div className="flex flex-wrap gap-2">
                {suppliers.slice(0, 6).map((s) => (
                  <button key={s.id} type="button" onClick={() => chooseSupplier(s.id)}
                    className={cn("rounded-lg border px-3 py-2 text-sm font-semibold", supplierId === s.id ? "border-fuchsia-600 bg-fuchsia-50 text-fuchsia-800 ring-2 ring-fuchsia-600/20" : "border-slate-300 bg-white hover:border-slate-400")}>
                    {s.name}
                  </button>
                ))}
              </div>
              {suppliers.length > 6 && (
                <Select id="supplier" className="mt-2" value={supplierId} onChange={(e) => chooseSupplier(e.target.value)}>
                  <option value="">Other supplier…</option>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
              )}
              {supplier && (
                <p className="mt-2 text-xs text-slate-500">
                  {supplier.gstin ? <>GSTIN <span className="font-mono">{supplier.gstin}</span> · </> : <span className="text-amber-700">No GSTIN on file · </span>}
                  {igst ? "IGST (out of state)" : "CGST + SGST"}
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="wh">Goods arrive at</Label>
              <Select id="wh" value={warehouseId} onChange={(e) => chooseWarehouse(e.target.value)}>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </Select>
              {brandName && <p className="mt-1 text-xs text-slate-500">This is a <b>{brandName}</b> purchase: only {brandName} products can be added.</p>}
            </div>
            <div>
              <Label htmlFor="odate">Order date</Label>
              <Input id="odate" type="date" value={orderDate} max={todayIST()} onChange={(e) => setOrderDate(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="edate" hint="optional">Expected delivery</Label>
              <Input id="edate" type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <StepTitle n={2} title="Products and purchase cost" />
          <ProductSearch key={brandId} brandId={brandId} brandName={brandName} onAdd={add} />
          {lines.length === 0 ? (
            <div className="mt-4 rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
              Search by name, model or barcode — or pick a brand to list its products.
            </div>
          ) : (
            <div className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-200">
              {lines.map((l, i) => {
                const c = calc[i];
                const changed = l.cost !== l.product.purchase_cost || l.mode !== l.product.purchase_cost_mode;
                return (
                  <div key={l.product.id} className="grid gap-3 p-3 sm:grid-cols-[1fr_auto]">
                    <div className="min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-medium">{l.product.name}</div>
                          <div className="text-xs text-slate-500">
                            {l.product.brand_name} · <span className="font-mono">{l.product.sku}</span> · {l.product.gst_rate}% GST · {fmtQty(l.product.on_hand)} in stock
                          </div>
                        </div>
                        <button onClick={() => setLines((p) => p.filter((_, j) => j !== i))} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-red-600" aria-label="Remove line">
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                      <div className="mt-2 flex flex-wrap items-end gap-3">
                        <div>
                          <div className="mb-1 text-[11px] font-medium text-slate-500">Qty ({l.product.unit_code})</div>
                          <Input type="number" min={0} step="any" inputMode="decimal" value={l.qty || ""} onChange={(e) => update(i, { qty: Number(e.target.value) })} className="tabular h-9 w-24" />
                        </div>
                        <div>
                          <div className="mb-1 text-[11px] font-medium text-slate-500">Cost per unit</div>
                          <Input type="number" min={0} step="0.01" value={Number.isNaN(l.cost) ? "" : l.cost} onChange={(e) => update(i, { cost: e.target.value === "" ? NaN : Number(e.target.value) })} className={cn("tabular h-9 w-28", changed && "border-amber-400 bg-amber-50")} />
                        </div>
                        <div>
                          <div className="mb-1 text-[11px] font-medium text-slate-500">Cost is</div>
                          <div className="flex h-9 rounded-lg border border-slate-300 p-0.5 text-xs">
                            {(["exclusive", "inclusive"] as const).map((m) => (
                              <button key={m} type="button" onClick={() => update(i, { mode: m })} className={cn("rounded-md px-2", l.mode === m ? "bg-ink-900 text-white" : "text-slate-600")}>
                                {m === "exclusive" ? "+ GST" : "incl. GST"}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <div className="mb-1 text-[11px] font-medium text-slate-500">Disc. %</div>
                          <Input type="number" min={0} max={100} step="0.01" value={l.discount || ""} onChange={(e) => update(i, { discount: Number(e.target.value) })} className="tabular h-9 w-20" />
                        </div>
                      </div>
                      {changed && <div className="mt-1 text-[11px] text-amber-700">Last cost {inr(l.product.purchase_cost)} {l.product.purchase_cost_mode === "inclusive" ? "incl." : "+"} GST</div>}
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
        </Card>
      </div>

      <div className="space-y-6 xl:sticky xl:top-6 xl:self-start">
        <Card className="p-5">
          <StepTitle n={3} title="Terms" />
          <Label>Supplier credit period</Label>
          <div className="flex flex-wrap gap-2">
            {CREDIT.map((d) => (
              <button key={d} type="button" onClick={() => setCreditDays(d)}
                className={cn("rounded-lg border px-3 py-1.5 text-sm font-medium", creditDays === d ? "border-ink-900 bg-ink-900 text-white" : "border-slate-300 bg-white hover:border-slate-400")}>
                {d === 0 ? "Cash" : `${d} days`}
              </button>
            ))}
            <Input type="number" min={0} max={365} value={creditDays} onChange={(e) => setCreditDays(Number(e.target.value))} className="h-9 w-20" aria-label="Credit days" />
          </div>
          <p className="mt-2 text-sm text-slate-600">Payment due {creditDays} days after the supplier&apos;s bill date.</p>
          <div className="mt-4">
            <Label htmlFor="other" hint="freight, packing">Other charges (₹)</Label>
            <Input id="other" type="number" min={0} step="0.01" value={otherCharges} onChange={(e) => setOtherCharges(e.target.value)} className="tabular" />
          </div>
          <div className="mt-4">
            <Label htmlFor="pnotes" hint="optional">Notes</Label>
            <Textarea id="pnotes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="bg-gradient-to-br from-fuchsia-700 to-fuchsia-900 px-5 py-4 text-white">
            <div className="text-sm text-fuchsia-100">Purchase total</div>
            <div className="tabular text-3xl font-semibold tracking-tight">{inr(grand)}</div>
            <div className="text-xs text-fuchsia-200">{lines.length} product{lines.length === 1 ? "" : "s"} · {fmtQty(lines.reduce((s, l) => s + (l.qty || 0), 0))} units · {igst ? "IGST" : "CGST + SGST"}</div>
          </div>
          <dl className="tabular space-y-1.5 p-5 text-sm">
            <Row k="Subtotal" v={inr(t.subtotal)} />
            {t.discount > 0 && <Row k="Discount" v={`− ${inr(t.discount)}`} />}
            <Row k="Taxable value" v={inr(t.taxable)} />
            {igst ? <Row k="IGST (input)" v={inr(t.igst)} /> : (<><Row k="CGST (input)" v={inr(t.cgst)} /><Row k="SGST (input)" v={inr(t.sgst)} /></>)}
            {other > 0 && <Row k="Other charges" v={inr(other)} />}
            {roundOff !== 0 && <Row k="Round off" v={inr(roundOff)} />}
          </dl>

          <div className="space-y-3 border-t border-slate-100 p-5">
            <label className={cn("flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm", receiveNow ? "border-emerald-500 bg-emerald-50" : "border-slate-200")}>
              <input type="checkbox" checked={receiveNow} onChange={(e) => setReceiveNow(e.target.checked)} className="mt-0.5 size-4" />
              <span>
                <span className="font-semibold">Goods have arrived with the bill</span>
                <span className="block text-xs text-slate-500">Adds the stock now. Leave unticked to send a purchase order first.</span>
              </span>
            </label>
            {receiveNow && (
              <div className="grid gap-3 rounded-lg bg-slate-50 p-3">
                <div><Label htmlFor="bill">Supplier bill number</Label><Input id="bill" value={billNo} onChange={(e) => setBillNo(e.target.value)} /></div>
                <div>
                  <Label htmlFor="bdate">Bill date</Label>
                  <Input id="bdate" type="date" value={billDate} max={todayIST()} onChange={(e) => setBillDate(e.target.value)} />
                  <p className="mt-1 text-xs text-slate-500">Due {fmtDate(addDays(billDate || todayIST(), creditDays || 0))}</p>
                </div>
                <label className="flex items-center gap-2 text-xs text-slate-600">
                  <input type="checkbox" checked={updateCost} onChange={(e) => setUpdateCost(e.target.checked)} className="size-4" />
                  Update each product&apos;s purchase cost to this bill&apos;s cost
                </label>
              </div>
            )}
            {error && <Alert>{error}</Alert>}
            {receiveNow ? (
              <Button className="h-11 w-full bg-emerald-600 hover:bg-emerald-700" disabled={pending} onClick={() => submit(true)}>
                <PackageCheck className="size-4" /> {pending ? "Saving…" : "Save and add stock"}
              </Button>
            ) : (
              <Button className="h-11 w-full bg-fuchsia-700 hover:bg-fuchsia-800" disabled={pending} onClick={() => submit(false)}>
                <ClipboardList className="size-4" /> {pending ? "Saving…" : initial ? "Save purchase order" : "Create purchase order"}
              </Button>
            )}
            <p className="text-center text-xs text-slate-400">
              {receiveNow ? "Stock is added at the net cost (after discount, before GST)." : "Send the PO to the supplier by PDF or WhatsApp, then receive it when the goods arrive."}
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}

function StepTitle({ n, title }: { n: number; title: string }) {
  return (
    <h2 className="mb-3 flex items-center gap-2 font-semibold">
      <span className="grid size-6 place-items-center rounded-full bg-fuchsia-100 text-xs font-bold text-fuchsia-700">{n}</span>
      {title}
    </h2>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-slate-500">{k}</dt>
      <dd className="font-medium">{v}</dd>
    </div>
  );
}

function ProductSearch({ brandId, brandName, onAdd }: { brandId?: string; brandName: string; onAdd: (p: PurchaseProduct, qty?: number) => void }) {
  const [q, setQ] = useState("");
  const [brand, setBrand] = useState<string | undefined>();   // set = list every product of the brand
  const [results, setResults] = useState<PurchaseProduct[]>([]);
  const [open, setOpen] = useState(false);
  const addRef = useRef(onAdd);
  useEffect(() => { addRef.current = onAdd; }, [onAdd]);

  useEffect(() => {
    if (!brand && q.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      const r = await searchPurchaseProducts(q, brandId, !!brand);
      setResults(r);
      setOpen(true);
      if (!brand && r.length === 1 && /^[0-9]{8,14}$/.test(q.trim())) { addRef.current(r[0]); setQ(""); setOpen(false); }
    }, 200);
    return () => clearTimeout(t);
  }, [q, brand, brandId]);

  return (
    <div className="relative">
      <div className="mb-2 flex flex-wrap gap-2">
        <button type="button" onClick={() => { setBrand(undefined); setOpen(false); }} className={cn("rounded-full border px-3 py-1 text-xs font-medium", !brand ? "border-ink-900 bg-ink-900 text-white" : "border-slate-300")}>Search</button>
        {brandId && (
          <button type="button" onClick={() => setBrand(brandId)} className={cn("rounded-full border px-3 py-1 text-xs font-medium", brand ? "border-fuchsia-600 bg-fuchsia-600 text-white" : "border-slate-300")}>
            All {brandName} products
          </button>
        )}
      </div>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => results.length && setOpen(true)} placeholder="Add product: name, model number or barcode" className="pl-9" />
        </div>
        <BarcodeScanButton onDetected={(code) => setQ(code)} />
      </div>
      {open && results.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-96 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {brand && (
            <li className="flex items-center justify-between border-b border-slate-100 px-3 py-2 text-xs text-slate-500">
              {results.length} products
              <button type="button" className="font-semibold text-fuchsia-700 hover:underline" onClick={() => { results.forEach((p) => onAdd(p, 1)); setOpen(false); }}>
                Add all (qty 1 each)
              </button>
            </li>
          )}
          {results.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => { onAdd(p); if (!brand) { setQ(""); setOpen(false); } }} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-slate-50">
                <span className="min-w-0">
                  <span className="font-medium">{p.name}</span>
                  <span className="block truncate text-xs text-slate-500">{p.brand_name} · {p.sku} · last cost {inr(p.purchase_cost)}</span>
                </span>
                <Badge tone={p.on_hand > 0 ? "green" : "red"}>{fmtQty(p.on_hand)} in stock</Badge>
              </button>
            </li>
          ))}
          <li className="border-t border-slate-100 px-3 py-1.5 text-right">
            <button type="button" className="text-xs text-slate-500 hover:underline" onClick={() => setOpen(false)}>Close</button>
          </li>
        </ul>
      )}
    </div>
  );
}

