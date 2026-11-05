"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { dbError } from "@/lib/actions";
import { normaliseMobile } from "@/lib/format";
import { signProductImages } from "@/lib/images";

export type SaveResult = { ok?: boolean; error?: string; hint?: string; orderId?: string; invoiceId?: string };

export type OrderLineInput = { product_id: string; qty: number; discount_pct?: number; unit_price?: number | null };

// Save (create or edit) a quotation; optionally confirm it straight into an invoice.
export async function saveOrder(input: {
  orderId?: string | null;
  retailerId: string;
  creditDays: number;
  notes: string;
  lines: OrderLineInput[];
  clientUuid?: string;
  confirm?: boolean;
  overrideCredit?: boolean;
}): Promise<SaveResult> {
  const { profile } = await requireRole("super_admin", "manager", "billing", "salesman");
  if (!input.retailerId) return { error: "Choose a retailer." };
  if (input.lines.length === 0) return { error: "Add at least one product." };

  const supabase = await createClient();
  const { data: orderId, error } = await supabase.rpc("save_quotation", {
    p_order_id: input.orderId ?? null,
    p_retailer_id: input.retailerId,
    p_credit_days: input.creditDays,
    p_notes: input.notes,
    p_lines: input.lines,
    p_client_uuid: input.orderId ? null : input.clientUuid ?? null,
  });
  if (error) return { error: dbError(error) };

  revalidatePath("/sales/quotations");
  if (!input.confirm) return { ok: true, orderId: orderId as string };
  if (profile.role === "salesman") return { ok: true, orderId: orderId as string };

  const res = await confirmOrder(orderId as string, input.overrideCredit ?? false);
  return { ...res, orderId: orderId as string };
}

export async function confirmOrder(orderId: string, overrideCredit = false): Promise<SaveResult> {
  await requireRole("super_admin", "manager", "billing");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("confirm_order", { p_order_id: orderId, p_override_credit: overrideCredit });
  if (error) return { error: error.message, hint: error.hint ?? undefined, orderId };
  revalidatePath("/sales");
  revalidatePath("/stock");
  return { ok: true, invoiceId: data as string, orderId };
}

export async function cancelQuotation(orderId: string, reason: string): Promise<SaveResult> {
  await requireRole("super_admin", "manager", "billing", "salesman");
  const supabase = await createClient();
  const { error } = await supabase
    .from("orders")
    .update({ status: "cancelled", cancel_reason: reason || "Cancelled" })
    .eq("id", orderId)
    .eq("status", "quotation");
  if (error) return { error: dbError(error) };
  revalidatePath("/sales/quotations");
  return { ok: true };
}

export async function cancelInvoice(invoiceId: string, reason: string): Promise<SaveResult> {
  await requireRole("super_admin", "manager", "billing");
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_invoice", { p_invoice_id: invoiceId, p_reason: reason });
  if (error) return { error: error.message };
  revalidatePath("/sales");
  revalidatePath(`/sales/invoices/${invoiceId}`);
  return { ok: true };
}

export async function createCreditNote(
  invoiceId: string,
  reason: string,
  restock: boolean,
  lines: { invoice_line_id: string; qty: number }[]
): Promise<SaveResult & { creditNoteId?: string }> {
  await requireRole("super_admin", "manager", "billing");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_credit_note", {
    p_invoice_id: invoiceId,
    p_reason: reason,
    p_restock: restock,
    p_lines: lines.filter((l) => l.qty > 0),
  });
  if (error) return { error: error.message };
  revalidatePath(`/sales/invoices/${invoiceId}`);
  return { ok: true, creditNoteId: data as string };
}

// ---------- Lookups for the order builder ----------

export type PickerProduct = {
  id: string;
  name: string;
  sku: string;
  brand_id: string;
  brand_name: string;
  unit_code: string;
  retailer_price: number;
  retailer_price_mode: "inclusive" | "exclusive";
  mrp: number;
  gst_rate: number;
  available: number;
  image_url?: string;
};

export async function searchProducts(q: string, brandId?: string, withImages = false): Promise<PickerProduct[]> {
  await requireRole();
  const supabase = await createClient();
  const term = q.replace(/[,()*%\\]/g, " ").trim().slice(0, 60);
  let query = supabase
    .from("catalog")
    .select("id, name, sku, brand_id, brand_name, unit_code, retailer_price, retailer_price_mode, mrp, gst_rate, image_path")
    .eq("is_active", true)
    .order("name")
    .limit(withImages ? 120 : 15);
  if (term) query = query.or(`name.ilike.%${term}%,sku.ilike.%${term}%,barcode.eq.${term}`);
  if (brandId) query = query.eq("brand_id", brandId);
  const { data } = await query;
  const rows = data ?? [];
  const ids = rows.map((r) => r.id);
  const { data: stock } = ids.length
    ? await supabase.from("product_stock").select("product_id, available").in("product_id", ids)
    : { data: [] };
  const sMap = new Map((stock ?? []).map((s) => [s.product_id as string, Number(s.available)]));
  const urls = withImages ? await signProductImages(supabase, rows.map((r) => r.image_path)) : new Map<string, string>();
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    sku: r.sku,
    brand_id: r.brand_id,
    brand_name: r.brand_name,
    unit_code: r.unit_code,
    retailer_price: Number(r.retailer_price),
    retailer_price_mode: r.retailer_price_mode,
    mrp: Number(r.mrp),
    gst_rate: Number(r.gst_rate),
    available: sMap.get(r.id) ?? 0,
    image_url: r.image_path ? urls.get(r.image_path) : undefined,
  }));
}

