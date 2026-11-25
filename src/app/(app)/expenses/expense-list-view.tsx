import Link from "next/link";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { inr } from "@/lib/format";
import { todayIST } from "@/lib/gst";
import type { ExpenseRow, ExpenseSummary } from "@/lib/expense-labels";
import { PAGE_SIZE, type ExpenseFilters, loadExpenseOptions, monthRange } from "@/lib/expenses";
import { Button, Card, Input, Select, cn } from "@/components/ui";
import { Chip } from "@/components/chip";
import { ExpenseTable } from "./expense-table";

export type ExpenseSP = { month?: string; from?: string; to?: string; employee?: string; category?: string; brand?: string; route?: string; status?: string; q?: string; sort?: string; page?: string };
type Options = Awaited<ReturnType<typeof loadExpenseOptions>>;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

// Turns the address bar into filters. The month is the default range; a from–to pair wins.
export function readFilters(sp: ExpenseSP, opts: { employee?: string; allTime?: boolean; status?: string; sort?: ExpenseFilters["sort"] } = {}): ExpenseFilters & { month: string } {
  const today = todayIST();
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : today.slice(0, 7);
  const range = opts.allTime ? { from: "2020-01-01", to: today }
    : sp.from && DATE.test(sp.from) && sp.to && DATE.test(sp.to) ? { from: sp.from, to: sp.to } : monthRange(month);
  const sort = (["amount", "-amount", "submitted"] as const).find((s) => s === sp.sort) ?? opts.sort ?? "date";
  return {
    ...range, month,
    employee: opts.employee ?? sp.employee,
    category: sp.category, brand: sp.brand, route: sp.route, q: sp.q,
    status: opts.status ?? sp.status,
    sort, page: Math.max(1, Number(sp.page) || 1),
  };
}

export function hrefWith(path: string, sp: ExpenseSP, over: Partial<ExpenseSP>) {
  const n = new URLSearchParams(Object.entries({ ...sp, ...over }).filter(([, v]) => v !== undefined && v !== "") as [string, string][]);
  return n.size ? `${path}?${n}` : path;
}

