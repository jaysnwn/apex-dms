"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { required } from "@/lib/required";

export type OpenInvoice = {
  invoice_id: string;
  invoice_no: string;
  invoice_date: string;
  due_date: string;
  grand_total: number;
  balance: number;
  open: number; // balance minus uncleared cheques already allocated
  due_status: string;
  days_past_due: number;
};

export async function openInvoices(retailerId: string): Promise<OpenInvoice[]> {
  await requireRole();
  const supabase = await createClient();
  const { data } = await supabase
    .from("invoice_balances")
    .select("invoice_id, invoice_no, invoice_date, due_date, grand_total, balance, cheque_pending, due_status, days_past_due")
    .eq("retailer_id", retailerId)
    .gt("balance", 0)
    .order("due_date")
    .order("invoice_no");
  // invoice_balances reads FROM invoices and adds only LEFT JOINs to two
  // aggregate subqueries, so each field below is the invoice's own NOT NULL
  // column, or an expression over them. The view's type cannot say so.
  return (data ?? []).map((r) => ({
    invoice_id: required(r.invoice_id, "Invoice id"),
    invoice_no: required(r.invoice_no, "Invoice number"),
    invoice_date: required(r.invoice_date, "Invoice date"),
    due_date: required(r.due_date, "Invoice due date"),
    grand_total: Number(r.grand_total),
    balance: Number(r.balance),
    open: Math.max(0, Number(r.balance) - Number(r.cheque_pending)),
    due_status: required(r.due_status, "Invoice due status"),
    days_past_due: Number(r.days_past_due),
  }));
}

export async function recordPayment(input: {
  retailerId: string;
  amount: number;
  method: "cash" | "upi" | "bank_transfer" | "cheque";
  date?: string;
  reference?: string;
  chequeDate?: string;
  bank?: string;
  notes?: string;
  allocations?: { invoice_id: string; amount: number }[] | null;
  visitId?: string | null;
  clientUuid?: string;
}): Promise<{ id?: string; error?: string }> {
  await requireRole("super_admin", "manager", "billing", "salesman");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("record_payment", {
    p_retailer_id: input.retailerId,
    p_amount: input.amount,
    p_method: input.method,
    p_payment_date: input.date || null,
    p_reference: input.reference || null,
    p_cheque_date: input.chequeDate || null,
    p_bank: input.bank || null,
    p_notes: input.notes || null,
    p_allocations: input.allocations && input.allocations.length ? input.allocations : null,
    p_visit_id: input.visitId ?? null,
    p_client_uuid: input.clientUuid ?? null,
  });
  if (error) return { error: error.message };
  revalidatePath("/payments");
  revalidatePath(`/retailers/${input.retailerId}`);
  return { id: data as string };
}

export async function setPaymentStatus(paymentId: string, status: "received" | "bounced" | "cancelled", note: string) {
  await requireRole("super_admin", "manager", "billing");
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_payment_status", { p_payment_id: paymentId, p_status: status, p_note: note || null });
  if (error) return { error: error.message };
  revalidatePath("/payments");
  revalidatePath(`/payments/${paymentId}`);
  return { ok: true };
}

export async function reallocatePayment(paymentId: string, allocations: { invoice_id: string; amount: number }[] | null) {
  await requireRole("super_admin", "manager", "billing");
  const supabase = await createClient();
  const { error } = await supabase.rpc("reallocate_payment", { p_payment_id: paymentId, p_allocations: allocations });
  if (error) return { error: error.message };
  revalidatePath(`/payments/${paymentId}`);
  return { ok: true };
}

export async function savePromise(input: { retailerId: string; invoiceId?: string | null; date: string; amount: number; remarks?: string }) {
  await requireRole("super_admin", "manager", "billing", "salesman");
  if (!input.date) return { error: "Choose the promised date." };
  if (!(input.amount > 0)) return { error: "Enter the promised amount." };
  const supabase = await createClient();
  const { data: me } = await supabase.auth.getUser();
  const { error } = await supabase.from("payment_promises").insert({
    retailer_id: input.retailerId,
    invoice_id: input.invoiceId || null,
    promised_date: input.date,
    amount: input.amount,
    remarks: input.remarks || null,
    created_by: me.user?.id,
  });
  if (error) return { error: error.message };
  revalidatePath("/payments/promises");
  revalidatePath(`/retailers/${input.retailerId}`);
  return { ok: true };
}

export async function setPromiseStatus(id: string, status: "kept" | "broken" | "cancelled") {
  await requireRole("super_admin", "manager", "billing", "salesman");
  const supabase = await createClient();
  const { error } = await supabase.from("payment_promises").update({ status }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/payments/promises");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Verification of salesman collections (office)
// ---------------------------------------------------------------------------
export async function verifyCollections(ids: string[]): Promise<{ count?: number; error?: string }> {
  await requireRole("super_admin", "manager", "billing");
  if (!ids.length) return { count: 0 };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("verify_payments", { p_ids: ids });
  if (error) return { error: error.message };
  revalidatePath("/payments");
  revalidatePath("/dashboard");
  return { count: data as number };
}

export async function rejectCollection(id: string, reason: string): Promise<{ ok?: boolean; error?: string }> {
  await requireRole("super_admin", "manager", "billing");
  const supabase = await createClient();
  const { error } = await supabase.rpc("reject_payment", { p_id: id, p_reason: reason });
  if (error) return { error: error.message };
  revalidatePath("/payments");
  revalidatePath("/retailers");
  return { ok: true };
}
