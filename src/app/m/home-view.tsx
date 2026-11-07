import Link from "next/link";
import { ChevronRight, ClipboardList, IndianRupee, MapPin, Navigation, Plus, Receipt, ShoppingBag, Store, Target, TrendingUp } from "lucide-react";
import { date, inr } from "@/lib/format";
import { ORDER_STATUS } from "@/lib/status";
import { Badge, cn } from "@/components/ui";
import type { HomeData } from "./data";
import { Ring } from "./ui";

export function HomeView({ h, firstName }: { h: HomeData; firstName: string }) {
  const hour = new Date(Date.now() + 5.5 * 3600 * 1000).getUTCHours();
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const goal = h.target?.sales ?? 0;
  const pct = goal > 0 ? (h.achieved / goal) * 100 : 0;
  const remaining = Math.max(0, goal - h.achieved);
  const perDay = h.daysLeft > 0 ? remaining / h.daysLeft : remaining;
  const ringColor = pct >= 100 ? "#34d399" : pct >= 60 ? "#38bdf8" : "#f6a43d";
  const monthName = new Date(h.period.start + "T00:00:00Z").toLocaleDateString("en-IN", { month: "long", timeZone: "UTC" });

  return (
    <div className="space-y-4">
      <p className="px-1 text-sm text-slate-500">{greet}, <span className="font-medium text-slate-800">{firstName}</span> · {date(h.today)}</p>

      {/* ---------- Monthly target (main highlight) ---------- */}
      <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-ink-900 via-ink-800 to-ink-700 text-white shadow-lg">
        <div className="flex items-center justify-between px-5 pt-4">
          <span className="flex items-center gap-1.5 text-sm font-medium text-slate-300"><Target className="size-4 text-accent-400" /> {h.target ? "Sales target" : "Sales"} · {monthName}</span>
          {h.target && <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs text-slate-200">{h.daysLeft} day{h.daysLeft === 1 ? "" : "s"} left</span>}
        </div>

        {h.target && goal > 0 ? (
          <div className="flex items-center gap-4 px-5 pt-3 pb-4">
            <div className="relative">
              <Ring pct={pct} color={ringColor} />
              <div className="absolute inset-0 grid place-items-center text-center">
                <div>
                  <div className="tabular text-3xl font-bold">{Math.floor(pct)}%</div>
                  <div className="text-[11px] text-slate-300">achieved</div>
                </div>
              </div>
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <div>
                <div className="text-[11px] tracking-wide text-slate-400 uppercase">Achieved</div>
                <div className="tabular text-2xl leading-tight font-bold">{inr(h.achieved, { decimals: false })}</div>
                <div className="tabular text-xs text-slate-300">of {inr(goal, { decimals: false })}</div>
              </div>
              {remaining > 0 ? (
                <div className="rounded-xl bg-white/10 px-3 py-2">
                  <div className="tabular text-sm font-semibold text-accent-400">{inr(remaining, { decimals: false })} to go</div>
                  <div className="tabular text-[11px] text-slate-300">≈ {inr(perDay, { decimals: false })} per day</div>
                </div>
              ) : (
                <div className="rounded-xl bg-emerald-400/20 px-3 py-2 text-sm font-semibold text-emerald-300">Target reached! 🎉</div>
              )}
            </div>
          </div>
        ) : (
          <div className="px-5 pt-3 pb-4">
            <div className="tabular text-4xl font-bold">{inr(h.achieved, { decimals: false })}</div>
            <div className="text-sm text-slate-300">invoiced this month · no target set yet</div>
          </div>
        )}

        <div className="grid grid-cols-2 divide-x divide-white/10 border-t border-white/10 text-center">
          <Link href="/m/orders?status=quotation" className="px-3 py-3 active:bg-white/5">
            <div className="tabular text-base font-semibold text-violet-300">{inr(h.pendingQuotes.value, { decimals: false })}</div>
            <div className="text-[11px] text-slate-400">{h.pendingQuotes.count} quotation{h.pendingQuotes.count === 1 ? "" : "s"} with office</div>
          </Link>
          <div className="px-3 py-3">
            <div className="tabular text-base font-semibold text-emerald-300">{inr(h.collected, { decimals: false })}</div>
            <div className="text-[11px] text-slate-400">collected{h.target?.collection ? ` of ${inr(h.target.collection, { decimals: false })}` : ""}</div>
          </div>
        </div>
      </section>

      {/* ---------- Big order button ---------- */}
      <Link href="/m/order" className="flex items-center gap-4 rounded-3xl bg-gradient-to-r from-accent-500 to-accent-600 p-4 text-white shadow-md shadow-accent-500/30 active:scale-[0.99]">
        <span className="grid size-14 place-items-center rounded-2xl bg-white/20"><Plus className="size-8" strokeWidth={2.5} /></span>
        <span className="flex-1">
          <span className="block text-lg font-bold">Take new order</span>
          <span className="block text-sm text-orange-50">Pick outlet → tap products → send</span>
        </span>
        <ChevronRight className="size-6" />
      </Link>

      {/* ---------- Today ---------- */}
      <section className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Today</h2>
          <Link href="/m/route" className="flex items-center text-sm font-medium text-sky-700">My route <ChevronRight className="size-4" /></Link>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <Tile icon={MapPin} tone="bg-sky-50 text-sky-700" value={`${h.today_.visitsDone}/${h.today_.visitsTotal}`} label="visits" />
          <Tile icon={ShoppingBag} tone="bg-orange-50 text-orange-700" value={inr(h.today_.quoteValue, { decimals: false })} label={`${h.today_.quotes} order${h.today_.quotes === 1 ? "" : "s"}`} />
          <Tile icon={IndianRupee} tone="bg-emerald-50 text-emerald-700" value={inr(h.today_.collected, { decimals: false })} label="collected" />
        </div>
        {h.today_.visitsTotal > 0 && (
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-sky-500" style={{ width: `${(h.today_.visitsDone / h.today_.visitsTotal) * 100}%` }} />
          </div>
        )}
        {h.nextVisit ? (
          <Link href={`/m/outlets/${h.nextVisit.retailer_id}`} className="mt-3 flex items-center gap-3 rounded-2xl bg-sky-50 p-3 active:bg-sky-100">
            <span className="grid size-10 place-items-center rounded-xl bg-sky-600 text-white"><Navigation className="size-5" /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs text-sky-700">Next visit{h.today_.routeNames.length ? ` · ${h.today_.routeNames.join(" + ")}` : ""}</span>
              <span className="block truncate font-semibold text-slate-900">{h.nextVisit.shop_name}</span>
              {h.nextVisit.city && <span className="block text-xs text-slate-500">{h.nextVisit.city}</span>}
            </span>
            <ChevronRight className="size-5 text-sky-700" />
          </Link>
        ) : (
          <p className="mt-3 rounded-2xl bg-slate-50 p-3 text-sm text-slate-500">
            {h.today_.visitsTotal ? "All visits done for today. 🎉" : "No route planned for today. You can still take orders from any of your outlets."}
          </p>
        )}
      </section>

      {/* ---------- Quick actions ---------- */}
      <section className="grid grid-cols-3 gap-3">
        <Quick href="/m/outlets/new" icon={Store} label="Add outlet" tone="from-violet-500 to-violet-600" />
        <Quick href="/m/expenses?add=1" icon={Receipt} label="Log expense" tone="from-rose-500 to-rose-600" badge={h.expensesPending ? `${h.expensesPending} pending` : undefined} />
        <Quick href="/m/orders" icon={ClipboardList} label="My orders" tone="from-sky-500 to-sky-600" />
      </section>

      {/* ---------- Recent orders ---------- */}
      <section className="rounded-3xl bg-white shadow-sm ring-1 ring-slate-200/70">
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <h2 className="flex items-center gap-2 font-semibold"><TrendingUp className="size-4 text-slate-400" /> Recent orders</h2>
          <Link href="/m/orders" className="text-sm font-medium text-sky-700">See all</Link>
        </div>
        {h.recent.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-slate-500">No orders yet. Tap <b>New order</b> to start.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {h.recent.map((o) => {
              const st = o.status === "quotation" ? { label: "With office", tone: "violet" as const } : ORDER_STATUS[o.status];
              return (
                <li key={o.id}>
                  <Link href={`/m/orders/${o.id}`} className="flex items-center gap-3 px-4 py-3 active:bg-slate-50">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{o.shop_name}</span>
                      <span className="block text-xs text-slate-500">{date(o.created_at)} · {o.order_no.split("/").pop()}</span>
                    </span>
                    <span className="text-right">
                      <span className="tabular block font-semibold">{inr(o.grand_total, { decimals: false })}</span>
                      <Badge tone={st.tone}>{st.label}</Badge>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function Tile({ icon: Icon, tone, value, label }: { icon: typeof MapPin; tone: string; value: string; label: string }) {
  return (
    <div className={cn("rounded-2xl p-2.5", tone)}>
      <Icon className="mx-auto mb-1 size-4 opacity-80" />
      <div className="tabular truncate text-sm font-bold">{value}</div>
      <div className="text-[11px] opacity-80">{label}</div>
    </div>
  );
}

function Quick({ href, icon: Icon, label, tone, badge }: { href: string; icon: typeof MapPin; label: string; tone: string; badge?: string }) {
  return (
    <Link href={href} className="relative flex flex-col items-center gap-2 rounded-3xl bg-white p-3 text-center shadow-sm ring-1 ring-slate-200/70 active:scale-[0.98]">
      <span className={cn("grid size-12 place-items-center rounded-2xl bg-gradient-to-br text-white shadow-sm", tone)}><Icon className="size-6" /></span>
      <span className="text-xs font-semibold text-slate-800">{label}</span>
      {badge && <span className="absolute top-2 right-2 rounded-full bg-rose-100 px-1.5 text-[10px] font-semibold text-rose-700">{badge}</span>}
    </Link>
  );
}
