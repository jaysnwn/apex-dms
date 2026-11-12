import Link from "next/link";
import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { date, inr } from "@/lib/format";
import { Badge, Card } from "@/components/ui";
import { allRows } from "@/lib/all-rows";

export const metadata: Metadata = { title: "Pending for dispatch" };

export default async function PendingPage() {
  const { profile } = await requireRole("super_admin", "manager", "billing", "salesman", "warehouse");
  const supabase = await createClient();
  const { data: invoices } = await allRows(() => supabase
    .from("invoices")
    .select("id, invoice_no, invoice_date, grand_total, retailer_id, retailer_snapshot, order_id, orders!inner(status)")
    .eq("status", "issued")
    .eq("orders.status", "invoiced")
    .order("invoice_date")
    .order("id"));
  const rows = invoices ?? [];
  const canDispatch = ["super_admin", "manager"].includes(profile.role);

  return (
    <>
      <p className="mb-4 text-sm text-slate-500">
        Invoiced orders waiting to leave the warehouse. {canDispatch && <Link href="/dispatch" className="font-medium text-accent-700 hover:underline">Open Dispatch</Link>}
      </p>
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
            <tr><th className="px-4 py-2.5">Invoice</th><th className="px-3 py-2.5">Retailer</th><th className="px-3 py-2.5">Waiting</th><th className="px-4 py-2.5 text-right">Amount</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 && <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-500">Nothing waiting for dispatch.</td></tr>}
            {rows.map((i) => {
              const days = Math.floor((Date.now() - new Date(i.invoice_date).getTime()) / 864e5);
              const snap = i.retailer_snapshot as { shop_name: string; billing_city?: string };
              return (
                <tr key={i.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5"><Link href={`/sales/invoices/${i.id}`} className="font-mono font-medium hover:underline">{i.invoice_no}</Link><div className="text-xs text-slate-500">{date(i.invoice_date)}</div></td>
                  <td className="px-3 py-2.5">{snap.shop_name}<div className="text-xs text-slate-500">{snap.billing_city}</div></td>
                  <td className="px-3 py-2.5"><Badge tone={days >= 2 ? "red" : days >= 1 ? "amber" : "blue"}>{days === 0 ? "Today" : `${days} day${days === 1 ? "" : "s"}`}</Badge></td>
                  <td className="tabular px-4 py-2.5 text-right font-medium">{inr(i.grand_total)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </>
  );
}
