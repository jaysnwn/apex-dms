import "server-only";

import { createClient } from "@supabase/supabase-js";
import { assertSupabaseEnv, SUPABASE_URL } from "./env";

// Service-role client. Bypasses RLS — use ONLY in server actions that have
// already checked the caller is a Super Administrator (see requireRole).
export function createAdminClient() {
  assertSupabaseEnv();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY (server-only). Add it to .env.local / Vercel env.");
  }
  return createClient(SUPABASE_URL, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
