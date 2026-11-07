import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getHome } from "./data";
import { HomeView } from "./home-view";

export const metadata: Metadata = { title: "Home" };

export default async function FieldHome() {
  const { user, profile } = await requireRole("salesman", "manager", "super_admin");
  const supabase = await createClient();
  const h = await getHome(supabase, user.id);
  return <HomeView h={h} firstName={(profile.full_name || "").split(" ")[0]} />;
}
