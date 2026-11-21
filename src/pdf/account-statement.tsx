import { Document, Page, Text, View } from "@react-pdf/renderer";
import type { Style } from "@react-pdf/types";
import { Fragment } from "react";
import { CompanyHeader, LINE, INK, d, money, s, type Col, type Company } from "./base";
import {
  SCOPE_LABEL, documentRef, isIdle, particulars, routes, totals, towns,
  type EntryRow, type RouteGroup, type ShopRow, type StatementScope, type TownGroup, type Totals,
} from "@/lib/account-statement";

// ---------------------------------------------------------------------------
// Account statement: one retailer, a town, a route or a territory, A4.
// Bank-statement ledger per shop (opening, every bill and receipt, running
// balance, closing), then town, route and territory summaries. Every figure
// comes from account_statement / account_statement_entries (migration 0039);
// the totals here are those rows added up in paise.
// ---------------------------------------------------------------------------
export type AccountStatementData = {
  company: Company;
  scope: StatementScope;
  subject: { name: string; detail: string | null };
  from: string | null;
  to: string;
  generatedAt: string;
  shops: ShopRow[];
  entries: EntryRow[];
  showIdle: boolean;
};

const GREEN = "#047857";
const RED = "#b91c1c";
const BAND = "#f1f5f9";
const FOOTER = "Computer-generated statement | For accounting and reconciliation purposes.";

// ₹1,234.00 Dr = the shop owes; ₹500.00 Cr = the shop is in credit (advance)
const bal = (n: number) => (Math.round(n * 100) === 0 ? money(0) : `${money(Math.abs(n))} ${n > 0 ? "Dr" : "Cr"}`);
const amt = (n: number) => (Math.round(Number(n) * 100) === 0 ? "" : money(n));
const genTime = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });

const LEDGER: Col[] = [
  { label: "Date", w: 0.95 },
  { label: "Particulars", w: 2.9 },
  { label: "Invoice no. / Payment ref.", w: 1.75 },
  { label: "Debit (invoice)", w: 1.15, right: true },
  { label: "Credit (received)", w: 1.15, right: true },
  { label: "Balance", w: 1.3, right: true },
];

function Head({ cols }: { cols: Col[] }) {
  return (
    <View style={[s.row, { borderBottomWidth: 1, borderBottomColor: "#cbd5e1" }]} fixed>
      {cols.map((c) => <Text key={c.label} style={[s.th, { flex: c.w }, c.right ? s.right : {}]}>{c.label}</Text>)}
    </View>
  );
}
function Cells({ cols, cells, style, shade }: { cols: Col[]; cells: React.ReactNode[]; style?: Style; shade?: boolean }) {
  return (
    <View style={[s.row, shade ? { backgroundColor: "#fafafa" } : {}, style ?? {}]} wrap={false}>
      {cols.map((c, i) => <View key={c.label} style={[s.td, { flex: c.w }]}><Text style={c.right ? s.right : {}}>{cells[i] as string}</Text></View>)}
    </View>
  );
}

function Band({ label, name, sub }: { label: string; name: string; sub?: string | null }) {
  return (
    <View style={{ backgroundColor: BAND, borderLeftWidth: 3, borderLeftColor: INK, paddingVertical: 5, paddingHorizontal: 8, marginBottom: 8 }} wrap={false} minPresenceAhead={120}>
      <Text style={[s.small, s.muted]}>{label}</Text>
      <Text style={{ fontSize: 11.5, fontWeight: 700, color: INK }}>{name}</Text>
      {sub && <Text style={[s.small, s.muted]}>{sub}</Text>}
    </View>
  );
}

