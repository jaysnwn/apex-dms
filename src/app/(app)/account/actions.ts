"use server";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { allowAttempt, TOO_MANY } from "@/lib/rate-limit";
import { passwordProblem } from "@/lib/password-policy";

export type PasswordState = { ok?: string; error?: string };

export async function changePassword(_prev: PasswordState, formData: FormData): Promise<PasswordState> {
  const { user } = await requireRole();
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  const problem = passwordProblem(next, { email: user.email });
  if (problem) return { error: problem };
  if (next !== confirm) return { error: "The two new passwords do not match." };
  if (next === current) return { error: "Choose a password different from the current one." };
  if (!(await allowAttempt(`password:${user.id}`, 5, 900))) return { error: TOO_MANY };

  const supabase = await createClient();
  const { error: verifyError } = await supabase.auth.signInWithPassword({ email: user.email!, password: current });
  if (verifyError) return { error: "Current password is incorrect." };

  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) return { error: error.message };
  return { ok: "Password changed." };
}
