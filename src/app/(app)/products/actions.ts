"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { dbError, formObject, zodMessage } from "@/lib/actions";
import type { FormResult } from "@/components/action-form";

const money = z.coerce.number({ message: "Enter a number" }).min(0, "Cannot be negative");
const mode = z.enum(["inclusive", "exclusive"]);

const productSchema = z
  .object({
    id: z.string().uuid().optional(),
    name: z.string().min(2, "Enter the product name"),
    brand_id: z.string().uuid("Choose a brand"),
    sku: z.string().min(1, "Enter the model number / SKU").max(60),
    category_id: z.string().uuid().optional(),
    barcode: z.string().max(64).optional(),
    hsn_code: z.string().regex(/^([0-9]{4,8})?$/, "HSN code is 4–8 digits").optional(),
    unit_code: z.string().min(1),
    purchase_cost: money,
    purchase_cost_mode: mode,
    retailer_price: money,
    retailer_price_mode: mode,
    mrp: money,
    mrp_mode: mode,
    gst_rate: z.coerce.number().min(0).max(40),
    min_stock_qty: z.coerce.number().min(0, "Cannot be negative"),
    default_warehouse_id: z.string().uuid().optional(),
    rack_code: z.string().max(30).optional(),
    description: z.string().max(2000).optional(),
    is_active: z.enum(["true", "false"]).optional(),
    opening_qty: z.coerce.number().min(0, "Opening stock cannot be negative").optional(),
  })
  .refine((v) => v.mrp === 0 || v.retailer_price <= v.mrp || v.retailer_price_mode !== v.mrp_mode, {
    message: "Retailer price is higher than MRP.",
  });

export async function saveProduct(_prev: FormResult, formData: FormData): Promise<FormResult> {
  await requireRole("super_admin", "manager");
  const raw = formObject(formData);
  for (const k of Object.keys(raw)) if (raw[k] === "") delete raw[k];

  const parsed = productSchema.safeParse(raw);
  if (!parsed.success) return { error: zodMessage(parsed.error) };
  const { id, rack_code, opening_qty, is_active, ...fields } = parsed.data;

  const supabase = await createClient();

  // Rack / shelf: find or create the location in the default warehouse.
  let default_location_id: string | null = null;
  if (rack_code && fields.default_warehouse_id) {
    const code = rack_code.toUpperCase();
    const { data: loc } = await supabase
      .from("warehouse_locations")
      .select("id")
      .eq("warehouse_id", fields.default_warehouse_id)
      .eq("code", code)
      .maybeSingle();
    if (loc) default_location_id = loc.id;
    else {
      const { data: created, error } = await supabase
        .from("warehouse_locations")
        .insert({ warehouse_id: fields.default_warehouse_id, code })
        .select("id")
        .single();
      if (error) return { error: dbError(error) };
      default_location_id = created.id;
    }
  }

  const row = {
    ...fields,
    category_id: fields.category_id ?? null,
    barcode: fields.barcode ?? null,
    hsn_code: fields.hsn_code ?? null,
    description: fields.description ?? null,
    default_warehouse_id: fields.default_warehouse_id ?? null,
    default_location_id,
    is_active: is_active !== "false",
  };

  if (id) {
    const { error } = await supabase.from("products").update(row).eq("id", id);
    if (error) return { error: dbError(error) };
    revalidatePath("/products");
    revalidatePath(`/products/${id}`);
    return { ok: "Product saved.", redirectTo: `/products/${id}` };
  }

  const { data: created, error } = await supabase.from("products").insert(row).select("id").single();
  if (error) return { error: dbError(error) };

  if (opening_qty && opening_qty > 0) {
    if (!row.default_warehouse_id) return { error: "Product created. Choose a warehouse to record opening stock.", redirectTo: `/products/${created.id}/edit` };
    const { data: me } = await supabase.auth.getUser();
    const { error: stockError } = await supabase.from("stock_movements").insert({
      product_id: created.id,
      warehouse_id: row.default_warehouse_id,
      location_id: default_location_id,
      movement_type: "opening",
      qty: opening_qty,
      reason: "Opening stock",
      created_by: me.user?.id,
    });
    if (stockError) return { error: `Product created, but opening stock failed: ${dbError(stockError)}`, redirectTo: `/products/${created.id}` };
  }

  revalidatePath("/products");
  return { ok: "Product created.", redirectTo: `/products/${created.id}` };
}

// ---------- Photos (file itself is uploaded from the browser to Storage) ----------

export async function addProductImage(productId: string, storagePath: string) {
  await requireRole("super_admin", "manager");
  const supabase = await createClient();
  const { count } = await supabase
    .from("product_images")
    .select("id", { count: "exact", head: true })
    .eq("product_id", productId);
  const { error } = await supabase.from("product_images").insert({
    product_id: productId,
    storage_path: storagePath,
    is_primary: (count ?? 0) === 0,
    sort_order: count ?? 0,
  });
  if (error) return { error: dbError(error) };
  revalidatePath(`/products/${productId}`);
  revalidatePath("/products");
  return { ok: true };
}

export async function setPrimaryImage(productId: string, imageId: string) {
  await requireRole("super_admin", "manager");
  const supabase = await createClient();
  await supabase.from("product_images").update({ is_primary: false }).eq("product_id", productId);
  const { error } = await supabase.from("product_images").update({ is_primary: true }).eq("id", imageId);
  if (error) return { error: dbError(error) };
  revalidatePath(`/products/${productId}`);
  revalidatePath("/products");
  return { ok: true };
}

export async function removeProductImage(productId: string, imageId: string) {
  await requireRole("super_admin", "manager");
  const supabase = await createClient();
  const { data: img } = await supabase.from("product_images").select("storage_path, is_primary").eq("id", imageId).single();
  if (!img) return { error: "Photo not found." };
  const { error } = await supabase.from("product_images").delete().eq("id", imageId);
  if (error) return { error: dbError(error) };
  await supabase.storage.from("product-images").remove([img.storage_path]);
  if (img.is_primary) {
    const { data: next } = await supabase
      .from("product_images")
      .select("id")
      .eq("product_id", productId)
      .order("sort_order")
      .limit(1)
      .maybeSingle();
    if (next) await supabase.from("product_images").update({ is_primary: true }).eq("id", next.id);
  }
  revalidatePath(`/products/${productId}`);
  revalidatePath("/products");
  return { ok: true };
}

// ---------- Brands & categories ----------

const masterSchema = z.object({
  kind: z.enum(["brands", "categories"]),
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2, "Enter a name").max(60),
  is_active: z.enum(["true", "false"]).optional(),
});

export async function saveMaster(_prev: FormResult, formData: FormData): Promise<FormResult> {
  await requireRole("super_admin", "manager");
  const raw = formObject(formData);
  if (!raw.id) delete raw.id;
  const parsed = masterSchema.safeParse(raw);
  if (!parsed.success) return { error: zodMessage(parsed.error) };
  const { kind, id, name, is_active } = parsed.data;

  const supabase = await createClient();
  const row = { name, is_active: is_active !== "false" };
  const { error } = id
    ? await supabase.from(kind).update(row).eq("id", id)
    : await supabase.from(kind).insert(row);
  if (error) return { error: dbError(error) };
  revalidatePath("/products/settings");
  return { ok: id ? "Saved." : `${name} added.`, resetForm: !id };
}
