import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { listSuppliers } from "../../actions";
import { SupplierPaymentForm } from "../../supplier-payment-form";

export const metadata: Metadata = { title: "Pay supplier" };

export default async function NewSupplierPaymentPage({ searchParams }: { searchParams: Promise<{ supplier?: string; bill?: string }> }) {
  await requireRole("super_admin", "manager", "billing");
  const sp = await searchParams;
  const suppliers = await listSuppliers();
  return <SupplierPaymentForm suppliers={suppliers} initialSupplier={sp.supplier} focusBill={sp.bill} />;
}
