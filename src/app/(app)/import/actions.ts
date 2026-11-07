"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { dbError } from "@/lib/actions";
import { normaliseMobile } from "@/lib/format";
import { getBrandContext } from "@/lib/brand";
import { fetchAll } from "@/lib/reports";
import { checkRows, num, yes, type ImportContext } from "@/lib/product-import";

export type ImportResult = {
  created: number;
  updated: number;
  skipped: number;
  stockRows: number;
  errors: { row: number; message: string }[];
  fatal?: string;
};

const MAX_ROWS = 2000;

// ---------------------------------------------------------------------------
// Products (+ opening stock for new products) — always into ONE brand
// ---------------------------------------------------------------------------

// What the browser needs to validate a file for this brand before importing.
export async function prepareProductImport(brandId: string): Promise<{ ctx?: ImportContext; error?: string }> {
  await requireRole("super_admin", "manager");
  const brands = await getBrandContext();
  const brand = brands.brands.find((b) => b.id === brandId);
  if (!brand) return { error: "You do not have access to this brand." };
  const supabase = await createClient();
  const [skus, units, wh, all] = await Promise.all([
    fetchAll<{ sku: string }>(() => supabase.from("products").select("sku").eq("brand_id", brandId)),
    supabase.from("units").select("code"),
    supabase.from("warehouses").select("name").eq("brand_id", brandId).eq("is_active", true),
    supabase.from("brands").select("name"),
  ]);
  return {
    ctx: {
      brandName: brand.name,
      existingSkus: skus.map((s) => s.sku.toLowerCase()),
      units: (units.data ?? []).map((u) => u.code as string),
      warehouses: (wh.data ?? []).map((w) => (w.name as string).toLowerCase()),
      otherBrands: (all.data ?? []).map((b) => (b.name as string).toLowerCase()).filter((n) => n !== brand.name.toLowerCase()),
    },
  };
}

export async function importProducts(brandId: string, rows: Record<string, string>[]): Promise<ImportResult> {
  const { user } = await requireRole("super_admin", "manager");
  const result: ImportResult = { created: 0, updated: 0, skipped: 0, stockRows: 0, errors: [] };
  if (rows.length > MAX_ROWS) return { ...result, fatal: `Import at most ${MAX_ROWS} rows at a time.` };
  const prep = await prepareProductImport(brandId);
  if (!prep.ctx) return { ...result, fatal: prep.error };

  // Same checks as the preview; rows that still have errors are not saved.
  const checks = checkRows(rows, prep.ctx);

  const supabase = await createClient();
  const [catsRes, whRes, locRes, prodRes] = await Promise.all([
    supabase.from("categories").select("id, name").eq("brand_id", brandId),
    supabase.from("warehouses").select("id, name").eq("brand_id", brandId).eq("is_active", true).order("created_at"),
    supabase.from("warehouse_locations").select("id, warehouse_id, code"),
    fetchAll<{ id: string; sku: string }>(() => supabase.from("products").select("id, sku").eq("brand_id", brandId)),
  ]);
  const cats = new Map((catsRes.data ?? []).map((c) => [c.name.toLowerCase(), c.id as string]));
  const warehouses = new Map((whRes.data ?? []).map((w) => [w.name.toLowerCase(), w.id as string]));
  const defaultWh = whRes.data?.[0]?.id as string | undefined;
  const locations = new Map((locRes.data ?? []).map((l) => [`${l.warehouse_id}:${l.code}`, l.id as string]));
  const existing = new Map(prodRes.map((p) => [p.sku.toLowerCase(), p.id]));

  const ensureCategory = async (name: string) => {
    const key = name.toLowerCase();
    if (cats.has(key)) return cats.get(key)!;
    const { data, error } = await supabase.from("categories").insert({ name, brand_id: brandId }).select("id").single();
    if (error) throw new Error(dbError(error));
    cats.set(key, data.id);
    return data.id as string;
  };

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const line = Number(r.__row) || i + 2;
    if (checks[i].errors.length) {
      result.skipped++;
      result.errors.push({ row: line, message: checks[i].errors.join("; ") });
      continue;
    }
    try {
      const whId = r.warehouse ? warehouses.get(r.warehouse.trim().toLowerCase()) : defaultWh;
      let locationId: string | null = null;
      if (r.rack && whId) {
        const code = r.rack.trim().toUpperCase();
        locationId = locations.get(`${whId}:${code}`) ?? null;
        if (!locationId) {
          const { data, error } = await supabase.from("warehouse_locations").insert({ warehouse_id: whId, code }).select("id").single();
          if (error) throw new Error(dbError(error));
          locationId = data.id;
          locations.set(`${whId}:${code}`, data.id);
        }
      }
      const skuKey = r.sku.trim().toLowerCase();
      const existingId = existing.get(skuKey);
      const row: Record<string, unknown> = {
        name: r.name.trim(),
        brand_id: brandId,
        sku: r.sku.trim(),
        category_id: r.category?.trim() ? await ensureCategory(r.category.trim()) : null,
        barcode: r.barcode?.trim() || null,
        hsn_code: r.hsn_code?.trim() || null,
        unit_code: (r.unit_code || "PCS").trim().toUpperCase(),
        gst_rate: num(r.gst_rate) ?? 18,
        purchase_cost: num(r.purchase_cost) ?? 0,
        distributor_price: num(r.distributor_price) ?? 0,
        retailer_price: num(r.retailer_price) ?? 0,
        mrp: num(r.mrp) ?? 0,
        purchase_cost_mode: yes(r.purchase_cost_incl) ? "inclusive" : "exclusive",
        distributor_price_mode: yes(r.distributor_price_incl) ? "inclusive" : "exclusive",
        retailer_price_mode: yes(r.retailer_price_incl) ? "inclusive" : "exclusive",
        mrp_mode: !r.mrp_incl || yes(r.mrp_incl) ? "inclusive" : "exclusive",
        min_stock_qty: num(r.min_stock_qty) ?? 0,
        default_warehouse_id: whId ?? null,
        default_location_id: locationId,
        description: r.description?.trim() || null,
      };
      if (existingId) {
        // Only overwrite what the file actually has.
        for (const [k, col] of [["category", "category_id"], ["gst_rate", "gst_rate"], ["purchase_cost", "purchase_cost"], ["distributor_price", "distributor_price"], ["retailer_price", "retailer_price"], ["mrp", "mrp"], ["min_stock_qty", "min_stock_qty"], ["hsn_code", "hsn_code"], ["barcode", "barcode"], ["description", "description"], ["unit_code", "unit_code"]] as const) {
          if (!(r[k] ?? "").trim()) delete row[col];
        }
        const { error } = await supabase.from("products").update(row).eq("id", existingId);
        if (error) throw new Error(dbError(error));
        result.updated++;
        continue;
      }
      const { data: created, error } = await supabase.from("products").insert(row).select("id").single();
      if (error) throw new Error(dbError(error));
      existing.set(skuKey, created.id);
      result.created++;

      const opening = num(r.opening_qty) ?? 0;
      if (opening > 0 && whId) {
        const { error: mErr } = await supabase.from("stock_movements").insert({
          product_id: created.id, warehouse_id: whId, location_id: locationId, movement_type: "opening",
          qty: opening, reason: "Opening stock (import)", created_by: user.id,
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
