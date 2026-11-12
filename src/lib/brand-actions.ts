"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { ALL, BRAND_COOKIE, getBrandContext } from "@/lib/brand";

export async function switchBrand(value: string) {
  const ctx = await getBrandContext();
  const ok = value === ALL ? ctx.canSeeAll : ctx.brands.some((b) => b.id === value);
  if (!ok) return { error: "You do not have access to that brand." };
  (await cookies()).set(BRAND_COOKIE, value, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/", "layout");
  return { ok: true };
}
