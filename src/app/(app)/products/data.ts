import "server-only";

import { createClient } from "@/lib/supabase/server";

// Lookup lists used by product and stock forms.
export async function productFormOptions() {
  const supabase = await createClient();
  const [brands, categories, units, warehouses] = await Promise.all([
    supabase.from("brands").select("id, name").eq("is_active", true).order("name"),
    supabase.from("categories").select("id, name").eq("is_active", true).order("name"),
    supabase.from("units").select("code, name").order("code"),
    supabase.from("warehouses").select("id, name").eq("is_active", true).order("name"),
  ]);
  return {
    brands: brands.data ?? [],
    categories: categories.data ?? [],
    units: units.data ?? [],
    warehouses: warehouses.data ?? [],
  };
}
