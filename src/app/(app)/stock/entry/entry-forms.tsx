"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, CircleAlert, PackageOpen, SlidersHorizontal, Trash2 } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { ProductPicker, type PickedProduct } from "@/components/product-picker";
import { IdempotencyKey } from "@/components/idempotency-key";
import { Alert, Button, Card, Input, Label, Select, Textarea, cn } from "@/components/ui";
import { qty as fmtQty } from "@/lib/format";
import { adjustStock, recordMovement, systemStock, transferStock } from "../actions";

type Warehouse = { id: string; name: string };
import type { EntryType } from "./entry-types";
export type { EntryType };

export const ENTRY_TYPES: { key: EntryType; label: string; help: string; icon: typeof ArrowDownToLine; tone: string }[] = [
  { key: "stock_in", label: "Stock inward", help: "Goods received without a purchase order. Goods bought on a purchase order are added automatically when you receive the purchase.", icon: ArrowDownToLine, tone: "emerald" },
  { key: "stock_out", label: "Stock outward", help: "Goods leaving the warehouse for a reason other than a sale (sales are taken out when the invoice is dispatched).", icon: ArrowUpFromLine, tone: "rose" },
  { key: "adjustment", label: "Stock adjustment", help: "Correct the system to the physical stock. Needs a reason and your confirmation.", icon: SlidersHorizontal, tone: "violet" },
  { key: "damage", label: "Damaged", help: "Remove damaged units from sellable stock.", icon: Trash2, tone: "amber" },
  { key: "transfer", label: "Transfer", help: "Move stock between two warehouses of the same brand.", icon: ArrowLeftRight, tone: "sky" },
  { key: "opening", label: "Opening stock", help: "Starting quantity when you begin using the system.", icon: PackageOpen, tone: "slate" },
];
const TONE: Record<string, string> = {
  emerald: "border-emerald-500 bg-emerald-50 text-emerald-800", rose: "border-rose-500 bg-rose-50 text-rose-800",
  violet: "border-violet-500 bg-violet-50 text-violet-800", amber: "border-amber-500 bg-amber-50 text-amber-900",
  sky: "border-sky-500 bg-sky-50 text-sky-800", slate: "border-slate-500 bg-slate-100 text-slate-800",
};
const OUT_REASONS = ["Sample to retailer", "Internal use", "Promotion / display", "Sent for repair / replacement", "Lost / missing", "Other"];
const ADJ_REASONS = ["Count difference", "Data entry mistake", "Found extra stock", "Damaged found during count", "Theft / missing", "Other"];

const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

