import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PaymentForm } from "../payment-form";
import type { PickerRetailer } from "../../sales/actions";

export const metadata: Metadata = { title: "Record payment" };

export default async function NewPaymentPage({ searchParams }: { searchParams: Promise<{ retailer?: string; invoice?: string }> }) {
  await requireRole("super_admin", "manager", "billing", "salesman");
  const sp = await searchParams;
  let retailer: PickerRetailer | null = null;
  if (sp.retailer) {
    const supabase = await createClient();
    const [{ data: r }, { data: b }] = await Promise.all([
      supabase.from("retailer_directory").select("id, code, shop_name, owner_name, mobile, billing_city, billing_state_code, credit_days, credit_limit, status").eq("id", sp.retailer).maybeSingle(),
      supabase.from("retailer_balances").select("outstanding, overdue").eq("retailer_id", sp.retailer).maybeSingle(),
    ]);
    if (r) retailer = { ...r, credit_days: Number(r.credit_days), credit_limit: Number(r.credit_limit), outstanding: Number(b?.outstanding ?? 0), overdue: Number(b?.overdue ?? 0) } as PickerRetailer;
  }
  return (
    <>
      {retailer && <p className="mb-4 text-sm text-slate-500">Payment from <span className="font-semibold text-slate-900">{retailer.shop_name}</span> ({retailer.code})</p>}
      <PaymentForm initialRetailer={retailer} focusInvoice={sp.invoice} />
    </>
  );
}
