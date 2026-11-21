import Link from "next/link";
import type { Metadata } from "next";
import { BarChart3, Boxes, FileText, IndianRupee, MapPinned, PackagePlus, Receipt, Users } from "lucide-react";
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
  { key: "Routes", icon: MapPinned, tone: "bg-cyan-50 text-cyan-600" },
  { key: "Expenses", icon: Receipt, tone: "bg-rose-50 text-rose-600" },
] as const;

// Account statements: their own page (a ledger per shop and a PDF), not a table report.
const STATEMENTS = [
  { type: "route", title: "Route-wise statement", description: "Every town and retailer on a route: ledgers, town totals and the route total, in one PDF." },
  { type: "town", title: "Town-wise statement", description: "Every retailer in a town with its own ledger, and the town's invoices, collections and outstanding." },
  { type: "retailer", title: "Retailer statement", description: "One shop's bills, payments, credit notes and running balance for any period." },
  { type: "territory", title: "Territory-wise statement", description: "All routes, towns and retailers of a territory, with route, town and territory totals." },
];

export default async function ReportsPage() {
  const { profile } = await requireRole();
  const mine = REPORTS.filter((r) => r.roles.includes(profile.role));
  return (
    <>
      <PageHeader title="Reports" description="Every report can be filtered by date and exported to Excel or CSV." />
      <div className="space-y-8">
        {["super_admin", "manager", "billing"].includes(profile.role) && (
          <section id="statements">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
              <span className="grid size-7 place-items-center rounded-md bg-indigo-50 text-indigo-600"><FileText className="size-4" /></span> Account statements
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {STATEMENTS.map((r) => (
                <Link key={r.type} href={`/reports/statements?type=${r.type}`}>
                  <Card className="h-full p-4 transition hover:border-slate-300 hover:shadow-sm">
                    <div className="font-medium">{r.title}</div>
                    <p className="mt-1 text-sm text-slate-500">{r.description}</p>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        )}
        {GROUPS.map((g) => {
          const list = mine.filter((r) => r.group === g.key);
          if (!list.length) return null;
          return (
            <section key={g.key} id={g.key.toLowerCase()}>
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