function Kv({ k, v, strong, tone }: { k: string; v: string; strong?: boolean; tone?: string }) {
  return (
    <View style={[s.row, { justifyContent: "space-between", paddingVertical: 1.5 }]}>
      <Text style={strong ? s.bold : {}}>{k}</Text>
      <Text style={[strong ? { fontWeight: 700, fontSize: 10.5 } : {}, tone ? { color: tone } : {}]}>{v}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// One shop
// ---------------------------------------------------------------------------
// A long ledger is printed in parts (see shopBlocks): the first part carries the
// shop's heading and opening balance, the last its summary, and every part its
// own column headings at the top of a page.
function ShopLedger({ shop, entries, period, bare, first = true, last = true, offset = 0 }: { shop: ShopRow; entries: EntryRow[]; period: { from: string | null; to: string }; bare?: boolean; first?: boolean; last?: boolean; offset?: number }) {
  const closing = Number(shop.closing);
  const place = [shop.billing_city, shop.town_name && shop.town_name !== shop.billing_city ? shop.town_name : null].filter(Boolean).join(" · ");
  return (
    <View style={{ marginBottom: 14 }}>
      {!first && <Text style={[s.small, s.muted, { marginBottom: 2 }]}>{shop.shop_name} — continued</Text>}
      {first && !bare && <View style={[s.row, { justifyContent: "space-between", alignItems: "flex-end", borderBottomWidth: 1, borderBottomColor: INK, paddingBottom: 3, marginBottom: 2 }]} wrap={false} minPresenceAhead={90}>
        <View style={{ maxWidth: "68%" }}>
          <Text style={{ fontSize: 10, fontWeight: 700, color: INK }}>{shop.shop_name}</Text>
          <Text style={s.muted}>
            {[shop.code, shop.owner_name, shop.mobile, place].filter(Boolean).join("  ·  ")}
          </Text>
        </View>
        <Text style={[s.small, s.muted, s.right]}>
          {shop.gstin ? `GSTIN ${shop.gstin}\n` : ""}Credit {shop.credit_days} days{Number(shop.credit_limit) > 0 ? ` · limit ${money(shop.credit_limit, false)}` : ""}
        </Text>
      </View>}

      <Head cols={LEDGER} />
      {first && <Cells cols={LEDGER} style={{ backgroundColor: "#f8fafc" }}
        cells={[period.from ? d(period.from) : "", period.from ? "Opening balance (brought forward)" : "Opening balance", "", "", "", bal(Number(shop.opening))]} />}
      {first && entries.length === 0 && (
        <Cells cols={LEDGER} cells={["", "No transactions in this period", "", "", "", ""]} />
      )}
      {entries.map((e, i) => {
        const ref = documentRef(e);
        return (
          <Cells key={`${e.kind}-${e.doc_id}`} cols={LEDGER} shade={(offset + i) % 2 === 1}
            cells={[d(e.entry_date), particulars(e, d, (n) => money(n)), ref.ref ? `${ref.no}\n${ref.ref}` : ref.no, amt(Number(e.debit)), amt(Number(e.credit)), bal(Number(e.balance))]} />
        );
      })}

      {last && <View style={[s.row, { marginTop: 6, gap: 8 }]} wrap={false}>
        <View style={[s.box, { flex: 1.25 }]}>
          <Kv k="Opening balance" v={bal(Number(shop.opening))} />
          <Kv k="Total invoice amount" v={money(shop.invoiced)} />
          <Kv k="Total payments received" v={money(shop.collected)} tone={GREEN} />
          <Kv k="Credit notes / adjustments" v={money(shop.credit_notes)} />
        </View>
        <View style={[s.box, { flex: 1, borderColor: INK, borderWidth: 1.2 }]}>
          <Text style={[s.small, s.muted]}>{closing < 0 ? "CLOSING BALANCE (IN CREDIT)" : "CLOSING OUTSTANDING BALANCE"}</Text>
          <Text style={{ fontSize: 15, fontWeight: 700, color: closing < 0 ? GREEN : INK, marginTop: 2 }}>{bal(closing)}</Text>
          <Text style={[s.small, { marginTop: 3 }]}>Unpaid bills {money(shop.bills_due)}{Number(shop.overdue) > 0 ? " · " : ""}{Number(shop.overdue) > 0 && <Text style={{ color: RED }}>overdue {money(shop.overdue)}</Text>}</Text>
          {Number(shop.advance) > 0 && <Text style={s.small}>Advance not yet applied {money(shop.advance)}</Text>}
        </View>
      </View>}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Summaries
// ---------------------------------------------------------------------------
function SummaryFigures({ title, t, extra, strongLabel }: { title: string; t: Totals; extra?: [string, string][]; strongLabel: string }) {
  return (
    <View style={[s.box, { borderColor: INK, borderWidth: 1.2, marginTop: 4, marginBottom: 12 }]} wrap={false}>
      <Text style={s.h2}>{title}</Text>
      <View style={[s.row, { gap: 16 }]}>
        <View style={{ flex: 1 }}>
          {extra?.map(([k, v]) => <Kv key={k} k={k} v={v} />)}
          <Kv k="Retailers" v={String(t.shops)} />
          <Kv k="With outstanding dues" v={String(t.withDues)} />
          <Kv k="Zero balance" v={String(t.zero)} />
          {t.inCredit > 0 && <Kv k="In credit (advance)" v={String(t.inCredit)} />}
        </View>
        <View style={{ flex: 1.3 }}>
          <Kv k="Total opening balance" v={bal(t.opening)} />
          <Kv k="Total invoices" v={money(t.invoiced)} />
          <Kv k="Total collections" v={money(t.collected)} tone={GREEN} />
          <Kv k="Total credit notes / adjustments" v={money(t.creditNotes)} />
          <Kv k="Unpaid bills" v={money(t.billsDue)} />
          <Kv k="Less: advance not yet applied" v={money(t.advance)} />
          <Kv k="Overdue" v={money(t.overdue)} tone={t.overdue > 0 ? RED : undefined} />
        </View>
      </View>
      <View style={[s.row, { justifyContent: "space-between", borderTopWidth: 1, borderTopColor: LINE, marginTop: 5, paddingTop: 5 }]}>
        <Text style={{ fontWeight: 700, fontSize: 10.5 }}>{strongLabel}</Text>
        <Text style={{ fontWeight: 700, fontSize: 12, color: t.closing < 0 ? GREEN : INK }}>{bal(t.closing)}</Text>
      </View>
    </View>
  );
}

const CMP = (first: string, withTowns = false): Col[] => [
  { label: first, w: 2.4 },
  ...(withTowns ? [{ label: "Towns", w: 0.6, right: true }] : []),
  { label: "Retailers", w: 0.8, right: true },
  { label: "Sales", w: 1.3, right: true },
  { label: "Collections", w: 1.3, right: true },
  { label: "Overdue", w: 1.2, right: true },
  { label: "Outstanding", w: 1.4, right: true },
];

function Comparison({ title, first, rows, all, withTowns }: { title: string; first: string; rows: { name: string; towns?: number; t: Totals }[]; all: Totals; withTowns?: boolean }) {
  const cols = CMP(first, withTowns);
  const line = (name: string, t: Totals, n?: number) => [name, ...(withTowns ? [String(n ?? "")] : []), String(t.shops), money(t.sales), money(t.collected), amt(t.overdue) || "—", bal(t.closing)];
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={s.h2} minPresenceAhead={60}>{title}</Text>
      <Head cols={cols} />
      {rows.map((x, i) => <Cells key={`${x.name}-${i}`} cols={cols} shade={i % 2 === 1} cells={line(x.name, x.t, x.towns)} />)}
      <Cells cols={cols} style={{ backgroundColor: BAND }} cells={line("TOTAL", all, withTowns ? rows.reduce((n, x) => n + (x.towns ?? 0), 0) : undefined)} />
      {all.carriedOver > 0 && (
        <Text style={[s.small, s.muted, { marginTop: 3 }]}>Sales leave out {money(all.carriedOver)} of balances carried over from the previous system; they are in the invoice totals and the outstanding.</Text>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Blocks and page runs
//
// The PDF library lays out everything still to come each time it starts a
// page, so one long page run grows with the square of its length (300 shops:
// two minutes). The statement is therefore a list of blocks packed into short
// runs of about two pages each: a run is laid out on its own, page numbers
// still count across the whole document, and 300 shops take seconds.
// A block's height is estimated generously, in points, only to pack the runs.
// ---------------------------------------------------------------------------
type Block = { key: string; el: React.ReactNode; height: number; newPage?: boolean };

const RUN_HEIGHT = 1450; // about two A4 pages of content
const ROW = 24; // a ledger row, allowing for particulars that wrap to two lines

// Lines in one part of a long ledger: a part must fit one page even when every
// line wraps to two (about 31 pt each); the first shares its page with headings.
const PART_ROWS = 21;
const FIRST_PART_ROWS = 15;
const shopHeight = (n: number) => 32 + 18 + ROW * (n + 1) + 78 + 14;

function shopBlocks(shop: ShopRow, list: EntryRow[], period: { from: string | null; to: string }, bare = false): Block[] {
  if (list.length <= FIRST_PART_ROWS + 8) {
    return [{ key: `shop-${shop.retailer_id}`, height: shopHeight(Math.max(1, list.length)), el: <ShopLedger shop={shop} entries={list} period={period} bare={bare} /> }];
  }
  const out: Block[] = [];
  for (let i = 0; i < list.length; ) {
    const size = i === 0 ? FIRST_PART_ROWS : PART_ROWS;
    const part = list.slice(i, i + size);
    const first = i === 0, last = i + size >= list.length;
    out.push({
      key: `shop-${shop.retailer_id}-${i}`, newPage: !first, height: (first ? 50 : 30) + ROW * (part.length + 1) + (last ? 92 : 0),
      el: <ShopLedger shop={shop} entries={part} period={period} bare={bare} first={first} last={last} offset={i} />,
    });
    i += size;
  }
  return out;
}
const summaryHeight = 175;
const tableHeight = (rows: number) => 40 + 20 * (rows + 1);

function townBlocks(town: TownGroup, byShop: Map<string, EntryRow[]>, period: { from: string | null; to: string }, showIdle: boolean, newPage: boolean, route: string | null): Block[] {
  const printed = showIdle ? town.shops : town.shops.filter((x) => !isIdle(x));
  const idle = showIdle ? [] : town.shops.filter(isIdle);
  const out: Block[] = [{
    key: `town-${town.key}-${route ?? ""}`, height: 50, newPage,
    el: <Band label="TOWN" name={town.name} sub={[route, `${town.totals.shops} retailers`].filter(Boolean).join("  ·  ")} />,
  }];
  for (const shop of printed) out.push(...shopBlocks(shop, byShop.get(shop.retailer_id) ?? [], period));
  if (idle.length > 0) {
    out.push({
      key: `idle-${town.key}-${route ?? ""}`, height: 20 + Math.ceil(idle.length / 8) * 11,
      el: <Text style={[s.small, s.muted, { marginBottom: 8 }]}>No balance and no transactions in this period ({idle.length}): {idle.map((x) => x.shop_name).join(", ")}.</Text>,
    });
  }
  out.push({ key: `townsum-${town.key}-${route ?? ""}`, height: summaryHeight, el: <SummaryFigures title={`Town summary — ${town.name}`} t={town.totals} strongLabel="TOTAL TOWN OUTSTANDING" /> });
  return out;
}

function routeSummaryBlocks(route: RouteGroup): Block[] {
  return [
    { key: `routesum-${route.key}`, height: 50 + summaryHeight, newPage: true,
      el: (
        <>
          <Band label="ROUTE SUMMARY" name={route.name} sub={route.code} />
          <SummaryFigures title="Route totals" t={route.totals} strongLabel="TOTAL ROUTE OUTSTANDING" extra={[["Towns", String(route.towns.length)]]} />
        </>
      ) },
    { key: `routecmp-${route.key}`, height: tableHeight(route.towns.length),
      el: <Comparison title="Town-wise comparison" first="Town" rows={route.towns.map((t) => ({ name: t.name, t: t.totals }))} all={route.totals} /> },
  ];
}

// Packs blocks into runs: a new run at a forced page break, or when the run is full.
function runs(blocks: Block[]): Block[][] {
  const out: Block[][] = [];
  let cur: Block[] = [];
  let h = 0;
  for (const b of blocks) {
    if (cur.length && (b.newPage || (h + b.height > RUN_HEIGHT && b.height <= RUN_HEIGHT))) { out.push(cur); cur = []; h = 0; }
    cur.push(b);
    h += b.height;
  }
  if (cur.length) out.push(cur);
  return out;
}

// ---------------------------------------------------------------------------
// Document
// ---------------------------------------------------------------------------
const TITLE: Record<StatementScope, string> = {
  retailer: "ACCOUNT STATEMENT",
  town: "TOWN-WISE STATEMENT",
  route: "ROUTE-WISE STATEMENT",
  territory: "TERRITORY-WISE STATEMENT",
};

export function AccountStatementPdf({ data }: { data: AccountStatementData }) {
  const { company, scope, subject, from, to, shops, entries, showIdle } = data;
  const period = { from, to };
  const periodText = from ? `${d(from)} to ${d(to)}` : `All transactions up to ${d(to)}`;
  const byShop = new Map<string, EntryRow[]>();
  for (const e of entries) {
    const list = byShop.get(e.retailer_id) ?? [];
    list.push(e);
    byShop.set(e.retailer_id, list);
  }
  const all = totals(shops);
  const f = shops[0];
  const crumbs: [string, string | null | undefined][] =
    scope === "retailer" ? [["Territory", f?.territory_name], ["Route", f?.route_name], ["Town", f?.town_name]]
      : scope === "town" ? [["Territory", subject.detail]]
        : scope === "route" ? [["Territory", f?.territory_name]] : [];
  const routeList = routes(shops);

  const blocks: Block[] = [{
    key: "head", height: 230,
    el: (
      <>
        <CompanyHeader company={company} title={TITLE[scope]} subtitle={periodText} />
        <View style={[s.row, { gap: 8, marginBottom: 12 }]} wrap={false}>
          <View style={[s.box, { flex: 1.5 }]}>
            <Text style={[s.small, s.muted]}>{SCOPE_LABEL[scope].toUpperCase()}</Text>
            <Text style={s.h2}>{subject.name}</Text>
            {scope === "retailer" && f && <Text>{[f.code, f.owner_name, f.mobile].filter(Boolean).join("  ·  ")}</Text>}
            {scope === "retailer" && f?.billing_address && <Text style={s.muted}>{f.billing_address}{f.billing_city ? `, ${f.billing_city}` : ""}</Text>}
            {scope === "retailer" && f && <Text style={s.muted}>GSTIN: {f.gstin ?? "Unregistered"}  ·  Credit {f.credit_days} days{Number(f.credit_limit) > 0 ? ` · limit ${money(f.credit_limit, false)}` : ""}</Text>}
            {crumbs.filter(([, v]) => v).map(([k, v]) => <Text key={k}>{k}: {v}</Text>)}
          </View>
          <View style={[s.box, { flex: 1 }]}>
            <Kv k="Statement period" v={from ? `${d(from)} – ${d(to)}` : "All transactions"} />
            <Kv k="Balances as of" v={d(to)} />
            <Kv k="Generated" v={genTime(data.generatedAt)} />
            {scope !== "retailer" && <Kv k="Retailers" v={String(all.shops)} />}
          </View>
        </View>
      </>
    ),
  }];

  if (shops.length === 0) {
    blocks.push({
      key: "empty", height: 60,
      el: (
        <View style={[s.box, { padding: 16 }]}>
          <Text style={s.bold}>No retailers to show.</Text>
          <Text style={s.muted}>Nothing is assigned to this {SCOPE_LABEL[scope].toLowerCase()} yet, or you do not have access to its retailers.</Text>
        </View>
      ),
    });
  } else if (scope === "retailer") {
    blocks.push(...shopBlocks(f, byShop.get(f.retailer_id) ?? [], period, true));
  } else if (scope === "town") {
    blocks.push(...townBlocks(towns(shops)[0], byShop, period, showIdle, false, null));
  } else if (scope === "route") {
    for (const rt of routeList) {
      rt.towns.forEach((t, i) => blocks.push(...townBlocks(t, byShop, period, showIdle, i > 0, rt.name)));
      blocks.push(...routeSummaryBlocks(rt));
    }
  } else {
    routeList.forEach((rt, ri) => {
      blocks.push({
        key: `route-${rt.key}`, height: 50, newPage: ri > 0,
        el: <Band label="ROUTE" name={rt.name} sub={[rt.code, `${rt.towns.length} towns · ${rt.totals.shops} retailers`].filter(Boolean).join("  ·  ")} />,
      });
      rt.towns.forEach((t, i) => blocks.push(...townBlocks(t, byShop, period, showIdle, i > 0, rt.name)));
      blocks.push(...routeSummaryBlocks(rt));
    });
    blocks.push(
      { key: "terr-sum", height: 50 + summaryHeight, newPage: true,
        el: (
          <>
            <Band label="TERRITORY SUMMARY" name={subject.name} sub={subject.detail} />
            <SummaryFigures title="Territory totals" t={all} strongLabel="TOTAL TERRITORY OUTSTANDING"
              extra={[["Routes", String(routeList.filter((x) => x.id).length)], ["Towns", String(new Set(shops.map((x) => x.town_id ?? "-")).size)], ["Active retailers", String(all.active)]]} />
          </>
        ) },
      { key: "terr-routes", height: tableHeight(routeList.length),
        el: <Comparison title="Route-wise summary" first="Route" withTowns rows={routeList.map((x) => ({ name: x.name, towns: x.towns.length, t: x.totals }))} all={all} /> },
      { key: "terr-towns", height: tableHeight(routeList.reduce((n, x) => n + x.towns.length, 0)),
        el: <Comparison title="Town-wise summary" first="Town (route)" rows={routeList.flatMap((x) => x.towns.map((t) => ({ name: `${t.name} (${x.name})`, t: t.totals })))} all={all} /> },
    );
  }

  return (
    <Document title={`${SCOPE_LABEL[scope]} statement — ${subject.name}`} author={company.legal_name}>
      {runs(blocks).map((run) => (
        <Page key={run[0].key} size="A4" style={s.page}>
          {run.map((b) => <Fragment key={b.key}>{b.el}</Fragment>)}
          <View style={s.footer} fixed>
            <Text>{FOOTER}</Text>
            <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
          </View>
        </Page>
      ))}
    </Document>
  );
}
