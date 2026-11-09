import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext, type TenantSummary } from "@/lib/tenant";
import type { AppRole } from "@/lib/roles";

// The signed-in person. role and is_active are their role and status in the
// business (tenant) this request works in — a person can be a salesman for
// one distributor and a manager for another.
export type Profile = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  role: AppRole;
  is_active: boolean;
  created_at: string;
};

// The signed-in user, their profile and their business, once per request.
export const getSession = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: person }, ctx] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email, phone, created_at").eq("id", user.id).single(),
    getTenantContext(),
  ]);

  const tenant: TenantSummary | null = ctx.current;
  const profile: Profile | null = person
    ? { ...(person as Omit<Profile, "role" | "is_active">), role: tenant?.role ?? "salesman", is_active: !!tenant }
    : null;

  return { user, profile, tenant, tenants: ctx.tenants };
});

// Use at the top of every protected page / server action.
// Pass roles to restrict; omit for "any active user of this business".
export async function requireRole(...roles: AppRole[]) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { profile, tenant } = session;
  // No business to work in (none chosen, membership switched off, business
  // suspended): the organisation page explains and lets them pick or sign out.
  if (!profile || !tenant) redirect("/select-org");
  if (roles.length > 0 && !roles.includes(profile.role)) redirect("/dashboard?denied=1");
  return { user: session.user, profile, tenant };
}
