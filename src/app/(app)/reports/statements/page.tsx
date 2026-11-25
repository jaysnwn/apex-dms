import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, Banknote, Receipt, Scale, Wallet } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { allRows } from "@/lib/all-rows";
import { date, inr } from "@/lib/format";
import { todayIST } from "@/lib/gst";
import {
  SCOPE_KIND, SCOPE_LABEL, STATEMENT_SCOPES, documentRef, isIdle, particulars, periodQuery, periods, readPeriod, routes, totals,
  type ShopRow, type StatementScope, type Totals,
} from "@/lib/account-statement";
import { statementEntries, statementShops, statementSubject } from "@/lib/account-statement-data";
import { Button, Card, Input, PageHeader, Select, cn } from "@/components/ui";
import { Chip } from "@/components/chip";
import { StatCard } from "@/components/stat-card";
import { EmptyState } from "@/components/empty-state";
import { DocButtons } from "@/components/doc-buttons";

export const metadata: Metadata = { title: "Account statements" };

type Sp = { type?: string; territory?: string; route?: string; town?: string; retailer?: string; from?: string; to?: string; period?: string; idle?: string };

// ₹1,000.00 Dr = the shop owes; ₹500.00 Cr = the shop is in credit (advance)
function Bal({ v, strong }: { v: number; strong?: boolean }) {
  const paise = Math.round(v * 100);
  if (paise === 0) return <span className={cn("text-slate-400", strong && "font-semibold")}>{inr(0)}</span>;
  return <span className={cn(paise < 0 && "text-emerald-700", strong && "font-semibold")}>{inr(Math.abs(v))} {paise > 0 ? "Dr" : "Cr"}</span>;
}
const money = (v: number) => (Math.round(v * 100) === 0 ? <span className="text-slate-400">—</span> : inr(v));

const TH = "px-3 py-2.5 whitespace-nowrap first:pl-4 last:pr-4";
const TD = "px-3 py-2 first:pl-4 last:pr-4";
const NUM = "tabular text-right whitespace-nowrap";

