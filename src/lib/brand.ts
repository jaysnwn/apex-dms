import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type Brand = { id: string; name: string; code: string; logo_path: string | null };
export const ALL = "all";
// Old switcher cookie; only still named so sign-out / org switch can clear it.
export const BRAND_COOKIE = "dms_brand";

// Brands this user may work with (the database decides: Super Admin = all,
// everyone else = their profile_brands).
//
// There is no global brand switcher: every screen shows all of the user's
// brands together, and list / report pages offer their own brand filter in the
// URL (?brand=BL). `current` is the single brand only when the user has just
// one; otherwise it is null and `isAll` is true.
export const getBrandContext = cache(async () => {
  const supabase = await createClient();
  const [{ data: ids }, { data: all }] = await Promise.all([
    supabase.rpc("my_brand_ids"),
    supabase.from("brands").select("id, name, code, logo_path, is_active").order("name"),
  ]);
  const allowed = new Set((ids as string[] | null) ?? []);
  const brands: Brand[] = (all ?? [])
    .filter((b) => b.is_active && allowed.has(b.id))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((b) => ({ id: b.id, name: b.name, code: b.code, logo_path: b.logo_path }));
  const current: Brand | null = brands.length === 1 ? brands[0] : null;
  const canSeeAll = brands.length > 1;
  return { brands, current, canSeeAll, isAll: current === null && canSeeAll };
});

// The brand a page is filtered to, from its ?brand= value (brand code or id).
// null = all of the user's brands.
export async function pageBrand(value?: string | string[] | null): Promise<Brand | null> {
  const ctx = await getBrandContext();
  if (ctx.current) return ctx.current;
  const v = (Array.isArray(value) ? value[0] : value)?.trim();
  if (!v || v === ALL) return null;
  return ctx.brands.find((b) => b.id === v || b.code.toLowerCase() === v.toLowerCase()) ?? null;
}

// For forms that need a default brand (e.g. a new product): the filtered brand
// or the first one.
export async function requireOneBrand(value?: string | string[] | null) {
  const ctx = await getBrandContext();
  const picked = await pageBrand(value);
  return { ...ctx, brand: picked ?? ctx.brands[0] ?? null };
}

// Brand ids to show on a list page: the filtered brand, or every allowed brand.
export async function brandScope(value?: string | string[] | null): Promise<string[]> {
  const ctx = await getBrandContext();
  const picked = await pageBrand(value);
  return picked ? [picked.id] : ctx.brands.map((b) => b.id);
}
