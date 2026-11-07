import Link from "next/link";
import { CheckCircle2, ChevronRight, CircleDashed, Clock, IndianRupee, ShoppingBag, Sparkles, Store, Target } from "lucide-react";
import { cn } from "@/components/ui";
import { date, inr } from "@/lib/format";
import { recoveryGap, type IncentiveShop, type IncentiveSummary } from "@/lib/incentive";

// Incentive breakdown with to-do lists. Used in the salesman app and on the
// manager's per-salesman page. shopHref decides where a shop row links to.
export function IncentiveView({ s, shops, shopHref, orderHref }: {
  s: IncentiveSummary; shops: IncentiveShop[]; shopHref: (id: string) => string; orderHref?: (id: string) => string;
}) {
  const sc = s.scheme;
  const salesGap = Math.max(0, sc.sales_target - s.net_sales);
  const billedGap = Math.max(0, sc.billed_target - s.billed_shops);
  const smartGap = Math.max(0, sc.smart_target - s.smart_shops);
  const recGap = recoveryGap(s);

  const onTrack = shops.filter((x) => x.status === "on_track").sort((a, b) => (a.next_deadline ?? "").localeCompare(b.next_deadline ?? ""));
  const nearMin = shops.filter((x) => x.status === "below_min").sort((a, b) => b.billed_taxable - a.billed_taxable);
  const notBilled = shops.filter((x) => x.status === "not_billed");
  const smart = shops.filter((x) => x.status === "smart");
  const missed = shops.filter((x) => x.status === "missed");
  const toCollect = shops.map((x) => ({ ...x, due: Math.max(0, x.billed_total - x.collected_in_month) })).filter((x) => x.due > 0.99).sort((a, b) => b.due - a.due);

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-600 to-teal-800 p-5 text-white shadow-md">
        <div className="flex items-center justify-between text-sm text-emerald-100">
          <span className="flex items-center gap-1.5"><Sparkles className="size-4" /> Incentive</span>
          <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs">{s.is_final ? "Final" : `Provisional · final on ${date(s.final_on)}`}</span>
        </div>
        <div className="mt-1 flex items-end gap-2">
          <span className="tabular text-4xl font-bold">{inr(s.total, { decimals: false })}</span>
          <span className="tabular pb-1 text-emerald-100">of {inr(s.max_total, { decimals: false })}</span>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-1.5">
          {[s.sales_earned, s.billed_earned, s.smart_earned, s.recovery_earned].map((v, i) => (
            <div key={i} className={cn("h-2 rounded-full", v > 0 ? "bg-white" : "bg-white/20")} />
          ))}
        </div>
      </section>

      <Criterion icon={Target} title="Monthly sales (before GST)" amount={sc.sales_amount} met={s.sales_earned > 0}
        value={inr(s.net_sales, { decimals: false })} target={inr(sc.sales_target, { decimals: false })} pct={(s.net_sales / sc.sales_target) * 100}
        hint={salesGap > 0 ? `${inr(salesGap, { decimals: false })} more sales needed` : "Target reached"}
        note={s.returns_earlier_bills > 0 ? `Includes − ${inr(s.returns_earlier_bills, { decimals: false })} returns on earlier bills` : undefined} />

      <Criterion icon={Store} title={`Shops billed this month`} amount={sc.billed_amount} met={s.billed_earned > 0}
        value={String(s.billed_shops)} target={String(sc.billed_target)} pct={(s.billed_shops / sc.billed_target) * 100}
        hint={billedGap > 0 ? `${billedGap} more shop${billedGap === 1 ? "" : "s"} to bill` : "Done"}>
        {notBilled.length > 0 && (
          <ShopList title={`Not billed yet · ${notBilled.length}`} rows={notBilled.map((x) => ({ x, right: "", sub: x.city ?? "" }))} shopHref={shopHref} orderHref={orderHref} />
        )}
      </Criterion>

      <Criterion icon={ShoppingBag} title={`Smart retailers (≥ ${inr(sc.smart_min_purchase, { decimals: false })} & paid in ${sc.smart_pay_days} days)`} amount={sc.smart_amount} met={s.smart_earned > 0}
        value={String(s.smart_shops)} target={String(sc.smart_target)} pct={(s.smart_shops / sc.smart_target) * 100}
        hint={smartGap > 0 ? `${smartGap} more needed${onTrack.length ? ` · ${onTrack.length} can still qualify if they pay on time` : ""}` : "Done"}>
        {onTrack.length > 0 && (
          <ShopList open title={`Collect before the deadline · ${onTrack.length}`} tone="amber"
            rows={onTrack.map((x) => ({ x, right: inr(x.unpaid, { decimals: false }), sub: `pay by ${date(x.next_deadline)}` }))} shopHref={shopHref} />
        )}
        {nearMin.length > 0 && (
          <ShopList title={`Need more purchase · ${nearMin.length}`} tone="blue"
            rows={nearMin.map((x) => ({ x, right: `+${inr(sc.smart_min_purchase - x.billed_taxable, { decimals: false })}`, sub: `bought ${inr(x.billed_taxable, { decimals: false })}` }))} shopHref={shopHref} orderHref={orderHref} />
        )}
        {smart.length > 0 && <ShopList title={`Smart ✓ · ${smart.length}`} tone="green" rows={smart.map((x) => ({ x, right: inr(x.billed_taxable, { decimals: false }), sub: x.city ?? "" }))} shopHref={shopHref} />}
        {missed.length > 0 && <ShopList title={`Paid late, not counted · ${missed.length}`} tone="red" rows={missed.map((x) => ({ x, right: x.unpaid > 0 ? inr(x.unpaid, { decimals: false }) : "", sub: x.unpaid > 0 ? "still unpaid" : "paid after the deadline" }))} shopHref={shopHref} />}
      </Criterion>

      <Criterion icon={IndianRupee} title="Recovery of this month's bills" amount={sc.recovery_amount} met={s.recovery_earned > 0}
        value={`${s.recovery_pct.toFixed(0)}%`} target={`${sc.recovery_pct}%`} pct={(s.recovery_pct / sc.recovery_pct) * 100}
        hint={recGap > 0 ? `Collect ${inr(recGap, { decimals: false })} more against this month's bills` : "Done"}
        note={`${inr(s.month_collected, { decimals: false })} collected of ${inr(s.month_billing, { decimals: false })} billed (incl. GST). Old dues don't count.`}>
        {toCollect.length > 0 && (
          <ShopList title={`Still to collect · ${toCollect.length}`} tone="amber" rows={toCollect.map((x) => ({ x, right: inr(x.due, { decimals: false }), sub: x.city ?? "" }))} shopHref={shopHref} />
        )}
      </Criterion>
    </div>
  );
}

