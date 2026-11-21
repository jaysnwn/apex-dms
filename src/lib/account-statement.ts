// Account statements (retailer, town, route, territory): the shared shape,
// grouping, totals, periods and file names. The figures themselves come from
// the database (account_statement / account_statement_entries, migration 0039);
// this file only groups and adds them up, in paise, so a town total is exactly
// the sum of its shops, a route the sum of its towns, a territory of its routes.
import type { Database } from "@/lib/supabase/database.types";

export type StatementScope = "retailer" | "town" | "route" | "territory";
export const STATEMENT_SCOPES: StatementScope[] = ["route", "town", "retailer", "territory"];
export const SCOPE_LABEL: Record<StatementScope, string> = { retailer: "Retailer", town: "Town", route: "Route", territory: "Territory" };
// PDF kind for each scope (the retailer statement keeps its old address, used by the field apps)
export const SCOPE_KIND = { retailer: "statement", town: "town-statement", route: "route-statement", territory: "territory-statement" } as const;

type Fn = Database["public"]["Functions"];
export type ShopRow = Fn["account_statement"]["Returns"][number];
export type EntryRow = Fn["account_statement_entries"]["Returns"][number];

// ---------------------------------------------------------------------------
// Money: add in whole paise, never in floating rupees
// ---------------------------------------------------------------------------
const p = (v: number | string | null | undefined) => Math.round(Number(v ?? 0) * 100);
const r = (paise: number) => paise / 100;

export type Totals = {
  shops: number;
  opening: number;
  invoiced: number;
  sales: number; // invoiced without balances carried over from the previous system
  carriedOver: number;
  creditNotes: number;
  collected: number;
  closing: number; // net: bills due − advance
  billsDue: number;
  advance: number;
  overdue: number;
  withDues: number;
  zero: number;
  inCredit: number;
  active: number;
  unverified: number;
};

export function totals(rows: ShopRow[]): Totals {
  const t = { opening: 0, invoiced: 0, carriedOver: 0, creditNotes: 0, collected: 0, closing: 0, billsDue: 0, advance: 0, overdue: 0, unverified: 0 };
  let withDues = 0, zero = 0, inCredit = 0, active = 0;
  for (const s of rows) {
    t.opening += p(s.opening); t.invoiced += p(s.invoiced); t.carriedOver += p(s.carried_over); t.creditNotes += p(s.credit_notes);
    t.collected += p(s.collected); t.closing += p(s.closing); t.billsDue += p(s.bills_due); t.advance += p(s.advance);
    t.overdue += p(s.overdue); t.unverified += p(s.unverified);
    const c = p(s.closing);
    if (c > 0) withDues++; else if (c < 0) inCredit++; else zero++;
    if (s.retailer_status === "active") active++;
  }
  return {
    shops: rows.length, withDues, zero, inCredit, active,
    opening: r(t.opening), invoiced: r(t.invoiced), sales: r(t.invoiced - t.carriedOver), carriedOver: r(t.carriedOver),
    creditNotes: r(t.creditNotes), collected: r(t.collected), closing: r(t.closing), billsDue: r(t.billsDue),
    advance: r(t.advance), overdue: r(t.overdue), unverified: r(t.unverified),
  };
}

// ---------------------------------------------------------------------------
// Hierarchy: territory → route → town → shop, in the order the database gave
// ---------------------------------------------------------------------------
export type TownGroup = { key: string; id: string | null; name: string; shops: ShopRow[]; totals: Totals };
export type RouteGroup = { key: string; id: string | null; name: string; code: string | null; towns: TownGroup[]; shops: ShopRow[]; totals: Totals };
export type TerritoryGroup = { key: string; id: string | null; name: string; routes: RouteGroup[]; shops: ShopRow[]; totals: Totals };

export const NO_TOWN = "Town not set";
export const NO_ROUTE = "Not on a route";
export const NO_TERRITORY = "No territory";

function groupBy<T>(rows: ShopRow[], key: (s: ShopRow) => string, make: (first: ShopRow, rows: ShopRow[]) => T): T[] {
  const order: string[] = [];
  const m = new Map<string, ShopRow[]>();
  for (const s of rows) {
    const k = key(s);
    if (!m.has(k)) { m.set(k, []); order.push(k); }
    m.get(k)!.push(s);
  }
  return order.map((k) => make(m.get(k)![0], m.get(k)!));
}

export function towns(rows: ShopRow[]): TownGroup[] {
  return groupBy(rows, (s) => s.town_id ?? "-", (f, list) => ({ key: f.town_id ?? "-", id: f.town_id ?? null, name: f.town_name ?? NO_TOWN, shops: list, totals: totals(list) }));
}
export function routes(rows: ShopRow[]): RouteGroup[] {
  return groupBy(rows, (s) => s.route_id ?? "-", (f, list) => ({
    key: f.route_id ?? "-", id: f.route_id ?? null, name: f.route_name ?? NO_ROUTE, code: f.route_code ?? null,
    towns: towns(list), shops: list, totals: totals(list),
  }));
}
export function territories(rows: ShopRow[]): TerritoryGroup[] {
  return groupBy(rows, (s) => s.territory_id ?? "-", (f, list) => ({
    key: f.territory_id ?? "-", id: f.territory_id ?? null, name: f.territory_name ?? NO_TERRITORY, routes: routes(list), shops: list, totals: totals(list),
  }));
}

