"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { dbError } from "@/lib/actions";
import { GST_RATES, normaliseMobile } from "@/lib/format";

export type ImportResult = {
  created: number;
  updated: number;
  skipped: number;
  stockRows: number;
  errors: { row: number; message: string }[];
  fatal?: string;
};

const MAX_ROWS = 2000;
const yes = (v: string | undefined) => /^(y|yes|true|1|incl|inclusive)$/i.test((v ?? "").trim());
const num = (v: string | undefined) => {
  const s = (v ?? "").replace(/[₹,\s]/g, "");
  return s === "" ? null : Number(s);
};

// ---------------------------------------------------------------------------
// Products (+ opening stock for new products)
// ---------------------------------------------------------------------------
export async function importProducts(rows: Record<string, string>[]): Promise<ImportResult> {
  const { user } = await requireRole("super_admin", "manager");
  const result: ImportResult = { created: 0, updated: 0, skipped: 0, stockRows: 0, errors: [] };
  if (rows.length > MAX_ROWS) return { ...result, fatal: `Import at most ${MAX_ROWS} rows at a time.` };

  const supabase = await createClient();
  const [brandsRes, catsRes, unitsRes, whRes, locRes, prodRes] = await Promise.all([
    supabase.from("brands").select("id, name"),
    supabase.from("categories").select("id, name"),
    supabase.from("units").select("code"),
    supabase.from("warehouses").select("id, name").eq("is_active", true).order("name"),
    supabase.from("warehouse_locations").select("id, warehouse_id, code"),
    supabase.from("products").select("id, sku"),
  ]);
  const brands = new Map((brandsRes.data ?? []).map((b) => [b.name.toLowerCase(), b.id as string]));
  const cats = new Map((catsRes.data ?? []).map((c) => [c.name.toLowerCase(), c.id as string]));
  const units = new Set((unitsRes.data ?? []).map((u) => u.code as string));
  const warehouses = new Map((whRes.data ?? []).map((w) => [w.name.toLowerCase(), w.id as string]));
  const defaultWh = (whRes.data ?? []).find((w) => w.name === "Main Warehouse")?.id ?? whRes.data?.[0]?.id;
  const locations = new Map((locRes.data ?? []).map((l) => [`${l.warehouse_id}:${l.code}`, l.id as string]));
  const existing = new Map((prodRes.data ?? []).map((p) => [p.sku.toLowerCase(), p.id as string]));

  const ensure = async (table: "brands" | "categories", map: Map<string, string>, name: string) => {
    const key = name.toLowerCase();
    if (map.has(key)) return map.get(key)!;
    const { data, error } = await supabase.from(table).insert({ name }).select("id").single();
    if (error) throw new Error(dbError(error));
    map.set(key, data.id);
    return data.id as string;
  };

  const seen = new Set<string>();
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const line = i + 2; // spreadsheet row number (header is row 1)
    try {
      if (!r.name || !r.brand || !r.sku) throw new Error("Product name, Brand and Model / SKU are required");
      const skuKey = r.sku.toLowerCase();
      if (seen.has(skuKey)) throw new Error(`Model / SKU ${r.sku} appears twice in the file`);
      seen.add(skuKey);

      const gst = num(r.gst_rate) ?? 18;
      if (!GST_RATES.includes(gst)) throw new Error(`GST % must be one of ${GST_RATES.join(", ")}`);
      const unit = (r.unit_code || "PCS").toUpperCase();
      if (!units.has(unit)) throw new Error(`Unknown unit ${unit} (use ${[...units].join(", ")})`);
      if (r.hsn_code && !/^[0-9]{4,8}$/.test(r.hsn_code)) throw new Error("HSN must be 4–8 digits");
      const prices = { purchase_cost: num(r.purchase_cost) ?? 0, retailer_price: num(r.retailer_price) ?? 0, mrp: num(r.mrp) ?? 0 };
      if (Object.values(prices).some((p) => !Number.isFinite(p) || p < 0)) throw new Error("Prices must be numbers of 0 or more");

      const whId = r.warehouse ? warehouses.get(r.warehouse.toLowerCase()) : defaultWh;
      if (r.warehouse && !whId) throw new Error(`Warehouse "${r.warehouse}" not found`);

      let locationId: string | null = null;
      if (r.rack && whId) {
        const code = r.rack.toUpperCase();
        locationId = locations.get(`${whId}:${code}`) ?? null;
        if (!locationId) {
          const { data, error } = await supabase.from("warehouse_locations").insert({ warehouse_id: whId, code }).select("id").single();
          if (error) throw new Error(dbError(error));
          locationId = data.id;
          locations.set(`${whId}:${code}`, data.id);
        }
      }

      const row = {
        name: r.name,
        brand_id: await ensure("brands", brands, r.brand),
        sku: r.sku,
        category_id: r.category ? await ensure("categories", cats, r.category) : null,
        barcode: r.barcode || null,
        hsn_code: r.hsn_code || null,
        unit_code: unit,
        gst_rate: gst,
        ...prices,
        purchase_cost_mode: yes(r.purchase_cost_incl) ? "inclusive" : "exclusive",
        retailer_price_mode: yes(r.retailer_price_incl) ? "inclusive" : "exclusive",
        mrp_mode: r.mrp_incl === "" || r.mrp_incl === undefined || yes(r.mrp_incl) ? "inclusive" : "exclusive",
        min_stock_qty: num(r.min_stock_qty) ?? 0,
        default_warehouse_id: whId ?? null,
        default_location_id: locationId,
        description: r.description || null,
      };

      const existingId = existing.get(skuKey);
      if (existingId) {
        const { error } = await supabase.from("products").update(row).eq("id", existingId);
        if (error) throw new Error(dbError(error));
        result.updated++;
        if ((num(r.opening_qty) ?? 0) > 0) result.errors.push({ row: line, message: "Product updated; opening stock ignored for existing products (use Stock entry)." });
        continue;
      }

      const { data: created, error } = await supabase.from("products").insert(row).select("id").single();
      if (error) throw new Error(dbError(error));
      existing.set(skuKey, created.id);
      result.created++;

      const opening = num(r.opening_qty) ?? 0;
      if (opening > 0 && whId) {
        const { error: mErr } = await supabase.from("stock_movements").insert({
          product_id: created.id,
          warehouse_id: whId,
          location_id: locationId,
          movement_type: "opening",
          qty: opening,
          reason: "Opening stock (import)",
          created_by: user.id,
        });
        if (mErr) result.errors.push({ row: line, message: `Created, but opening stock failed: ${dbError(mErr)}` });
        else result.stockRows++;
      }
    } catch (e) {
      result.skipped++;
      result.errors.push({ row: line, message: e instanceof Error ? e.message : "Could not import" });
    }
  }

  revalidatePath("/products");
  revalidatePath("/stock");
  return result;
}

