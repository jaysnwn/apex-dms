import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { BuilderLine } from "./order-builder";
import type { PickerRetailer } from "./actions";

export async function builderOptions() {
  const supabase = await createClient();
  const [{ data: co }, { data: brands }] = await Promise.all([
    supabase.from("company_settings").select("state_code, salesman_max_discount").eq("id", 1).single(),
    supabase.from("brands").select("id, name").eq("is_active", true).order("name"),
  ]);
  return {
    companyState: (co?.state_code as string) ?? "27",
    maxSalesmanDiscount: Number(co?.salesman_max_discount ?? 5),
    brands: brands ?? [],
  };
}

// Load an order with everything the builder / order page needs.
export async function loadOrder(id: string) {
  const supabase = await createClient();
  const { data: order } = await supabase.from("orders").select("*").eq("id", id).maybeSingle();
  if (!order) return null;
  const [{ data: lines }, { data: r }, { data: bal }, { data: invoice }] = await Promise.all([
    supabase.from("order_lines").select("*").eq("order_id", id).order("line_no"),
    supabase
      .from("retailer_directory")
      .select("id, code, shop_name, owner_name, mobile, billing_city, billing_state_code, credit_days, credit_limit, status")
      .eq("id", order.retailer_id)
      .maybeSingle(),
    supabase.from("retailer_balances").select("outstanding, overdue").eq("retailer_id", order.retailer_id).maybeSingle(),
    supabase.from("invoices").select("id, invoice_no").eq("order_id", id).maybeSingle(),
  ]);
  const productIds = (lines ?? []).map((l) => l.product_id as string);
  const [{ data: products }, { data: stock }] = await Promise.all([
    productIds.length
      ? supabase.from("catalog").select("id, name, sku, brand_id, brand_name, unit_code, retailer_price, retailer_price_mode, mrp, gst_rate").in("id", productIds)
      : Promise.resolve({ data: [] }),
    productIds.length ? supabase.from("product_stock").select("product_id, available").in("product_id", productIds) : Promise.resolve({ data: [] }),
  ]);
  const pMap = new Map((products ?? []).map((p) => [p.id as string, p]));
  const sMap = new Map((stock ?? []).map((s) => [s.product_id as string, Number(s.available)]));

  const retailer: PickerRetailer | null = r
    ? ({ ...r, credit_days: Number(r.credit_days), credit_limit: Number(r.credit_limit), outstanding: Number(bal?.outstanding ?? 0), overdue: Number(bal?.overdue ?? 0) } as PickerRetailer)
    : null;

  const builderLines: BuilderLine[] = (lines ?? []).map((l) => {
    const p = pMap.get(l.product_id);
    return {
      product: {
        id: l.product_id,
        name: p?.name ?? "Product",
        sku: p?.sku ?? "",
        brand_id: p?.brand_id ?? "",
        brand_name: p?.brand_name ?? "",
        unit_code: p?.unit_code ?? "PCS",
        retailer_price: Number(p?.retailer_price ?? l.unit_price),
        retailer_price_mode: (p?.retailer_price_mode ?? l.price_mode) as "inclusive" | "exclusive",
        mrp: Number(p?.mrp ?? 0),
        gst_rate: Number(l.gst_rate),
        available: sMap.get(l.product_id) ?? 0,
      },
      qty: Number(l.qty),
      discount: Number(l.discount_pct),
      price: Number(l.unit_price) !== Number(p?.retailer_price) ? Number(l.unit_price) : null,
    };
  });

  return { order, lines: lines ?? [], retailer, builderLines, invoice };
}
