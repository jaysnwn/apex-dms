import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { OWNER_COOKIE, TENANT_COOKIE, TENANT_HEADER, UUID_RE } from "@/lib/tenant-shared";
import { assertSupabaseEnv, SUPABASE_ANON_KEY, SUPABASE_URL } from "./env";
import { capWatchingFetch } from "./row-cap";

// Server-side Supabase client acting as the signed-in user.
// Every query runs under that user's row-level security, in the business
// (tenant) chosen in the dms_tenant cookie. The database checks the user is
// an active member of it; otherwise every query returns nothing.
// A list that came back exactly full (1,000 rows) was probably cut short:
// one log line for the hosting's logs and one row in the error log.
function reportCappedList(table: string, user: string | undefined, tenant: string | undefined) {
  const message = `List cut at 1,000 rows: ${table}. Page through it with allRows() (src/lib/all-rows.ts).`;
  console.error(JSON.stringify({ level: "error", at: new Date().toISOString(), kind: "row-cap", table, message }));
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return;
  void fetch(`${SUPABASE_URL}/rest/v1/rpc/report_app_error`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      p_source: "server", p_message: message, p_digest: null, p_path: null, p_detail: "row-cap",
      p_user: user && UUID_RE.test(user) ? user : null, p_tenant: tenant && UUID_RE.test(tenant) ? tenant : null,
    }),
    signal: AbortSignal.timeout(3000),
  }).then(() => undefined, () => undefined);
}

export async function createClient() {
  const cookieStore = await cookies(); // first, so pages render per request
  assertSupabaseEnv();

  const tenant = cookieStore.get(TENANT_COOKIE)?.value;
  const headers: Record<string, string> = tenant && UUID_RE.test(tenant) ? { [TENANT_HEADER]: tenant } : {};

  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers, fetch: capWatchingFetch((table) => reportCappedList(table, cookieStore.get(OWNER_COOKIE)?.value, tenant)) },
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
