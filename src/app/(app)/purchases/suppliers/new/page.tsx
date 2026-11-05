import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { Card } from "@/components/ui";
import { SupplierForm } from "../../supplier-form";

export const metadata: Metadata = { title: "New supplier" };

export default async function NewSupplierPage() {
  await requireRole("super_admin", "manager", "billing");
  return <Card className="max-w-3xl p-6"><h2 className="mb-4 font-semibold">New supplier</h2><SupplierForm /></Card>;
}
