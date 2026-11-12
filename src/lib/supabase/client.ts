"use client";

import { createBrowserClient } from "@supabase/ssr";
import { OWNER_COOKIE, TENANT_COOKIE, TENANT_HEADER, UUID_RE } from "@/lib/tenant-shared";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./env";
import type { Database } from "./database";

function uuidCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]+)`));
  const v = m ? decodeURIComponent(m[1]) : null;
  return v && UUID_RE.test(v) ? v : null;
}

// The business (tenant) this browser is working in, from the dms_tenant cookie.
export function currentTenantId(): string | null {
  return uuidCookie(TENANT_COOKIE);
}

// The person signed in on this browser (set by the middleware).
export function currentUserId(): string | null {
  return uuidCookie(OWNER_COOKIE);
}

// Browser-side Supabase client (the signed-in user's session cookie), sending
// the chosen business with every request. Not shared between calls, so a
// business switch is picked up at once.
export function createClient() {
  const tenant = currentTenantId();
  return createBrowserClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
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
// business AND per person: switching business never sends or shows another
// business's data, and on a shared phone the next person never sees the
// previous one's outlets nor sends their queued orders under their own name.
export function tenantKey(base: string) {
  const tenant = currentTenantId() ?? "none";
  const user = currentUserId() ?? "anon";
  const key = `${base}:${tenant}:${user}`;
  // Kept per business only (before per-person keys): hand it to the person
  // signed in now, once.
  if (user !== "anon") {
    try {
      const old = `${base}:${tenant}`;
      const v = localStorage.getItem(old);
      if (v !== null) {
        if (localStorage.getItem(key) === null) localStorage.setItem(key, v);
        localStorage.removeItem(old);
      }
    } catch {
      /* storage blocked */
    }
  }
  return key;
}
