import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/roles";

export type Profile = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  role: AppRole;
  is_active: boolean;
  created_at: string;
};

// The signed-in user and their profile, once per request.
export const getSession = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, email, phone, role, is_active, created_at")
    .eq("id", user.id)
    .single<Profile>();

  return { user, profile };
});

// Use at the top of every protected page / server action.
// Pass roles to restrict; omit for "any active user".
export async function requireRole(...roles: AppRole[]) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { profile } = session;
  if (!profile || !profile.is_active) redirect("/login?error=inactive");
  if (roles.length > 0 && !roles.includes(profile.role)) redirect("/dashboard?denied=1");
  return { user: session.user, profile };
}