export function EntryForms({
  brandId, brandName, warehouses, initialType, allowed, canSetCost, today,
}: {
  brandId: string; brandName: string; warehouses: Warehouse[]; initialType: EntryType; allowed: EntryType[]; canSetCost: boolean; today: string;
}) {
  const [type, setType] = useState<EntryType>(initialType);
  const [formKey, setFormKey] = useState(newId());   // new id after each save → protects against double submit
  const current = ENTRY_TYPES.find((t) => t.key === type)!;
  const defaultWh = warehouses[0]?.id;
  const switchTo = (t: EntryType) => { setType(t); setFormKey(newId()); };

  if (!warehouses.length) {
    return <Alert tone="amber">{brandName} has no active warehouse yet. Add one under Warehouses.</Alert>;
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {ENTRY_TYPES.filter((t) => allowed.includes(t.key)).map((t) => (
          <button key={t.key} type="button" onClick={() => switchTo(t.key)}
            className={cn("flex items-center gap-2 rounded-xl border-2 px-3 py-2.5 text-left text-sm font-semibold transition",
              t.key === type ? TONE[t.tone] : "border-transparent bg-white text-slate-700 ring-1 ring-slate-200 hover:ring-slate-300")}>
            <t.icon className="size-4 shrink-0" /> {t.label}
          </button>
        ))}
      </div>
      <Card className="p-5">
        <p className="mb-4 text-sm text-slate-500">{current.help}</p>

        {type === "adjustment" ? (
          <AdjustmentForm key={formKey} brandId={brandId} warehouses={warehouses} onDone={() => setFormKey(newId())} />
        ) : type === "transfer" ? (
          warehouses.length < 2 ? (
            <Alert tone="amber">{brandName} has only one warehouse. Add a second {brandName} warehouse to transfer stock. Stock can never move to another brand&apos;s warehouse.</Alert>
          ) : (
            <ActionForm key={formKey} action={transferStock} submitLabel="Record transfer">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2"><Label>Product</Label><ProductPicker brandId={brandId} /></div>
                <div>
                  <Label htmlFor="from_warehouse">From</Label>
                  <Select id="from_warehouse" name="from_warehouse" defaultValue={defaultWh}>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</Select>
                </div>
                <div>
                  <Label htmlFor="to_warehouse">To</Label>
                  <Select id="to_warehouse" name="to_warehouse" defaultValue={warehouses[1]?.id}>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</Select>
                </div>
                <div><Label htmlFor="qty">Quantity</Label><Input id="qty" name="qty" type="number" min={0} step="any" required /></div>
                <div><Label htmlFor="reason" hint="optional">Note</Label><Input id="reason" name="reason" /></div>
              </div>
            </ActionForm>
          )
        ) : (
          <ActionForm key={formKey} action={recordMovement} submitLabel={`Save ${current.label.toLowerCase()}`}>
            <input type="hidden" name="type" value={type} />
            <IdempotencyKey />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2"><Label>Product</Label><ProductPicker brandId={brandId} /></div>
              <div>
                <Label htmlFor="warehouse_id">Warehouse</Label>
                <Select id="warehouse_id" name="warehouse_id" defaultValue={defaultWh}>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</Select>
              </div>
              <div><Label htmlFor="movement_date">Date</Label><Input id="movement_date" name="movement_date" type="date" defaultValue={today} max={today} /></div>
              <div>
                <Label htmlFor="qty">{type === "stock_in" ? "Quantity received" : "Quantity"}</Label>
                <Input id="qty" name="qty" type="number" min={0} step="any" required className="tabular text-lg font-semibold" />
              </div>
              {canSetCost && (type === "stock_in" || type === "opening") ? (
                <div>
                  <Label htmlFor="unit_cost" hint="excl. GST, optional">Cost per unit (₹)</Label>
                  <Input id="unit_cost" name="unit_cost" type="number" min={0} step="0.01" placeholder="Product cost" />
                </div>
              ) : <div className="hidden sm:block" />}

              {type === "stock_in" && (
                <>
                  <div><Label htmlFor="reference_no" hint="optional">Supplier / reference</Label><Input id="reference_no" name="reference_no" placeholder="e.g. supplier name" /></div>
                  <div><Label htmlFor="bill_no" hint="optional">Purchase bill number</Label><Input id="bill_no" name="bill_no" /></div>
                </>
              )}
              {(type === "stock_out" || type === "damage") && (
                <>
                  <div>
                    <Label htmlFor="reason">Reason</Label>
                    {type === "stock_out" ? (
                      <Select id="reason" name="reason" required defaultValue="">
                        <option value="" disabled>Choose…</option>
                        {OUT_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                      </Select>
                    ) : <Input id="reason" name="reason" required placeholder="e.g. broken in transit" />}
                  </div>
                  <div><Label htmlFor="reference_no" hint="optional">Reference number</Label><Input id="reference_no" name="reference_no" /></div>
                </>
              )}
              <div className="sm:col-span-2"><Label htmlFor="notes" hint="optional">Notes</Label><Textarea id="notes" name="notes" rows={2} /></div>
            </div>
          </ActionForm>
        )}
      </Card>
    </div>
  );
}

// Current system stock → physical stock → difference → reason → confirm.
function AdjustmentForm({ brandId, warehouses, onDone }: { brandId: string; warehouses: Warehouse[]; onDone: () => void }) {
  const router = useRouter();
  const [product, setProduct] = useState<PickedProduct | null>(null);
  const [wh, setWh] = useState(warehouses[0]?.id ?? "");
  const [system, setSystem] = useState<number | null>(null);
  const [physical, setPhysical] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [clientUuid] = useState(newId());
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!product || !wh) return;
    let live = true;
    systemStock(product.id, wh).then((n) => { if (live) setSystem(n); });
    return () => { live = false; setSystem(null); };
  }, [product, wh]);

  const phys = physical.trim() === "" ? null : Number(physical);
  const diff = phys !== null && system !== null ? phys - system : null;

  if (done) {
    return (
      <div className="space-y-4">
        <Alert tone="green">{done}</Alert>
        <Button variant="secondary" onClick={onDone}>Adjust another product</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><Label>Product</Label><ProductPicker brandId={brandId} onChange={(p) => { setProduct(p); setConfirming(false); }} /></div>
        <div>
          <Label htmlFor="adj_wh">Warehouse</Label>
          <Select id="adj_wh" value={wh} onChange={(e) => { setWh(e.target.value); setConfirming(false); }}>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</Select>
        </div>
        <div className="hidden sm:block" />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
          <div className="text-xs text-slate-500">Current system stock</div>
          <div className="tabular mt-1 text-2xl font-bold">{product ? (system === null ? "…" : fmtQty(system)) : "—"}</div>
        </div>
        <div className="rounded-xl bg-white p-3 ring-2 ring-violet-300">
          <label htmlFor="adj_phys" className="text-xs text-slate-500">Actual physical stock</label>
          <input id="adj_phys" type="number" min={0} step="any" value={physical} onChange={(e) => { setPhysical(e.target.value); setConfirming(false); }}
            className="tabular mt-1 w-full bg-transparent text-2xl font-bold outline-none" placeholder="0" disabled={!product} />
        </div>
        <div className={cn("rounded-xl p-3 ring-1", diff === null ? "bg-slate-50 ring-slate-200" : diff < 0 ? "bg-red-50 ring-red-200" : diff > 0 ? "bg-emerald-50 ring-emerald-200" : "bg-slate-50 ring-slate-200")}>
          <div className="text-xs text-slate-500">Difference</div>
          <div className={cn("tabular mt-1 text-2xl font-bold", diff !== null && diff < 0 && "text-red-700", diff !== null && diff > 0 && "text-emerald-700")}>
            {diff === null ? "—" : `${diff > 0 ? "+" : ""}${fmtQty(diff)}`}
          </div>
          {diff !== null && diff !== 0 && <div className="text-[11px] text-slate-500">{diff < 0 ? "shortage" : "extra stock"}</div>}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="adj_reason">Reason for adjustment</Label>
          <Select id="adj_reason" value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="" disabled>Choose…</option>
            {ADJ_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </Select>
        </div>
        <div><Label htmlFor="adj_notes" hint="optional">Notes</Label><Input id="adj_notes" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
      </div>

      {error && <Alert>{error}</Alert>}

      {!confirming ? (
        <Button disabled={!product || diff === null || diff === 0 || !reason} onClick={() => { setError(null); setConfirming(true); }}>
          Review adjustment
        </Button>
      ) : (
        <div className="rounded-xl border-2 border-violet-300 bg-violet-50 p-4">
          <div className="mb-3 flex items-start gap-2 text-sm text-violet-900">
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
            <span>
              <b>{product?.name}</b>: system {fmtQty(system ?? 0)} → physical {fmtQty(phys ?? 0)}. This posts an adjustment of{" "}
              <b>{diff! > 0 ? "+" : ""}{fmtQty(diff ?? 0)}</b> with the reason &ldquo;{reason}&rdquo;. It is recorded in the movement history with your name.
            </span>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setConfirming(false)}>Back</Button>
            <Button disabled={pending} onClick={() => start(async () => {
              const r = await adjustStock({ productId: product!.id, warehouseId: wh, physical: phys!, reason, notes, clientUuid });
              if (r.error) { setError(r.error); setConfirming(false); return; }
              setDone(`Adjusted ${product!.name} by ${r.diff! > 0 ? "+" : ""}${fmtQty(r.diff!)}. Stock is now ${fmtQty(phys!)}.`);
              router.refresh();
            })}>{pending ? "Saving…" : "Confirm adjustment"}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
