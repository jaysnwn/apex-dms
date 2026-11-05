import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { ProductForm, type ProductRow } from "../../product-form";
import { productFormOptions } from "../../data";

export const metadata: Metadata = { title: "Edit product" };

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("super_admin", "manager");
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("products")
    .select("*, location:warehouse_locations!products_default_location_id_fkey(code)")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();

  const product = { ...data, rack_code: (data.location as { code: string } | null)?.code ?? null } as ProductRow;
  const options = await productFormOptions();

  return (
    <>
      <PageHeader title={`Edit ${product.name}`} />
      <div className="max-w-3xl">
        <ProductForm product={product} {...options} />
      </div>
    </>
  );
}
