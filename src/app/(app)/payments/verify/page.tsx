import type { Metadata } from "next";
import { CheckCircle2 } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import { VerifyBoard, type PendingPayment } from "./verify-board";

export const metadata: Metadata = { title: "Verify collections" };

export default async function VerifyPage() {
  await requireRole("super_admin", "manager", "billing");
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("payments")
    .select("id, receipt_no, payment_date, amount, method, reference_no, bank_name, cheque_date, status, collected_by, created_at, retailers(shop_name, code, billing_city)")
    .is("verified_at", null)
    .in("status", ["received", "cheque_pending"])
    .order("payment_date")
    .order("created_at")
    .limit(1000);
  const ids = [...new Set((rows ?? []).map((r) => r.collected_by as string).filter(Boolean))];
  const { data: people } = ids.length ? await supabase.from("profiles").select("id, full_name").in("id", ids) : { data: [] };
  const names = new Map((people ?? []).map((p) => [p.id as string, p.full_name as string]));
  const list: PendingPayment[] = (rows ?? []).map((r) => {
    const ret = r.retailers as unknown as { shop_name: string; code: string; billing_city: string | null };
    return {
      id: r.id, receipt_no: r.receipt_no, payment_date: r.payment_date, amount: Number(r.amount), method: r.method,
      reference_no: r.reference_no, bank_name: r.bank_name, status: r.status, created_at: r.created_at,
      salesman_id: r.collected_by ?? "unknown", salesman: names.get(r.collected_by as string) ?? "Unknown",
      shop: ret?.shop_name ?? "", city: ret?.billing_city ?? null,
    };
  });

  if (!list.length) {
    return (
      <Card className="p-10 text-center">
        <CheckCircle2 className="mx-auto mb-2 size-10 text-emerald-500" />
        <div className="font-semibold">All collections are verified.</div>
        <p className="text-sm text-slate-500">Payments that salesmen record in the app appear here until you confirm they were handed over.</p>
      </Card>
    );
  }
  return <VerifyBoard payments={list} />;
}
