import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { RetailerForm, type RetailerRow } from "../../retailer-form";
import { retailerFormOptions } from "../../data";

export const metadata: Metadata = { title: "Edit retailer" };

export default async function EditRetailerPage({ params }: { params: Promise<{ id: string }> }) {
  const { user, profile } = await requireRole("super_admin", "manager", "billing");
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("retailers").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const options = await retailerFormOptions(profile.role, user.id);
  return (
    <>
      <PageHeader title={`Edit ${data.shop_name}`} description={data.code} />
      <div className="max-w-3xl">
        <RetailerForm retailer={data as RetailerRow} {...options} isSalesman={false} />
      </div>
    </>
  );
}
