"use client";

import { ActionForm } from "@/components/action-form";
import { Input, Label, Select, Textarea } from "@/components/ui";
import { GST_RATES } from "@/lib/format";
import { saveProduct } from "./actions";

type Option = { id: string; name: string };
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
  purchase_cost_mode: "inclusive" | "exclusive";
  retailer_price: number;
  retailer_price_mode: "inclusive" | "exclusive";
  mrp: number;
  mrp_mode: "inclusive" | "exclusive";
  gst_rate: number;
  min_stock_qty: number;
  default_warehouse_id: string | null;
  rack_code: string | null;
  description: string | null;
  is_active: boolean;
};

export function ProductForm({
  product,
  brands,
  categories,
  units,
  warehouses,
}: {
  product?: ProductRow;
  brands: Option[];
  categories: Option[];
  units: { code: string; name: string }[];
  warehouses: Option[];
}) {
  const isNew = !product;

  return (
    <ActionForm action={saveProduct} submitLabel={isNew ? "Create product" : "Save product"}>
      {product && <input type="hidden" name="id" value={product.id} />}

      <Section title="Product">
        <div className="sm:col-span-2">
          <Label htmlFor="name">Product name</Label>
          <Input id="name" name="name" defaultValue={product?.name} required placeholder="e.g. 20000mAh Power Bank 22.5W" />
        </div>
        <div>
          <Label htmlFor="brand_id">Brand</Label>
          <Select id="brand_id" name="brand_id" defaultValue={product?.brand_id ?? brands[0]?.id} required>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="category_id">Category</Label>
          <Select id="category_id" name="category_id" defaultValue={product?.category_id ?? ""}>
            <option value="">—</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="sku">Model number / SKU</Label>
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
            {units.map((u) => (
              <option key={u.code} value={u.code}>{u.name} ({u.code})</option>
            ))}
          </Select>
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="description" hint="optional">Description</Label>
          <Textarea id="description" name="description" rows={3} defaultValue={product?.description ?? ""} />
        </div>
      </Section>

      <Section title="Prices and GST" note="For each price, choose whether it already includes GST.">
        <div>
          <Label htmlFor="gst_rate">GST rate</Label>
          <Select id="gst_rate" name="gst_rate" defaultValue={String(product?.gst_rate ?? 18)}>
            {GST_RATES.map((r) => (
              <option key={r} value={r}>{r}%</option>
            ))}
          </Select>
        </div>
        <div className="hidden sm:block" />
        <PriceField name="purchase_cost" label="Purchase cost" value={product?.purchase_cost} mode={product?.purchase_cost_mode ?? "exclusive"} />
        <PriceField name="retailer_price" label="Retailer selling price" value={product?.retailer_price} mode={product?.retailer_price_mode ?? "exclusive"} />
        <PriceField name="mrp" label="MRP" value={product?.mrp} mode={product?.mrp_mode ?? "inclusive"} />
      </Section>

      <Section title="Stock">
        <div>
          <Label htmlFor="default_warehouse_id">Warehouse</Label>
          <Select id="default_warehouse_id" name="default_warehouse_id" defaultValue={product?.default_warehouse_id ?? warehouses[0]?.id}>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="rack_code" hint="e.g. R2-S3">Rack / shelf</Label>
          <Input id="rack_code" name="rack_code" defaultValue={product?.rack_code ?? ""} className="uppercase" maxLength={30} />
        </div>
        <div>
          <Label htmlFor="min_stock_qty" hint="alert at or below">Minimum stock</Label>
          <Input id="min_stock_qty" name="min_stock_qty" type="number" min={0} step="any" defaultValue={product?.min_stock_qty ?? 0} />
        </div>
        {isNew ? (
          <div>
            <Label htmlFor="opening_qty" hint="in the warehouse above">Opening stock</Label>
            <Input id="opening_qty" name="opening_qty" type="number" min={0} step="any" defaultValue={0} />
          </div>
        ) : (
          <div>
            <Label htmlFor="is_active">Status</Label>
            <Select id="is_active" name="is_active" defaultValue={String(product.is_active)}>
              <option value="true">Active — can be sold</option>
              <option value="false">Inactive — hidden from orders</option>
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

function PriceField({ name, label, value, mode }: { name: string; label: string; value?: number; mode: string }) {
  return (
    <div>
      <Label htmlFor={name}>{label} (₹)</Label>
      <div className="flex gap-2">
        <Input id={name} name={name} type="number" min={0} step="0.01" defaultValue={value ?? 0} required className="tabular" />
        <Select name={`${name}_mode`} defaultValue={mode} aria-label={`${label} GST`} className="w-36 shrink-0">
          <option value="exclusive">+ GST</option>
          <option value="inclusive">incl. GST</option>
        </Select>
      </div>
    </div>
  );
}
