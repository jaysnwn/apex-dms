"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { dbError } from "@/lib/actions";
import { normaliseMobile } from "@/lib/format";
import { signProductImages } from "@/lib/images";
import { searchSource, searchWords } from "@/lib/search-words";

export type SaveResult = { ok?: boolean; error?: string; hint?: string; orderId?: string; invoiceId?: string; invoiceNo?: string; paid?: number };

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
  overrideStock?: boolean;
  payment?: { amount: number; method: "cash" | "upi" | "bank_transfer" | "cheque"; reference?: string } | null;
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

  const res = await confirmOrder(orderId as string, input.overrideCredit ?? false, input.overrideStock ?? false);
  if (!res.invoiceId || !input.payment || !(input.payment.amount > 0)) return { ...res, orderId: orderId as string };

  // Money received at the counter goes against this invoice (not the oldest bill).
  const { data: inv } = await supabase.from("invoices").select("grand_total").eq("id", res.invoiceId).single();
  const amount = Math.min(Math.round(input.payment.amount * 100) / 100, Number(inv?.grand_total ?? 0));
  const { error: payErr } = await supabase.rpc("record_payment", {
    p_retailer_id: input.retailerId, p_amount: amount, p_method: input.payment.method, p_payment_date: null,
    p_reference: input.payment.reference || null, p_cheque_date: null, p_bank: null, p_notes: "Paid at billing",
    p_allocations: [{ invoice_id: res.invoiceId, amount }], p_visit_id: null, p_client_uuid: input.clientUuid ?? null,
  });
  revalidatePath("/payments");
  if (payErr) return { ...res, orderId: orderId as string, error: `Invoice created, but the payment was not saved: ${dbError(payErr)}` };
  return { ...res, orderId: orderId as string, paid: amount };
}

export async function confirmOrder(orderId: string, overrideCredit = false, overrideStock = false): Promise<SaveResult> {
  await requireRole("super_admin", "manager", "billing");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("confirm_order", { p_order_id: orderId, p_override_credit: overrideCredit, p_override_stock: overrideStock });
  if (error) return { error: error.message, hint: error.hint ?? undefined, orderId };
  const { data: inv } = await supabase.from("invoices").select("invoice_no").eq("id", data as string).single();
  revalidatePath("/sales");
  revalidatePath("/stock");
  return { ok: true, invoiceId: data as string, invoiceNo: inv?.invoice_no, orderId };
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
  category_id?: string | null;
  category_name?: string | null;
  barcode?: string | null;
  description?: string | null;
};

const PRODUCT_COLS = "id, name, sku, barcode, description, brand_id, brand_name, category_id, category_name, unit_code, retailer_price, retailer_price_mode, mrp, gst_rate, image_path";

async function toPicker(supabase: Awaited<ReturnType<typeof createClient>>, rows: Record<string, unknown>[], withImages: boolean): Promise<PickerProduct[]> {
  const ids = rows.map((r) => r.id as string);
  const stock: { product_id: string; available: number }[] = [];
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await supabase.from("product_stock").select("product_id, available").in("product_id", ids.slice(i, i + 300));
    stock.push(...((data ?? []) as { product_id: string; available: number }[]));
  }
  const sMap = new Map(stock.map((s) => [s.product_id, Number(s.available)]));
  const urls = withImages ? await signProductImages(supabase, rows.map((r) => r.image_path as string | null)) : new Map<string, string>();
  return rows.map((r) => ({
    id: r.id as string, name: r.name as string, sku: r.sku as string, brand_id: r.brand_id as string, brand_name: r.brand_name as string,
    unit_code: r.unit_code as string, retailer_price: Number(r.retailer_price), retailer_price_mode: r.retailer_price_mode as "inclusive" | "exclusive",
    mrp: Number(r.mrp), gst_rate: Number(r.gst_rate), available: sMap.get(r.id as string) ?? 0,
    image_url: r.image_path ? urls.get(r.image_path as string) : undefined,
    category_id: (r.category_id as string) ?? null, category_name: (r.category_name as string) ?? null,
    barcode: (r.barcode as string) ?? null, description: (r.description as string) ?? null,
  }));
}

