"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { dbError, formObject, zodMessage } from "@/lib/actions";
import type { FormResult } from "@/components/action-form";

const qtySchema = z.coerce.number({ message: "Enter a quantity" }).positive("Quantity must be more than zero");

const entrySchema = z.object({
  type: z.enum(["stock_in", "stock_out", "opening", "damage"]),
  product_id: z.string().guid("Choose a product"),
  warehouse_id: z.string().guid("Choose a warehouse"),
  qty: qtySchema,
  movement_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  unit_cost: z.coerce.number().min(0).optional(),
  reason: z.string().max(300).optional(),
  reference_no: z.string().max(80).optional(),
  bill_no: z.string().max(60).optional(),
  notes: z.string().max(500).optional(),
  client_uuid: z.string().guid().optional(),
});

// Inward, outward, damage, opening. Every change is a new movement row: stock is never overwritten.
export async function recordMovement(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const { user, profile } = await requireRole("super_admin", "manager", "warehouse");
  const raw = formObject(formData);
  for (const k of Object.keys(raw)) if (raw[k] === "") delete raw[k];
  const parsed = entrySchema.safeParse(raw);
  if (!parsed.success) return { error: zodMessage(parsed.error) };
  const v = parsed.data;

  const signed = v.type === "damage" || v.type === "stock_out" ? -v.qty : v.qty;
  if ((v.type === "damage" || v.type === "stock_out") && !v.reason) return { error: "Choose the reason for this entry." };

  const ref = [v.reference_no, v.bill_no ? `Bill ${v.bill_no}` : null].filter(Boolean).join(" · ") || null;
  const supabase = await createClient();
  const { error } = await supabase.from("stock_movements").insert({
    product_id: v.product_id,
    warehouse_id: v.warehouse_id,
    movement_type: v.type,
    qty: signed,
    movement_date: v.movement_date ?? undefined,
    // Only roles that see costs may set a cost; otherwise the database uses the product cost.
    unit_cost: profile.role !== "warehouse" && v.unit_cost !== undefined && signed > 0 ? v.unit_cost : null,
    reason: v.reason ?? (v.type === "stock_in" ? "Stock inward" : v.type === "opening" ? "Opening stock" : null),
    reference_no: ref,
    notes: v.notes ?? null,
    client_uuid: v.client_uuid ?? null,
    created_by: user.id,
  });
  // Same form submitted twice: the first one already counted.
  if (error && !(error.code === "23505" && error.message.includes("client_uuid"))) return { error: dbError(error) };

  revalidatePath("/stock");
  const label = { stock_in: "Stock inward", stock_out: "Stock outward", opening: "Opening stock", damage: "Damaged stock" }[v.type];
  return { ok: `${label} of ${v.qty} recorded.`, resetForm: true };
}

