"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { ROLES, type AppRole } from "@/lib/roles";

export type ActionState = { ok?: string; error?: string };

const roleSchema = z.enum(ROLES as [AppRole, ...AppRole[]]);

const createSchema = z.object({
  full_name: z.string().trim().min(2, "Enter the full name"),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  phone: z
    .string()
    .trim()
    .regex(/^([6-9][0-9]{9})?$/, "Mobile must be 10 digits")
    .optional(),
  role: roleSchema,
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export async function createUser(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole("super_admin");

  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { full_name, email, phone, role, password } = parsed.data;

  const brandIds = formData.getAll("brand_ids").map(String).filter(Boolean);
  if (role !== "super_admin" && brandIds.length === 0) return { error: "Tick at least one brand this user works with." };

  const admin = createAdminClient();
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role },
    user_metadata: { full_name, phone: phone || null },
  });

  if (error) {
    return { error: error.message.includes("already") ? "A user with this email already exists." : error.message };
  }

  // Brand access (CONQRETE / BLUEI / both). Runs as the signed-in Super Admin.
  const supabase = await createClient();
  const { error: bErr } = await supabase.rpc("set_user_brands", { p_user: created.user.id, p_brands: brandIds });
  if (bErr) return { error: `User created, but brand access could not be saved: ${bErr.message}` };

  revalidatePath("/admin/users");
  return { ok: `${full_name} can now sign in as ${email}.` };
}

const updateSchema = z.object({
  id: z.string().uuid(),
  full_name: z.string().trim().min(2, "Enter the full name"),
  phone: z
    .string()
    .trim()
    .regex(/^([6-9][0-9]{9})?$/, "Mobile must be 10 digits")
    .optional(),
  role: roleSchema,
  is_active: z.enum(["true", "false"]),
});

export async function updateUser(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { profile: me } = await requireRole("super_admin");

  const parsed = updateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { id, full_name, phone, role, is_active } = parsed.data;
  const active = is_active === "true";
  const isSelf = id === me.id;

  if (isSelf && !active) return { error: "You cannot disable your own account." };

  const supabase = await createClient();
  const { data: before } = await supabase.from("profiles").select("role, is_active").eq("id", id).single();
  if (!before) return { error: "User not found." };

  // Profile change runs as the signed-in admin, so RLS, the audit trigger and the
  // "last Super Administrator" guard all apply.
  const { error } = await supabase
    .from("profiles")
    .update({ full_name, phone: phone || null, role, is_active: active })
    .eq("id", id);
  if (error) return { error: error.message };

  const brandIds = formData.getAll("brand_ids").map(String).filter(Boolean);
  if (role !== "super_admin" && brandIds.length === 0) return { error: "Tick at least one brand this user works with." };
  const { error: bErr } = await supabase.rpc("set_user_brands", { p_user: id, p_brands: brandIds });
  if (bErr) return { error: `Saved, but brand access could not be changed: ${bErr.message}` };

  // Touch the auth record only when something it holds actually changed.
  // Supabase signs the user out everywhere whenever ban status is changed, so
  // never send ban_duration unless the account is really being enabled/disabled.
  const authUpdate: { ban_duration?: string; app_metadata?: { role: AppRole } } = {};
  if (before.is_active !== active) authUpdate.ban_duration = active ? "none" : "876000h";
  if (before.role !== role) authUpdate.app_metadata = { role };

  if (Object.keys(authUpdate).length > 0) {
    const admin = createAdminClient();
    const { error: authError } = await admin.auth.admin.updateUserById(id, authUpdate);
    if (authError) return { error: `Saved, but sign-in status could not be updated: ${authError.message}` };
  }

  revalidatePath("/admin/users");
  return { ok: !active && before.is_active ? "Saved. The user has been signed out and cannot sign in." : "Saved." };
}

const passwordSchema = z.object({
  id: z.string().uuid(),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export async function resetPassword(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole("super_admin");

  const parsed = passwordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(parsed.data.id, { password: parsed.data.password });
  if (error) return { error: error.message };
  return { ok: "Password changed. Share it with the user privately." };
}
