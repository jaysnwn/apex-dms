import Link from "next/link";
import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { date, inr } from "@/lib/format";
import { ORDER_STATUS } from "@/lib/status";
import { Badge, cn } from "@/components/ui";
import { enumParam } from "@/lib/enum-param";

export const metadata: Metadata = { title: "My orders" };

const FILTERS = [
  { k: "", label: "All" },
  { k: "quotation", label: "With office" },
  { k: "invoiced", label: "Invoiced" },
  { k: "dispatched", label: "On the way" },
  { k: "delivered", label: "Delivered" },
  { k: "cancelled", label: "Cancelled" },
];

export default async function MyOrdersPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { user } = await requireRole("salesman", "manager", "super_admin");
  const { status } = await searchParams;
  const supabase = await createClient();
  let q = supabase.from("orders").select("id, order_no, status, grand_total, created_at, cancel_reason, retailers(shop_name, billing_city)").eq("salesman_id", user.id).order("created_at", { ascending: false }).limit(200);
  const statusFilter = enumParam("order_status", status);
  if (statusFilter) q = q.eq("status", statusFilter);
  const { data: rows } = await q;
  const total = (rows ?? []).filter((r) => r.status !== "cancelled").reduce((t, r) => t + Number(r.grand_total), 0);

  return (
    <div className="space-y-3">
      <h1 className="px-1 text-xl font-bold">My orders</h1>
      <div className="no-scrollbar flex gap-2 overflow-x-auto">
        {FILTERS.map((f) => (
          <Link key={f.k} href={f.k ? `/m/orders?status=${f.k}` : "/m/orders"} className={cn("h-9 shrink-0 rounded-full px-4 py-2 text-sm font-semibold", (status ?? "") === f.k ? "bg-ink-900 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200")}>{f.label}</Link>
        ))}
      </div>
      <p className="px-1 text-xs text-slate-500">{(rows ?? []).length} orders · <span className="tabular font-semibold text-slate-700">{inr(total, { decimals: false })}</span></p>
      <ul className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70">
        {(rows ?? []).length === 0 && <li className="p-6 text-center text-sm text-slate-500">No orders here.</li>}
        {(rows ?? []).map((o) => {
          const st = o.status === "quotation" ? { label: "With office", tone: "violet" as const } : ORDER_STATUS[o.status];
          const r = o.retailers as unknown as { shop_name: string; billing_city: string | null } | null;
          return (
            <li key={o.id} className="border-b border-slate-100 last:border-0">
              <Link href={`/m/orders/${o.id}`} className="flex items-center gap-3 px-4 py-3 active:bg-slate-50">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{r?.shop_name}</span>
                  <span className="block text-xs text-slate-500">{date(o.created_at)} · {o.order_no.split("/").pop()}{r?.billing_city ? ` · ${r.billing_city}` : ""}</span>
                </span>
                <span className="text-right">
                  <span className={cn("tabular block font-semibold", o.status === "cancelled" && "text-slate-400 line-through")}>{inr(o.grand_total, { decimals: false })}</span>
                  <Badge tone={st.tone}>{st.label}</Badge>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
