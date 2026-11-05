import Link from "next/link";
import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { Alert } from "@/components/ui";
import { PurchaseBuilder } from "../purchase-builder";
import { builderOptions } from "../data";

export const metadata: Metadata = { title: "New purchase" };

export default async function NewPurchasePage({ searchParams }: { searchParams: Promise<{ supplier?: string }> }) {
  await requireRole("super_admin", "manager", "billing");
  const { supplier } = await searchParams;
  const options = await builderOptions();
  if (options.suppliers.length === 0) {
    return <Alert tone="amber">Add a supplier first. <Link href="/purchases/suppliers/new" className="font-semibold underline">New supplier</Link></Alert>;
  }
  return <PurchaseBuilder key={supplier ?? "new"} {...options} presetSupplierId={supplier} />;
}