function Criterion({ icon: Icon, title, amount, met, value, target, pct, hint, note, children }: {
  icon: typeof Target; title: string; amount: number; met: boolean; value: string; target: string; pct: number; hint: string; note?: string; children?: React.ReactNode;
}) {
  const p = Math.max(0, Math.min(100, pct || 0));
  return (
    <section className={cn("rounded-3xl bg-white p-4 shadow-sm ring-1", met ? "ring-emerald-300" : "ring-slate-200/70")}>
      <div className="flex items-start gap-3">
        <span className={cn("grid size-10 shrink-0 place-items-center rounded-2xl", met ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600")}><Icon className="size-5" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-sm leading-snug font-semibold">{title}</h3>
            <span className={cn("flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold", met ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500")}>
              {met ? <CheckCircle2 className="size-3.5" /> : <CircleDashed className="size-3.5" />} {inr(amount, { decimals: false })}
            </span>
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="tabular text-xl font-bold">{value}</span>
            <span className="tabular text-sm text-slate-500">/ {target}</span>
          </div>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100">
            <div className={cn("h-full rounded-full", met ? "bg-emerald-500" : p >= 60 ? "bg-sky-500" : "bg-amber-500")} style={{ width: `${p}%` }} />
          </div>
          <p className={cn("mt-1.5 text-xs font-medium", met ? "text-emerald-700" : "text-slate-600")}>{hint}</p>
          {note && <p className="mt-0.5 text-[11px] text-slate-400">{note}</p>}
        </div>
      </div>
      {children && <div className="mt-3 space-y-2">{children}</div>}
    </section>
  );
}

const TONES = { amber: "bg-amber-50 text-amber-900", blue: "bg-sky-50 text-sky-900", green: "bg-emerald-50 text-emerald-900", red: "bg-red-50 text-red-900", slate: "bg-slate-50 text-slate-700" };

function ShopList({ title, rows, tone = "slate", open, shopHref, orderHref }: {
  title: string; rows: { x: IncentiveShop; right: string; sub: string }[]; tone?: keyof typeof TONES; open?: boolean;
  shopHref: (id: string) => string; orderHref?: (id: string) => string;
}) {
  return (
    <details open={open} className="group overflow-hidden rounded-2xl ring-1 ring-slate-200">
      <summary className={cn("flex cursor-pointer list-none items-center justify-between px-3 py-2.5 text-sm font-semibold", TONES[tone])}>
        <span className="flex items-center gap-1.5">{tone === "amber" && <Clock className="size-4" />}{title}</span>
        <ChevronRight className="size-4 transition group-open:rotate-90" />
      </summary>
      <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto bg-white">
        {rows.map(({ x, right, sub }) => (
          <li key={x.retailer_id} className="flex items-center gap-2 px-3 py-2">
            <Link href={shopHref(x.retailer_id)} className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{x.shop_name}</span>
              {sub && <span className="block truncate text-[11px] text-slate-500">{sub}</span>}
            </Link>
            {right && <span className="tabular text-sm font-semibold">{right}</span>}
            {orderHref && <Link href={orderHref(x.retailer_id)} className="rounded-lg bg-accent-500 px-2.5 py-1 text-xs font-bold text-white">Order</Link>}
          </li>
        ))}
      </ul>
    </details>
  );
}
