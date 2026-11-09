import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, PageHeader } from "@/components/ui";
import { SettingsForm, type CompanySettings } from "./settings-form";

export const metadata: Metadata = { title: "Company" };

export default async function SettingsPage() {
  await requireRole("super_admin");
  const supabase = await createClient();
  const { data } = await supabase
    .from("company_settings")
    .select("legal_name, gstin, state_code, address, phone, email, bank_details, invoice_terms, doc_prefix, salesman_max_discount, billing_max_discount, reorder_lead_days, reorder_cover_days, expense_claim_days, geofence_radius_m, gps_min_accuracy_m, live_location_minutes")
    .eq("id", 1)
    .single<CompanySettings>();

  return (
    <>
      <PageHeader
        title="Company details"
        description="Printed on every invoice, receipt and statement. The state code decides CGST + SGST vs IGST."
      />
      <Card className="max-w-3xl p-5">
        {data ? <SettingsForm settings={data} /> : <p className="text-sm text-slate-500">Settings row missing — run the migrations.</p>}
      </Card>
    </>
  );
}