// Every word must match somewhere (name, SKU, barcode, category or description):
// "65W" finds all 65W products, "type c" finds "Type-C Cable 1m".
export async function searchProducts(q: string, brandId?: string, withImages = false): Promise<PickerProduct[]> {
  await requireRole();
  const supabase = await createClient();
  const words = searchWords(q);
  const limit = withImages ? 120 : 15;
  // With words: the database finds the matches through its search index first
  // (search_catalog), then sorts and cuts. Without: the first products by name.
  let query = words.length
    ? supabase.rpc("search_catalog", { p_words: words, p_limit: limit, p_active: true, p_brand: brandId ?? null }).select(PRODUCT_COLS)
    : supabase.from("catalog").select(PRODUCT_COLS).eq("is_active", true).order("name").limit(limit);
  if (brandId && !words.length) query = query.eq("brand_id", brandId);
  const { data } = await query;
  return toPicker(supabase, (data ?? []) as Record<string, unknown>[], withImages);
}

// The whole active catalogue of one brand (with photos and stock) for the billing screen:
// searching and category tabs then work instantly in the browser.
export async function loadBillingCatalogue(brandId: string): Promise<{ products: PickerProduct[]; categories: { id: string; name: string }[] }> {
  await requireRole("super_admin", "manager", "billing", "salesman");
  const supabase = await createClient();
  const [{ data: rows }, { data: cats }] = await Promise.all([
    supabase.from("catalog").select(PRODUCT_COLS).eq("is_active", true).eq("brand_id", brandId).order("name").limit(2000),
    supabase.from("categories").select("id, name").eq("brand_id", brandId).eq("is_active", true).order("sort_order").order("name"),
  ]);
  return { products: await toPicker(supabase, (rows ?? []) as Record<string, unknown>[], true), categories: cats ?? [] };
}

// What this shop usually buys from the brand, and its last invoice (to repeat it).
export async function retailerUsuals(retailerId: string, brandId: string): Promise<{ usual: { product_id: string; qty: number; times: number }[]; last: { invoice_no: string; invoice_date: string; lines: { product_id: string; qty: number }[] } | null }> {
  await requireRole("super_admin", "manager", "billing", "salesman");
  const supabase = await createClient();
  const since = new Date(Date.now() - 120 * 864e5).toISOString().slice(0, 10);
  const { data } = await supabase.from("sales_register").select("invoice_id, invoice_no, invoice_date, product_id, qty")
    .eq("retailer_id", retailerId).eq("brand_id", brandId).gte("invoice_date", since).order("invoice_date", { ascending: false }).limit(500);
  const rows = data ?? [];
  const agg = new Map<string, { qty: number; invoices: Set<string> }>();
  for (const r of rows) {
    const a = agg.get(r.product_id) ?? { qty: 0, invoices: new Set<string>() };
    a.qty += Number(r.qty); a.invoices.add(r.invoice_id);
    agg.set(r.product_id, a);
  }
  const usual = [...agg.entries()].map(([product_id, a]) => ({ product_id, times: a.invoices.size, qty: Math.max(1, Math.round(a.qty / a.invoices.size)) }))
    .sort((x, y) => y.times - x.times || y.qty - x.qty).slice(0, 8);
  const lastId = rows[0]?.invoice_id;
  const last = lastId ? {
    invoice_no: rows[0].invoice_no, invoice_date: rows[0].invoice_date,
    lines: rows.filter((r) => r.invoice_id === lastId).map((r) => ({ product_id: r.product_id, qty: Number(r.qty) })),
  } : null;
  return { usual, last };
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
  gstin?: string | null;
  billing_address?: string | null;
  billing_pincode?: string | null;
};

