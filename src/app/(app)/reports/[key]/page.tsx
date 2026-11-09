import Link from "next/link";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getBrandContext } from "@/lib/brand";
import { reportByKey, type Column } from "@/lib/reports";
import { date, inr, qty } from "@/lib/format";
import { todayIST } from "@/lib/gst";
import { Button, Card, Input, PageHeader, Select, cn } from "@/components/ui";
import { ExportButton } from "../export-button";

export const metadata: Metadata = { title: "Report" };

function fmt(v: unknown, c: Column) {
  if (v === null || v === undefined || v === "") return "—";
  switch (c.type) {
    case "money": return inr(Number(v));
    case "num": return qty(Number(v));
    case "int": return Number(v).toLocaleString("en-IN");
    case "pct": return `${Number(v).toFixed(1)}%`;
    case "date": return date(String(v));
    default: return String(v);
  }
}

const PRESETS = (today: string) => {
  const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7));
  const fyStart = m >= 4 ? `${y}-04-01` : `${y - 1}-04-01`;
  const lastM = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 10);
  const lastMEnd = new Date(Date.UTC(y, m - 1, 0)).toISOString().slice(0, 10);
  return [
    { label: "Today", from: today, to: today },
    { label: "This month", from: today.slice(0, 8) + "01", to: today },
    { label: "Last month", from: lastM, to: lastMEnd },
    { label: "This FY", from: fyStart, to: today },
  ];
};

export default async function ReportPage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<{ from?: string; to?: string; brand?: string; salesman?: string; route?: string; employee?: string; category?: string }> }) {
  const { profile } = await requireRole();
  const { key } = await params;
  const def = reportByKey(key);
  if (!def) notFound();
  if (!def.roles.includes(profile.role)) redirect("/reports");
  const sp = await searchParams;
  const today = todayIST();
  // Brand filter follows the brand switcher unless the user picks another in the report.
  const ctx = await getBrandContext();
  const wantAll = sp.brand === "" && ctx.canSeeAll;
  const brand = def.filters.includes("brand")
    ? (ctx.brands.some((b) => b.id === sp.brand) ? sp.brand : wantAll ? undefined : ctx.current?.id ?? (ctx.canSeeAll ? undefined : ctx.brands[0]?.id))
    : undefined;
  const f = { from: sp.from || today.slice(0, 8) + "01", to: sp.to || today, brand, salesman: profile.role === "salesman" ? undefined : sp.salesman, route: sp.route, employee: sp.employee, category: sp.category };
  const supabase = await createClient();

  const [result, brands, salesmen, routes, employees, expenseCats] = await Promise.all([
    def.run(supabase, f),
    Promise.resolve({ data: def.filters.includes("brand") ? ctx.brands.map((b) => ({ id: b.id, name: b.name })) : [] }),
    def.filters.includes("salesman") && profile.role !== "salesman" ? supabase.from("tenant_people").select("id, full_name").eq("role", "salesman").order("full_name") : Promise.resolve({ data: [] }),
    def.filters.includes("route") ? supabase.from("routes").select("id, name").order("name") : Promise.resolve({ data: [] }),
    def.filters.includes("employee") ? supabase.from("tenant_people").select("id, full_name").order("full_name") : Promise.resolve({ data: [] }),
    def.filters.includes("category") ? supabase.from("expense_categories").select("id, name").order("sort_order") : Promise.resolve({ data: [] }),
  ]);
  const numeric = (c: Column) => ["money", "num", "int", "pct"].includes(c.type ?? "");
  const presetHref = (p: { from: string; to: string }) => {
    const n = new URLSearchParams({ ...Object.fromEntries(Object.entries(sp).filter(([, v]) => v)), from: p.from, to: p.to } as Record<string, string>);
    return `/reports/${key}?${n}`;
  };

  return (
    <>
      <Link href="/reports" className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="size-4" /> All reports</Link>
      <PageHeader title={def.title} description={def.description} actions={<ExportButton title={`${f.brand ? `${ctx.brands.find((b) => b.id === f.brand)?.name} ` : ""}${def.title} ${f.from} to ${f.to}`} columns={result.columns} rows={result.rows} totals={result.totals} />} />

      <Card className="mb-4 p-4">
        <form className="flex flex-wrap items-end gap-2">
          <div><div className="mb-1 text-xs text-slate-500">From</div><Input type="date" name="from" defaultValue={f.from} /></div>
          <div><div className="mb-1 text-xs text-slate-500">To</div><Input type="date" name="to" defaultValue={f.to} /></div>
          {(brands.data ?? []).length > 0 && (
            <Select name="brand" defaultValue={f.brand ?? ""} className="w-40" aria-label="Brand">{ctx.canSeeAll && <option value="">All brands</option>}{(brands.data ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select>
          )}
          {(salesmen.data ?? []).length > 0 && (
            <Select name="salesman" defaultValue={sp.salesman ?? ""} className="w-44" aria-label="Salesman"><option value="">All salesmen</option>{(salesmen.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}</Select>
          )}
          {(employees.data ?? []).length > 0 && (
            <Select name="employee" defaultValue={sp.employee ?? ""} className="w-44" aria-label="Employee"><option value="">All employees</option>{(employees.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}</Select>
          )}
          {(expenseCats.data ?? []).length > 0 && (
            <Select name="category" defaultValue={sp.category ?? ""} className="w-44" aria-label="Category"><option value="">All categories</option>{(expenseCats.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
          )}
          {(routes.data ?? []).length > 0 && (
            <Select name="route" defaultValue={sp.route ?? ""} className="w-44" aria-label="Route"><option value="">All routes</option>{(routes.data ?? []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select>
          )}
          <Button type="submit" variant="secondary">Apply</Button>
          <div className="ml-auto flex flex-wrap gap-1.5">
            {PRESETS(today).map((p) => (
              <Link key={p.label} href={presetHref(p)} className={cn("rounded-full border px-3 py-1 text-xs", f.from === p.from && f.to === p.to ? "border-ink-900 bg-ink-900 text-white" : "border-slate-300 hover:border-slate-400")}>{p.label}</Link>
            ))}
          </div>
        </form>
      </Card>
      {result.note && <p className="mb-3 text-sm text-slate-500">{result.note}</p>}

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
            <tr>{result.columns.map((c) => <th key={c.key} className={cn("px-3 py-2.5 whitespace-nowrap first:pl-4 last:pr-4", numeric(c) && "text-right")}>{c.label}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {result.rows.length === 0 && <tr><td colSpan={result.columns.length} className="px-4 py-10 text-center text-slate-500">No data for these filters.</td></tr>}
            {result.rows.map((r, i) => (
              <tr key={i} className="hover:bg-slate-50">
                {result.columns.map((c) => (
                  <td key={c.key} className={cn("px-3 py-2 first:pl-4 last:pr-4", numeric(c) && "tabular text-right whitespace-nowrap", c.key === "margin" && Number(r[c.key]) < 0 && "text-red-700")}>{fmt(r[c.key], c)}</td>
                ))}
              </tr>
            ))}
          </tbody>
          {result.totals && result.rows.length > 0 && (
            <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
              <tr>{result.columns.map((c, i) => <td key={c.key} className={cn("px-3 py-2.5 first:pl-4 last:pr-4", numeric(c) && "tabular text-right whitespace-nowrap")}>{i === 0 ? `Total (${result.rows.length})` : result.totals![c.key] !== undefined ? fmt(result.totals![c.key], c) : ""}</td>)}</tr>
            </tfoot>
          )}
        </table>
      </Card>
    </>
  );
}
