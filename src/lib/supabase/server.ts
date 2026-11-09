import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { TENANT_COOKIE, TENANT_HEADER, UUID_RE } from "@/lib/tenant-shared";
import { assertSupabaseEnv, SUPABASE_ANON_KEY, SUPABASE_URL } from "./env";

// Server-side Supabase client acting as the signed-in user.
// Every query runs under that user's row-level security, in the business
// (tenant) chosen in the dms_tenant cookie. The database checks the user is
// an active member of it; otherwise every query returns nothing.
export async function createClient() {
  const cookieStore = await cookies(); // first, so pages render per request
  assertSupabaseEnv();

  const tenant = cookieStore.get(TENANT_COOKIE)?.value;
  const headers: Record<string, string> = tenant && UUID_RE.test(tenant) ? { [TENANT_HEADER]: tenant } : {};

  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component: middleware refreshes the session instead.
        }
      },
    },
  });
}