export type PickerRetailer = {
  id: string;
  code: string;
  shop_name: string;
  owner_name: string | null;
  mobile: string;
  billing_city: string | null;
  billing_state_code: string;
  credit_days: number;
  credit_limit: number;
  status: string;
  outstanding: number;
  overdue: number;
};

export async function searchRetailers(q: string): Promise<PickerRetailer[]> {
  await requireRole();
  const supabase = await createClient();
  const term = q.replace(/[,()*%\\]/g, " ").trim().slice(0, 60);
  let query = supabase
    .from("retailer_directory")
    .select("id, code, shop_name, owner_name, mobile, billing_city, billing_state_code, credit_days, credit_limit, status")
    .order("shop_name")
    .limit(15);
  if (term) query = query.or(`shop_name.ilike.%${term}%,owner_name.ilike.%${term}%,mobile.ilike.%${term}%,code.ilike.%${term}%,billing_city.ilike.%${term}%`);
  const { data } = await query;
  const rows = data ?? [];
  const ids = rows.map((r) => r.id);
  const { data: bal } = ids.length
    ? await supabase.from("retailer_balances").select("retailer_id, outstanding, overdue").in("retailer_id", ids)
    : { data: [] };
  const bMap = new Map((bal ?? []).map((b) => [b.retailer_id as string, b]));
  return rows.map((r) => ({
    ...r,
    credit_days: Number(r.credit_days),
    credit_limit: Number(r.credit_limit),
    outstanding: Number(bMap.get(r.id)?.outstanding ?? 0),
    overdue: Number(bMap.get(r.id)?.overdue ?? 0),
  })) as PickerRetailer[];
}

// Create a retailer from inside New Order (minimal fields, duplicate check).
const quickSchema = z.object({
  shop_name: z.string().trim().min(2, "Enter the shop name"),
  owner_name: z.string().trim().optional(),
  mobile: z.string().regex(/^[6-9][0-9]{9}$/, "Mobile must be a 10-digit number"),
  billing_city: z.string().trim().optional(),
  gstin: z
    .string()
    .regex(/^([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z])?$/, "GSTIN format is not valid")
    .optional(),
  billing_address: z.string().trim().optional(),
  force: z.boolean().optional(),
});

export async function quickCreateRetailer(
  input: z.input<typeof quickSchema>
): Promise<{ retailer?: PickerRetailer; error?: string; similar?: { code: string; shop_name: string; city: string | null }[] }> {
  const { user, profile } = await requireRole("super_admin", "manager", "billing", "salesman");
  const parsed = quickSchema.safeParse({
    ...input,
    mobile: normaliseMobile(input.mobile ?? ""),
    gstin: (input.gstin ?? "").toUpperCase().replace(/\s/g, "") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const v = parsed.data;
  const supabase = await createClient();

  const { data: dups } = await supabase.rpc("find_retailer_duplicates", {
    p_mobile: v.mobile,
    p_gstin: v.gstin ?? null,
    p_shop_name: v.shop_name,
    p_city: v.billing_city ?? null,
    p_exclude_id: null,
  });
  const list = (dups ?? []) as { code: string; shop_name: string; city: string | null; reason: string }[];
  const hard = list.find((d) => d.reason !== "Similar shop name");
  if (hard) return { error: `${hard.reason}: ${hard.shop_name} (${hard.code}) already exists. Search for it instead.` };
  if (list.length && !v.force) return { similar: list.map((d) => ({ code: d.code, shop_name: d.shop_name, city: d.city })) };

  const { data: route } =
    profile.role === "salesman"
      ? await supabase.from("routes").select("id").eq("default_salesman_id", user.id).eq("is_active", true).limit(1).maybeSingle()
      : { data: null };

  const { data, error } = await supabase
    .from("retailers")
    .insert({
      shop_name: v.shop_name,
      owner_name: v.owner_name || null,
      mobile: v.mobile,
      gstin: v.gstin || null,
      billing_city: v.billing_city || null,
      billing_address: v.billing_address || null,
      salesman_id: profile.role === "salesman" ? user.id : null,
      route_id: route?.id ?? null,
    })
    .select("id, code, shop_name, owner_name, mobile, billing_city, billing_state_code, credit_days, credit_limit, status")
    .single();
  if (error) return { error: dbError(error) };
  revalidatePath("/retailers");
  return { retailer: { ...data, credit_days: Number(data.credit_days), credit_limit: Number(data.credit_limit), outstanding: 0, overdue: 0 } as PickerRetailer };
}
