import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PurchaseBuilder, type PurchaseBuilderLine } from "../../purchase-builder";
import { builderOptions } from "../../data";

export const metadata: Metadata = { title: "Edit purchase order" };

export default async function EditPurchasePage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("super_admin", "manager", "billing");
  const { id } = await params;
  const supabase = await createClient();
  const { data: p } = await supabase.from("purchases").select("*").eq("id", id).maybeSingle();
  if (!p) notFound();
  if (p.status !== "ordered") redirect(`/purchases/${id}`);
  const [{ data: lines }, options] = await Promise.all([
    supabase.from("purchase_lines").select("qty, unit_cost, cost_mode, discount_pct, products(id, name, sku, unit_code, gst_rate, purchase_cost, purchase_cost_mode, brands(name))").eq("purchase_id", id).order("line_no"),
    builderOptions(),
  ]);
  const ids = (lines ?? []).map((l) => (l.products as unknown as { id: string }).id);
  const { data: stock } = ids.length ? await supabase.from("product_stock").select("product_id, on_hand").in("product_id", ids) : { data: [] };
  const sMap = new Map((stock ?? []).map((s) => [s.product_id as string, Number(s.on_hand)]));
  const initialLines: PurchaseBuilderLine[] = (lines ?? []).map((l) => {
    const pr = l.products as unknown as { id: string; name: string; sku: string; unit_code: string; gst_rate: number; purchase_cost: number; purchase_cost_mode: "inclusive" | "exclusive"; brands: { name: string } | null };
    return {
      product: { id: pr.id, name: pr.name, sku: pr.sku, unit_code: pr.unit_code, brand_name: pr.brands?.name ?? "", gst_rate: Number(pr.gst_rate), purchase_cost: Number(pr.purchase_cost), purchase_cost_mode: pr.purchase_cost_mode, on_hand: sMap.get(pr.id) ?? 0 },
      qty: Number(l.qty),
      cost: Number(l.unit_cost),
      mode: l.cost_mode as "inclusive" | "exclusive",
      discount: Number(l.discount_pct),
    };
  });
  // Keep a supplier that was since deactivated selectable for this PO.
  if (!options.suppliers.some((s) => s.id === p.supplier_id)) {
    const { data: s } = await supabase.from("suppliers").select("id, code, name, state_code, gstin, credit_days, city, mobile").eq("id", p.supplier_id).single();
    if (s) options.suppliers.push(s as (typeof options.suppliers)[number]);
  }
  return (
    <>
      <p className="mb-4 text-sm text-slate-500">Editing purchase order <span className="font-mono font-medium text-slate-800">{p.purchase_no}</span></p>
      <PurchaseBuilder
        {...options}
        initial={{
          purchaseId: p.id,
          purchaseNo: p.purchase_no,
          supplierId: p.supplier_id,
          warehouseId: p.warehouse_id,
          orderDate: p.order_date,
          expectedDate: p.expected_date,
          creditDays: Number(p.credit_days),
          otherCharges: Number(p.other_charges),
          notes: p.notes ?? "",
          lines: initialLines,
        }}
      />
    </>
  );
}
