import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { dateTime } from "@/lib/format";
import { Badge } from "@/components/ui";
import { CountSheet, type SheetLine } from "./count-sheet";

export const metadata: Metadata = { title: "Stock count" };

export default async function CountPage({ params }: { params: Promise<{ id: string }> }) {
  const { profile } = await requireRole("super_admin", "manager", "billing", "warehouse");
  const { id } = await params;
  const supabase = await createClient();

  const { data: count } = await supabase.from("stock_counts").select("*").eq("id", id).maybeSingle();
  if (!count) notFound();

  const [{ data: lines }, { data: warehouse }] = await Promise.all([
    supabase.from("stock_count_lines").select("id, product_id, location_id, system_qty, counted_qty").eq("count_id", id),
    supabase.from("warehouses").select("name").eq("id", count.warehouse_id).single(),
  ]);
  const productIds = (lines ?? []).map((l) => l.product_id as string);
  const locationIds = (lines ?? []).map((l) => l.location_id).filter(Boolean) as string[];
  const [{ data: products }, { data: locations }] = await Promise.all([
    productIds.length ? supabase.from("catalog").select("id, name, sku").in("id", productIds) : Promise.resolve({ data: [] }),
    locationIds.length ? supabase.from("warehouse_locations").select("id, code").in("id", locationIds) : Promise.resolve({ data: [] }),
  ]);
  const pMap = new Map((products ?? []).map((p) => [p.id as string, p]));
  const lMap = new Map((locations ?? []).map((l) => [l.id as string, l.code as string]));

  const sheet: SheetLine[] = (lines ?? [])
    .map((l) => ({
      id: l.id as string,
      product: pMap.get(l.product_id)?.name ?? "—",
      sku: pMap.get(l.product_id)?.sku ?? "",
      rack: l.location_id ? lMap.get(l.location_id) ?? null : null,
      system_qty: Number(l.system_qty),
      counted_qty: l.counted_qty === null ? null : Number(l.counted_qty),
    }))
    .sort((a, b) => (a.rack ?? "~").localeCompare(b.rack ?? "~") || a.product.localeCompare(b.product));

  const isManager = profile.role === "super_admin" || profile.role === "manager";
  // Blind count: warehouse staff don't see system quantities while counting.
  const showSystem = isManager || profile.role === "billing" || count.status === "approved";

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold">{warehouse?.name} count</h2>
        <Badge tone={count.status === "approved" ? "green" : count.status === "submitted" ? "blue" : count.status === "draft" ? "amber" : "slate"}>
          {count.status === "draft" ? "Counting" : count.status === "submitted" ? "Waiting for approval" : count.status === "approved" ? "Approved" : "Cancelled"}
        </Badge>
        <span className="text-sm text-slate-500">Started {dateTime(count.created_at)}{count.notes ? ` · ${count.notes}` : ""}</span>
      </div>
      {count.status === "draft" && (
        <p className="mb-4 text-sm text-slate-500">
          Count what is physically on each shelf and type the number. Leave a product blank if you did not count it — it will not be changed.
        </p>
      )}
      <CountSheet countId={id} status={count.status} lines={sheet} showSystem={showSystem} canApprove={isManager} />
    </>
  );
}
