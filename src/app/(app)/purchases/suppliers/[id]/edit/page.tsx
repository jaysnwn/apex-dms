import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import { SupplierForm, type SupplierRow } from "../../../supplier-form";

export const metadata: Metadata = { title: "Edit supplier" };

export default async function EditSupplierPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("super_admin", "manager", "billing");
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("suppliers").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  return <Card className="max-w-3xl p-6"><h2 className="mb-4 font-semibold">Edit {data.name}</h2><SupplierForm supplier={data as SupplierRow} /></Card>;
}
