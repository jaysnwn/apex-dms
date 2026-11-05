"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

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
