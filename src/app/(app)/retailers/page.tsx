import Link from "next/link";
import type { Metadata } from "next";
import { Plus, Route as RouteIcon, Upload } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { inr, RETAILER_STATUS_LABELS } from "@/lib/format";
import { Badge, Button, Card, PageHeader, Select } from "@/components/ui";
import { LinkButton } from "@/components/chip";
import { SearchBar } from "@/components/search-bar";
import { RETAILER_CLASS } from "@/lib/status";
import { ClassifyButton } from "./[id]/classify-button";
import { searchSource, searchWords } from "@/lib/search-words";
import { allRows } from "@/lib/all-rows";
import { required } from "@/lib/required";

export const metadata: Metadata = { title: "Retailers" };

const STATUS_TONE = { active: "green", on_hold: "amber", blocked: "red", inactive: "slate" } as const;

export default async function RetailersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; route?: string; salesman?: string; status?: string }>;
}) {
  const { profile } = await requireRole();
  const sp = await searchParams;
  const supabase = await createClient();
  const role = profile.role;
  const canCreate = role !== "warehouse";
  const isOffice = role === "super_admin" || role === "manager" || role === "billing";

  const words = searchWords(sp.q);
  let query = searchSource(supabase, "retailer_directory", "search_retailer_directory", words)
    .select("id, code, shop_name, owner_name, mobile, billing_city, gstin, route_name, salesman_name, status, classification, credit_days, credit_limit")
    .order("shop_name")
    .limit(500);
  if (sp.route) query = query.eq("route_id", sp.route);
  if (sp.salesman) query = query.eq("salesman_id", sp.salesman);
  if (sp.status) query = query.eq("status", sp.status);

  const [{ data: rows }, { data: routes }, { data: salesmen }, { data: balances }] = await Promise.all([
    query,
    supabase.from("routes").select("id, name").order("name"),
    isOffice ? supabase.from("tenant_people").select("id, full_name").eq("role", "salesman").order("full_name") : Promise.resolve({ data: [] }),
    allRows(() => supabase.from("retailer_balances").select("retailer_id, outstanding, overdue").order("retailer_id")),
  ]);
  const balMap = new Map((balances ?? []).map((b) => [b.retailer_id as string, b]));
  const list = rows ?? [];

  return (
    <>
      <PageHeader
        title="Retailers"
        description={`${list.length} retailer${list.length === 1 ? "" : "s"}${role === "salesman" ? " on your routes" : ""}`}
        actions={
          <>
            {(role === "super_admin" || role === "manager") && (
              <>
                <ClassifyButton />
                <LinkButton href="/routes/manage"><RouteIcon className="size-4" /> <span className="hidden sm:inline">Routes</span></LinkButton>
                <LinkButton href="/import?tab=retailers"><Upload className="size-4" /> <span className="hidden sm:inline">Import</span></LinkButton>
              </>
            )}
            {canCreate && <LinkButton href="/retailers/new" variant="primary"><Plus className="size-4" /> Add retailer</LinkButton>}
          </>
        }
      />

      <div className="mb-3">
        <SearchBar placeholder="Search shop, owner, mobile, retailer ID, GSTIN or city" />
      </div>
      <form className="mb-5 grid gap-2 sm:grid-cols-4">
        {sp.q && <input type="hidden" name="q" value={sp.q} />}
        <Select name="route" defaultValue={sp.route ?? ""} aria-label="Route">
          <option value="">All routes</option>
          {(routes ?? []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </Select>
        {isOffice ? (
          <Select name="salesman" defaultValue={sp.salesman ?? ""} aria-label="Salesman">
            <option value="">All salesmen</option>
            {(salesmen ?? []).map((s) => <option key={required(s.id, "Salesman id")} value={required(s.id, "Salesman id")}>{s.full_name}</option>)}
          </Select>
        ) : <div className="hidden sm:block" />}
        <Select name="status" defaultValue={sp.status ?? ""} aria-label="Status">
          <option value="">Any status</option>
          {Object.entries(RETAILER_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        <Button type="submit" variant="secondary">Filter</Button>
      </form>

      {list.length === 0 ? (
        <Card className="p-10 text-center text-sm text-slate-500">
          No retailers found. {canCreate && <Link href="/retailers/new" className="font-medium text-ink-900 underline">Add one</Link>}
        </Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
              <tr>
                <th className="px-4 py-2.5">Retailer</th>
                <th className="px-3 py-2.5">Mobile</th>
                <th className="hidden px-3 py-2.5 md:table-cell">Route · Salesman</th>
                <th className="hidden px-3 py-2.5 lg:table-cell">Credit</th>
                <th className="px-3 py-2.5 text-right">Outstanding</th>
                <th className="px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {list.map((r) => {
                const b = balMap.get(r.id);
                return (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5">
                      <Link href={`/retailers/${r.id}`} className="font-medium text-slate-900 hover:underline">{r.shop_name}</Link>
                      <div className="text-xs text-slate-500">
                        <span className="font-mono">{r.code}</span>
                        {r.owner_name && ` · ${r.owner_name}`}
                        {r.billing_city && ` · ${r.billing_city}`}
                      </div>
                    </td>
                    <td className="tabular px-3 py-2.5 whitespace-nowrap"><a href={`tel:${r.mobile}`} className="hover:underline">{r.mobile}</a></td>
                    <td className="hidden px-3 py-2.5 text-slate-600 md:table-cell">{r.route_name ?? "—"} · {r.salesman_name ?? "—"}</td>
                    <td className="hidden px-3 py-2.5 whitespace-nowrap text-slate-600 lg:table-cell">
                      {r.credit_days} days · {Number(r.credit_limit) > 0 ? inr(r.credit_limit, { decimals: false }) : "no limit"}
                    </td>
                    <td className="tabular px-3 py-2.5 text-right whitespace-nowrap">
                      {inr(b?.outstanding ?? 0, { decimals: false })}
                      {Number(b?.overdue ?? 0) > 0 && <div className="text-xs text-red-700">{inr(b?.overdue, { decimals: false })} overdue</div>}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        <Badge tone={STATUS_TONE[r.status as keyof typeof STATUS_TONE]}>{RETAILER_STATUS_LABELS[r.status]}</Badge>
                        {r.classification && <Badge tone={RETAILER_CLASS[r.classification].tone}>{RETAILER_CLASS[r.classification].label}</Badge>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
