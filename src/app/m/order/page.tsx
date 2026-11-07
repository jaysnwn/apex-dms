import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCatalogue, getOutlets } from "../data";
import { OrderFlow } from "./order-flow";

export const metadata: Metadata = { title: "New order" };

export default async function OrderPage({ searchParams }: { searchParams: Promise<{ retailer?: string }> }) {
  const { user } = await requireRole("salesman", "manager", "super_admin");
  const { retailer } = await searchParams;
  const supabase = await createClient();
  let outlets = null;
  let catalogue = null;
  try {
    [outlets, catalogue] = await Promise.all([getOutlets(supabase, user.id), getCatalogue(supabase)]);
  } catch {
    // The phone falls back to its cached copy.
  }
  return <OrderFlow key={retailer ?? "pick"} initialOutlets={outlets} initialCatalogue={catalogue} presetRetailer={retailer} />;
}
