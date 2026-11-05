import type { Metadata } from "next";
import { CheckCircle2, Clock, Receipt, Wallet } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { date, inr } from "@/lib/format";
import { EXPENSE_CATEGORY, EXPENSE_STATUS } from "@/lib/status";
import { todayIST } from "@/lib/gst";
import { Badge, Card, PageHeader } from "@/components/ui";
import { Chip } from "@/components/chip";
import { StatCard } from "@/components/stat-card";
import { ExpenseForm } from "./expense-form";
import { ReimburseButton, ReviewButtons } from "./review";

export const metadata: Metadata = { title: "Expenses" };

type Exp = { id: string; salesman_id: string; route_id: string | null; expense_date: string; category: string; amount: number; description: string | null; receipt_path: string | null; status: string; rejection_reason: string | null };

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ tab?: string; month?: string }> }) {
  const { user, profile } = await requireRole();
  const sp = await searchParams;
  const isManager = profile.role === "super_admin" || profile.role === "manager";
  const canSeeAll = isManager || profile.role === "billing";
  const tab = canSeeAll ? sp.tab ?? (isManager ? "approve" : "all") : "mine";
  const month = sp.month || todayIST().slice(0, 7);
  const supabase = await createClient();

  let q = supabase.from("expenses").select("id, salesman_id, route_id, expense_date, category, amount, description, receipt_path, status, rejection_reason").order("expense_date", { ascending: false }).limit(500);
  if (tab === "mine") q = q.eq("salesman_id", user.id);
  if (tab === "approve") q = q.eq("status", "submitted");
  if (tab === "reimburse") q = q.eq("status", "approved");
  if (tab === "all" || tab === "mine") q = q.gte("expense_date", `${month}-01`).lte("expense_date", `${month}-31`);
  const [{ data }, { data: people }, { data: routes }] = await Promise.all([
    q,
    supabase.from("profiles").select("id, full_name"),
    supabase.from("routes").select("id, name").eq("is_active", true).order("name"),
  ]);
  const rows = (data ?? []) as Exp[];
  const uMap = new Map((people ?? []).map((p) => [p.id as string, p.full_name as string]));
  const rMap = new Map((routes ?? []).map((r) => [r.id as string, r.name as string]));
  const paths = rows.map((r) => r.receipt_path).filter(Boolean) as string[];
  const { data: signed } = paths.length ? await supabase.storage.from("expense-receipts").createSignedUrls(paths, 3600) : { data: [] };
  const urls = new Map((signed ?? []).map((s) => [s.path as string, s.signedUrl as string]));

  const sum = (st?: string) => rows.filter((r) => !st || r.status === st).reduce((t, r) => t + Number(r.amount), 0);

  // reimbursement grouped by salesman
  const bySalesman = new Map<string, Exp[]>();
  if (tab === "reimburse") for (const r of rows) bySalesman.set(r.salesman_id, [...(bySalesman.get(r.salesman_id) ?? []), r]);

  // monthly summary by category
  const byCat = new Map<string, number>();
  for (const r of rows) if (r.status !== "rejected") byCat.set(r.category, (byCat.get(r.category) ?? 0) + Number(r.amount));

  return (
    <>
      <PageHeader title="Expenses" description="Fuel, food, parking, stay and travel — with receipt photos and manager approval." />
      <div className="mb-5 flex flex-wrap gap-2">
        <Chip href="/expenses?tab=mine" active={tab === "mine"}>My expenses</Chip>
        {isManager && <Chip href="/expenses?tab=approve" active={tab === "approve"}>To approve</Chip>}
        {isManager && <Chip href="/expenses?tab=reimburse" active={tab === "reimburse"}>To reimburse</Chip>}
        {canSeeAll && <Chip href="/expenses?tab=all" active={tab === "all"}>All (month)</Chip>}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          {(tab === "mine" || tab === "all") && (
            <>
              <form className="flex items-center gap-2">
                <input type="hidden" name="tab" value={tab} />
                <input type="month" name="month" defaultValue={month} className="h-10 rounded-lg border border-slate-300 px-3 text-sm" aria-label="Month" />
                <button className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm">Show</button>
              </form>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatCard label="This month" value={inr(sum(), { decimals: false })} icon={Receipt} tone="violet" />
                <StatCard label="Waiting approval" value={inr(sum("submitted"), { decimals: false })} icon={Clock} tone="amber" />
                <StatCard label="Approved" value={inr(sum("approved"), { decimals: false })} icon={CheckCircle2} tone="blue" />
                <StatCard label="Reimbursed" value={inr(sum("reimbursed"), { decimals: false })} icon={Wallet} tone="green" />
              </div>
              {byCat.size > 0 && (
                <Card className="p-4">
                  <div className="mb-2 text-sm font-medium">By category</div>
                  <div className="flex flex-wrap gap-2">{[...byCat.entries()].map(([k, v]) => <Badge key={k} tone="violet">{EXPENSE_CATEGORY[k]}: {inr(v, { decimals: false })}</Badge>)}</div>
                </Card>
              )}
            </>
          )}

          {tab === "reimburse" ? (
            [...bySalesman.entries()].length === 0 ? <Card className="p-8 text-center text-sm text-slate-500">Nothing waiting for reimbursement.</Card> :
            [...bySalesman.entries()].map(([sid, list]) => (
              <Card key={sid} className="p-4">
                <div className="mb-2 flex items-center justify-between"><span className="font-semibold">{uMap.get(sid)}</span><ReimburseButton ids={list.map((l) => l.id)} total={list.reduce((t, l) => t + Number(l.amount), 0)} name={uMap.get(sid) ?? ""} /></div>
                <ul className="text-sm text-slate-600">{list.map((l) => <li key={l.id} className="flex justify-between"><span>{date(l.expense_date)} · {EXPENSE_CATEGORY[l.category]} · {l.description}</span><span className="tabular">{inr(l.amount)}</span></li>)}</ul>
              </Card>
            ))
          ) : (
            <Card className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
                  <tr><th className="px-4 py-2.5">Date</th>{tab !== "mine" && <th className="px-3 py-2.5">Salesman</th>}<th className="px-3 py-2.5">Expense</th><th className="px-3 py-2.5">Receipt</th><th className="px-3 py-2.5">Status</th><th className="px-4 py-2.5 text-right">Amount</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">{tab === "approve" ? "Nothing waiting for approval." : "No expenses."}</td></tr>}
                  {rows.map((r) => {
                    const st = EXPENSE_STATUS[r.status];
                    const url = r.receipt_path ? urls.get(r.receipt_path) : undefined;
                    return (
                      <tr key={r.id}>
                        <td className="px-4 py-2.5 whitespace-nowrap">{date(r.expense_date)}</td>
                        {tab !== "mine" && <td className="px-3 py-2.5">{uMap.get(r.salesman_id)}</td>}
                        <td className="px-3 py-2.5"><span className="font-medium">{EXPENSE_CATEGORY[r.category]}</span><div className="text-xs text-slate-500">{r.description}{r.route_id ? ` · ${rMap.get(r.route_id) ?? ""}` : ""}</div>{r.rejection_reason && <div className="text-xs text-red-700">Rejected: {r.rejection_reason}</div>}</td>
                        <td className="px-3 py-2.5">{url ? <a href={url} target="_blank" rel="noopener" className="text-accent-700 hover:underline">View</a> : <span className="text-slate-400">None</span>}</td>
                        <td className="px-3 py-2.5">{tab === "approve" ? <ReviewButtons id={r.id} /> : <Badge tone={st.tone}>{st.label}</Badge>}</td>
                        <td className="tabular px-4 py-2.5 text-right font-medium">{inr(r.amount)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          )}
        </div>
        <div><ExpenseForm userId={user.id} routes={routes ?? []} /></div>
      </div>
    </>
  );
}
