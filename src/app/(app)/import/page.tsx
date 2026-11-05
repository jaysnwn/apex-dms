import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { Importer } from "./importer";

export const metadata: Metadata = { title: "Import" };

export default async function ImportPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireRole("super_admin", "manager");
  const { tab } = await searchParams;
  return (
    <>
      <PageHeader title="Import from Excel" description="Load products, opening stock and retailers in bulk instead of typing them one by one." />
      <Importer initialTab={tab === "retailers" ? "retailers" : "products"} />
    </>
  );
}
