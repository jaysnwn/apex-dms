import "server-only";

import { createClient } from "@/lib/supabase/server";

// Salesmen and routes for retailer forms. A salesman only gets his own routes.
export async function retailerFormOptions(role: string, userId: string) {
  const supabase = await createClient();
  const [salesmen, routes] = await Promise.all([
    supabase.from("profiles").select("id, full_name").eq("role", "salesman").eq("is_active", true).order("full_name"),
    (() => {
      let q = supabase.from("routes").select("id, name, default_salesman_id").eq("is_active", true).order("name");
      if (role === "salesman") q = q.eq("default_salesman_id", userId);
      return q;
    })(),
  ]);
  return {
    salesmen: (salesmen.data ?? []).map((s) => ({ id: s.id as string, name: s.full_name as string })),
    routes: (routes.data ?? []).map((r) => ({ id: r.id as string, name: r.name as string })),
  };
}
