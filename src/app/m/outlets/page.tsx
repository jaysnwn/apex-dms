import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getOutlets, type Outlet } from "../data";
import { OutletList } from "./outlet-list";

export const metadata: Metadata = { title: "My outlets" };

export default async function OutletsPage() {
  const { user } = await requireRole("salesman", "manager", "super_admin");
  const supabase = await createClient();
  let outlets: Outlet[] | null = null;
  try {
    outlets = await getOutlets(supabase, user.id);
  } catch {
    outlets = null;
  }
  return <OutletList initial={outlets} />;
}
