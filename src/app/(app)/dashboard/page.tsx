import Link from "next/link";
import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { modulesFor, ROLE_LABELS } from "@/lib/roles";
import { Alert, Badge, Card, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const { profile } = await requireRole();
  const { denied } = await searchParams;
  const supabase = await createClient();

  const isAdmin = profile.role === "super_admin" || profile.role === "manager";
  let stats: { label: string; value: number }[] = [];

  if (isAdmin) {
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const [users, changes, retailers] = await Promise.all([
      supabase.from("profiles").select("id", { count: "exact", head: true }).eq("is_active", true),
      supabase.from("audit_log").select("id", { count: "exact", head: true }).gte("changed_at", since),
      supabase.from("retailers").select("id", { count: "exact", head: true }),
    ]);
    stats = [
      { label: "Active users", value: users.count ?? 0 },
      { label: "Changes logged, last 24 h", value: changes.count ?? 0 },
      { label: "Retailers", value: retailers.count ?? 0 },
    ];
  }

  const modules = modulesFor(profile.role).filter((m) => m.key !== "dashboard");
  const firstName = profile.full_name.split(" ")[0] || "there";

  return (
    <>
      <PageHeader title={`Hello, ${firstName}`} description={`Signed in as ${ROLE_LABELS[profile.role]}`} />

      {denied && (
        <div className="mb-6">
          <Alert tone="amber">Your role does not have access to that page.</Alert>
        </div>
      )}

      {stats.length > 0 && (
        <div className="mb-8 grid gap-4 sm:grid-cols-3">
          {stats.map((s) => (
            <Card key={s.label} className="p-5">
              <div className="text-sm text-slate-500">{s.label}</div>
              <div className="tabular mt-1 text-3xl font-semibold tracking-tight">{s.value.toLocaleString("en-IN")}</div>
            </Card>
          ))}
        </div>
      )}

      <h2 className="mb-3 text-sm font-semibold text-slate-900">Your modules</h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {modules.map((m) => (
          <Link key={m.key} href={m.href} className="group">
            <Card className="h-full p-5 transition group-hover:border-slate-300 group-hover:shadow-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium text-slate-900">{m.label}</span>
                {m.ready ? <Badge tone="green">Live</Badge> : <Badge>Coming in {m.milestone}</Badge>}
              </div>
              <p className="mt-2 text-sm text-slate-500">{m.description}</p>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
