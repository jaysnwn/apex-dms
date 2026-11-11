"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { dbError, formObject, zodMessage } from "@/lib/actions";
import type { FormResult } from "@/components/action-form";
import { searchSource, searchWords } from "@/lib/search-words";

const OFFICE = ["super_admin", "manager", "billing"] as const;

export type Result = { ok?: boolean; error?: string; id?: string };

// ---------------------------------------------------------------------------
// Pickers
// ---------------------------------------------------------------------------
export type PickerSupplier = { id: string; code: string; name: string; state_code: string | null; gstin: string | null; credit_days: number; city: string | null; mobile: string | null; brand_id: string | null; lead_days: number };

export async function listSuppliers(): Promise<PickerSupplier[]> {
  await requireRole(...OFFICE);
  const supabase = await createClient();
  const { data } = await supabase
    .from("suppliers")
    .select("id, code, name, state_code, gstin, credit_days, city, mobile, brand_id, lead_days")
    .eq("is_active", true)
    .order("name");
  return (data ?? []) as PickerSupplier[];
}

export type PurchaseProduct = {
  id: string;
  name: string;
  sku: string;
  brand_name: string;
  unit_code: string;
  gst_rate: number;
  purchase_cost: number;
  purchase_cost_mode: "inclusive" | "exclusive";
  on_hand: number;
};

export async function searchPurchaseProducts(q: string, brandId?: string, listAll = false): Promise<PurchaseProduct[]> {
  await requireRole(...OFFICE);
  const supabase = await createClient();
  const words = searchWords(q);
  let query = searchSource(supabase, "products", "search_products", words)
    .select("id, name, sku, unit_code, gst_rate, purchase_cost, purchase_cost_mode, brand_id, brands(name)")
    .eq("is_active", true)
    .order("name")
    .limit(listAll ? 300 : 15);
  if (brandId) query = query.eq("brand_id", brandId);
  const { data } = await query;
  const rows = data ?? [];
  const ids = rows.map((r) => r.id as string);
  const { data: stock } = ids.length
    ? await supabase.from("product_stock").select("product_id, on_hand").in("product_id", ids)
    : { data: [] };
  const sMap = new Map((stock ?? []).map((s) => [s.product_id as string, Number(s.on_hand)]));
  return rows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    sku: r.sku as string,
    brand_name: (r.brands as unknown as { name: string } | null)?.name ?? "",
    unit_code: r.unit_code as string,
    gst_rate: Number(r.gst_rate),
    purchase_cost: Number(r.purchase_cost),
    purchase_cost_mode: r.purchase_cost_mode as "inclusive" | "exclusive",
    on_hand: sMap.get(r.id as string) ?? 0,
  }));
}

// ---------------------------------------------------------------------------
// Purchases
// ---------------------------------------------------------------------------
export type PurchaseLineInput = { product_id: string; qty: number; unit_cost: number; cost_mode: "inclusive" | "exclusive"; discount_pct: number };

export async function savePurchase(input: {
  purchaseId?: string | null;
  supplierId: string;
  warehouseId: string;
  orderDate: string;
  expectedDate?: string | null;
  creditDays: number;
  otherCharges: number;
  notes: string;
  lines: PurchaseLineInput[];
  receive?: { billNo: string; billDate: string; receivedDate?: string | null; updateCost: boolean } | null;
}): Promise<Result & { received?: boolean }> {
  await requireRole(...OFFICE);
  if (!input.supplierId) return { error: "Choose a supplier." };
  if (!input.warehouseId) return { error: "Choose the warehouse." };
  if (input.lines.length === 0) return { error: "Add at least one product." };
  const supabase = await createClient();
  const { data: id, error } = await supabase.rpc("save_purchase", {
    p_purchase_id: input.purchaseId ?? null,
    p_supplier_id: input.supplierId,
    p_warehouse_id: input.warehouseId,
    p_order_date: input.orderDate || null,
    p_expected_date: input.expectedDate || null,
    p_credit_days: input.creditDays,
    p_other_charges: input.otherCharges || 0,
    p_notes: input.notes,
    p_lines: input.lines,
  });
  if (error) return { error: dbError(error) };
  revalidatePath("/purchases");

  if (input.receive) {
    const r = await receivePurchase(id as string, input.receive);
    if (r.error) return { id: id as string, error: `Saved as purchase order, but not received: ${r.error}` };
    return { ok: true, id: id as string, received: true };
  }
  return { ok: true, id: id as string };
}

