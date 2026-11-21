import Link from "next/link";
import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { dateTime } from "@/lib/format";
import { ActionForm } from "@/components/action-form";
import { Badge, Card, Input, Label, Select } from "@/components/ui";
import { startCount } from "../actions";
import { brandScope, getBrandContext, pageBrand } from "@/lib/brand";
import { BrandFilter } from "@/components/brand-filter";
import { warehouseOr } from "@/lib/warehouse-scope";

export const metadata: Metadata = { title: "Stock verification" };

const TONE = { draft: "amber", submitted: "blue", approved: "green", cancelled: "slate" } as const;
const LABEL = { draft: "Counting", submitted: "Waiting for approval", approved: "Approved", cancelled: "Cancelled" } as const;

export default async function CountsPage({ searchParams }: { searchParams: Promise<{ brand?: string }> }) {
  const sp = await searchParams;
  const { profile } = await requireRole("super_admin", "manager", "billing", "warehouse");
  const supabase = await createClient();
  const ctx = await getBrandContext();
  const picked = await pageBrand(sp.brand);
  const scope = await brandScope(sp.brand);
  const canStart = profile.role !== "billing";

  const [{ data: counts }, { data: warehouses }, { data: people }] = await Promise.all([
    supabase.from("stock_counts").select("id, warehouse_id, brand_id, status, notes, counted_by, approved_by, created_at, approved_at").in("brand_id", scope).order("created_at", { ascending: false }).limit(50),
    supabase.from("warehouses").select("id, name, brand_id").eq("is_active", true).or(warehouseOr(scope)).order("name"),
    supabase.from("tenant_people").select("id, full_name"),
  ]);
  const wMap = new Map((warehouses ?? []).map((w) => [w.id as string, w.name as string]));
  const uMap = new Map((people ?? []).map((u) => [u.id as string, u.full_name as string]));

  return (
    <>
    <BrandFilter brands={ctx.brands} current={picked} path="/stock/counts" params={sp} label="Counts for" />
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <Card className="overflow-hidden">
        <div className="border-b border-slate-100 p-4">
          <h2 className="font-semibold">Physical stock verification</h2>
          <p className="text-sm text-slate-500">Warehouse counts the shelves (on screen, or on the printed Excel sheet from Stock reports); a Manager approves and the system posts the differences. Each count covers one brand, so every brand gets its own count sheet even in the shared warehouse.</p>
        </div>
        {(counts ?? []).length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500">No counts yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {(counts ?? []).map((c) => (
              <li key={c.id}>
                <Link href={`/stock/counts/${c.id}`} className="flex items-center gap-3 p-4 hover:bg-slate-50">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{wMap.get(c.warehouse_id) ?? "Warehouse"}{ctx.brands.length > 1 && ` · ${ctx.brands.find((b) => b.id === c.brand_id)?.name ?? ""}`} {c.notes && <span className="font-normal text-slate-500">· {c.notes}</span>}</div>
                    <div className="text-sm text-slate-500">
                      Started {dateTime(c.created_at)} by {uMap.get(c.counted_by ?? "") ?? "—"}
                      {c.approved_at && ` · approved by ${uMap.get(c.approved_by ?? "") ?? "—"}`}
                    </div>
                  </div>
                  <Badge tone={TONE[c.status as keyof typeof TONE]}>{LABEL[c.status as keyof typeof LABEL]}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {canStart && (
        <Card className="h-fit p-5">
          <h2 className="mb-3 font-semibold">Start a count</h2>
          <ActionForm action={startCount} submitLabel="Start count sheet" pendingLabel="Preparing…">
            <div className="space-y-3">
              <div>
                <Label htmlFor="warehouse_id">Warehouse</Label>
                <Select id="warehouse_id" name="warehouse_id">
                  {(warehouses ?? []).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </Select>
              </div>
              {ctx.brands.length > 1 && (
                <div>
                  <Label htmlFor="brand_id">Brand to count</Label>
                  <Select id="brand_id" name="brand_id" defaultValue={picked?.id ?? ctx.brands[0]?.id}>
                    {ctx.brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </Select>
                </div>
              )}
              <div>
                <Label htmlFor="notes" hint="optional">Note</Label>
                <Input id="notes" name="notes" placeholder="e.g. November month-end" />
              </div>
            </div>
          </ActionForm>
        </Card>
      )}
    </div>
    </>
  );
}
