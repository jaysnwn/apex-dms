import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "System health" };

type Health = {
  files_bytes: number;
  files_count: number;
  rows: Record<string, number>;
  errors_24h: number;
  errors_7d: number;
  platform?: { database_bytes: number; database_limit_bytes: number; files_bytes: number; files_limit_bytes: number; tenants: number };
};
type ErrorRow = { at: string; source: string; message: string; digest: string | null; path: string | null; user_name: string | null };

const MB = 1024 * 1024;
const fmtMB = (b: number) => `${(b / MB).toFixed(b < 10 * MB ? 1 : 0)} MB`;
const fmtN = (n: number) => n.toLocaleString("en-IN");
const ROW_LABELS: Record<string, string> = {
  products: "Products", retailers: "Retailers", invoices: "Invoices", invoice_lines: "Invoice lines",
  payments: "Payments", stock_movements: "Stock movements", audit_log: "Audit entries",
};

function Meter({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct = Math.min(100, Math.round((used / limit) * 100));
  const tone = pct >= 80 ? "bg-red-500" : pct >= 60 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm">
        <span className="font-medium text-slate-700">{label}</span>
        <span className="tabular text-slate-500">{fmtMB(used)} of {fmtMB(limit)} · {pct}%</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-slate-100" role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default async function HealthPage() {
  const { tenant } = await requireRole("super_admin");
  const supabase = await createClient();
  const [{ data: h }, { data: errs }] = await Promise.all([
    supabase.rpc("system_health"),
    supabase.rpc("recent_app_errors", { p_limit: 50 }),
  ]);
  const health = h as Health | null;
  const errors = (errs ?? []) as ErrorRow[];

  return (
    <>
      <PageHeader title="System health" description={`Errors and data use for ${tenant.display_name}. Backups run twice a day; see the backup runbook.`} />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Errors, last 24 hours</div>
          <div className="tabular mt-1 text-2xl font-semibold text-slate-900">{fmtN(health?.errors_24h ?? 0)}</div>
          <div className="text-xs text-slate-500">{fmtN(health?.errors_7d ?? 0)} in the last 7 days</div>
        </Card>
        <Card className="p-5">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Stored files</div>
          <div className="tabular mt-1 text-2xl font-semibold text-slate-900">{fmtN(health?.files_count ?? 0)}</div>
          <div className="text-xs text-slate-500">{fmtMB(health?.files_bytes ?? 0)}</div>
        </Card>
        <Card className="p-5">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Invoices</div>
          <div className="tabular mt-1 text-2xl font-semibold text-slate-900">{fmtN(health?.rows.invoices ?? 0)}</div>
          <div className="text-xs text-slate-500">{fmtN(health?.rows.invoice_lines ?? 0)} lines</div>
        </Card>
      </div>

      {health?.platform && (
        <Card className="mb-6 space-y-4 p-5">
          <h2 className="font-semibold text-slate-900">Platform limits (free plan)</h2>
          <Meter label="Database" used={health.platform.database_bytes} limit={health.platform.database_limit_bytes} />
          <Meter label="File storage" used={health.platform.files_bytes} limit={health.platform.files_limit_bytes} />
          <p className="text-xs text-slate-500">
            {health.platform.tenants} organization(s). At 80 % the plan must change: the free plan stops accepting data at its limit.
          </p>
        </Card>
      )}

      <Card className="mb-6 p-5">
        <h2 className="mb-3 font-semibold text-slate-900">Records</h2>
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-4">
          {Object.entries(health?.rows ?? {}).map(([k, v]) => (
            <div key={k} className="flex justify-between border-b border-slate-100 py-1 text-sm">
              <dt className="text-slate-600">{ROW_LABELS[k] ?? k}</dt>
              <dd className="tabular font-medium text-slate-900">{fmtN(v)}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <h2 className="mb-3 text-sm font-semibold text-slate-900">Recent errors</h2>
      {errors.length === 0 ? (
        <Card className="p-8 text-center text-sm text-slate-500">No errors recorded. Errors from the last 30 days appear here.</Card>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="px-4 py-2">When</th><th className="px-4 py-2">Where</th><th className="px-4 py-2">Error</th><th className="px-4 py-2">Who</th></tr>
            </thead>
            <tbody>
              {errors.map((e, i) => (
                <tr key={i} className="border-t border-slate-100 align-top">
                  <td className="tabular whitespace-nowrap px-4 py-2 text-slate-500">
                    {new Date(e.at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "short", timeStyle: "short" })}
                  </td>
                  <td className="px-4 py-2"><Badge tone={e.source === "server" ? "amber" : "slate"}>{e.source}</Badge> <span className="text-slate-600">{e.path}</span></td>
                  <td className="max-w-md px-4 py-2 text-slate-800">{e.message}{e.digest && <span className="block text-xs text-slate-400">Ref {e.digest}</span>}</td>
                  <td className="px-4 py-2 text-slate-600">{e.user_name ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
