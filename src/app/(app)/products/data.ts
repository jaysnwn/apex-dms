import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getBrandContext } from "@/lib/brand";

// Lookup lists used by product and stock forms. Categories and warehouses carry
// their brand so the form shows only the chosen brand's ones.
export async function productFormOptions() {
  const supabase = await createClient();
  const ctx = await getBrandContext();
  const ids = ctx.brands.map((b) => b.id);
  const [categories, units, warehouses] = await Promise.all([
    supabase.from("categories").select("id, name, brand_id").eq("is_active", true).in("brand_id", ids).order("name"),
    supabase.from("units").select("code, name").order("code"),
    supabase.from("warehouses").select("id, name, brand_id").eq("is_active", true).in("brand_id", ids).order("name"),
  ]);
  return {
    brands: ctx.brands.map((b) => ({ id: b.id, name: b.name })),
    defaultBrandId: ctx.current?.id ?? ctx.brands[0]?.id ?? "",
    categories: categories.data ?? [],
    units: units.data ?? [],
    warehouses: warehouses.data ?? [],
  };
}