// ---------------------------------------------------------------------------
// Retailers
// ---------------------------------------------------------------------------
export async function importRetailers(rows: Record<string, string>[]): Promise<ImportResult> {
  await requireRole("super_admin", "manager");
  const result: ImportResult = { created: 0, updated: 0, skipped: 0, stockRows: 0, errors: [] };
  if (rows.length > MAX_ROWS) return { ...result, fatal: `Import at most ${MAX_ROWS} rows at a time.` };

  const supabase = await createClient();
  const [existingRes, routesRes, salesRes] = await Promise.all([
    supabase.from("retailers").select("mobile, gstin"),
    supabase.from("routes").select("id, name"),
    supabase.from("profiles").select("id, email, full_name").eq("role", "salesman"),
  ]);
  const mobiles = new Set((existingRes.data ?? []).map((r) => r.mobile as string));
  const gstins = new Set((existingRes.data ?? []).map((r) => r.gstin as string).filter(Boolean));
  const routes = new Map((routesRes.data ?? []).map((r) => [r.name.toLowerCase(), r.id as string]));
  const salesmen = new Map<string, string>();
  for (const s of salesRes.data ?? []) {
    if (s.email) salesmen.set(String(s.email).toLowerCase(), s.id);
    if (s.full_name) salesmen.set(String(s.full_name).toLowerCase(), s.id);
  }

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const line = i + 2;
    try {
      if (!r.shop_name) throw new Error("Shop name is required");
      const mobile = normaliseMobile(r.mobile ?? "");
      if (!/^[6-9][0-9]{9}$/.test(mobile)) throw new Error(`Mobile "${r.mobile}" is not a valid 10-digit number`);
      if (mobiles.has(mobile)) { result.skipped++; result.errors.push({ row: line, message: `Skipped: mobile ${mobile} already exists` }); continue; }
      const gstin = (r.gstin ?? "").toUpperCase().replace(/\s/g, "") || null;
      if (gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin)) throw new Error(`GSTIN "${r.gstin}" is not valid`);
      if (gstin && gstins.has(gstin)) { result.skipped++; result.errors.push({ row: line, message: `Skipped: GSTIN ${gstin} already exists` }); continue; }
      const alt = r.alt_mobile ? normaliseMobile(r.alt_mobile) : null;
      if (alt && !/^[6-9][0-9]{9}$/.test(alt)) throw new Error("Alternate mobile is not valid");
      if (r.billing_pincode && !/^[1-9][0-9]{5}$/.test(r.billing_pincode)) throw new Error("PIN code must be 6 digits");

      let routeId: string | null = null;
      if (r.route) {
        routeId = routes.get(r.route.toLowerCase()) ?? null;
        if (!routeId) {
          const { data, error } = await supabase.from("routes").insert({ name: r.route }).select("id").single();
          if (error) throw new Error(dbError(error));
          routeId = data.id;
          routes.set(r.route.toLowerCase(), data.id);
        }
      }
      const salesmanId = r.salesman ? salesmen.get(r.salesman.toLowerCase()) : undefined;
      if (r.salesman && !salesmanId) throw new Error(`Salesman "${r.salesman}" not found (use their login email)`);

      const creditDays = num(r.credit_days) ?? 15;
      const creditLimit = num(r.credit_limit) ?? 0;
      if (!Number.isInteger(creditDays) || creditDays < 0 || creditDays > 365) throw new Error("Credit days must be 0–365");
      if (!Number.isFinite(creditLimit) || creditLimit < 0) throw new Error("Credit limit must be 0 or more");

      const { error } = await supabase.from("retailers").insert({
        shop_name: r.shop_name,
        owner_name: r.owner_name || null,
        mobile,
        alt_mobile: alt,
        gstin,
        billing_address: r.billing_address || null,
        billing_city: r.billing_city || null,
        billing_pincode: r.billing_pincode || null,
        billing_state_code: /^[0-9]{2}$/.test(r.billing_state_code ?? "") ? r.billing_state_code : "27",
        delivery_address: r.delivery_address || null,
        route_id: routeId,
        salesman_id: salesmanId ?? null,
        credit_days: creditDays,
        credit_limit: creditLimit,
        notes: r.notes || null,
      });
      if (error) throw new Error(dbError(error));
      mobiles.add(mobile);
      if (gstin) gstins.add(gstin);
      result.created++;
    } catch (e) {
      result.skipped++;
      result.errors.push({ row: line, message: e instanceof Error ? e.message : "Could not import" });
    }
  }

  revalidatePath("/retailers");
  return result;
}
