"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { ROLES, type AppRole } from "@/lib/roles";
import { allowAttempt, TOO_MANY } from "@/lib/rate-limit";
import { passwordProblem } from "@/lib/password-policy";

export type ActionState = { ok?: string; error?: string };

// Users here are people of THIS business (tenant). One login can work for
// several businesses; each business decides only its own role / status for
// that person. Everything goes through database functions that check the
// caller is this business's Super Admin and the person belongs to it.

const roleSchema = z.enum(ROLES as [AppRole, ...AppRole[]]);
const phoneSchema = z
  .string()
  .trim()
  .regex(/^([6-9][0-9]{9})?$/, "Mobile must be 10 digits")
  .optional();

const createSchema = z.object({
  full_name: z.string().trim().min(2, "Enter the full name"),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  phone: phoneSchema,
  role: roleSchema,
  password: z.string().optional(),
});

// The service key sees every business. Used only for login accounts (create,
// sign-in block, password), never to read business data.
async function activeMembershipCount(userId: string) {
  const admin = createAdminClient();
  const { count } = await admin.from("tenant_members").select("user_id", { count: "exact", head: true })
    .eq("user_id", userId).eq("is_active", true);
  return count ?? 0;
}

export async function createUser(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { tenant, user: me } = await requireRole("super_admin");

  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { full_name, email, phone, role, password } = parsed.data;

  const brandIds = formData.getAll("brand_ids").map(String).filter(Boolean);
  if (role !== "super_admin" && brandIds.length === 0) return { error: "Tick at least one brand this user works with." };
  if (!(await allowAttempt(`admin:${me.id}`, 30, 600))) return { error: TOO_MANY };

  const supabase = await createClient();

  // Someone who already has a login (for another business) joins this one:
  // no new account, no password change — they sign in as they always do.
  const { data: existingId, error: addErr } = await supabase.rpc("add_member", { p_email: email, p_role: role });
  if (addErr) return { error: addErr.message };
  let userId = existingId as string | null;
  let joined = !!userId;

  if (!userId) {
    const problem = passwordProblem(password ?? "", { email, name: full_name });
    if (problem) return { error: problem };
    const admin = createAdminClient();
    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      // the database makes the person a member of THIS business only
      app_metadata: { role, tenant_id: tenant.id },
      user_metadata: { full_name, phone: phone || null },
    });
    if (error) return { error: error.message };
    userId = created.user.id;
    joined = false;
  }

  const { error: bErr } = await supabase.rpc("set_user_brands", { p_user: userId, p_brands: brandIds });
  if (bErr) return { error: `User added, but brand access could not be saved: ${bErr.message}` };

  revalidatePath("/admin/users");
  return {
    ok: joined
      ? `${email} already had a login; they now also work for ${tenant.display_name} and sign in with their usual password.`
      : `${full_name} can now sign in as ${email}.`,
  };
}

const updateSchema = z.object({
  id: z.string().uuid(),
  full_name: z.string().trim().min(2, "Enter the full name"),
  phone: phoneSchema,
  role: roleSchema,
  is_active: z.enum(["true", "false"]),
});

export async function updateUser(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole("super_admin");

  const parsed = updateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { id, full_name, phone, role, is_active } = parsed.data;
  const active = is_active === "true";
  const canReimburse = formData.get("can_reimburse") === "true";

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_member", {
    p_user: id, p_role: role, p_active: active, p_can_reimburse: canReimburse,
    p_full_name: full_name, p_phone: phone || null,
  });
  if (error) return { error: error.message };

  const brandIds = formData.getAll("brand_ids").map(String).filter(Boolean);
  if (role !== "super_admin" && brandIds.length === 0) return { error: "Tick at least one brand this user works with." };
  const { error: bErr } = await supabase.rpc("set_user_brands", { p_user: id, p_brands: brandIds });
  if (bErr) return { error: `Saved, but brand access could not be changed: ${bErr.message}` };

  // The login itself is blocked only when the person is active in no business
  // at all; someone disabled here keeps signing in to their other businesses.
  // Supabase signs the user out everywhere whenever the block changes, so only
  // touch it when it really has to change.
  const admin = createAdminClient();
  const { data: authUser } = await admin.auth.admin.getUserById(id);
  const blocked = !!authUser.user?.banned_until && new Date(authUser.user.banned_until) > new Date();
  const shouldBlock = (await activeMembershipCount(id)) === 0;
  if (blocked !== shouldBlock) {
    const { error: authError } = await admin.auth.admin.updateUserById(id, { ban_duration: shouldBlock ? "876000h" : "none" });
    if (authError) return { error: `Saved, but sign-in status could not be updated: ${authError.message}` };
  }

  revalidatePath("/admin/users");
  return { ok: !active ? (shouldBlock ? "Saved. The user has been signed out and cannot sign in." : "Saved. They can no longer work in this organization.") : "Saved." };
}

const passwordSchema = z.object({
  id: z.string().uuid(),
  password: z.string().min(1, "Enter the new password"),
});

export async function resetPassword(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user: me } = await requireRole("super_admin");

  const parsed = passwordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const problem = passwordProblem(parsed.data.password);
  if (problem) return { error: problem };
  if (!(await allowAttempt(`admin:${me.id}`, 30, 600))) return { error: TOO_MANY };

  // A login that also opens another business is not this business's to reset.
  const supabase = await createClient();
  const { data: allowed, error: checkErr } = await supabase.rpc("password_reset_allowed", { p_user: parsed.data.id });
  if (checkErr) return { error: checkErr.message };
  if (!allowed) {
    return { error: "This person also works for another organization. Only they can change their password (Account → Change password)." };
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(parsed.data.id, { password: parsed.data.password });
  if (error) return { error: error.message };
  return { ok: "Password changed. Share it with the user privately." };
}
