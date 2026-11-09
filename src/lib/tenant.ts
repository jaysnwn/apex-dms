import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/roles";
import { TENANT_COOKIE } from "@/lib/tenant-shared";

export type TenantStatus = "trial" | "active" | "suspended" | "closed";
export type TenantSummary = {
  id: string;
  slug: string;
  display_name: string;
  role: AppRole;
  status: TenantStatus;
  is_default: boolean;
};

const isOpen = (t: TenantSummary) => t.status === "trial" || t.status === "active";

// The businesses this user works for, and the one this request works in.
// The same rule as the database's current_tenant_id():
//   chosen in the cookie (if the user is an active member and it is open),
//   otherwise the default business, otherwise the only one.
export const getTenantContext = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_tenants");
  const tenants = ((data ?? []) as TenantSummary[]).filter((t) => t.status !== "closed");
  const open = tenants.filter(isOpen);
  const chosen = (await cookies()).get(TENANT_COOKIE)?.value ?? null;

  let current: TenantSummary | null;
  if (chosen) {
    current = open.find((t) => t.id === chosen) ?? null;
  } else {
    current = open.find((t) => t.is_default) ?? (open.length === 1 ? open[0] : null);
  }
  return { tenants, open, current, chosen };
});

// Which business to open when the user named none (sign-in, first visit).
export function pickDefault(tenants: TenantSummary[]) {
  const open = tenants.filter(isOpen);
  return open.find((t) => t.is_default) ?? (open.length === 1 ? open[0] : null);
}

export function isOpenTenant(t: TenantSummary) {
  return isOpen(t);
}
