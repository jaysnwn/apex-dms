import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { brandScope } from "@/lib/brand";
import { Chip } from "@/components/chip";
import { PageHeader } from "@/components/ui";
import { DispatchBoard, type DispatchedRow, type PendingInvoice } from "./dispatch-board";

export const metadata: Metadata = { title: "Dispatch" };

export default async function DispatchPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { profile } = await requireRole("super_admin", "manager", "billing", "warehouse");
  const sp = await searchParams;
  const tab = sp.tab === "transit" || sp.tab === "history" ? sp.tab : "pending";
  const supabase = await createClient();
  const scope = await brandScope();
  const [{ data: warehouses }, { data: brandRows }] = await Promise.all([
    supabase.from("warehouses").select("id, name, brand_id").eq("is_active", true).in("brand_id", scope).order("name"),
    supabase.from("brands").select("id, name"),
  ]);
  const brandName = new Map((brandRows ?? []).map((b) => [b.id as string, b.name as string]));

  let pending: PendingInvoice[] = [];
  let dispatched: DispatchedRow[] = [];

  if (tab === "pending") {
    const { data: invs } = await supabase
      .from("invoices")
      .select("id, invoice_no, invoice_date, grand_total, retailer_snapshot, brand_id, orders!inner(status)")
      .eq("status", "issued")
      .in("brand_id", scope)
      .eq("orders.status", "invoiced")
      .order("invoice_date");
    const ids = (invs ?? []).map((i) => i.id);
    const [{ data: lines }, { data: oh }] = await Promise.all([
      ids.length ? supabase.from("invoice_lines").select("invoice_id, product_id, product_name, qty, unit_code").in("invoice_id", ids).order("line_no") : Promise.resolve({ data: [] }),
      supabase.from("stock_on_hand").select("product_id, warehouse_id, on_hand"),
    ]);
    const onHand = new Map((oh ?? []).map((r) => [`${r.product_id}:${r.warehouse_id}`, Number(r.on_hand)]));
    pending = (invs ?? []).map((i) => {
      const snap = i.retailer_snapshot as { shop_name: string; billing_city: string | null; mobile: string };
      return {
        id: i.id,
        invoice_no: i.invoice_no,
        invoice_date: i.invoice_date,
        grand_total: Number(i.grand_total),
        shop_name: snap.shop_name,
        city: snap.billing_city,
        mobile: snap.mobile,
        brand_id: i.brand_id,
        brand_name: brandName.get(i.brand_id) ?? "",
        items: (lines ?? [])
          .filter((l) => l.invoice_id === i.id)
          .map((l) => ({
            product_name: l.product_name,
            qty: Number(l.qty),
            unit_code: l.unit_code,
            shortIn: Object.fromEntries((warehouses ?? []).map((w) => [w.id, (onHand.get(`${l.product_id}:${w.id}`) ?? 0) < Number(l.qty)])),
          })),
      };
    });
  } else {
    const { data: ds } = await supabase
      .from("dispatches")
      .select("id, dispatch_no, invoice_id, vehicle_no, dispatched_at, delivered_at, status, delivery_remarks, warehouse_id, invoices!inner(invoice_no, retailer_snapshot, brand_id)")
      .in("invoices.brand_id", scope)
      .eq("status", tab === "transit" ? "dispatched" : "delivered")
      .order(tab === "transit" ? "dispatched_at" : "delivered_at", { ascending: false })
      .limit(200);
    const wMap = new Map((warehouses ?? []).map((w) => [w.id as string, w.name as string]));
    dispatched = (ds ?? []).map((d) => {
      const inv = d.invoices as unknown as { invoice_no: string; retailer_snapshot: { shop_name: string; billing_city: string | null } };
      return {
        id: d.id,
        dispatch_no: d.dispatch_no,
        invoice_id: d.invoice_id,
        invoice_no: inv?.invoice_no ?? "",
        shop_name: inv?.retailer_snapshot.shop_name ?? "",
        city: inv?.retailer_snapshot.billing_city ?? null,
        vehicle_no: d.vehicle_no,
        dispatched_at: d.dispatched_at,
        delivered_at: d.delivered_at,
        status: d.status,
        remarks: d.delivery_remarks,
        warehouse: wMap.get(d.warehouse_id) ?? "",
      };
    });
  }

  return (
    <>
      <PageHeader title="Dispatch" description="Every invoice ships in full. Stock is deducted when you confirm dispatch." />
      <div className="mb-5 flex flex-wrap gap-2">
        <Chip href="/dispatch" active={tab === "pending"}>Waiting to dispatch</Chip>
        <Chip href="/dispatch?tab=transit" active={tab === "transit"}>On the way</Chip>
        <Chip href="/dispatch?tab=history" active={tab === "history"}>Delivered</Chip>
      </div>
      <DispatchBoard tab={tab} pending={pending} dispatched={dispatched} warehouses={warehouses ?? []} canDispatch={profile.role !== "billing"} />
    </>
  );
}
