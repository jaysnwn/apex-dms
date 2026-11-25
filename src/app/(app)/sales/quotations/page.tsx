import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { dateTime, inr, safeSearch } from "@/lib/format";
import { ORDER_STATUS } from "@/lib/status";
import { Alert, Badge, Card } from "@/components/ui";
import { Chip } from "@/components/chip";
import { SearchBar } from "@/components/search-bar";

export const metadata: Metadata = { title: "Quotations" };

export default async function QuotationsPage({ searchParams }: { searchParams: Promise<{ q?: string; show?: string; saved?: string }> }) {
  const { profile } = await requireRole("super_admin", "manager", "billing", "salesman");
  const sp = await searchParams;
  const supabase = await createClient();
  let query = supabase
    .from("orders")
    .select("id, order_no, retailer_id, status, grand_total, created_at, credit_days, salesman_id")
    .order("created_at", { ascending: false })
    .limit(200);
  query = sp.show === "cancelled" ? query.eq("status", "cancelled") : query.eq("status", "quotation");
  const term = safeSearch(sp.q);
  if (term) query = query.ilike("order_no", `%${term}%`);
  const { data: orders } = await query;
  const rIds = [...new Set((orders ?? []).map((o) => o.retailer_id as string))];
  const [{ data: retailers }, { data: people }] = await Promise.all([
    rIds.length ? supabase.from("retailers").select("id, shop_name, code").in("id", rIds) : Promise.resolve({ data: [] }),
    supabase.from("tenant_people").select("id, full_name"),
  ]);
  const rMap = new Map((retailers ?? []).map((r) => [r.id as string, r]));
  const uMap = new Map((people ?? []).map((u) => [u.id as string, u.full_name as string]));

  const isOffice = ["super_admin", "manager", "billing"].includes(profile.role);
  const saved = (sp.saved ?? "").split(",").filter(Boolean);

  return (
    <>
      {saved.length > 0 && (
        <div className="mb-4"><Alert tone="green">Saved as {saved.length} quotations, one per brand: {saved.join(", ")}. {isOffice ? "Open each and choose Create invoice." : "The office will turn them into invoices."}</Alert></div>
      )}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex-1"><SearchBar placeholder="Search order number" /></div>
        <div className="flex gap-2">
          <Chip href="/sales/quotations" active={sp.show !== "cancelled"}>Open</Chip>
          <Chip href="/sales/quotations?show=cancelled" active={sp.show === "cancelled"}>Cancelled</Chip>
        </div>
      </div>
      <Card className="relative overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
            <tr><th className="px-4 py-2.5">Order</th><th className="px-3 py-2.5">Retailer</th><th className="hidden px-3 py-2.5 sm:table-cell">Salesman</th><th className="px-3 py-2.5">Status</th><th className="px-4 py-2.5 text-right">Amount</th>{isOffice && <th className="px-4 py-2.5"><span className="sr-only">Next step</span></th>}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(orders ?? []).length === 0 && <tr><td colSpan={isOffice ? 6 : 5}><EmptyState art="receipt" title="No quotations" action={{ href: "/sales/new", label: "New sale" }} /></td></tr>}
            {(orders ?? []).map((o) => (
              <tr key={o.id} className="hover:bg-slate-50">
                <td className="px-4 py-2.5"><Link href={`/sales/orders/${o.id}`} className="font-mono font-medium hover:underline">{o.order_no}</Link><div className="text-xs text-slate-500">{dateTime(o.created_at)}</div></td>
                <td className="px-3 py-2.5">{rMap.get(o.retailer_id)?.shop_name ?? "—"}</td>
                <td className="hidden px-3 py-2.5 text-slate-600 sm:table-cell">{o.salesman_id ? uMap.get(o.salesman_id) : "—"}</td>
                <td className="px-3 py-2.5"><Badge tone={ORDER_STATUS[o.status].tone}>{ORDER_STATUS[o.status].label}</Badge></td>
                <td className="tabular px-4 py-2.5 text-right font-medium">{inr(o.grand_total)}</td>
                {isOffice && (
                  <td className="px-4 py-2.5 text-right">
                    {o.status === "quotation" && <Link href={`/sales/orders/${o.id}?step=invoice`} className="text-[13px] font-medium whitespace-nowrap text-primary-text hover:underline">Create invoice</Link>}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
