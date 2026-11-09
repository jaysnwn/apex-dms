import Link from "next/link";
import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getBrandContext } from "@/lib/brand";
import { Badge, Button, Card, PageHeader, Select } from "@/components/ui";

export const metadata: Metadata = { title: "Audit log" };

const PAGE_SIZE = 50;

const TABLES = [
  "profiles", "company_settings", "brands", "categories", "warehouses", "warehouse_locations",
  "products", "product_images", "stock_movements", "stock_counts", "stock_count_lines",
  "routes", "retailers", "orders", "order_lines", "invoices", "invoice_lines",
  "credit_notes", "credit_note_lines", "dispatches", "payments", "payment_allocations",
  "payment_promises", "route_plans", "visits", "targets", "expenses", "reimbursements", "reimbursement_lines", "expense_categories",
  "suppliers", "purchases", "purchase_lines", "purchase_returns", "supplier_payments", "profile_brands",
];

type AuditRow = {
  id: number;
  table_name: string;
  record_id: string | null;
  action: "INSERT" | "UPDATE" | "DELETE";
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  changed_by: string | null;
  changed_at: string;
  brand_id: string | null;
};

const IGNORED_KEYS = new Set(["updated_at", "created_at"]);

function changedKeys(row: AuditRow) {
  if (row.action !== "UPDATE" || !row.old_data || !row.new_data) return [];
  return Object.keys(row.new_data).filter(
    (k) => !IGNORED_KEYS.has(k) && JSON.stringify(row.old_data![k]) !== JSON.stringify(row.new_data![k])
  );
}

function fmt(v: unknown) {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ table?: string; action?: string; user?: string; page?: string; brand?: string }>;
}) {
  await requireRole("super_admin", "manager");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const supabase = await createClient();
  const ctx = await getBrandContext();
  const brandName = new Map(ctx.brands.map((b) => [b.id, b.name]));

  let query = supabase
    .from("audit_log")
    .select("id, table_name, record_id, action, old_data, new_data, changed_by, changed_at, brand_id", { count: "exact" })
    .order("changed_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (sp.table && TABLES.includes(sp.table)) query = query.eq("table_name", sp.table);
  if (sp.action && ["INSERT", "UPDATE", "DELETE"].includes(sp.action)) query = query.eq("action", sp.action);
  if (sp.user) query = query.eq("changed_by", sp.user);
  if (sp.brand === "none") query = query.is("brand_id", null);
  else if (sp.brand && brandName.has(sp.brand)) query = query.eq("brand_id", sp.brand);

  const [{ data, count }, { data: people }] = await Promise.all([
    query,
    supabase.from("profiles").select("id, full_name, email").order("full_name"),
  ]);
  const rows = (data ?? []) as AuditRow[];
  const names = new Map((people ?? []).map((p) => [p.id as string, (p.full_name || p.email) as string]));
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  const qs = (p: number) => {
    const params = new URLSearchParams();
    if (sp.table) params.set("table", sp.table);
    if (sp.action) params.set("action", sp.action);
    if (sp.user) params.set("user", sp.user);
    if (sp.brand) params.set("brand", sp.brand);
    params.set("page", String(p));
    return `?${params}`;
  };

  return (
    <>
      <PageHeader title="Audit log" description="Every change to stock, money, retailers and users, with who made it and when." />

      <Card className="mb-4 p-4">
        <form className="grid gap-3 sm:grid-cols-5">
          <Select name="brand" defaultValue={sp.brand ?? ""} aria-label="Brand">
            <option value="">All brands</option>
            {ctx.brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            <option value="none">Not brand-specific</option>
          </Select>
          <Select name="table" defaultValue={sp.table ?? ""} aria-label="Table">
            <option value="">All records</option>
            {TABLES.map((t) => (
              <option key={t} value={t}>
                {t.replaceAll("_", " ")}
              </option>
            ))}
          </Select>
          <Select name="action" defaultValue={sp.action ?? ""} aria-label="Action">
            <option value="">All actions</option>
            <option value="INSERT">Created</option>
            <option value="UPDATE">Changed</option>
            <option value="DELETE">Deleted</option>
          </Select>
          <Select name="user" defaultValue={sp.user ?? ""} aria-label="User">
            <option value="">Everyone</option>
            {(people ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name || p.email}
              </option>
            ))}
          </Select>
          <Button type="submit" variant="secondary">Filter</Button>
        </form>
      </Card>

      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500">No changes match these filters.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((r) => {
              const keys = changedKeys(r);
              return (
                <li key={r.id} className="p-4">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <Badge tone={r.action === "INSERT" ? "green" : r.action === "DELETE" ? "red" : "blue"}>
                      {r.action === "INSERT" ? "Created" : r.action === "UPDATE" ? "Changed" : "Deleted"}
                    </Badge>
                    <span className="font-medium text-slate-900">{r.table_name.replaceAll("_", " ")}</span>
                    <span className="font-mono text-xs text-slate-400">{r.record_id?.slice(0, 8)}</span>
                    {r.brand_id && brandName.has(r.brand_id) && <Badge>{brandName.get(r.brand_id)}</Badge>}
                    <span className="ml-auto text-slate-500">
                      {r.changed_by ? names.get(r.changed_by) ?? "Unknown user" : "System"} ·{" "}
                      <time dateTime={r.changed_at} className="tabular">
                        {new Date(r.changed_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
                      </time>
                    </span>
                  </div>
                  {keys.length > 0 && (
                    <div className="mt-2 overflow-x-auto">
                      <table className="text-xs">
                        <tbody>
                          {keys.map((k) => (
                            <tr key={k}>
                              <td className="py-0.5 pr-4 font-medium text-slate-600">{k}</td>
                              <td className="py-0.5 pr-2 text-red-700 line-through">{fmt(r.old_data?.[k])}</td>
                              <td className="py-0.5 text-emerald-700">{fmt(r.new_data?.[k])}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
        <span className="tabular">
          {(count ?? 0).toLocaleString("en-IN")} entries · page {page} of {totalPages}
        </span>
        <div className="flex gap-2">
          {page > 1 && <Link className="rounded-lg border bg-white px-3 py-1.5" href={qs(page - 1)}>Newer</Link>}
          {page < totalPages && <Link className="rounded-lg border bg-white px-3 py-1.5" href={qs(page + 1)}>Older</Link>}
        </div>
      </div>
    </>
  );
}