const RETAILER_COLS = "id, code, shop_name, owner_name, mobile, gstin, billing_address, billing_city, billing_pincode, billing_state_code, credit_days, credit_limit, status";

export async function searchRetailers(q: string): Promise<PickerRetailer[]> {
  await requireRole();
  const supabase = await createClient();
  const words = searchWords(q);
  const { data } = await searchSource(supabase, "retailer_directory", "search_retailer_directory", words)
    .select(RETAILER_COLS)
    .neq("status", "inactive")
    .order("shop_name")
    .limit(15);
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
  billing_pincode: z.string().regex(/^([1-9][0-9]{5})?$/, "PIN code must be 6 digits").optional(),
  billing_state_code: z.string().regex(/^[0-9]{2}$/).optional(),
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
      billing_pincode: v.billing_pincode || null,
      ...(v.billing_state_code && !v.gstin ? { billing_state_code: v.billing_state_code } : {}),
      salesman_id: profile.role === "salesman" ? user.id : null,
      route_id: route?.id ?? null,
    })
    .select(RETAILER_COLS)
    .single();
  if (error) return { error: dbError(error) };
  revalidatePath("/retailers");
  return { retailer: { ...data, credit_days: Number(data.credit_days), credit_limit: Number(data.credit_limit), outstanding: 0, overdue: 0 } as PickerRetailer };
}

// Complete a shop's billing details from the billing screen (office roles).
const billingSchema = z.object({
  gstin: z.string().regex(/^([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z])?$/, "GSTIN format is not valid").optional(),
  billing_address: z.string().trim().min(3, "Enter the billing address"),
  billing_city: z.string().trim().optional(),
  billing_pincode: z.string().regex(/^[1-9][0-9]{5}$/, "PIN code must be 6 digits"),
  billing_state_code: z.string().regex(/^[0-9]{2}$/, "Choose the state"),
  owner_name: z.string().trim().optional(),
});
export async function updateRetailerBilling(id: string, input: z.input<typeof billingSchema>): Promise<{ retailer?: PickerRetailer; error?: string }> {
  await requireRole("super_admin", "manager", "billing");
  const parsed = billingSchema.safeParse({ ...input, gstin: (input.gstin ?? "").toUpperCase().replace(/\s/g, "") || undefined });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const v = parsed.data;
  if (v.gstin && v.gstin.slice(0, 2) !== v.billing_state_code) return { error: "The state does not match the GSTIN (first two digits)." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("retailers").update({
    gstin: v.gstin ?? null, billing_address: v.billing_address, billing_city: v.billing_city || null,
    billing_pincode: v.billing_pincode, billing_state_code: v.billing_state_code, ...(v.owner_name ? { owner_name: v.owner_name } : {}),
  }).eq("id", id).select(RETAILER_COLS).single();
  if (error) return { error: dbError(error) };
  const { data: b } = await supabase.from("retailer_balances").select("outstanding, overdue").eq("retailer_id", id).maybeSingle();
  revalidatePath("/retailers");
  return { retailer: { ...data, credit_days: Number(data.credit_days), credit_limit: Number(data.credit_limit), outstanding: Number(b?.outstanding ?? 0), overdue: Number(b?.overdue ?? 0) } as PickerRetailer };
}

// Change the payment terms of an issued invoice (Manager / Super Admin).
export async function changeInvoiceTerms(invoiceId: string, creditDays: number, reason: string): Promise<SaveResult & { dueDate?: string }> {
  await requireRole("super_admin", "manager");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("change_invoice_terms", { p_invoice_id: invoiceId, p_credit_days: creditDays, p_reason: reason });
  if (error) return { error: error.message };
  revalidatePath(`/sales/invoices/${invoiceId}`);
  revalidatePath("/payments/outstanding");
  return { ok: true, dueDate: data as string };
}