export default async function StatementsPage({ searchParams }: { searchParams: Promise<Sp> }) {
  await requireRole("super_admin", "manager", "billing");
  const sp = await searchParams;
  const type: StatementScope = STATEMENT_SCOPES.includes(sp.type as StatementScope) ? (sp.type as StatementScope) : "route";
  const today = todayIST();
  const { from, to } = readPeriod(new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]), today);
  const showIdle = sp.idle === "1";
  const supabase = await createClient();

  // Lists for the pickers; a territory narrows routes and towns, a route or town narrows the shops.
  const [{ data: terrs }, { data: rts }, { data: tws }, shopList] = await Promise.all([
    supabase.from("territories").select("id, name").order("name"),
    supabase.from("routes").select("id, name, territory_id").is("archived_at", null).order("sort_order").order("name"),
    supabase.from("locations").select("id, name, territory_id").order("name"),
    type === "retailer"
      ? allRows(() => supabase.from("retailers").select("id, shop_name, code, location_id, route_id").order("shop_name").order("id"))
      : Promise.resolve({ data: [] as { id: string; shop_name: string; code: string; location_id: string | null; route_id: string | null }[] }),
  ]);
  const routeOpts = (rts ?? []).filter((r) => !sp.territory || r.territory_id === sp.territory);
  const townOpts = (tws ?? []).filter((t) => !sp.territory || t.territory_id === sp.territory);
  const townIds = new Set(townOpts.map((t) => t.id));
  const routeIds = new Set(routeOpts.map((r) => r.id));
  const shopOpts = shopList.data.filter((r) =>
    (!sp.route || r.route_id === sp.route) && (!sp.town || r.location_id === sp.town)
    && (!sp.territory || (r.route_id && routeIds.has(r.route_id)) || (r.location_id && townIds.has(r.location_id))));

  const subjectId = sp[type] || null;
  const subject = subjectId ? await statementSubject(supabase, type, subjectId) : null;
  const [shops, entries] = subject
    ? await Promise.all([
        statementShops(supabase, type, subject.id, from, to),
        type === "retailer" ? statementEntries(supabase, type, subject.id, from, to) : Promise.resolve([]),
      ])
    : [[] as ShopRow[], []];
  const all = totals(shops);

  // Links that keep everything else and change one thing
  const keep = Object.fromEntries(Object.entries(sp).filter(([, v]) => v)) as Record<string, string>;
  const href = (patch: Record<string, string | undefined>) => {
    const n = new URLSearchParams(keep);
    for (const [k, v] of Object.entries(patch)) { if (v) n.set(k, v); else n.delete(k); }
    return `/reports/statements?${n}`;
  };
  const periodHref = (p: { from: string | null; to: string }) => href({ from: p.from ?? undefined, to: p.to, period: p.from ? undefined : "all" });
  const query = `${periodQuery(from, to)}${showIdle && type !== "retailer" ? "&idle=1" : ""}`;

  return (
    <>
      <Link href="/reports" className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="size-4" /> All reports</Link>
      <PageHeader
        title="Account statements"
        description="Ledger and outstanding for a route, town, retailer or territory. Check it here, then download the PDF."
        actions={subject ? <DocButtons kind={SCOPE_KIND[type]} id={subject.id} query={`${query}&download=1`} label="Download PDF" share={type === "retailer"} /> : undefined}
      />

      <div className="mb-3 flex flex-wrap gap-2">
        {STATEMENT_SCOPES.map((s) => (
          <Chip key={s} href={`/reports/statements?type=${s}${sp.territory ? `&territory=${sp.territory}` : ""}&${periodQuery(from, to)}`} active={s === type}>{SCOPE_LABEL[s]}-wise</Chip>
        ))}
      </div>

      <Card className="mb-4 p-4">
        <form className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="type" value={type} />
          <div>
            <div className="mb-1 text-xs text-slate-500">Territory</div>
            <Select name="territory" defaultValue={sp.territory ?? ""} className="w-44" aria-label="Territory">
              <option value="">{type === "territory" ? "Choose a territory" : "All territories"}</option>
              {(terrs ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </div>
          {(type === "route" || type === "retailer") && (
            <div>
              <div className="mb-1 text-xs text-slate-500">Route</div>
              <Select name="route" defaultValue={sp.route ?? ""} className="w-52" aria-label="Route">
                <option value="">{type === "route" ? "Choose a route" : "All routes"}</option>
                {routeOpts.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </Select>
            </div>
          )}
          {(type === "town" || type === "retailer") && (
            <div>
              <div className="mb-1 text-xs text-slate-500">Town</div>
              <Select name="town" defaultValue={sp.town ?? ""} className="w-44" aria-label="Town">
                <option value="">{type === "town" ? "Choose a town" : "All towns"}</option>
                {townOpts.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            </div>
          )}
          {type === "retailer" && (
            <div>
              <div className="mb-1 text-xs text-slate-500">Retailer</div>
              <Select name="retailer" defaultValue={sp.retailer ?? ""} className="w-60" aria-label="Retailer">
                <option value="">Choose a retailer ({shopOpts.length})</option>
                {shopOpts.map((r) => <option key={r.id} value={r.id}>{r.shop_name} · {r.code}</option>)}
              </Select>
            </div>
          )}
          <div><div className="mb-1 text-xs text-slate-500">From</div><Input type="date" name="from" defaultValue={from ?? ""} /></div>
          <div><div className="mb-1 text-xs text-slate-500">To</div><Input type="date" name="to" defaultValue={to} /></div>
          {type !== "retailer" && (
            <label className="flex h-10 items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" name="idle" value="1" defaultChecked={showIdle} className="size-4 accent-primary" /> Include shops with nothing to show
            </label>
          )}
          <Button type="submit" variant="secondary">Show</Button>
        </form>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {periods(today).map((p) => (
            <Chip key={p.key} href={periodHref(p)} active={from === p.from && to === p.to}>{p.label}</Chip>
          ))}
        </div>
      </Card>

      {!subjectId && (
        <Card><EmptyState art="receipt" title={`Choose a ${SCOPE_LABEL[type].toLowerCase()}`}>Pick it above and press Show to see the statement before downloading it.</EmptyState></Card>
      )}
      {subjectId && !subject && (
        <Card><EmptyState art="search" title="Not found">It may have been removed, or you do not have access to it.</EmptyState></Card>
      )}

      {subject && (
        <>
          <div className="mb-2 flex flex-wrap items-baseline gap-x-2 text-sm">
            <span className="text-base font-semibold text-slate-900">{subject.name}</span>
            {subject.detail && <span className="text-slate-500">{subject.detail}</span>}
            <span className="text-slate-500">· {from ? `${date(from)} to ${date(to)}` : `all transactions up to ${date(to)}`}</span>
          </div>
          <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Opening balance" value={balText(all.opening)} icon={Scale} hint={from ? `before ${date(from)}` : "from the first transaction"} />
            <StatCard label="Invoices" value={inr(all.invoiced, { decimals: false })} icon={Receipt} hint={all.creditNotes > 0 ? `returns ${inr(all.creditNotes, { decimals: false })}` : "in this period"} />
            <StatCard label="Payments received" value={inr(all.collected, { decimals: false })} icon={Banknote} hint={all.refunded > 0 ? `cash and UPI · ${inr(all.refunded, { decimals: false })} given back` : "cash and UPI, in this period"} />
            <StatCard label="Closing outstanding" value={balText(all.closing)} icon={Wallet} alert={all.overdue > 0}
              hint={[all.overdue > 0 ? `${inr(all.overdue, { decimals: false })} overdue` : "nothing overdue", all.advance > 0 ? `advance ${inr(all.advance, { decimals: false })}` : null].filter(Boolean).join(" · ")} />
          </div>
          {all.unverified > 0 && (
            <p className="mb-3 text-sm text-slate-500">
              {inr(all.unverified)} of the payments counted here were recorded by a salesman and are not verified by the office yet (Payments → Verify collections).
            </p>
          )}

          {shops.length === 0 && (
            <Card><EmptyState art="store" title="No retailers here yet">Assign retailers to this {SCOPE_LABEL[type].toLowerCase()} first.</EmptyState></Card>
          )}

          {type === "retailer" && shops[0] && <Ledger shop={shops[0]} entries={entries} from={from} />}

          {type === "route" && shops.length > 0 && (
            <Comparison title="Town-wise" first="Town" rows={routes(shops).flatMap((r) => r.towns.map((t) => ({ key: t.key, name: t.name, t: t.totals })))} all={all} />
          )}
          {type === "territory" && shops.length > 0 && (
            <>
              <Comparison title="Route-wise" first="Route" rows={routes(shops).map((r) => ({ key: r.key, name: r.name, t: r.totals }))} all={all} />
              <Comparison title="Town-wise" first="Town (route)" rows={routes(shops).flatMap((r) => r.towns.map((t) => ({ key: `${r.key}-${t.key}`, name: `${t.name} (${r.name})`, t: t.totals })))} all={all} />
            </>
          )}
          {type !== "retailer" && shops.length > 0 && (
            <Shops shops={shops} type={type} showIdle={showIdle} retailerHref={(id) => href({ type: "retailer", retailer: id, route: undefined, town: undefined, idle: undefined })} />
          )}
        </>
      )}
    </>
  );
}

function balText(v: number) {
  const paise = Math.round(v * 100);
  return paise === 0 ? inr(0, { decimals: false }) : `${inr(Math.abs(v), { decimals: false })} ${paise > 0 ? "Dr" : "Cr"}`;
}

function Comparison({ title, first, rows, all }: { title: string; first: string; rows: { key: string; name: string; t: Totals }[]; all: Totals }) {
  return (
    <section className="mb-4">
      <h2 className="mb-2 text-sm font-semibold text-slate-900">{title}</h2>
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
            <tr>
              <th className={TH}>{first}</th><th className={cn(TH, "text-right")}>Retailers</th><th className={cn(TH, "text-right")}>Sales</th>
              <th className={cn(TH, "text-right")}>Collections</th><th className={cn(TH, "text-right")}>Overdue</th><th className={cn(TH, "text-right")}>Outstanding</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.key} className="hover:bg-slate-50">
                <td className={cn(TD, "font-medium")}>{r.name}</td><td className={cn(TD, NUM)}>{r.t.shops}</td><td className={cn(TD, NUM)}>{money(r.t.sales)}</td>
                <td className={cn(TD, NUM)}>{money(r.t.collected)}</td><td className={cn(TD, NUM, r.t.overdue > 0 && "text-red-700")}>{money(r.t.overdue)}</td><td className={cn(TD, NUM)}><Bal v={r.t.closing} /></td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
            <tr>
              <td className={TD}>Total</td><td className={cn(TD, NUM)}>{all.shops}</td><td className={cn(TD, NUM)}>{money(all.sales)}</td>
              <td className={cn(TD, NUM)}>{money(all.collected)}</td><td className={cn(TD, NUM)}>{money(all.overdue)}</td><td className={cn(TD, NUM)}><Bal v={all.closing} strong /></td>
            </tr>
          </tfoot>
        </table>
      </Card>
      {all.carriedOver > 0 && <p className="mt-1.5 text-xs text-slate-500">Sales leave out {inr(all.carriedOver)} of balances carried over from the previous system; the outstanding includes them.</p>}
    </section>
  );
}

function Shops({ shops, type, showIdle, retailerHref }: { shops: ShopRow[]; type: StatementScope; showIdle: boolean; retailerHref: (id: string) => string }) {
  const list = showIdle ? shops : shops.filter((s) => !isIdle(s));
  const hidden = shops.length - list.length;
  const t = totals(shops);
  const where = (s: ShopRow) => (type === "territory" ? [s.route_name, s.town_name] : type === "route" ? [s.town_name] : []).filter(Boolean).join(" · ");
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold text-slate-900">Retailers</h2>
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
            <tr>
              <th className={TH}>Retailer</th><th className={cn(TH, "text-right")}>Opening</th><th className={cn(TH, "text-right")}>Invoices</th>
              <th className={cn(TH, "text-right")}>Credit notes</th><th className={cn(TH, "text-right")}>Received</th><th className={cn(TH, "text-right")}>Overdue</th><th className={cn(TH, "text-right")}>Closing</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {list.map((s) => (
              <tr key={s.retailer_id} className="hover:bg-slate-50">
                <td className={TD}>
                  <Link href={retailerHref(s.retailer_id)} className="font-medium hover:underline">{s.shop_name}</Link>
                  <div className="text-xs text-slate-500">{[s.code, where(s)].filter(Boolean).join(" · ")}</div>
                </td>
                <td className={cn(TD, NUM)}><Bal v={Number(s.opening)} /></td><td className={cn(TD, NUM)}>{money(Number(s.invoiced))}</td>
                <td className={cn(TD, NUM)}>{money(Number(s.credit_notes))}</td><td className={cn(TD, NUM, "text-emerald-700")}>{money(Number(s.collected))}</td>
                <td className={cn(TD, NUM, Number(s.overdue) > 0 && "text-red-700")}>{money(Number(s.overdue))}</td><td className={cn(TD, NUM)}><Bal v={Number(s.closing)} strong /></td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
            <tr>
              <td className={TD}>Total ({t.shops}) · {t.withDues} with dues · {t.zero} at zero{t.inCredit ? ` · ${t.inCredit} in credit` : ""}</td>
              <td className={cn(TD, NUM)}><Bal v={t.opening} /></td><td className={cn(TD, NUM)}>{money(t.invoiced)}</td><td className={cn(TD, NUM)}>{money(t.creditNotes)}</td>
              <td className={cn(TD, NUM)}>{money(t.collected)}</td><td className={cn(TD, NUM)}>{money(t.overdue)}</td><td className={cn(TD, NUM)}><Bal v={t.closing} strong /></td>
            </tr>
          </tfoot>
        </table>
      </Card>
      {hidden > 0 && <p className="mt-1.5 text-xs text-slate-500">{hidden} retailer{hidden === 1 ? "" : "s"} with no balance and no transactions in this period are counted in the totals but not listed.</p>}
    </section>
  );
}

function Ledger({ shop, entries, from }: { shop: ShopRow; entries: Awaited<ReturnType<typeof statementEntries>>; from: string | null }) {
  return (
    <Card className="overflow-x-auto">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 px-4 py-3 text-sm">
        <span className="text-slate-500">{[shop.code, shop.mobile, shop.town_name, shop.route_name].filter(Boolean).join(" · ")}</span>
        <Link href={`/retailers/${shop.retailer_id}`} className="text-slate-500 hover:underline">Open retailer</Link>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500">
          <tr>
            <th className={TH}>Date</th><th className={TH}>Particulars</th><th className={TH}>Invoice no. / Payment ref.</th>
            <th className={cn(TH, "text-right")}>Debit</th><th className={cn(TH, "text-right")}>Credit</th><th className={cn(TH, "text-right")}>Balance</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          <tr className="bg-slate-50/50">
            <td className={cn(TD, "whitespace-nowrap text-slate-500")}>{from ? date(from) : ""}</td><td className={cn(TD, "font-medium")}>Opening balance</td><td /><td /><td />
            <td className={cn(TD, NUM, "font-medium")}><Bal v={Number(shop.opening)} /></td>
          </tr>
          {entries.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-500">No transactions in this period.</td></tr>}
          {entries.map((e) => {
            const ref = documentRef(e);
            return (
              <tr key={`${e.kind}-${e.doc_id}`}>
                <td className={cn(TD, "whitespace-nowrap text-slate-500")}>{date(e.entry_date)}</td>
                <td className={cn(TD, "text-slate-600")}>{particulars(e, date, (n) => inr(n))}</td>
                <td className={TD}><span className="font-mono text-xs">{ref.no}</span>{ref.ref && <div className="text-xs text-slate-500">{ref.ref}</div>}</td>
                <td className={cn(TD, NUM)}>{Number(e.debit) ? inr(e.debit) : ""}</td>
                <td className={cn(TD, NUM, "text-emerald-700")}>{Number(e.credit) ? inr(e.credit) : ""}</td>
                <td className={cn(TD, NUM, "font-medium")}><Bal v={Number(e.balance)} /></td>
              </tr>
            );
          })}
        </tbody>
        <tfoot className="border-t-2 border-slate-200 bg-slate-50">
          <tr>
            <td colSpan={5} className="px-3 py-2.5 text-right font-semibold">Closing outstanding balance</td>
            <td className={cn(TD, NUM, "text-base")}><Bal v={Number(shop.closing)} strong /></td>
          </tr>
          <tr>
            <td colSpan={6} className="px-4 pb-2.5 text-right text-xs text-slate-500">
              Unpaid bills {inr(shop.bills_due)}{Number(shop.overdue) > 0 ? ` · overdue ${inr(shop.overdue)}` : ""}{Number(shop.advance) > 0 ? ` · advance not yet applied ${inr(shop.advance)}` : ""}
            </td>
          </tr>
        </tfoot>
      </table>
    </Card>
  );
}

