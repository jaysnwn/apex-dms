"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function dispatchInvoice(invoiceId: string, warehouseId: string, vehicle: string, remarks: string) {
  await requireRole("super_admin", "manager", "warehouse");
  const supabase = await createClient();
  const { error } = await supabase.rpc("dispatch_invoice", {
    p_invoice_id: invoiceId,
    p_warehouse_id: warehouseId,
    p_vehicle: vehicle || null,
    p_remarks: remarks || null,
  });
  if (error) return { error: error.message };
  revalidatePath("/dispatch");
  revalidatePath("/stock");
  return { ok: true };
}

export async function confirmDelivery(dispatchId: string, remarks: string, proofPath: string | null) {
  await requireRole("super_admin", "manager", "warehouse", "salesman");
  const supabase = await createClient();
  const { error } = await supabase.rpc("confirm_delivery", { p_dispatch_id: dispatchId, p_remarks: remarks || null, p_proof_path: proofPath });
  if (error) return { error: error.message };
  revalidatePath("/dispatch");
  return { ok: true };
}
