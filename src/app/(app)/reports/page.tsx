import Link from "next/link";
import type { Metadata } from "next";
import { BarChart3, Boxes, IndianRupee, PackagePlus, Users } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { REPORTS } from "@/lib/reports";
import { Card, PageHeader, cn } from "@/components/ui";

export const metadata: Metadata = { title: "Reports" };

const GROUPS = [
  { key: "Sales", icon: BarChart3, tone: "bg-sky-50 text-sky-600" },
  { key: "Money", icon: IndianRupee, tone: "bg-emerald-50 text-emerald-600" },
  { key: "Stock", icon: Boxes, tone: "bg-teal-50 text-teal-600" },
  { key: "Purchases", icon: PackagePlus, tone: "bg-fuchsia-50 text-fuchsia-600" },
  { key: "Team", icon: Users, tone: "bg-violet-50 text-violet-600" },
] as const;

export default async function ReportsPage() {
  const { profile } = await requireRole();
  const mine = REPORTS.filter((r) => r.roles.includes(profile.role));
  return (
    <>
      <PageHeader title="Reports" description="Every report can be filtered by date and exported to Excel." />
      <div className="space-y-8">
        {GROUPS.map((g) => {
          const list = mine.filter((r) => r.group === g.key);
          if (!list.length) return null;
          return (
            <section key={g.key}>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
                <span className={cn("grid size-7 place-items-center rounded-md", g.tone)}><g.icon className="size-4" /></span> {g.key}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {list.map((r) => (
                  <Link key={r.key} href={`/reports/${r.key}`}>
                    <Card className="h-full p-4 transition hover:border-slate-300 hover:shadow-sm">
                      <div className="font-medium">{r.title}</div>
                      <p className="mt-1 text-sm text-slate-500">{r.description}</p>
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
