import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";

export type Brand = { id: string; name: string; code: string; logo_path: string | null };
export const BRAND_COOKIE = "apex_brand";
export const ALL = "all";

// Brands this user may work with (the database decides: Super Admin = all,
// everyone else = their profile_brands) and the one picked in the switcher.
// `current` is null only when a manager chose "All brands" (consolidated view).
export const getBrandContext = cache(async () => {
  const supabase = await createClient();
  const session = await getSession();
  const [{ data: ids }, { data: all }] = await Promise.all([
    supabase.rpc("my_brand_ids"),
    supabase.from("brands").select("id, name, code, logo_path, is_active").order("name"),
  ]);
  const allowed = new Set((ids as string[] | null) ?? []);
  const brands: Brand[] = (all ?? [])
    .filter((b) => b.is_active && allowed.has(b.id))
    .sort((a, b) => (a.code === "CQ" ? -1 : b.code === "CQ" ? 1 : a.name.localeCompare(b.name)))
    .map((b) => ({ id: b.id, name: b.name, code: b.code, logo_path: b.logo_path }));
  const role = session?.profile?.role;
  const canSeeAll = brands.length > 1 && (role === "super_admin" || role === "manager");

  const picked = (await cookies()).get(BRAND_COOKIE)?.value;
  let current: Brand | null = brands.find((b) => b.id === picked) ?? null;
  if (!current && !(picked === ALL && canSeeAll)) current = brands[0] ?? null;
  return { brands, current, canSeeAll, isAll: current === null && canSeeAll };
});

// For pages that need exactly one brand (forms, stock entry, counts):
// the picked brand, or the first brand when "All brands" is on.
export async function requireOneBrand() {
  const ctx = await getBrandContext();
  return { ...ctx, brand: ctx.current ?? ctx.brands[0] ?? null };
}

// Brand ids to show on list pages: the picked brand, or every allowed brand.
export async function brandScope(): Promise<string[]> {
  const ctx = await getBrandContext();
  return ctx.current ? [ctx.current.id] : ctx.brands.map((b) => b.id);
}
