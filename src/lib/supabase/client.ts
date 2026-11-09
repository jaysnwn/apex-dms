"use client";

import { createBrowserClient } from "@supabase/ssr";
import { TENANT_COOKIE, TENANT_HEADER, UUID_RE } from "@/lib/tenant-shared";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./env";

// The business (tenant) this browser is working in, from the dms_tenant cookie.
export function currentTenantId(): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${TENANT_COOKIE}=([^;]+)`));
  const v = m ? decodeURIComponent(m[1]) : null;
  return v && UUID_RE.test(v) ? v : null;
}

// Browser-side Supabase client (the signed-in user's session cookie), sending
// the chosen business with every request. Not shared between calls, so a
// business switch is picked up at once.
export function createClient() {
  const tenant = currentTenantId();
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: tenant ? { [TENANT_HEADER]: tenant } : {} },
    isSingleton: false,
  });
}

// Files go under the business's own folder: <tenant_id>/...
// Storage refuses files outside the current business's folder.
export function tenantStoragePath(rest: string) {
  const tenant = currentTenantId();
  if (!tenant) throw new Error("No organization selected. Reload the page and try again.");
  return `${tenant}/${rest.replace(/^\/+/, "")}`;
}

// Data kept on this device (offline queues, caches, drafts) is kept per
// business, so switching business never sends or shows another business's data.
export function tenantKey(base: string) {
  return `${base}:${currentTenantId() ?? "none"}`;
}
