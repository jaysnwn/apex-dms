// Column definitions shared by the Excel templates (browser) and the import
// actions (server). Header matching ignores case, spaces and punctuation.

export type ImportKind = "products" | "retailers";

export type ColumnDef = { key: string; header: string; required?: boolean; example: string | number; aliases?: string[] };

export const PRODUCT_COLUMNS: ColumnDef[] = [
  { key: "name", header: "Product name", required: true, example: "Havoc 65W GaN Charger", aliases: ["product", "item", "item name", "name", "description of goods"] },
  { key: "sku", header: "SKU / Product code", required: true, example: "CQ-HV65", aliases: ["model", "model number", "model no", "sku", "product code", "item code", "code", "model sku"] },
  { key: "category", header: "Category", example: "Chargers & Adapters", aliases: ["group", "product category", "type"] },
  { key: "hsn_code", header: "HSN", example: "85044030", aliases: ["hsn code", "hsn sac", "hsnsac"] },
  { key: "unit_code", header: "Unit", example: "PCS", aliases: ["uom", "units"] },
  { key: "gst_rate", header: "GST %", example: 18, aliases: ["gst", "gst rate", "tax", "tax rate", "gst percent"] },
  { key: "purchase_cost", header: "Purchase price", example: 650, aliases: ["purchase cost", "cost", "cost price", "buying price", "landing price"] },
  { key: "purchase_cost_incl", header: "Purchase price incl GST (Y/N)", example: "N", aliases: ["purchase incl gst", "purchase cost incl gst yn"] },
  { key: "distributor_price", header: "Distributor price", example: 760, aliases: ["dp", "dealer price", "distributor rate"] },
  { key: "distributor_price_incl", header: "Distributor price incl GST (Y/N)", example: "N" },
  { key: "retailer_price", header: "Retailer price", example: 899, aliases: ["retailer selling price", "selling price", "rate", "sale price", "rlp", "retail price"] },
  { key: "retailer_price_incl", header: "Retailer price incl GST (Y/N)", example: "N" },
  { key: "mrp", header: "MRP", example: 1599, aliases: ["m r p", "max retail price"] },
  { key: "mrp_incl", header: "MRP incl GST (Y/N)", example: "Y" },
  { key: "opening_qty", header: "Opening stock", example: 50, aliases: ["opening qty", "stock", "qty", "quantity", "opening quantity"] },
  { key: "min_stock_qty", header: "Minimum stock alert", example: 10, aliases: ["min stock", "minimum stock", "reorder level", "min qty"] },
  { key: "warehouse", header: "Warehouse", example: "", aliases: ["godown", "location"] },
  { key: "rack", header: "Rack / shelf", example: "R1-S2", aliases: ["rack", "shelf", "bin"] },
  { key: "barcode", header: "Barcode", example: "", aliases: ["ean", "upc"] },
  { key: "description", header: "Description", example: "", aliases: ["details", "notes"] },
  { key: "brand", header: "Brand", example: "", aliases: ["make"] },
];

export const RETAILER_COLUMNS: ColumnDef[] = [
  { key: "shop_name", header: "Shop name", required: true, example: "Shree Mobile Point" },
  { key: "owner_name", header: "Owner name", example: "Ramesh Patil" },
  { key: "mobile", header: "Mobile", required: true, example: "9822000001", aliases: ["mobile number", "phone"] },
  { key: "alt_mobile", header: "Alternate mobile", example: "" },
  { key: "gstin", header: "GSTIN", example: "27ABCDE1234F1Z5" },
  { key: "billing_address", header: "Billing address", example: "Main Road, Near Bus Stand", aliases: ["address"] },
  { key: "billing_city", header: "City", example: "Sangamner" },
  { key: "billing_pincode", header: "PIN code", example: "422605", aliases: ["pincode", "pin"] },
  { key: "billing_state_code", header: "State code", example: "27" },
  { key: "delivery_address", header: "Delivery address", example: "" },
  { key: "salesman", header: "Salesman (email)", example: "", aliases: ["salesman", "salesman email"] },
  { key: "route", header: "Route", example: "Sangamner City" },
  { key: "credit_days", header: "Credit days", example: 15, aliases: ["credit period"] },
  { key: "credit_limit", header: "Credit limit", example: 50000 },
  { key: "notes", header: "Notes", example: "" },
];

export const COLUMNS: Record<ImportKind, ColumnDef[]> = { products: PRODUCT_COLUMNS, retailers: RETAILER_COLUMNS };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

// Best guess of which file column holds each field: exact header / alias first,
// then a header that contains the alias (e.g. "Retailer Price (Rs)").
export function guessMapping(defs: ColumnDef[], fileHeaders: string[]): Record<string, number> {
  const heads = fileHeaders.map((h) => norm(String(h ?? "").replace(/\s*\*\s*$/, "")));
  const used = new Set<number>();
  const map: Record<string, number> = {};
  for (const pass of ["exact", "contains"] as const) {
    for (const d of defs) {
      if (map[d.key] !== undefined) continue;
      const names = [d.header, d.key, ...(d.aliases ?? [])].map(norm).filter((n) => n.length >= 2);
      const i = heads.findIndex((h, idx) => !used.has(idx) && h && (pass === "exact" ? names.includes(h) : names.some((n) => n.length >= 3 && (h.includes(n) || n.includes(h)))));
      if (i >= 0) { map[d.key] = i; used.add(i); }
    }
  }
  return map;
}

// Map spreadsheet rows (first row = headers) to objects keyed by column key.
export function rowsToRecords(kind: ImportKind, sheet: unknown[][]) {
  const defs = COLUMNS[kind];
  const [headerRow, ...body] = sheet;
  const headers = (headerRow ?? []).map((h) => norm(String(h ?? "")));
  const index = new Map<string, number>();
  for (const d of defs) {
    const names = [d.header, d.key, ...(d.aliases ?? [])].map(norm);
    const i = headers.findIndex((h) => names.includes(h));
    if (i >= 0) index.set(d.key, i);
  }
  const missing = defs.filter((d) => d.required && !index.has(d.key)).map((d) => d.header);
  const records = body
    .filter((r) => r.some((c) => c !== null && c !== undefined && String(c).trim() !== ""))
    .map((r) => {
      const o: Record<string, string> = {};
      for (const [key, i] of index) {
        const v = r[i];
        o[key] = v === null || v === undefined ? "" : String(v).trim();
      }
      return o;
    });
  return { records, missing };
}

// Minimal CSV parser (quoted fields, commas, newlines).
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}
