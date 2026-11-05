import Link from "next/link";
import type { Metadata } from "next";
import { ClipboardList, Plus } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { date, inr } from "@/lib/format";
import { todayIST } from "@/lib/gst";
import { Badge, Card } from "@/components/ui";
import { LinkButton } from "@/components/chip";
import { ReceiveButton } from "../purchase-actions";

export const metadata: Metadata = { title: "Orders to receive" };

export default async function PurchaseOrdersPage() {
  await requireRole("super_admin", "manager", "billing");
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("purchases")
    .select("id, purchase_no, order_date, expected_date, credit_days, grand_total, suppliers(name), warehouses(name), purchase_lines(qty)")
    .eq("status", "ordered")
    .order("order_date", { ascending: true })
    .limit(300);
  const today = todayIST();

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">Purchase orders sent to suppliers and not yet received. Receive them when the goods and bill arrive.</p>
        <LinkButton href="/purchases/new" className="bg-fuchsia-700 text-white hover:bg-fuchsia-800"><Plus className="size-4" /> New purchase</LinkButton>
      </div>
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
            <tr><th className="px-4 py-2.5">Order</th><th className="px-3 py-2.5">Supplier</th><th className="px-3 py-2.5">Expected</th><th className="hidden px-3 py-2.5 md:table-cell">Warehouse</th><th className="px-3 py-2.5 text-right">Units</th><th className="px-3 py-2.5 text-right">Value</th><th className="px-4 py-2.5"></th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(rows ?? []).length === 0 && (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-500"><ClipboardList className="mx-auto mb-2 size-8 text-slate-300" />No purchase orders waiting. <Link href="/purchases/new" className="font-medium text-fuchsia-700 underline">Create one</Link></td></tr>
            )}
            {(rows ?? []).map((p) => {
              const late = p.expected_date && p.expected_date < today;
              const units = ((p.purchase_lines as unknown as { qty: number }[]) ?? []).reduce((t, l) => t + Number(l.qty), 0);
              return (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5"><Link href={`/purchases/${p.id}`} className="font-mono text-xs font-medium hover:underline">{p.purchase_no}</Link><div className="text-xs text-slate-500">{date(p.order_date)}</div></td>
                  <td className="px-3 py-2.5 font-medium">{(p.suppliers as unknown as { name: string }).name}</td>
                  <td className="px-3 py-2.5">{p.expected_date ? <Badge tone={late ? "red" : p.expected_date === today ? "amber" : "blue"}>{late ? "Late · " : ""}{date(p.expected_date)}</Badge> : <span className="text-slate-400">—</span>}</td>
                  <td className="hidden px-3 py-2.5 text-slate-600 md:table-cell">{(p.warehouses as unknown as { name: string }).name}</td>
                  <td className="tabular px-3 py-2.5 text-right">{units.toLocaleString("en-IN")}</td>
                  <td className="tabular px-3 py-2.5 text-right font-semibold">{inr(p.grand_total, { decimals: false })}</td>
                  <td className="px-4 py-2.5 text-right"><ReceiveButton purchaseId={p.id} purchaseNo={p.purchase_no} creditDays={Number(p.credit_days)} showCostOption size="sm" /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </>
  );
}
