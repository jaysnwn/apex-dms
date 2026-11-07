import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { OrderBuilder } from "../order-builder";
import { builderOptions } from "../data";
import { loadBillingCatalogue, type PickerRetailer } from "../actions";

export const metadata: Metadata = { title: "Billing" };

export default async function NewOrderPage({ searchParams }: { searchParams: Promise<{ retailer?: string }> }) {
  const { profile } = await requireRole("super_admin", "manager", "billing", "salesman");
  const { retailer: rid } = await searchParams;
  const options = await builderOptions();
  let retailer: PickerRetailer | undefined;
  if (rid) {
    const supabase = await createClient();
    const [{ data: r }, { data: b }] = await Promise.all([
      supabase.from("retailer_directory").select("id, code, shop_name, owner_name, mobile, gstin, billing_address, billing_city, billing_pincode, billing_state_code, credit_days, credit_limit, status").eq("id", rid).maybeSingle(),
      supabase.from("retailer_balances").select("outstanding, overdue").eq("retailer_id", rid).maybeSingle(),
    ]);
    if (r) retailer = { ...r, credit_days: Number(r.credit_days), credit_limit: Number(r.credit_limit), outstanding: Number(b?.outstanding ?? 0), overdue: Number(b?.overdue ?? 0) } as PickerRetailer;
  }
  const brandId = options.defaultBrandId ?? options.brands[0]?.id;
  const initialCatalogue = brandId ? { brandId, ...(await loadBillingCatalogue(brandId)) } : undefined;
  return <OrderBuilder key={rid ?? "new"} role={profile.role} {...options} presetRetailer={retailer} initialCatalogue={initialCatalogue} />;
}
