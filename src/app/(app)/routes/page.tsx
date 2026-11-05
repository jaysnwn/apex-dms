import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CheckCircle2, IndianRupee, MapPin, ShoppingCart, XCircle } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { dateTime, inr } from "@/lib/format";
import { VISIT_STATUS } from "@/lib/status";
import { todayIST } from "@/lib/gst";
import { Badge, Button, Card, Input, PageHeader, cn } from "@/components/ui";
import { StatCard } from "@/components/stat-card";
import { RouteTabs } from "./manager-tabs";

export const metadata: Metadata = { title: "Routes" };

export default async function RoutesMonitor({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { profile } = await requireRole("super_admin", "manager", "salesman");
  if (profile.role === "salesman") redirect("/routes/today");
  const sp = await searchParams;
  const day = sp.date || todayIST();
  const supabase = await createClient();

  const [{ data: visits }, { data: salesmen }, { data: plans }, { data: pays }, { data: invs }] = await Promise.all([
    supabase.from("visits").select("id, retailer_id, salesman_id, status, checkin_at, remarks, missed_reason, latitude, longitude, retailers(shop_name)").eq("planned_date", day),
    supabase.from("profiles").select("id, full_name").eq("role", "salesman").eq("is_active", true).order("full_name"),
    supabase.from("route_plans").select("salesman_id, routes(name)").eq("plan_date", day),
    supabase.from("payments").select("collected_by, amount").eq("payment_date", day).in("status", ["received", "cheque_pending"]),
    supabase.from("invoices").select("grand_total, orders(salesman_id)").eq("invoice_date", day).eq("status", "issued"),
  ]);

  const per = (salesmen ?? []).map((s) => {
    const vs = (visits ?? []).filter((v) => v.salesman_id === s.id);
    return {
      id: s.id as string,
      name: s.full_name as string,
      routes: (plans ?? []).filter((p) => p.salesman_id === s.id).map((p) => (p.routes as unknown as { name: string })?.name).join(", "),
      planned: vs.length,
      done: vs.filter((v) => v.status === "completed").length,
      missed: vs.filter((v) => v.status === "missed").length,
      collected: (pays ?? []).filter((p) => p.collected_by === s.id).reduce((t, p) => t + Number(p.amount), 0),
      sold: (invs ?? []).filter((i) => (i.orders as unknown as { salesman_id: string } | null)?.salesman_id === s.id).reduce((t, i) => t + Number(i.grand_total), 0),
      visits: vs,
    };
  });
  const tot = (k: "planned" | "done" | "missed" | "collected" | "sold") => per.reduce((t, p) => t + p[k], 0);

  return (
    <>
      <PageHeader title="Routes" description="Planned versus actual visits, collections and sales by salesman." />
      <RouteTabs />
      <form className="mb-5 flex gap-2">
        <Input type="date" name="date" defaultValue={day} className="w-44" aria-label="Date" />
        <Button type="submit" variant="secondary">Show</Button>
      </form>
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Visits done" value={`${tot("done")} / ${tot("planned")}`} icon={CheckCircle2} tone="green" />
        <StatCard label="Missed" value={String(tot("missed"))} icon={XCircle} tone="red" alert={tot("missed") > 0} />
        <StatCard label="Collected" value={inr(tot("collected"), { decimals: false })} icon={IndianRupee} tone="teal" />
        <StatCard label="Invoiced" value={inr(tot("sold"), { decimals: false })} icon={ShoppingCart} tone="blue" />
      </div>
      <div className="space-y-4">
        {per.map((p) => {
          const pct = p.planned ? Math.round(((p.done + p.missed) / p.planned) * 100) : 0;
          return (
            <Card key={p.id} className="overflow-hidden">
              <details>
                <summary className="flex cursor-pointer list-none flex-col gap-3 p-4 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{p.name}</div>
                    <div className="text-sm text-slate-500">{p.routes || "No route planned"}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <Badge tone="green">{p.done} visited</Badge>
                    {p.missed > 0 && <Badge tone="red">{p.missed} missed</Badge>}
                    <Badge tone="amber">{p.planned - p.done - p.missed} left</Badge>
                    <span className="tabular text-teal-700">{inr(p.collected, { decimals: false })} collected</span>
                    <span className="tabular text-sky-700">{inr(p.sold, { decimals: false })} sold</span>
                  </div>
                  <div className="w-full sm:w-32">
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className={cn("h-full", pct >= 100 ? "bg-emerald-500" : "bg-accent-500")} style={{ width: `${pct}%` }} /></div>
                    <div className="tabular mt-0.5 text-right text-xs text-slate-500">{pct}%</div>
                  </div>
                </summary>
                {p.visits.length > 0 && (
                  <ul className="divide-y divide-slate-100 border-t border-slate-100 text-sm">
                    {p.visits.map((v) => (
                      <li key={v.id} className="flex flex-wrap items-center gap-2 px-4 py-2">
                        <Link href={`/retailers/${v.retailer_id}`} className="min-w-0 flex-1 truncate hover:underline">{(v.retailers as unknown as { shop_name: string })?.shop_name}</Link>
                        <Badge tone={VISIT_STATUS[v.status].tone}>{VISIT_STATUS[v.status].label}</Badge>
                        {v.checkin_at && <span className="text-xs text-slate-500">{dateTime(v.checkin_at)}</span>}
                        {v.latitude && <a href={`https://maps.google.com/?q=${v.latitude},${v.longitude}`} target="_blank" rel="noopener" className="text-accent-700"><MapPin className="size-4" /></a>}
                        {(v.missed_reason || v.remarks) && <span className="w-full text-xs text-slate-500">{v.missed_reason ?? v.remarks}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </details>
            </Card>
          );
        })}
        {per.length === 0 && <Card className="p-8 text-center text-sm text-slate-500">No active salesmen. Add users with the Salesman role first.</Card>}
      </div>
    </>
  );
}
