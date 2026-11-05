"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function submitExpense(input: { category: string; amount: number; date: string; description: string; routeId?: string | null; receiptPath?: string | null; clientUuid?: string }) {
  const { user } = await requireRole();
  if (!(input.amount > 0)) return { error: "Enter the amount." };
  const supabase = await createClient();
  if (input.clientUuid) {
    const { data: ex } = await supabase.from("expenses").select("id").eq("client_uuid", input.clientUuid).maybeSingle();
    if (ex) return { ok: true };
  }
  const { error } = await supabase.from("expenses").insert({
    salesman_id: user.id,
    category: input.category,
    amount: input.amount,
    expense_date: input.date,
    description: input.description || null,
    route_id: input.routeId || null,
    receipt_path: input.receiptPath || null,
    client_uuid: input.clientUuid ?? null,
  });
  if (error) return { error: error.message };
  revalidatePath("/expenses");
  return { ok: true };
}

export async function reviewExpense(id: string, decision: "approved" | "rejected", reason?: string) {
  const { user } = await requireRole("super_admin", "manager");
  if (decision === "rejected" && !reason?.trim()) return { error: "Enter the reason for rejection." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("expenses")
    .update({ status: decision, reviewed_by: user.id, reviewed_at: new Date().toISOString(), rejection_reason: decision === "rejected" ? reason : null })
    .eq("id", id)
    .eq("status", "submitted");
  if (error) return { error: error.message };
  revalidatePath("/expenses");
  return { ok: true };
}

export async function reimburse(ids: string[], method: "cash" | "upi" | "bank_transfer" | "cheque", reference: string) {
  await requireRole("super_admin", "manager");
  const supabase = await createClient();
  const { error } = await supabase.rpc("reimburse_expenses", { p_expense_ids: ids, p_method: method, p_reference: reference || null });
  if (error) return { error: error.message };
  revalidatePath("/expenses");
  return { ok: true };
}
