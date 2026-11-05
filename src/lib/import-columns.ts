// Column definitions shared by the Excel templates (browser) and the import
// actions (server). Header matching ignores case, spaces and punctuation.

export type ImportKind = "products" | "retailers";

export type ColumnDef = { key: string; header: string; required?: boolean; example: string | number; aliases?: string[] };

export const PRODUCT_COLUMNS: ColumnDef[] = [
  { key: "name", header: "Product name", required: true, example: "20000mAh Power Bank 22.5W" },
  { key: "brand", header: "Brand", required: true, example: "CONQRETE" },
  { key: "sku", header: "Model / SKU", required: true, example: "CQ-PB20K", aliases: ["model", "model number", "sku"] },
  { key: "category", header: "Category", example: "Power Banks" },
  { key: "barcode", header: "Barcode", example: "8901234567890" },
  { key: "hsn_code", header: "HSN", example: "85076000", aliases: ["hsn code"] },
  { key: "unit_code", header: "Unit", example: "PCS" },
  { key: "gst_rate", header: "GST %", example: 18, aliases: ["gst", "gst rate"] },
  { key: "purchase_cost", header: "Purchase cost", example: 900 },
  { key: "purchase_cost_incl", header: "Purchase cost incl GST (Y/N)", example: "N" },
  { key: "retailer_price", header: "Retailer price", example: 1199, aliases: ["retailer selling price", "selling price"] },
  { key: "retailer_price_incl", header: "Retailer price incl GST (Y/N)", example: "N" },
  { key: "mrp", header: "MRP", example: 1999 },
  { key: "mrp_incl", header: "MRP incl GST (Y/N)", example: "Y" },
  { key: "min_stock_qty", header: "Minimum stock", example: 10, aliases: ["min stock", "minimum stock alert"] },
  { key: "warehouse", header: "Warehouse", example: "Main Warehouse" },
  { key: "rack", header: "Rack / shelf", example: "R1-S2", aliases: ["rack", "shelf"] },
  { key: "opening_qty", header: "Opening stock", example: 50, aliases: ["opening qty", "stock"] },
  { key: "description", header: "Description", example: "" },
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
