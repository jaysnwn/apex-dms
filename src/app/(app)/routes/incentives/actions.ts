"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { dbError } from "@/lib/actions";

export async function approveMonth(month: string, override = false): Promise<{ ok?: boolean; count?: number; error?: string }> {
  await requireRole("super_admin", "manager");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("approve_incentives", { p_month: month, p_override: override });
  if (error) return { error: dbError(error) };
  revalidatePath("/routes/incentives");
  return { ok: true, count: data as number };
}

export async function markPaid(id: string, method: string, reference: string): Promise<{ ok?: boolean; error?: string }> {
  await requireRole("super_admin", "manager");
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_incentive_paid", { p_payout_id: id, p_method: method, p_reference: reference || null });
  if (error) return { error: dbError(error) };
  revalidatePath("/routes/incentives");
  return { ok: true };
}

export async function reopenPayout(id: string): Promise<{ ok?: boolean; error?: string }> {
  await requireRole("super_admin");
  const supabase = await createClient();
  const { error } = await supabase.rpc("reopen_incentive", { p_payout_id: id });
  if (error) return { error: dbError(error) };
  revalidatePath("/routes/incentives");
  return { ok: true };
}

const schemeSchema = z.object({
  effective_from: z.string().regex(/^\d{4}-\d{2}$/, "Choose the month it starts from"),
  sales_target: z.number().positive("Sales target must be above zero"),
  sales_amount: z.number().min(0),
  billed_target: z.number().int().positive(),
  billed_amount: z.number().min(0),
  smart_target: z.number().int().positive(),
  smart_min_purchase: z.number().positive(),
  smart_pay_days: z.number().int().min(1).max(90),
  smart_amount: z.number().min(0),
  recovery_pct: z.number().gt(0).max(100),
  recovery_amount: z.number().min(0),
  notes: z.string().optional(),
});

export async function saveScheme(input: z.input<typeof schemeSchema>): Promise<{ ok?: boolean; error?: string }> {
  await requireRole("super_admin");
  const parsed = schemeSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const v = parsed.data;
  const supabase = await createClient();
  const from = `${v.effective_from}-01`;
  const { data: locked } = await supabase.from("incentive_payouts").select("id").gte("month", from).limit(1);
  if ((locked ?? []).length) return { error: "Months from this date are already approved. Choose a later month." };
  // One scheme per start month: replace a same-month entry instead of failing.
  await supabase.from("incentive_schemes").delete().eq("effective_from", from);
  const { error } = await supabase.from("incentive_schemes").insert({ ...v, effective_from: from, notes: v.notes || null });
  if (error) return { error: dbError(error) };
  revalidatePath("/routes/incentives");
  revalidatePath("/m");
  return { ok: true };
}
