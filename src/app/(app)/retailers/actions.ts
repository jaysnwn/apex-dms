"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { dbError, formObject, zodMessage } from "@/lib/actions";
import { normaliseMobile } from "@/lib/format";
import type { FormResult } from "@/components/action-form";

export type Duplicate = { id: string; code: string; shop_name: string; city: string | null; mobile_hint: string; reason: string };

export async function checkDuplicates(input: { mobile?: string; gstin?: string; shop_name?: string; city?: string; exclude?: string }) {
  await requireRole();
  const supabase = await createClient();
  const { data } = await supabase.rpc("find_retailer_duplicates", {
    p_mobile: input.mobile ? normaliseMobile(input.mobile) : null,
    p_gstin: input.gstin?.trim() || null,
    p_shop_name: input.shop_name?.trim() || null,
    p_city: input.city?.trim() || null,
    p_exclude_id: input.exclude ?? null,
  });
  return (data ?? []) as Duplicate[];
}

const optional = z.string().max(500).optional();

const retailerSchema = z.object({
  id: z.string().uuid().optional(),
  shop_name: z.string().min(2, "Enter the shop name").max(120),
  owner_name: optional,
  mobile: z.string().regex(/^[6-9][0-9]{9}$/, "Mobile must be a 10-digit Indian number"),
  alt_mobile: z.string().regex(/^([6-9][0-9]{9})?$/, "Alternate mobile must be 10 digits").optional(),
  gstin: z
    .string()
    .regex(/^([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z])?$/, "GSTIN format is not valid (15 characters, e.g. 27ABCDE1234F1Z5)")
    .optional(),
  billing_address: optional,
  billing_city: z.string().max(80).optional(),
  billing_state_code: z.string().regex(/^[0-9]{2}$/),
  billing_pincode: z.string().regex(/^([1-9][0-9]{5})?$/, "PIN code is 6 digits").optional(),
  same_delivery: z.string().optional(),
  delivery_address: optional,
  delivery_city: z.string().max(80).optional(),
  delivery_pincode: z.string().regex(/^([1-9][0-9]{5})?$/, "Delivery PIN code is 6 digits").optional(),
  salesman_id: z.string().uuid().optional(),
  route_id: z.string().uuid().optional(),
  credit_days: z.coerce.number().int().min(0, "Credit period cannot be negative").max(365),
  credit_limit: z.coerce.number().min(0, "Credit limit cannot be negative"),
  status: z.enum(["active", "on_hold", "blocked", "inactive"]).optional(),
  classification: z.enum(["star", "average", "needs_attention", "high_credit_risk"]).optional(),
  notes: z.string().max(1000).optional(),
  confirm_similar: z.string().optional(),
});

export async function saveRetailer(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const { user, profile } = await requireRole("super_admin", "manager", "billing", "salesman");
  const raw = formObject(formData);
  if (raw.mobile) raw.mobile = normaliseMobile(raw.mobile);
  if (raw.alt_mobile) raw.alt_mobile = normaliseMobile(raw.alt_mobile);
  if (raw.gstin) raw.gstin = raw.gstin.toUpperCase().replace(/\s/g, "");
  if (raw.credit_days === "custom") raw.credit_days = raw.credit_days_custom ?? "";
  delete raw.credit_days_custom;
  for (const k of Object.keys(raw)) if (raw[k] === "") delete raw[k];

  const parsed = retailerSchema.safeParse(raw);
  if (!parsed.success) return { error: zodMessage(parsed.error) };
  const { id, same_delivery, confirm_similar, ...v } = parsed.data;
  const isSalesman = profile.role === "salesman";
  if (isSalesman && id) return { error: "Ask the office to change retailer details." };

  // Warn on similar names (exact mobile / GSTIN are blocked by the database).
  if (!confirm_similar) {
    const dups = await checkDuplicates({ mobile: v.mobile, gstin: v.gstin, shop_name: v.shop_name, city: v.billing_city, exclude: id });
    if (dups.length > 0) {
      const d = dups[0];
      if (d.reason !== "Similar shop name") return { error: `${d.reason}: ${d.shop_name} (${d.code}) already exists.` };
      return { error: `A similar retailer exists: ${d.shop_name} (${d.code}${d.city ? `, ${d.city}` : ""}). Tick "This is a different shop" to save anyway.` };
    }
  }

  const delivery = same_delivery
    ? { delivery_address: v.billing_address ?? null, delivery_city: v.billing_city ?? null, delivery_pincode: v.billing_pincode ?? null }
    : { delivery_address: v.delivery_address ?? null, delivery_city: v.delivery_city ?? null, delivery_pincode: v.delivery_pincode ?? null };

  const row: Record<string, unknown> = {
    shop_name: v.shop_name,
    owner_name: v.owner_name ?? null,
    mobile: v.mobile,
    alt_mobile: v.alt_mobile ?? null,
    gstin: v.gstin ?? null,
    billing_address: v.billing_address ?? null,
    billing_city: v.billing_city ?? null,
    billing_state_code: v.billing_state_code,
    billing_pincode: v.billing_pincode ?? null,
    ...delivery,
    route_id: v.route_id ?? null,
    notes: v.notes ?? null,
    // Salesmen create retailers for themselves with standard terms; the office sets credit.
    ...(isSalesman
      ? { salesman_id: user.id, credit_days: 15, credit_limit: 0, status: "active" as const }
      : {
          salesman_id: v.salesman_id ?? null,
          credit_days: v.credit_days,
          credit_limit: v.credit_limit,
          status: v.status ?? "active",
          classification: v.classification ?? null,
        }),
  };

  const supabase = await createClient();
  if (id) {
    const { error } = await supabase.from("retailers").update(row).eq("id", id);
    if (error) return { error: dbError(error) };
    revalidatePath("/retailers");
    revalidatePath(`/retailers/${id}`);
    return { ok: "Retailer saved.", redirectTo: `/retailers/${id}` };
  }
  const { data, error } = await supabase.from("retailers").insert(row).select("id").single();
  if (error) return { error: dbError(error) };
  revalidatePath("/retailers");
  return { ok: "Retailer created.", redirectTo: `/retailers/${data.id}` };
}

// ---------- Routes (full route planning comes in M5) ----------

const routeSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(2, "Enter a route name").max(80),
  description: z.string().max(300).optional(),
  default_salesman_id: z.string().uuid().optional(),
  is_active: z.enum(["true", "false"]).optional(),
});

export async function saveRoute(_prev: FormResult, formData: FormData): Promise<FormResult> {
  await requireRole("super_admin", "manager");
  const raw = formObject(formData);
  for (const k of Object.keys(raw)) if (raw[k] === "") delete raw[k];
  const parsed = routeSchema.safeParse(raw);
  if (!parsed.success) return { error: zodMessage(parsed.error) };
  const { id, ...v } = parsed.data;
  const row = {
    name: v.name,
    description: v.description ?? null,
    default_salesman_id: v.default_salesman_id ?? null,
    is_active: v.is_active !== "false",
  };
  const supabase = await createClient();
  const { error } = id ? await supabase.from("routes").update(row).eq("id", id) : await supabase.from("routes").insert(row);
  if (error) return { error: dbError(error) };
  revalidatePath("/retailers/routes");
  return { ok: id ? "Route saved." : `${v.name} added.`, resetForm: !id };
}

// Recalculate Star / Average / Needs Attention / High Credit Risk for every retailer.
export async function runClassification() {
  await requireRole("super_admin", "manager");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("classify_retailers");
  if (error) return { error: error.message };
  revalidatePath("/retailers");
  return { ok: true, changed: data as number };
}
