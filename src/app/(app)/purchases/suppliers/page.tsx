import Link from "next/link";
import type { Metadata } from "next";
import { Building2, Plus } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { inr } from "@/lib/format";
import { todayIST } from "@/lib/gst";
import { GST_STATES } from "@/lib/states";
import { Badge, Card } from "@/components/ui";
import { LinkButton } from "@/components/chip";

export const metadata: Metadata = { title: "Suppliers" };

export default async function SuppliersPage() {
  await requireRole("super_admin", "manager", "billing");
  const supabase = await createClient();
  const today = todayIST();
  const [{ data: rows }, { data: bal }] = await Promise.all([
    supabase.from("suppliers").select("id, code, name, gstin, state_code, city, mobile, contact_name, credit_days, is_active").order("is_active", { ascending: false }).order("name"),
    supabase.from("purchase_balances").select("supplier_id, balance, due_date").gt("balance", 0),
  ]);
  const owed = new Map<string, { total: number; overdue: number }>();
  for (const b of bal ?? []) {
    const o = owed.get(b.supplier_id) ?? { total: 0, overdue: 0 };
    o.total += Number(b.balance);
    if (b.due_date < today) o.overdue += Number(b.balance);
    owed.set(b.supplier_id, o);
  }
  return (
    <>
      <div className="mb-4 flex justify-end"><LinkButton href="/purchases/suppliers/new" variant="primary"><Plus className="size-4" /> New supplier</LinkButton></div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {(rows ?? []).map((s) => {
          const o = owed.get(s.id) ?? { total: 0, overdue: 0 };
          return (
            <Link key={s.id} href={`/purchases/suppliers/${s.id}`}>
              <Card className="h-full p-5 transition hover:border-fuchsia-300 hover:shadow-sm">
                <div className="flex items-start gap-3">
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-fuchsia-100 text-fuchsia-700"><Building2 className="size-5" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2"><span className="truncate font-semibold">{s.name}</span>{!s.is_active && <Badge>Inactive</Badge>}</div>
                    <div className="text-xs text-slate-500"><span className="font-mono">{s.code}</span>{s.city ? ` · ${s.city}` : ""}{s.state_code ? ` · ${GST_STATES[s.state_code] ?? s.state_code}` : ""}</div>
                    <div className="mt-0.5 text-xs text-slate-500">{s.gstin ? <span className="font-mono">{s.gstin}</span> : <span className="text-amber-700">GSTIN missing</span>} · {s.credit_days} days credit</div>
                  </div>
                </div>
                <div className="mt-4 flex items-end justify-between border-t border-slate-100 pt-3">
                  <div><div className="text-xs text-slate-500">Payable</div><div className="tabular text-lg font-semibold">{inr(o.total, { decimals: false })}</div></div>
                  {o.overdue > 0 ? <Badge tone="red">Overdue {inr(o.overdue, { decimals: false })}</Badge> : o.total > 0 ? <Badge tone="blue">Not yet due</Badge> : <Badge tone="green">Nothing due</Badge>}
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </>
  );
}
