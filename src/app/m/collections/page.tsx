import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, Banknote, Building2, CheckCircle2, Clock, CreditCard, HandCoins, Smartphone, XCircle } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { date, inr } from "@/lib/format";
import { addDays, todayIST } from "@/lib/gst";
import { PAYMENT_METHOD } from "@/lib/status";
import { cn } from "@/components/ui";
import { getMyCollections, type MyCollection } from "../data";

export const metadata: Metadata = { title: "My collections" };

const ICON: Record<string, typeof Banknote> = { cash: Banknote, upi: Smartphone, cheque: CreditCard, bank_transfer: Building2 };

// What the salesman sees for each payment he entered.
function state(p: MyCollection): { label: string; tone: string; icon: typeof Clock; note?: string } {
  if (p.status === "cancelled" && p.notes?.includes("Rejected at verification")) {
    const reason = p.notes.split("Rejected at verification:").pop()?.trim();
    return { label: "Rejected by office", tone: "bg-red-100 text-red-800", icon: XCircle, note: reason };
  }
  if (p.status === "cancelled") return { label: "Cancelled", tone: "bg-slate-100 text-slate-600", icon: XCircle };
  if (p.status === "bounced") return { label: "Cheque bounced", tone: "bg-red-100 text-red-800", icon: XCircle };
  if (!p.verified_at) return { label: "Hand over to office", tone: "bg-amber-100 text-amber-900", icon: HandCoins };
  if (p.status === "cheque_pending") return { label: "Verified · cheque not cleared", tone: "bg-sky-100 text-sky-800", icon: Clock };
  return { label: "Verified", tone: "bg-emerald-100 text-emerald-800", icon: CheckCircle2 };
}

export default async function MyCollectionsPage() {
  const { user } = await requireRole("salesman", "manager", "super_admin");
  const today = todayIST();
  const supabase = await createClient();
  const rows = await getMyCollections(supabase, user.id, addDays(today, -30));
  const open = rows.filter((p) => !p.verified_at && (p.status === "received" || p.status === "cheque_pending"));
  const rest = rows.filter((p) => !open.includes(p));
  const by = (m: string) => open.filter((p) => p.method === m).reduce((t, p) => t + p.amount, 0);
  const total = open.reduce((t, p) => t + p.amount, 0);

  return (
    <div className="space-y-4">
      <Link href="/m" className="flex items-center gap-1 px-1 text-sm font-medium text-slate-600"><ArrowLeft className="size-4" /> Home</Link>

      <section className="rounded-3xl bg-gradient-to-br from-amber-500 to-orange-600 p-5 text-white shadow-md">
        <div className="flex items-center gap-2 text-sm font-medium text-amber-50"><HandCoins className="size-4" /> Money with you</div>
        <div className="tabular mt-1 text-4xl font-bold">{inr(total, { decimals: false })}</div>
        <div className="text-sm text-amber-50">{open.length ? `${open.length} payment${open.length === 1 ? "" : "s"} to hand over to office` : "Nothing to hand over — all verified."}</div>
        {open.length > 0 && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            {(["cash", "upi", "cheque", "bank_transfer"] as const).filter((m) => by(m) > 0).map((m) => {
              const I = ICON[m];
              return (
                <div key={m} className="flex items-center gap-2 rounded-2xl bg-white/15 px-3 py-2">
                  <I className="size-5" />
                  <span className="text-sm">{PAYMENT_METHOD[m]}</span>
                  <span className="tabular ml-auto font-bold">{inr(by(m), { decimals: false })}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <p className="rounded-2xl bg-white p-3 text-sm text-slate-600 ring-1 ring-slate-200/70">
        Give the cash and cheques to the office. They check UPI and bank payments in the bank. Once the office verifies a payment it counts for your <b>incentive</b>.
      </p>

      {open.length > 0 && <List title="To hand over" rows={open} />}
      {rest.length > 0 && <List title="Last 30 days" rows={rest} />}
      {rows.length === 0 && <p className="py-10 text-center text-sm text-slate-500">No collections in the last 30 days.</p>}
    </div>
  );
}

function List({ title, rows }: { title: string; rows: MyCollection[] }) {
  return (
    <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70">
      <h2 className="px-4 pt-3 pb-1 text-sm font-semibold">{title}</h2>
      <ul className="divide-y divide-slate-100">
        {rows.map((p) => {
          const s = state(p);
          const I = ICON[p.method] ?? Banknote;
          return (
            <li key={p.id}>
              <Link href={`/m/outlets/${p.retailer_id}`} className="flex items-start gap-3 px-4 py-3 active:bg-slate-50">
                <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600"><I className="size-4" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{p.shop_name}</span>
                  <span className="block text-xs text-slate-500">{date(p.payment_date)} · {PAYMENT_METHOD[p.method]}{p.reference_no ? ` · ${p.reference_no}` : ""}</span>
                  <span className={cn("mt-1 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold", s.tone)}><s.icon className="size-3.5" /> {s.label}</span>
                  {s.note && <span className="mt-1 block text-xs text-red-700">Reason: {s.note}</span>}
                </span>
                <span className={cn("tabular font-semibold", p.status === "cancelled" || p.status === "bounced" ? "text-slate-400 line-through" : "")}>{inr(p.amount, { decimals: false })}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
