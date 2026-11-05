import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

// Signed URLs for private product photos (valid 1 hour).
export async function signProductImages(supabase: SupabaseClient, paths: (string | null | undefined)[]) {
  const unique = [...new Set(paths.filter((p): p is string => !!p))];
  const map = new Map<string, string>();
  if (unique.length === 0) return map;
  const { data } = await supabase.storage.from("product-images").createSignedUrls(unique, 3600);
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) map.set(item.path, item.signedUrl);
  }
  return map;
}
