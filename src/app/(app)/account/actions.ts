"use server";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type PasswordState = { ok?: string; error?: string };

export async function changePassword(_prev: PasswordState, formData: FormData): Promise<PasswordState> {
  const { user } = await requireRole();
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (next.length < 8) return { error: "New password must be at least 8 characters." };
  if (next !== confirm) return { error: "The two new passwords do not match." };

  const supabase = await createClient();
  const { error: verifyError } = await supabase.auth.signInWithPassword({ email: user.email!, password: current });
  if (verifyError) return { error: "Current password is incorrect." };

  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) return { error: error.message };
  return { ok: "Password changed." };
}
