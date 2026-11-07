import "server-only";

import type { PostgrestError } from "@supabase/supabase-js";
import type { ZodError } from "zod";

// Turn database / validation errors into messages staff can act on.
export function dbError(error: PostgrestError | null | undefined): string | undefined {
  if (!error) return undefined;
  if (error.code === "23505") {
    if (error.message.includes("products_sku") || error.message.includes("products_brand_sku")) return "Another product of this brand already uses this model number / SKU.";
    if (error.message.includes("products_barcode") || error.message.includes("products_brand_barcode")) return "Another product of this brand already uses this barcode.";
    if (error.message.includes("stock_movements_client_uuid")) return "This entry was already saved.";
    if (error.message.includes("retailers_mobile")) return "A retailer with this mobile number already exists.";
    if (error.message.includes("retailers_gstin")) return "A retailer with this GSTIN already exists.";
    if (error.message.includes("name_key")) return "That name is already in use.";
    return "This record already exists.";
  }
  if (error.code === "23514") {
    if (error.message.includes("mobile")) return "Mobile must be a valid 10-digit Indian number.";
    if (error.message.includes("gstin")) return "GSTIN format is not valid.";
    return "One of the values is not allowed.";
  }
  if (error.code === "42501") return "Your role is not allowed to do this.";
  return error.message;
}

export function zodMessage(error: ZodError) {
  const issue = error.issues[0];
  return issue?.message ?? "Please check the form.";
}

// FormData -> plain object with empty strings removed.
export function formObject(formData: FormData) {
  const out: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    if (typeof v === "string") out[k] = v.trim();
  }
  return out;
}
