"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { LOGO_BUCKET, LOGO_PATH_RE } from "@/lib/branding";

export type SettingsState = { ok?: string; error?: string };

const optional = z.string().trim().transform((v) => v || null);

const schema = z.object({
  legal_name: z.string().trim().min(2, "Enter the company name"),
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z])?$/, "GSTIN format is not valid")
    .transform((v) => v || null),
  state_code: z.string().trim().regex(/^[0-9]{2}$/, "State code is 2 digits, e.g. 27 for Maharashtra"),
  address: optional,
  phone: optional,
  email: optional,
  bank_details: optional,
  invoice_terms: optional,
  doc_prefix: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,6}$/, "Prefix: 2–6 letters or digits"),
  billing_max_discount: z.coerce.number().min(0).max(100, "Discount limit is 0–100%"),
  salesman_max_discount: z.coerce.number().min(0).max(100, "Discount limit is 0–100%"),
  reorder_lead_days: z.coerce.number().int().min(0).max(180),
  reorder_cover_days: z.coerce.number().int().min(1).max(365),
  expense_claim_days: z.coerce.number().int().min(1, "Claim window is 1–365 days").max(365, "Claim window is 1–365 days"),
  geofence_radius_m: z.coerce.number().int().min(20, "Shop radius is 20–5000 m").max(5000, "Shop radius is 20–5000 m"),
  gps_min_accuracy_m: z.coerce.number().int().min(5, "GPS accuracy is 5–2000 m").max(2000, "GPS accuracy is 5–2000 m"),
  live_location_minutes: z.coerce.number().int().min(2).max(120),
});

export async function saveSettings(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  await requireRole("super_admin");
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const data = parsed.data;
  if (data.gstin && data.gstin.slice(0, 2) !== data.state_code) {
    return { error: "The first two digits of the GSTIN must match the state code." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("company_settings").update(data).eq("id", 1);
  if (error) return { error: error.message };

  revalidatePath("/admin/settings");
  return { ok: "Company details saved." };
}

// The business's logo (uploaded from the browser to branding/<business>/logo-….png).
// Shown in the app, on the business's sign-in page and on every document.
export async function setCompanyLogo(path: string | null): Promise<SettingsState> {
  const { tenant } = await requireRole("super_admin");
  if (path && !(path.startsWith(`${tenant.id}/`) && LOGO_PATH_RE.test(path))) return { error: "Wrong file location." };
  const supabase = await createClient();
  const { data: old } = await supabase.from("company_settings").select("logo_path").eq("id", 1).single();
  const { error } = await supabase.from("company_settings").update({ logo_path: path }).eq("id", 1);
  if (error) return { error: error.message };
  if (old?.logo_path && old.logo_path !== path) await supabase.storage.from(LOGO_BUCKET).remove([old.logo_path as string]);
  revalidatePath("/", "layout");
  return { ok: path ? "Logo saved." : "Logo removed." };
}
