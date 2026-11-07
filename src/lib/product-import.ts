// Validation of product import rows. Runs in the browser (live preview while the
// user fixes cells) and again on the server before anything is saved.
import { GST_RATES } from "@/lib/format";

export type ImportContext = {
  brandName: string;
  existingSkus: string[];            // lower-case SKUs already in this brand
  units: string[];
  warehouses: string[];              // this brand's warehouse names (lower-case)
  otherBrands: string[];             // names of other brands (lower-case)
};
export type RowCheck = { errors: string[]; warnings: string[]; isUpdate: boolean };

export const num = (v: string | undefined) => {
  const s = (v ?? "").replace(/[₹,\s]|rs\.?/gi, "");
  return s === "" ? null : Number(s);
};
export const yes = (v: string | undefined) => /^(y|yes|true|1|incl|inclusive)$/i.test((v ?? "").trim());

export function checkRows(rows: Record<string, string>[], ctx: ImportContext): RowCheck[] {
  const existing = new Set(ctx.existingSkus);
  const units = new Set(ctx.units.map((u) => u.toUpperCase()));
  const whs = new Set(ctx.warehouses);
  const count = new Map<string, number>();
  for (const r of rows) {
    const k = (r.sku ?? "").trim().toLowerCase();
    if (k) count.set(k, (count.get(k) ?? 0) + 1);
  }

  return rows.map((r) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const sku = (r.sku ?? "").trim();
    const isUpdate = !!sku && existing.has(sku.toLowerCase());

    if (!(r.name ?? "").trim()) errors.push("Product name is missing");
    else if (r.name.trim().length < 2) errors.push("Product name is too short");
    if (!sku) errors.push("SKU is missing");
    if (!isUpdate && !(r.category ?? "").trim()) errors.push("Category is missing (new categories are created automatically)");
    else if (sku.length > 60) errors.push("SKU is longer than 60 characters");
    if (sku && (count.get(sku.toLowerCase()) ?? 0) > 1) errors.push(`SKU ${sku} appears more than once in the file`);

    if (r.brand && r.brand.trim()) {
      const b = r.brand.trim().toLowerCase();
      if (b !== ctx.brandName.toLowerCase()) {
        errors.push(ctx.otherBrands.includes(b) ? `This is a ${r.brand.trim()} product — import it with ${r.brand.trim()} selected` : `Unknown brand "${r.brand.trim()}"`);
      }
    }

    const gst = num(r.gst_rate);
    if (gst === null) { if (!isUpdate) warnings.push("GST % empty — 18% will be used"); }
    else if (Number.isNaN(gst) || !GST_RATES.includes(gst)) errors.push(`GST % must be one of ${GST_RATES.join(", ")}`);

    const prices: [string, string][] = [["purchase_cost", "Purchase price"], ["distributor_price", "Distributor price"], ["retailer_price", "Retailer price"], ["mrp", "MRP"]];
    for (const [k, label] of prices) {
      const v = num(r[k]);
      if (v !== null && (Number.isNaN(v) || v < 0)) errors.push(`${label} must be a number of 0 or more`);
    }
    const rp = num(r.retailer_price), mrp = num(r.mrp), pc = num(r.purchase_cost);
    if (!isUpdate && (rp === null || rp === 0)) warnings.push("Retailer price is empty");
    const rpIncl = rp !== null && gst !== null && !yes(r.retailer_price_incl) ? rp * (1 + (gst || 0) / 100) : rp;
    const mrpIncl = mrp !== null && r.mrp_incl && !yes(r.mrp_incl) && gst !== null ? mrp * (1 + gst / 100) : mrp;
    if (rpIncl !== null && mrpIncl && rpIncl > mrpIncl + 0.5) errors.push("Retailer price is higher than MRP");
    if (pc !== null && rp !== null && pc > 0 && rp > 0 && pc > rp) warnings.push("Purchase price is higher than retailer price");

    if (r.hsn_code && !/^[0-9]{4,8}$/.test(r.hsn_code.trim())) errors.push("HSN must be 4–8 digits");
    const unit = (r.unit_code || "PCS").trim().toUpperCase();
    if (!units.has(unit)) errors.push(`Unknown unit ${unit} (use ${[...units].join(", ")})`);
    if (r.warehouse && r.warehouse.trim() && !whs.has(r.warehouse.trim().toLowerCase())) errors.push(`Warehouse "${r.warehouse.trim()}" is not a ${ctx.brandName} warehouse`);

    const open = num(r.opening_qty), min = num(r.min_stock_qty);
    if (open !== null && (Number.isNaN(open) || open < 0)) errors.push("Opening stock must be 0 or more");
    if (min !== null && (Number.isNaN(min) || min < 0)) errors.push("Minimum stock must be 0 or more");
    if (isUpdate) warnings.push(open && open > 0 ? "Existing product: details will be updated, opening stock ignored (use Stock inward)" : "Existing product: details will be updated");

    return { errors, warnings, isUpdate };
  });
}
