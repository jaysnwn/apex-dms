import { cn } from "@/components/ui";
import { brandTone } from "@/lib/brand-style";

export function BrandBadge({ name, code, className }: { name: string; code?: string | null; className?: string }) {
  const t = brandTone(code);
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset", t.pill, className)}>
      <span className={cn("size-1.5 rounded-full", t.dot)} /> {name}
    </span>
  );
}

// Strip shown at the top of inventory screens so nobody mistakes which brand they are working on.
export function BrandStrip({ name, code, all, children }: { name?: string; code?: string | null; all?: boolean; children?: React.ReactNode }) {
  const t = brandTone(all ? null : code);
  return (
    <div className={cn("mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-2.5 ring-1 ring-inset", all ? "bg-slate-50 ring-slate-200" : t.pill)}>
      <div className="flex items-center gap-2 text-sm font-semibold">
        <span className={cn("size-2.5 rounded-full", all ? "bg-slate-400" : t.dot)} />
        {all ? "All brands — consolidated view. Records stay separate per brand." : `${name} inventory`}
      </div>
      {children}
    </div>
  );
}
