import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { OrderBuilder } from "../../../order-builder";
import { builderOptions, loadOrder } from "../../../data";

export const metadata: Metadata = { title: "Edit quotation" };

export default async function EditOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { profile } = await requireRole("super_admin", "manager", "billing", "salesman");
  const { id } = await params;
  const data = await loadOrder(id);
  if (!data || !data.retailer) notFound();
  if (data.order.status !== "quotation") redirect(`/sales/orders/${id}`);
  const options = await builderOptions();
  return (
    <>
      <p className="mb-4 text-sm text-slate-500">Editing quotation <span className="font-mono font-medium text-slate-800">{data.order.order_no}</span></p>
      <OrderBuilder
        role={profile.role}
        {...options}
        initial={{
          orderId: id,
          orderNo: data.order.order_no,
          retailer: data.retailer,
          creditDays: data.order.credit_days,
          notes: data.order.notes ?? "",
          lines: data.builderLines,
        }}
      />
    </>
  );
}
