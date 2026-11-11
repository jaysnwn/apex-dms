import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { SUPABASE_URL } from "@/lib/supabase/env";

// Each business's own logo (Admin → Company). The file sits in the public
// "branding" bucket, in that business's folder: a logo is printed on every
// invoice and shown on the business's sign-in page, so it is not secret.
export const LOGO_BUCKET = "branding";
export const LOGO_PATH_RE = /^[0-9a-f-]{36}\/logo-[0-9]+\.(png|jpg)$/;

export function logoUrl(path: string | null | undefined): string | null {
  if (!path || !LOGO_PATH_RE.test(path)) return null;
  return `${SUPABASE_URL}/storage/v1/object/public/${LOGO_BUCKET}/${path}`;
}

// The current business's logo address, once per request (null = none set).
export const getCompanyLogoUrl = cache(async (): Promise<string | null> => {
  const supabase = await createClient();
  const { data } = await supabase.from("company_settings").select("logo_path").limit(1).maybeSingle();
  return logoUrl(data?.logo_path as string | null | undefined);
});

// The logo file itself, for PDFs (null = none set, or not readable).
export async function getCompanyLogoFile(): Promise<{ data: Buffer; format: "png" | "jpg" } | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("company_settings").select("logo_path").limit(1).maybeSingle();
  const path = data?.logo_path as string | null | undefined;
  if (!path || !LOGO_PATH_RE.test(path)) return null;
  const { data: blob } = await supabase.storage.from(LOGO_BUCKET).download(path);
  if (!blob) return null;
  return { data: Buffer.from(await blob.arrayBuffer()), format: path.endsWith(".png") ? "png" : "jpg" };
}
