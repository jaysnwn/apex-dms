"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ExpenseDetail, ExpenseEvent, ExpenseRow, ReimbursementRef } from "@/lib/expense-labels";

// Every action below goes through a database function that re-checks the role,
// the expense's state and the amounts. These checks are only for friendly messages.

type Result<T = object> = ({ ok: true } & T) | { ok?: false; error: string; hint?: string };

function fail(e: { message: string; hint?: string | null } | null): { error: string; hint?: string } {
  return { error: e?.message ?? "Something went wrong", hint: e?.hint ?? undefined };
}
function refresh() {
  revalidatePath("/expenses");
  revalidatePath("/m/expenses");
  revalidatePath("/m");
}

const uuid = z.string().guid();
const optUuid = z.string().guid().nullish().or(z.literal("").transform(() => null));

const SaveInput = z.object({
  id: optUuid,
  employeeId: optUuid,
  categoryId: uuid,
  amount: z.number().positive("Enter an amount above zero").max(1000000, "Amount looks too large"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the date"),
  routeId: optUuid,
  brandId: optUuid,
  description: z.string().max(500).optional().default(""),
  paymentMethod: z.enum(["cash", "upi", "bank", "company_card", "other"]).nullish(),
  paidBy: z.enum(["employee", "company"]).default("employee"),
  receiptPath: z.string().max(300).nullish(),
  notes: z.string().max(1000).optional().default(""),
  submit: z.boolean(),
  clientUuid: optUuid,
  source: z.enum(["office", "salesman_app"]).default("office"),
});
export type SaveExpenseInput = z.input<typeof SaveInput>;

export async function saveExpense(input: SaveExpenseInput): Promise<Result<{ id: string; expenseNo: string | null; status: string; duplicate: boolean }>> {
  await requireRole();
  const p = SaveInput.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Check the form" };
  const v = p.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("expense_save", {
    p_id: v.id ?? null,
    p_employee_id: v.employeeId ?? null,
    p_category_id: v.categoryId,
    p_amount: Math.round(v.amount * 100) / 100,
    p_expense_date: v.date,
    p_route_id: v.routeId ?? null,
    p_brand_id: v.brandId ?? null,
    p_description: v.description,
    p_payment_method: v.paymentMethod ?? null,
    p_paid_by: v.paidBy,
    p_receipt_path: v.receiptPath ?? null,
    p_notes: v.notes,
    p_submit: v.submit,
    p_client_uuid: v.clientUuid ?? null,
    p_source: v.source,
  });
  if (error) return fail(error);
  refresh();
  const r = data as { id: string; expense_no: string | null; status: string; duplicate: boolean };
  return { ok: true, id: r.id, expenseNo: r.expense_no, status: r.status, duplicate: r.duplicate };
}

export async function submitExpense(id: string): Promise<Result<{ status: string }>> {
  await requireRole();
  if (!uuid.safeParse(id).success) return { error: "Unknown expense" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("expense_submit", { p_id: id });
  if (error) return fail(error);
  refresh();
  return { ok: true, status: data as string };
}

export async function deleteExpense(id: string): Promise<Result<{ result: string }>> {
  await requireRole();
  if (!uuid.safeParse(id).success) return { error: "Unknown expense" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("expense_delete", { p_id: id });
  if (error) return fail(error);
  refresh();
  return { ok: true, result: data as string };
}

const ReviewInput = z.object({
  ids: z.array(uuid).min(1, "Choose expenses").max(200),
  decision: z.enum(["approve", "reject", "return"]),
  reason: z.string().max(500).optional(),
  amounts: z.record(z.string(), z.number().positive()).optional(),
});

export async function reviewExpenses(input: z.input<typeof ReviewInput>): Promise<Result<{ count: number }>> {
  await requireRole("super_admin", "manager");
  const p = ReviewInput.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Check the form" };
  if (p.data.decision !== "approve" && !p.data.reason?.trim()) return { error: "Enter the reason" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("expense_review", {
    p_ids: p.data.ids,
    p_decision: p.data.decision,
    p_reason: p.data.reason?.trim() || null,
    p_amounts: p.data.amounts && Object.keys(p.data.amounts).length ? p.data.amounts : null,
  });
  if (error) return fail(error);
  refresh();
  return { ok: true, count: data as number };
}

export async function cancelExpense(id: string, reason: string): Promise<Result> {
  await requireRole("super_admin", "manager");
  if (!reason.trim()) return { error: "Enter the reason" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("expense_cancel", { p_id: id, p_reason: reason.trim() });
  if (error) return fail(error);
  refresh();
  return { ok: true };
}

const PayInput = z.object({
  lines: z.array(z.object({ expenseId: uuid, amount: z.number().positive() })).min(1, "Choose the expenses to pay"),
  paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  method: z.enum(["cash", "upi", "bank_transfer", "cheque"]),
  reference: z.string().max(100).optional().default(""),
  notes: z.string().max(500).optional().default(""),
  proofPath: z.string().max(300).nullish(),
  clientUuid: uuid,
});

export async function reimburseExpenses(input: z.input<typeof PayInput>): Promise<Result<{ id: string }>> {
  await requireRole("super_admin", "manager", "billing");
  const p = PayInput.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Check the form" };
  const v = p.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reimburse_expenses", {
    p_lines: v.lines.map((l) => ({ expense_id: l.expenseId, amount: Math.round(l.amount * 100) / 100 })),
    p_paid_on: v.paidOn,
    p_method: v.method,
    p_reference: v.reference || null,
    p_notes: v.notes || null,
    p_proof_path: v.proofPath ?? null,
    p_client_uuid: v.clientUuid,
  });
  if (error) return fail(error);
  refresh();
  return { ok: true, id: data as string };
}

export async function cancelReimbursement(id: string, reason: string): Promise<Result> {
  await requireRole("super_admin");
  if (!reason.trim()) return { error: "Enter the reason" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_reimbursement", { p_id: id, p_reason: reason.trim() });
  if (error) return fail(error);
  refresh();
  return { ok: true };
}

// Everything the detail panel shows: the expense, a receipt link, history and payments.
export async function getExpenseDetail(id: string): Promise<Result<{ detail: ExpenseDetail }>> {
  await requireRole();
  if (!uuid.safeParse(id).success) return { error: "Unknown expense" };
  const supabase = await createClient();
  const { data: e } = await supabase.from("expense_list").select("*").eq("id", id).maybeSingle<ExpenseRow>();
  if (!e) return { error: "Expense not found" };
  const [{ data: ev }, { data: lines }] = await Promise.all([
    supabase.from("expense_events").select("id, action, old_status, new_status, amount, performed_by, remarks, created_at").eq("expense_id", id).order("id"),
    supabase.from("reimbursement_lines").select("amount, reimbursements(id, reimbursement_no, paid_on, method, reference_no, amount, cancelled_at, notes, proof_path)").eq("expense_id", id),
  ]);
  const people = [...new Set((ev ?? []).map((x) => x.performed_by).filter(Boolean))] as string[];
  const { data: names } = people.length ? await supabase.from("tenant_people").select("id, full_name").in("id", people) : { data: [] };
  const nm = new Map((names ?? []).map((n) => [n.id as string, n.full_name as string]));
  const paths = [e.receipt_path, ...(lines ?? []).map((l) => (l.reimbursements as unknown as { proof_path: string | null } | null)?.proof_path)].filter(Boolean) as string[];
  const { data: signed } = paths.length ? await supabase.storage.from("expense-receipts").createSignedUrls(paths, 3600) : { data: [] };
  const url = new Map((signed ?? []).filter((s) => s.signedUrl).map((s) => [s.path as string, s.signedUrl as string]));
  const events: ExpenseEvent[] = (ev ?? []).map((x) => ({ ...x, performer: x.performed_by ? nm.get(x.performed_by) ?? null : null }) as ExpenseEvent);
  const payments: ReimbursementRef[] = (lines ?? []).map((l) => {
    const r = l.reimbursements as unknown as Omit<ReimbursementRef, "line_amount" | "proof_url"> & { proof_path: string | null };
    return { ...r, line_amount: Number(l.amount), proof_url: r.proof_path ? url.get(r.proof_path) ?? null : null };
  }).sort((a, b) => a.paid_on.localeCompare(b.paid_on));
  return { ok: true, detail: { expense: e, receiptUrl: e.receipt_path ? url.get(e.receipt_path) ?? null : null, events, payments } };
}

// ---------- Categories (Manager / Super Admin) ----------
const CategoryInput = z.object({
  id: optUuid,
  name: z.string().trim().min(1, "Enter the name").max(60),
  receipt_required: z.boolean(),
  route_required: z.boolean(),
  approval_required: z.boolean(),
  auto_approve_limit: z.number().min(0).max(1000000),
  is_active: z.boolean(),
  sort_order: z.number().int().min(0).max(100000),
});

export async function saveExpenseCategory(input: z.input<typeof CategoryInput>): Promise<Result> {
  await requireRole("super_admin", "manager");
  const p = CategoryInput.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Check the form" };
  const { id, ...row } = p.data;
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("expense_categories").update(row).eq("id", id)
    : await supabase.from("expense_categories").insert(row);
  if (error) return { error: error.code === "23505" ? "A category with this name already exists" : error.message };
  revalidatePath("/expenses/categories");
  refresh();
  return { ok: true };
}
