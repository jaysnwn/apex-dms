import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { ProductForm } from "../product-form";
import { productFormOptions } from "../data";

export const metadata: Metadata = { title: "Add product" };

export default async function NewProductPage() {
  await requireRole("super_admin", "manager");
  const options = await productFormOptions();
  return (
    <>
      <PageHeader title="Add product" description="Essentials first; you can edit everything later." />
      <div className="max-w-3xl">
        <ProductForm {...options} />
      </div>
    </>
  );
}
