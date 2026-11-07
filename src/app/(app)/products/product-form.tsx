"use client";

import { useState } from "react";
import { ImagePlus } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { Input, Label, Select, Textarea, cn } from "@/components/ui";
import { GST_RATES, inr } from "@/lib/format";
import { saveProduct } from "./actions";

type Option = { id: string; name: string };
type BrandOption = Option & { brand_id: string };
type Mode = "inclusive" | "exclusive";
export type ProductRow = {
  id: string;
  name: string;
  brand_id: string;
  sku: string;
  category_id: string | null;
  barcode: string | null;
  hsn_code: string | null;
  unit_code: string;
  purchase_cost: number;
  purchase_cost_mode: Mode;
  distributor_price: number;
  distributor_price_mode: Mode;
  retailer_price: number;
  retailer_price_mode: Mode;
  mrp: number;
  mrp_mode: Mode;
  gst_rate: number;
  min_stock_qty: number;
  default_warehouse_id: string | null;
  rack_code: string | null;
  description: string | null;
  is_active: boolean;
};

// Common rates first; 3% and 40% stay available for the rare cases.
const RATES = [0, 5, 12, 18, 28, ...GST_RATES.filter((r) => ![0, 5, 12, 18, 28].includes(r))];

export function ProductForm({
  product, brands, defaultBrandId, categories, units, warehouses,
}: {
  product?: ProductRow;
  brands: Option[];
  defaultBrandId: string;
  categories: BrandOption[];
  units: { code: string; name: string }[];
  warehouses: BrandOption[];
}) {
  const isNew = !product;
  const [brand, setBrand] = useState(product?.brand_id ?? defaultBrandId);
  const [gst, setGst] = useState(Number(product?.gst_rate ?? 18));
  const [photo, setPhoto] = useState<string | null>(null);
  const cats = categories.filter((c) => c.brand_id === brand);
  const whs = warehouses.filter((w) => w.brand_id === brand);
  const brandName = brands.find((b) => b.id === brand)?.name ?? "";

  return (
    <ActionForm action={saveProduct} submitLabel={isNew ? "Create product" : "Save product"}>
      {product && <input type="hidden" name="id" value={product.id} />}

      <Section title="Basic information">
        <div className="sm:col-span-2">
          <Label htmlFor="name">Product name</Label>
          <Input id="name" name="name" defaultValue={product?.name} required placeholder="e.g. Havoc 65W GaN Charger" />
        </div>
        <div>
          <Label htmlFor="brand_id">Brand</Label>
          <Select id="brand_id" name="brand_id" value={brand} onChange={(e) => setBrand(e.target.value)} required>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
          {!isNew && <p className="mt-1 text-xs text-slate-500">Brand cannot change once the product has stock or orders.</p>}
        </div>
        <div>
          <Label htmlFor="category_id" hint={`${brandName} categories · add more in Brands & categories`}>Category</Label>
          <Select key={brand} id="category_id" name="category_id" required defaultValue={product?.brand_id === brand ? product?.category_id ?? "" : ""}>
            <option value="" disabled>Choose…</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </div>
        <div>
          <Label htmlFor="sku" hint={`unique within ${brandName}`}>SKU / product code</Label>
          <Input id="sku" name="sku" defaultValue={product?.sku} required className="uppercase" />
        </div>
        <div>
          <Label htmlFor="barcode" hint="optional">Barcode</Label>
          <Input id="barcode" name="barcode" defaultValue={product?.barcode ?? ""} inputMode="numeric" />
        </div>
        <div>
          <Label htmlFor="hsn_code" hint="printed on GST invoice">HSN code</Label>
          <Input id="hsn_code" name="hsn_code" defaultValue={product?.hsn_code ?? ""} inputMode="numeric" maxLength={8} />
        </div>
        <div>
          <Label htmlFor="unit_code">Unit</Label>
          <Select id="unit_code" name="unit_code" defaultValue={product?.unit_code ?? "PCS"}>
            {units.map((u) => <option key={u.code} value={u.code}>{u.name} ({u.code})</option>)}
          </Select>
        </div>
        {isNew && (
          <div className="sm:col-span-2">
            <Label htmlFor="photo" hint="optional · under 4 MB · more photos after saving">Product image</Label>
            <label htmlFor="photo" className={cn("flex cursor-pointer items-center gap-4 rounded-xl border-2 border-dashed p-3 transition hover:border-slate-400", photo ? "border-emerald-300 bg-emerald-50/50" : "border-slate-300")}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {photo ? <img src={photo} alt="" className="size-16 rounded-lg object-cover" /> : <span className="grid size-16 place-items-center rounded-lg bg-slate-100"><ImagePlus className="size-6 text-slate-400" /></span>}
              <span className="text-sm text-slate-600">{photo ? "Photo chosen — tap to change" : "Tap to choose a photo (JPG / PNG)"}</span>
            </label>
            <input id="photo" name="photo" type="file" accept="image/*" className="sr-only"
              onChange={(e) => { const f = e.target.files?.[0]; setPhoto(f ? URL.createObjectURL(f) : null); }} />
          </div>
        )}
        <div className="sm:col-span-2">
          <Label htmlFor="description" hint="optional">Description</Label>
          <Textarea id="description" name="description" rows={2} defaultValue={product?.description ?? ""} />
        </div>
      </Section>

      <Section title="Pricing and GST" note="Choose for each price whether it already includes GST — the other amount is worked out for you.">
        <div>
          <Label htmlFor="gst_rate">GST rate</Label>
          <Select id="gst_rate" name="gst_rate" value={String(gst)} onChange={(e) => setGst(Number(e.target.value))}>
            {RATES.map((r) => <option key={r} value={r}>{r}%</option>)}
          </Select>
        </div>
        <div className="hidden sm:block" />
        <PriceField name="purchase_cost" label="Purchase price" value={product?.purchase_cost} mode={product?.purchase_cost_mode ?? "exclusive"} gst={gst} />
        <PriceField name="distributor_price" label="Distributor price" value={product?.distributor_price} mode={product?.distributor_price_mode ?? "exclusive"} gst={gst} optional />
        <PriceField name="retailer_price" label="Retailer price" value={product?.retailer_price} mode={product?.retailer_price_mode ?? "exclusive"} gst={gst} />
        <PriceField name="mrp" label="MRP" value={product?.mrp} mode={product?.mrp_mode ?? "inclusive"} gst={gst} />
      </Section>

      <Section title="Inventory">
        <div>
          <Label htmlFor="default_warehouse_id" hint={`${brandName} warehouses`}>Warehouse</Label>
          <Select key={brand} id="default_warehouse_id" name="default_warehouse_id" defaultValue={product?.brand_id === brand ? product?.default_warehouse_id ?? whs[0]?.id : whs[0]?.id}>
            {whs.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </Select>
        </div>
        <div>
          <Label htmlFor="rack_code" hint="optional, e.g. R2-S3">Rack / shelf</Label>
          <Input id="rack_code" name="rack_code" defaultValue={product?.rack_code ?? ""} className="uppercase" maxLength={30} />
        </div>
        {isNew && (
          <div>
            <Label htmlFor="opening_qty" hint="in the warehouse above">Opening stock quantity</Label>
            <Input id="opening_qty" name="opening_qty" type="number" min={0} step="any" defaultValue={0} />
          </div>
        )}
        <div>
          <Label htmlFor="min_stock_qty" hint="alert at or below">Minimum stock alert</Label>
          <Input id="min_stock_qty" name="min_stock_qty" type="number" min={0} step="any" defaultValue={product?.min_stock_qty ?? 0} />
        </div>
        {!isNew && (
          <div>
            <Label htmlFor="is_active">Status</Label>
            <Select id="is_active" name="is_active" defaultValue={String(product.is_active)}>
              <option value="true">Active — can be sold</option>
              <option value="false">Archived — hidden from orders</option>
            </Select>
          </div>
        )}
      </Section>
    </ActionForm>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <fieldset className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
      <legend className="px-1 text-sm font-semibold text-slate-900">{title}</legend>
      {note && <p className="-mt-1 mb-4 text-xs text-slate-500">{note}</p>}
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

// Price with its GST mode, and the converted amount underneath.
function PriceField({ name, label, value, mode: initialMode, gst, optional }: { name: string; label: string; value?: number; mode: Mode; gst: number; optional?: boolean }) {
  const [amount, setAmount] = useState(String(value ?? 0));
  const [mode, setMode] = useState<Mode>(initialMode);
  const n = Number(amount) || 0;
  const excl = mode === "inclusive" ? n / (1 + gst / 100) : n;
  const incl = mode === "inclusive" ? n : n * (1 + gst / 100);
  return (
    <div>
      <Label htmlFor={name} hint={optional ? "optional" : undefined}>{label} (₹)</Label>
      <div className="flex gap-2">
        <Input id={name} name={name} type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required={!optional} className="tabular min-w-0 flex-1" />
        <Select name={`${name}_mode`} value={mode} onChange={(e) => setMode(e.target.value as Mode)} aria-label={`${label} GST`} className="w-32 shrink-0">
          <option value="exclusive">+ GST</option>
          <option value="inclusive">incl. GST</option>
        </Select>
      </div>
      {n > 0 && (
        <p className="tabular mt-1 text-xs text-slate-500">
          {inr(excl)} excl. GST · GST {inr(incl - excl)} · <b className="text-slate-700">{inr(incl)} incl. GST</b>
        </p>
      )}
    </div>
  );
}