// Search on top; everything else folded under "More filters" so the page stays calm.
// The fold opens by itself when one of its filters is on.
export function ExpenseFilterBar({ path, sp, options, showEmployee, showDates = true, keep }: {
  path: string; sp: ExpenseSP; options: Options; showEmployee: boolean; showDates?: boolean; keep?: Partial<ExpenseSP>;
}) {
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : todayIST().slice(0, 7);
  const more = [showDates && sp.from, showDates && sp.to, showEmployee && sp.employee, sp.category, sp.brand, sp.route, sp.sort].filter(Boolean).length;
  return (
    <form action={path} className="mb-4">
      {Object.entries(keep ?? {}).map(([k, v]) => v ? <input key={k} type="hidden" name={k} value={v} /> : null)}
      <div className={cn("grid gap-2", showDates ? "sm:grid-cols-[1fr_11rem_auto]" : "sm:grid-cols-[1fr_auto]")}>
        <Input name="q" type="search" defaultValue={sp.q} placeholder={showEmployee ? "Search number, description or employee" : "Search number or description"} aria-label="Search" />
        {showDates && <Input type="month" name="month" defaultValue={sp.from ? "" : month} aria-label="Month" />}
        <Button type="submit" variant="secondary">Search</Button>
      </div>
      <details className="group mt-2" open={more > 0}>
        <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-md py-1 text-[13px] font-medium text-text-2 select-none hover:text-text [&::-webkit-details-marker]:hidden">
          <SlidersHorizontal className="size-3.5" aria-hidden />
          More filters
          {more > 0 && <span className="tabular rounded-full bg-primary-soft px-1.5 text-xs leading-5 text-primary-text">{more}</span>}
          <ChevronDown className="size-3.5 transition-transform duration-[160ms] group-open:rotate-180" aria-hidden />
        </summary>
        <Card className="mt-2 p-3">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {showDates && (
              <div className="grid grid-cols-2 gap-2 sm:col-span-2 lg:col-span-1">
                <Input type="date" name="from" defaultValue={sp.from} aria-label="From date" title="From date" />
                <Input type="date" name="to" defaultValue={sp.to} aria-label="To date" title="To date" />
              </div>
            )}
            {showEmployee && (
              <Select name="employee" defaultValue={sp.employee ?? ""} aria-label="Employee">
                <option value="">All employees</option>
                {options.allPeople.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </Select>
            )}
            <Select name="category" defaultValue={sp.category ?? ""} aria-label="Category">
              <option value="">All categories</option>
              {options.categories.map((c) => <option key={c.id} value={c.id}>{c.name}{c.is_active ? "" : " (disabled)"}</option>)}
            </Select>
            <Select name="brand" defaultValue={sp.brand ?? ""} aria-label="Brand">
              <option value="">Any brand</option>
              <option value="none">For all brands</option>
              {options.brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
            {options.routes.length > 0 && (
              <Select name="route" defaultValue={sp.route ?? ""} aria-label="Route">
                <option value="">All routes</option>
                {options.routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </Select>
            )}
            <Select name="sort" defaultValue={sp.sort ?? ""} aria-label="Sort">
              <option value="">{showDates ? "Newest first" : "Oldest first"}</option>
              <option value="-amount">Amount: high to low</option>
              <option value="amount">Amount: low to high</option>
            </Select>
          </div>
          {showDates && sp.from && <p className="mt-2 text-xs text-text-3">A from–to range replaces the month.</p>}
          <div className="mt-3 flex items-center gap-3">
            <Button type="submit" size="sm">Apply</Button>
            <Link href={hrefWith(path, {}, keep ?? {})} className="text-[13px] text-text-2 hover:text-text">Clear all</Link>
          </div>
        </Card>
      </details>
    </form>
  );
}

// Status as chips, like the invoice list.
const STATUS_CHIPS = [
  { key: "", label: "All" },
  { key: "submitted", label: "Waiting approval" },
  { key: "approved", label: "Approved" },
  { key: "to_reimburse", label: "To reimburse" },
  { key: "returned", label: "Returned" },
  { key: "rejected", label: "Rejected" },
  { key: "draft", label: "Drafts" },
  { key: "cancelled", label: "Cancelled" },
];

export function StatusChips({ path, sp }: { path: string; sp: ExpenseSP }) {
  return (
    <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
      {STATUS_CHIPS.map((c) => <Chip key={c.key} href={hrefWith(path, sp, { status: c.key, page: undefined })} active={(sp.status ?? "") === c.key}>{c.label}</Chip>)}
    </div>
  );
}

// Four figures in one quiet strip instead of eight tiles.
export function SummaryStrip({ s, office }: { s: ExpenseSummary; office: boolean }) {
  const cells = [
    { label: "Spent", value: s.incurred, hint: "submitted + approved" },
    { label: "Waiting approval", value: s.pending, hint: `${s.pending_count} expense${s.pending_count === 1 ? "" : "s"}`, href: office ? "/expenses/approve" : undefined },
    { label: "Still to pay back", value: s.outstanding, hint: s.reimbursed > 0 ? `${inr(s.reimbursed, { decimals: false })} already paid` : "to employees", href: office ? "/expenses/reimburse" : undefined },
    { label: "Company paid", value: s.company_paid, hint: "nothing to pay back" },
  ];
  return (
    <div className="mb-4 grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-card)] border border-line bg-line shadow-[var(--shadow-card)] lg:grid-cols-4">
      {cells.map((c) => {
        const body = (
          <>
            <div className="text-xs font-medium text-text-2">{c.label}</div>
            <div className="tabular mt-1 text-lg font-semibold tracking-[-0.01em] whitespace-nowrap text-text">{inr(c.value, { decimals: false })}</div>
            <div className="text-xs text-text-3">{c.hint}</div>
          </>
        );
        return c.href
          ? <Link key={c.label} href={c.href} className="block bg-surface px-4 py-3 transition-colors duration-[160ms] hover:bg-sunken">{body}</Link>
          : <div key={c.label} className="bg-surface px-4 py-3">{body}</div>;
      })}
    </div>
  );
}

export function Pager({ path, sp, page, total }: { path: string; sp: ExpenseSP; page: number; total: number }) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (pages <= 1) return null;
  return (
    <div className="mt-3 flex items-center justify-between text-sm text-text-2">
      <span className="tabular">{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}</span>
      <div className="flex gap-2">
        {page > 1 && <Link href={hrefWith(path, sp, { page: String(page - 1) })}><Button variant="secondary" size="sm">Previous</Button></Link>}
        {page < pages && <Link href={hrefWith(path, sp, { page: String(page + 1) })}><Button variant="secondary" size="sm">Next</Button></Link>}
      </div>
    </div>
  );
}

// "My expenses" and "All expenses" are the same page with a different scope.
export function ExpenseListBody({ path, sp, rows, total, page, summary, options, me, office, showEmployee }: {
  path: string; sp: ExpenseSP; rows: ExpenseRow[]; total: number; page: number; summary: ExpenseSummary; options: Options;
  me: { id: string; name: string; role: string }; office: boolean; showEmployee: boolean;
}) {
  return (
    <>
      <ExpenseFilterBar path={path} sp={sp} options={options} showEmployee={showEmployee} keep={{ status: sp.status }} />
      <StatusChips path={path} sp={sp} />
      <SummaryStrip s={summary} office={office} />
      <ExpenseTable rows={rows} me={me} office={office} options={options} showEmployee={showEmployee}
        empty={showEmployee ? "No expenses for these filters." : "You have no expenses for these filters."} addHref="/expenses/new" />
      <Pager path={path} sp={sp} page={page} total={total} />
    </>
  );
}