export async function receivePurchase(
  purchaseId: string,
  r: { billNo: string; billDate: string; receivedDate?: string | null; updateCost: boolean }
): Promise<Result> {
  await requireRole("super_admin", "manager", "billing", "warehouse");
  const supabase = await createClient();
  const { error } = await supabase.rpc("receive_purchase", {
    p_purchase_id: purchaseId,
    p_bill_no: r.billNo,
    p_bill_date: r.billDate || null,
    p_received_date: r.receivedDate || null,
    p_update_cost: r.updateCost,
  });
  if (error) return { error: dbError(error) };
  revalidatePath("/purchases");
  revalidatePath("/stock");
  revalidatePath("/products");
  return { ok: true, id: purchaseId };
}

export async function cancelPurchase(purchaseId: string, reason: string): Promise<Result> {
  await requireRole(...OFFICE);
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_purchase", { p_purchase_id: purchaseId, p_reason: reason });
  if (error) return { error: dbError(error) };
  revalidatePath("/purchases");
  revalidatePath("/stock");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Supplier payments
// ---------------------------------------------------------------------------
export type OpenBill = { purchase_id: string; purchase_no: string; supplier_bill_no: string; supplier_bill_date: string; due_date: string; balance: number; days_overdue: number };

export async function openBills(supplierId: string): Promise<OpenBill[]> {
  await requireRole(...OFFICE);
  const supabase = await createClient();
  const { data } = await supabase
    .from("purchase_balances")
    .select("purchase_id, purchase_no, supplier_bill_no, supplier_bill_date, due_date, balance, days_overdue")
    .eq("supplier_id", supplierId)
    .gt("balance", 0)
    .order("due_date")
    .order("supplier_bill_date");
  return (data ?? []).map((b) => ({ ...b, balance: Number(b.balance), days_overdue: Number(b.days_overdue) })) as OpenBill[];
}

export async function recordSupplierPayment(input: {
  supplierId: string;
  amount: number;
  method: string;
  date: string;
  reference: string;
  notes: string;
  allocations: { purchase_id: string; amount: number }[] | null;
}): Promise<Result> {
  await requireRole(...OFFICE);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("record_supplier_payment", {
    p_supplier_id: input.supplierId,
    p_amount: input.amount,
    p_method: input.method,
    p_payment_date: input.date || null,
    p_reference: input.reference || null,
    p_notes: input.notes || null,
    p_allocations: input.allocations && input.allocations.length ? input.allocations : null,
  });
  if (error) return { error: dbError(error) };
  revalidatePath("/purchases");
  return { ok: true, id: data as string };
}

export async function cancelSupplierPayment(paymentId: string, reason: string): Promise<Result> {
  await requireRole("super_admin", "manager");
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_supplier_payment", { p_payment_id: paymentId, p_reason: reason });
  if (error) return { error: dbError(error) };
  revalidatePath("/purchases");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Suppliers (form action)
// ---------------------------------------------------------------------------
const supplierSchema = z.object({
  id: z.string().guid().optional(),
  name: z.string().min(2, "Enter the supplier name"),
  gstin: z
    .string()
    .optional()
    .transform((v) => (v ? v.toUpperCase() : undefined))
    .refine((v) => !v || /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/.test(v), "GSTIN format is not valid"),
  state_code: z.string().optional(),
  contact_name: z.string().optional(),
  mobile: z.string().optional(),
  email: z.string().email("Email is not valid").optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  pincode: z.string().optional(),
  credit_days: z.coerce.number().int().min(0).max(365),
  lead_days: z.coerce.number().int().min(0, "Delivery time cannot be negative").max(180).optional(),
  brand_id: z.string().guid().optional().or(z.literal("")),
  bank_details: z.string().optional(),
  notes: z.string().optional(),
  is_active: z.string().optional(),
});

export async function saveSupplier(_: FormResult, formData: FormData): Promise<FormResult> {
  await requireRole(...OFFICE);
  const parsed = supplierSchema.safeParse(formObject(formData));
  if (!parsed.success) return { error: zodMessage(parsed.error) };
  const { id, is_active, ...v } = parsed.data;
  const row = {
    ...v,
    gstin: v.gstin ?? null,
    state_code: v.gstin ? v.gstin.slice(0, 2) : v.state_code || null,
    contact_name: v.contact_name ?? null,
    mobile: v.mobile ?? null,
    email: v.email ?? null,
    address: v.address ?? null,
    city: v.city ?? null,
    pincode: v.pincode ?? null,
    bank_details: v.bank_details ?? null,
    notes: v.notes ?? null,
    brand_id: v.brand_id || null,
    lead_days: v.lead_days ?? 8,
    is_active: id ? is_active === "on" : true,
  };
  const supabase = await createClient();
  const res = id
    ? await supabase.from("suppliers").update(row).eq("id", id).select("id").single()
    : await supabase.from("suppliers").insert(row).select("id").single();
  if (res.error) {
    if (res.error.code === "23505" && res.error.message.includes("gstin")) return { error: "Another supplier already uses this GSTIN." };
    return { error: dbError(res.error) };
  }
  revalidatePath("/purchases/suppliers");
  return { ok: "Supplier saved", redirectTo: `/purchases/suppliers/${res.data.id}` };
}

// ---------------------------------------------------------------------------
// Purchase returns (goods sent back to the supplier → stock and payable go down)
// ---------------------------------------------------------------------------
export async function createPurchaseReturn(input: { purchaseId: string; reason: string; lines: { purchase_line_id: string; qty: number }[]; clientUuid: string }): Promise<Result> {
  await requireRole(...OFFICE);
  const lines = input.lines.filter((l) => l.qty > 0);
  if (!lines.length) return { error: "Enter the quantity to return." };
  if (!input.reason.trim()) return { error: "Enter the reason for the return." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_purchase_return", {
    p_purchase_id: input.purchaseId, p_reason: input.reason, p_lines: lines, p_client_uuid: input.clientUuid,
  });
  if (error) return { error: dbError(error) };
  revalidatePath(`/purchases/${input.purchaseId}`);
  revalidatePath("/purchases/payables");
  revalidatePath("/stock");
  return { ok: true, id: data as string };
}

// One purchase order per supplier from the reorder list.
export async function createReorderPurchases(input: { brandId: string; items: { product_id: string; qty: number; supplier_id: string | null; unit_cost: number; cost_mode: "inclusive" | "exclusive" }[] }): Promise<{ ids?: string[]; error?: string }> {
  await requireRole(...OFFICE);
  const items = input.items.filter((i) => i.qty > 0);
  if (!items.length) return { error: "Tick at least one product." };
  if (items.some((i) => !i.supplier_id)) return { error: "Some products have no supplier. Add a supplier for the brand, or buy them once on a normal purchase." };
  const supabase = await createClient();
  const [{ data: wh }, { data: sups }] = await Promise.all([
    supabase.from("warehouses").select("id").eq("brand_id", input.brandId).eq("is_active", true).order("created_at").limit(1).maybeSingle(),
    supabase.from("suppliers").select("id, credit_days, lead_days").in("id", [...new Set(items.map((i) => i.supplier_id!))]),
  ]);
  if (!wh) return { error: "This brand has no active warehouse." };
  const today = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
  const ids: string[] = [];
  for (const s of sups ?? []) {
    const mine = items.filter((i) => i.supplier_id === s.id);
    const expected = new Date(Date.parse(today) + Number(s.lead_days ?? 8) * 864e5).toISOString().slice(0, 10);
    const { data, error } = await supabase.rpc("save_purchase", {
      p_purchase_id: null, p_supplier_id: s.id, p_warehouse_id: wh.id, p_order_date: today, p_expected_date: expected,
      p_credit_days: s.credit_days, p_other_charges: 0, p_notes: "Created from the reorder list",
      p_lines: mine.map((i) => ({ product_id: i.product_id, qty: i.qty, unit_cost: i.unit_cost, cost_mode: i.cost_mode, discount_pct: 0 })),
    });
    if (error) return { error: dbError(error), ids };
    ids.push(data as string);
  }
  revalidatePath("/purchases");
  return { ids };
}
