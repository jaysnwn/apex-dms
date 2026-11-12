import { cn } from "./ui";

// Loading placeholders shaped like the page that is coming, so a screen never
// sits blank or looks frozen. Server components: no JavaScript is sent.
// The shimmer is a soft moving highlight (.skeleton in globals.css) and stops
// for people who ask their device for reduced motion.

export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div aria-hidden className={cn("skeleton rounded-md", className)} style={style} />;
}

function Screen({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

function Header({ actions = 1 }: { actions?: number }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="flex gap-2">
        {Array.from({ length: actions }, (_, i) => (
          <Skeleton key={i} className="h-10 w-28 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 8, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex gap-4 border-b border-slate-100 bg-slate-50 px-4 py-3">
        {Array.from({ length: cols }, (_, i) => (
          <Skeleton key={i} className={cn("h-3", i === 0 ? "w-40" : "w-20")} />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex items-center gap-4 border-b border-slate-100 px-4 py-3.5 last:border-0">
          {Array.from({ length: cols }, (_, c) => (
            <Skeleton key={c} className={cn("h-4", c === 0 ? "w-48" : c === cols - 1 ? "ml-auto w-16" : "w-24")} />
          ))}
        </div>
      ))}
    </div>
  );
}

// Lists: invoices, retailers, products, payments, purchases, stock …
export function ListSkeleton({ label = "Loading" }: { label?: string }) {
  return (
    <Screen label={label}>
      <Header />
      <div className="mb-4 flex flex-wrap gap-2">
        <Skeleton className="h-10 w-72 max-w-full rounded-lg" />
        <Skeleton className="h-10 w-32 rounded-lg" />
        <Skeleton className="h-10 w-32 rounded-lg" />
      </div>
      <TableSkeleton />
    </Screen>
  );
}

// One record: invoice, order, purchase, payment, retailer, product …
export function DetailSkeleton({ label = "Loading" }: { label?: string }) {
  return (
    <Screen label={label}>
      <Header actions={2} />
      <div className="mb-6 grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="space-y-3 rounded-xl border border-slate-200 bg-white p-5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-32" />
          </div>
        ))}
      </div>
      <TableSkeleton rows={5} cols={6} />
    </Screen>
  );
}

// Forms: new sale, new purchase, new retailer, new product …
export function FormSkeleton({ label = "Loading" }: { label?: string }) {
  return (
    <Screen label={label}>
      <Header actions={0} />
      <div className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 sm:grid-cols-2">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>
        ))}
      </div>
      <div className="mt-4 flex justify-end">
        <Skeleton className="h-10 w-36 rounded-lg" />
      </div>
    </Screen>
  );
}

// Dashboard: stat cards, then charts.
export function DashboardSkeleton() {
  return (
    <Screen label="Loading the dashboard">
      <Header actions={0} />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="space-y-3 rounded-xl border border-slate-200 bg-white p-5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-7 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }, (_, i) => (
          <div key={i} className="rounded-xl border border-slate-200 bg-white p-5">
            <Skeleton className="mb-4 h-4 w-40" />
            <div className="flex h-48 items-end gap-2">
              {[40, 65, 50, 80, 55, 70, 45, 90, 60, 75].map((h, j) => (
                <Skeleton key={j} className="flex-1 rounded-b-none" style={{ height: `${h}%` }} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </Screen>
  );
}

// Salesman app: a column of cards.
export function MobileListSkeleton({ label = "Loading" }: { label?: string }) {
  return (
    <Screen label={label}>
      <div className="space-y-3 p-4">
        <Skeleton className="h-12 w-full rounded-2xl" />
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="space-y-2 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
            <div className="flex justify-between pt-1">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
        ))}
      </div>
    </Screen>
  );
}