// Adjustment: Manager / Super Admin set the system stock to the physical count, with a reason.
export async function adjustStock(input: { productId: string; warehouseId: string; physical: number; reason: string; notes?: string; clientUuid: string }) {
  await requireRole("super_admin", "manager");
  if (!Number.isFinite(input.physical) || input.physical < 0) return { error: "Physical stock must be zero or more." };
  if (!input.reason.trim()) return { error: "Choose the reason for the adjustment." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("adjust_stock_to", {
    p_product_id: input.productId, p_warehouse_id: input.warehouseId, p_physical: input.physical,
    p_reason: input.reason, p_notes: input.notes || null, p_client_uuid: input.clientUuid,
  });
  if (error) return { error: dbError(error) };
  revalidatePath("/stock");
  return { diff: Number(data) };
}

// Current system stock of one product in one warehouse (for the adjustment screen).
export async function systemStock(productId: string, warehouseId: string) {
  await requireRole("super_admin", "manager", "warehouse");
  const supabase = await createClient();
  const { data } = await supabase.from("stock_on_hand").select("on_hand").eq("product_id", productId).eq("warehouse_id", warehouseId).maybeSingle();
  return Number(data?.on_hand ?? 0);
}

const transferSchema = z.object({
  product_id: z.string().guid("Choose a product"),
  from_warehouse: z.string().guid("Choose the source warehouse"),
  to_warehouse: z.string().guid("Choose the destination warehouse"),
  qty: qtySchema,
  reason: z.string().max(300).optional(),
});

export async function transferStock(_prev: FormResult, formData: FormData): Promise<FormResult> {
  await requireRole("super_admin", "manager", "warehouse");
  const raw = formObject(formData);
  for (const k of Object.keys(raw)) if (raw[k] === "") delete raw[k];
  const parsed = transferSchema.safeParse(raw);
  if (!parsed.success) return { error: zodMessage(parsed.error) };
  const v = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.rpc("transfer_stock", {
    p_product_id: v.product_id,
    p_from_warehouse: v.from_warehouse,
    p_to_warehouse: v.to_warehouse,
    p_qty: v.qty,
    p_reason: v.reason ?? null,
  });
  if (error) return { error: dbError(error) };
  revalidatePath("/stock");
  return { ok: "Transfer recorded.", resetForm: true };
}

// ---------- Stock counts ----------

export async function startCount(_prev: FormResult, formData: FormData): Promise<FormResult> {
  await requireRole("super_admin", "manager", "warehouse");
  const warehouse = String(formData.get("warehouse_id") ?? "");
  const notes = String(formData.get("notes") ?? "").trim() || null;
  if (!warehouse) return { error: "Choose a warehouse." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("start_stock_count", { p_warehouse_id: warehouse, p_notes: notes });
  if (error) return { error: dbError(error) };
  redirect(`/stock/counts/${data}`);
}

export async function saveCountLines(countId: string, lines: { id: string; counted: string }[], submit: boolean) {
  await requireRole("super_admin", "manager", "warehouse");
  const supabase = await createClient();
  for (const l of lines) {
    const value = l.counted.trim() === "" ? null : Number(l.counted);
    if (value !== null && (!Number.isFinite(value) || value < 0)) return { error: "Counted quantities must be zero or more." };
    const { error } = await supabase.from("stock_count_lines").update({ counted_qty: value }).eq("id", l.id).eq("count_id", countId);
    if (error) return { error: dbError(error) };
  }
  if (submit) {
    const { error } = await supabase.from("stock_counts").update({ status: "submitted" }).eq("id", countId).eq("status", "draft");
    if (error) return { error: dbError(error) };
  }
  revalidatePath(`/stock/counts/${countId}`);
  revalidatePath("/stock/counts");
  return { ok: submit ? "Count submitted for approval." : "Saved." };
}

export async function reviewCount(countId: string, decision: "approve" | "reopen" | "cancel") {
  const supabase = await createClient();
  if (decision === "approve") {
    await requireRole("super_admin", "manager");
    const { data, error } = await supabase.rpc("approve_stock_count", { p_count_id: countId });
    if (error) return { error: dbError(error) };
    revalidatePath("/stock");
    revalidatePath(`/stock/counts/${countId}`);
    return { ok: `Approved. ${data} stock correction${data === 1 ? "" : "s"} posted.` };
  }
  await requireRole("super_admin", "manager", "warehouse");
  const status = decision === "reopen" ? "draft" : "cancelled";
  const { error } = await supabase.from("stock_counts").update({ status }).eq("id", countId).in("status", ["draft", "submitted"]);
  if (error) return { error: dbError(error) };
  revalidatePath(`/stock/counts/${countId}`);
  revalidatePath("/stock/counts");
  return { ok: decision === "reopen" ? "Sent back for recount." : "Count cancelled." };
}

// ---------- Warehouses & racks ----------

const warehouseSchema = z.object({
  id: z.string().guid().optional(),
  brand_id: z.string().guid().optional(),
  name: z.string().min(2, "Enter a warehouse name").max(80),
  address: z.string().max(300).optional(),
  is_active: z.enum(["true", "false"]).optional(),
});

export async function saveWarehouse(_prev: FormResult, formData: FormData): Promise<FormResult> {
  await requireRole("super_admin", "manager");
  const raw = formObject(formData);
  for (const k of Object.keys(raw)) if (raw[k] === "") delete raw[k];
  const parsed = warehouseSchema.safeParse(raw);
  if (!parsed.success) return { error: zodMessage(parsed.error) };
  const { id, ...v } = parsed.data;
  const row: Record<string, unknown> = { name: v.name, address: v.address ?? null, is_active: v.is_active !== "false" };
  if (!id) {
    if (!v.brand_id) return { error: "Choose the brand this warehouse belongs to." };
    row.brand_id = v.brand_id;
  }
  const supabase = await createClient();
  const { error } = id ? await supabase.from("warehouses").update(row).eq("id", id) : await supabase.from("warehouses").insert(row);
  if (error) return { error: dbError(error) };
  revalidatePath("/stock/warehouses");
  return { ok: id ? "Saved." : `${v.name} added.`, resetForm: !id };
}

export async function addLocation(_prev: FormResult, formData: FormData): Promise<FormResult> {
  await requireRole("super_admin", "manager");
  const warehouse_id = String(formData.get("warehouse_id") ?? "");
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const description = String(formData.get("description") ?? "").trim() || null;
  if (!code) return { error: "Enter a rack / shelf code." };
  const supabase = await createClient();
  const { error } = await supabase.from("warehouse_locations").insert({ warehouse_id, code, description });
  if (error) return { error: error.code === "23505" ? "That rack code already exists in this warehouse." : dbError(error) };
  revalidatePath("/stock/warehouses");
  return { ok: `${code} added.`, resetForm: true };
}
