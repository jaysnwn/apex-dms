"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BRAND_COOKIE } from "@/lib/brand";
import { isOpenTenant, pickDefault, type TenantSummary } from "@/lib/tenant";
import { safeNext, SLUG_RE, TENANT_COOKIE, tenantCookieOptions } from "@/lib/tenant-shared";
import { allowAttempt, clientIp, TOO_MANY } from "@/lib/rate-limit";

export type LoginState = { error?: string };

export async function signIn(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(String(formData.get("next") ?? ""));
  const org = String(formData.get("org") ?? "").trim().toLowerCase();

  if (!email || !password) return { error: "Enter your email and password." };

  // Guessing passwords: at most 8 tries per email and 30 per network address
  // in 15 minutes (on top of Supabase's own limits).
  const ip = await clientIp();
  const [byEmail, byIp] = await Promise.all([
    allowAttempt(`login:email:${email}`, 8, 900),
    allowAttempt(`login:ip:${ip}`, 30, 900),
  ]);
  if (!byEmail || !byIp) return { error: TOO_MANY };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) return { error: "Email or password is incorrect." };

  // Which businesses this login works for (active memberships only).
  const { data: list } = await supabase.rpc("my_tenants");
  const tenants = ((list ?? []) as TenantSummary[]).filter(isOpenTenant);
  if (tenants.length === 0) {
    await supabase.auth.signOut();
    return { error: "Your account is not active. Ask the administrator to enable it." };
  }

  // Signed in on a business's own page: that business, or nothing.
  let pick: TenantSummary | null = null;
  if (org && SLUG_RE.test(org)) {
    pick = tenants.find((t) => t.slug === org) ?? null;
    if (!pick) {
      await supabase.auth.signOut();
      return { error: "This login does not have access to this organization." };
    }
  } else {
    pick = pickDefault(tenants);
  }

  const jar = await cookies();
  jar.set(BRAND_COOKIE, "", { path: "/", maxAge: 0 });
  if (!pick) {
    jar.set(TENANT_COOKIE, "", { path: "/", maxAge: 0 });
    redirect(`/select-org?next=${encodeURIComponent(next)}`);
  }
  jar.set(TENANT_COOKIE, pick.id, tenantCookieOptions);
  redirect(next);
}
