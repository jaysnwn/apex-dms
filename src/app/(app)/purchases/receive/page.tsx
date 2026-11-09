import type { Metadata } from "next";
import { CheckCircle2, PackageOpen } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { date, qty } from "@/lib/format";
import { addDays, todayIST } from "@/lib/gst";
import { Badge, Card } from "@/components/ui";
import { ReceiveButton } from "../purchase-actions";

export const metadata: Metadata = { title: "Goods to receive" };

type Row = { purchase_id: string; purchase_no: string; status: string; order_date: string; expected_date: string | null; received_date: string | null;
  supplier_bill_no: string | null; credit_days: number; warehouse_name: string; supplier_name: string; line_no: number; product_name: string; sku: string; unit_code: string; qty: number };

export default async function ReceivePage() {
  const { profile } = await requireRole("super_admin", "manager", "billing", "warehouse");
  const supabase = await createClient();
  const today = todayIST();
  const [{ data: waiting }, { data: recent }] = await Promise.all([
    supabase.from("purchase_receipts").select("*").eq("status", "ordered").order("order_date").order("line_no"),
    supabase.from("purchase_receipts").select("*").eq("status", "received").gte("received_date", addDays(today, -14)).order("received_date", { ascending: false }).order("line_no"),
  ]);
  const group = (rows: Row[]) => {
    const m = new Map<string, { head: Row; lines: Row[] }>();
    for (const r of rows) {
      const g = m.get(r.purchase_id) ?? { head: r, lines: [] };
      g.lines.push(r);
      m.set(r.purchase_id, g);
    }
    return [...m.values()];
  };
  const toReceive = group((waiting ?? []) as Row[]);
  const done = group((recent ?? []) as Row[]);

  return (
    <>
      <p className="mb-4 text-sm text-slate-500">When goods arrive from a supplier: count them against the order, then press <b>Receive goods</b> and enter the supplier&apos;s bill number. Stock is added straight away.</p>
      {toReceive.length === 0 && (
        <Card className="p-10 text-center text-slate-500"><PackageOpen className="mx-auto mb-2 size-8 text-slate-300" />Nothing waiting to be received.</Card>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {toReceive.map(({ head, lines }) => {
          const late = head.expected_date && head.expected_date < today;
          return (
            <Card key={head.purchase_id} className="overflow-hidden">
              <div className="flex items-start justify-between gap-3 border-b border-slate-100 bg-fuchsia-50/60 px-4 py-3">
                <div>
                  <div className="font-semibold">{head.supplier_name}</div>
                  <div className="font-mono text-xs text-slate-500">{head.purchase_no} · ordered {date(head.order_date)}</div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <Badge tone="slate">To {head.warehouse_name}</Badge>
                    {head.expected_date && <Badge tone={late ? "red" : "blue"}>{late ? "Late · expected " : "Expected "}{date(head.expected_date)}</Badge>}
                  </div>
                </div>
                <ReceiveButton purchaseId={head.purchase_id} purchaseNo={head.purchase_no} creditDays={Number(head.credit_days)} showCostOption={profile.role !== "warehouse"} size="sm" />
              </div>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-slate-100">
                  {lines.map((l) => (
                    <tr key={l.line_no}>
                      <td className="px-4 py-2"><div className="font-medium">{l.product_name}</div><div className="font-mono text-xs text-slate-500">{l.sku}</div></td>
                      <td className="tabular px-4 py-2 text-right text-base font-semibold">{qty(l.qty)} <span className="text-xs font-normal text-slate-500">{l.unit_code}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          );
        })}
      </div>

      {done.length > 0 && (
        <>
          <h2 className="mt-8 mb-3 text-sm font-semibold text-slate-700">Received in the last 14 days</h2>
          <Card className="divide-y divide-slate-100">
            {done.map(({ head, lines }) => (
              <div key={head.purchase_id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span className="flex items-center gap-2"><CheckCircle2 className="size-4 text-emerald-600" /><span className="font-medium">{head.supplier_name}</span><span className="text-slate-500">bill {head.supplier_bill_no}</span></span>
                <span className="text-slate-500">{lines.length} products · {qty(lines.reduce((t, l) => t + Number(l.qty), 0))} units · {date(head.received_date)}</span>
              </div>
            ))}
          </Card>
        </>
      )}
    </>
  );
}