// A shop with nothing to show: no balance before, during or after the period.
export const isIdle = (s: ShopRow) => p(s.opening) === 0 && Number(s.entries) === 0 && p(s.closing) === 0;

// ---------------------------------------------------------------------------
// Ledger wording
// ---------------------------------------------------------------------------
export const METHOD_LABEL: Record<string, string> = { cash: "Cash", upi: "UPI", bank_transfer: "Bank transfer" };
const methodLabel = (m: string | null) => (m ? METHOD_LABEL[m] ?? m.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()) : "Payment");

export function particulars(e: EntryRow, fmtDate: (d: string) => string, fmtMoney: (n: number) => string): string {
  if (e.kind === "invoice") {
    return `Sales invoice${e.is_opening ? " (brought forward)" : ""}${e.due_date ? ` · due ${fmtDate(e.due_date)}` : ""}`;
  }
  if (e.kind === "credit_note") {
    return `Credit note${e.reason ? ` · ${e.reason}` : ""}${e.against ? ` · against ${e.against}` : ""}`;
  }
  const parts = [`${methodLabel(e.method)} received`];
  if (e.against) parts.push(`against ${e.against}`);
  if (p(e.on_account) > 0) parts.push(`${fmtMoney(Number(e.on_account))} kept as advance`);
  return parts.join(" · ");
}

// Document column: the invoice / credit note number, or the receipt number with the UPI reference
export function documentRef(e: EntryRow): { no: string; ref: string | null } {
  return { no: e.doc_no ?? "", ref: e.kind === "payment" && e.reference_no ? `Ref ${e.reference_no}` : null };
}

// ---------------------------------------------------------------------------
// Periods
// ---------------------------------------------------------------------------
export type Period = { key: string; label: string; from: string | null; to: string };

const iso = (d: Date) => d.toISOString().slice(0, 10);
export function periods(today: string): Period[] {
  const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7));
  const t = new Date(`${today}T00:00:00Z`);
  const dow = (t.getUTCDay() + 6) % 7; // Monday = 0
  const weekStart = iso(new Date(t.getTime() - dow * 864e5));
  const lastM = iso(new Date(Date.UTC(y, m - 2, 1)));
  const lastMEnd = iso(new Date(Date.UTC(y, m - 1, 0)));
  const fyStart = m >= 4 ? `${y}-04-01` : `${y - 1}-04-01`;
  return [
    { key: "today", label: "Today", from: today, to: today },
    { key: "week", label: "This week", from: weekStart, to: today },
    { key: "month", label: "This month", from: today.slice(0, 8) + "01", to: today },
    { key: "last-month", label: "Previous month", from: lastM, to: lastMEnd },
    { key: "fy", label: "This financial year", from: fyStart, to: today },
    { key: "all", label: "All transactions", from: null, to: today },
  ];
}

const isDate = (v: string | null | undefined): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

// Reads the period from a URL: ?period=all, or ?from=&to=. Unset: this month.
export function readPeriod(params: { get(k: string): string | null }, today: string, fallbackFrom?: string): { from: string | null; to: string } {
  const to = isDate(params.get("to")) ? params.get("to")! : today;
  if (params.get("period") === "all" || params.get("all") === "1") return { from: null, to };
  const from = isDate(params.get("from")) ? params.get("from")! : fallbackFrom ?? today.slice(0, 8) + "01";
  return from > to ? { from: to, to } : { from, to };
}

export function periodQuery(from: string | null, to: string) {
  return from ? `from=${from}&to=${to}` : `period=all&to=${to}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dmy = (v: string) => `${v.slice(8, 10)}_${MONTHS[Number(v.slice(5, 7)) - 1]}_${v.slice(0, 4)}`;
function periodTag(from: string | null, to: string) {
  if (!from) return `All_to_${dmy(to)}`;
  if (from.slice(0, 7) === to.slice(0, 7)) return `${MONTHS[Number(to.slice(5, 7)) - 1]}_${to.slice(0, 4)}`;
  return `${dmy(from)}_to_${dmy(to)}`;
}
const fileWord = (v: string) => v.normalize("NFKD").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "Statement";

// APEX_Route_Ghargaon_Bota_Alephata_Otur_Nov_2026.pdf
export function statementFilename(companyName: string, scope: StatementScope, subject: string, from: string | null, to: string) {
  const prefix = fileWord(companyName.split(/\s+/)[0] ?? "");
  return `${prefix}_${SCOPE_LABEL[scope]}_${fileWord(subject)}_${periodTag(from, to)}.pdf`;
}

// What the statement is for, in words: the name of the shop, town, route or territory
export function subjectName(scope: StatementScope, rows: ShopRow[], fallback: string) {
  const f = rows[0];
  if (!f) return fallback;
  if (scope === "retailer") return f.shop_name ?? fallback;
  if (scope === "town") return f.town_name ?? fallback;
  if (scope === "route") return f.route_name ?? fallback;
  return f.territory_name ?? fallback;
}
