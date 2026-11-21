import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Badge, cn, type Tone } from "./ui";
import { CountUp } from "./anim/count-up";
import { Sparkline } from "./anim/sparkline";

// "Needs attention" tile: a status chip, the figure, what it means and where to act.
// With nothing to do it calms down to a quiet "all clear".
export function ActionTile({
  id, label, tone, value, format, full, hint, href, cta,
}: {
  id: string;
  label: string;
  tone: Tone;
  value: number;
  format: "inrCompact" | "int";
  full?: string;
  hint: string;
  href: string;
  cta: string;
}) {
  const clear = value === 0;
  return (
    <Link
      href={href}
      title={full}
      className={cn(
        "group flex h-full flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-[var(--shadow-card)]",
        "transition-[transform,box-shadow,border-color] duration-[160ms] ease-out hover:-translate-y-0.5 hover:border-field/40 hover:shadow-[var(--shadow-raised)] motion-reduce:hover:translate-y-0"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <Badge tone={clear ? "green" : tone}>{clear ? `No ${label.toLowerCase()}` : label}</Badge>
        <ChevronRight className="hidden size-4 shrink-0 text-text-3 transition-transform duration-[160ms] group-hover:translate-x-0.5 sm:block" aria-hidden />
      </div>
      <div className="min-w-0">
        <CountUp id={id} value={value} format={format} className={cn("tabular block text-[26px] leading-tight font-semibold tracking-[-0.02em]", clear ? "text-text-2" : "text-text")} />
        <p className="mt-0.5 line-clamp-2 text-[13px] text-text-2">{clear ? "All clear" : hint}</p>
      </div>
      <span className="mt-auto text-[13px] font-medium text-primary-text">{cta}</span>
    </Link>
  );
}

// Month KPI: label, big figure (counts up once), optional trend line.
export function KpiTile({
  id, label, value, full, sub, href, trend,
}: {
  id: string;
  label: string;
  value: number;
  full: string;
  sub?: string;
  href?: string;
  trend?: number[];
}) {
  const body = (
    <div className="flex h-full flex-col gap-1.5 rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-[var(--shadow-card)] transition-[border-color,box-shadow] duration-[160ms] hover:border-field/40">
      <div className="text-[13px] text-text-2">{label}</div>
      <div title={full}>
        <CountUp id={id} value={value} format="inrCompact" className="tabular block text-[28px] leading-tight font-semibold tracking-[-0.025em] whitespace-nowrap text-text" />
        <span className="sr-only">{full}</span>
      </div>
      <div className="mt-auto flex items-end justify-between gap-3">
        {sub ? <p className="min-w-0 truncate text-xs text-text-2">{sub}</p> : <span />}
        {trend && trend.length > 1 && <Sparkline values={trend} className="h-7 w-24 shrink-0" />}
      </div>
    </div>
  );
  return href ? <Link href={href} className="block h-full">{body}</Link> : body;
}

// Small secondary figure in an "at a glance" strip.
export function MiniStat({ label, value, href, hint }: { label: string; value: string; href: string; hint?: string }) {
  return (
    <Link href={href} className="flex min-w-0 flex-col gap-0.5 rounded-[var(--radius-control)] px-3 py-2.5 transition-colors hover:bg-sunken">
      <span className="truncate text-xs text-text-2">{label}</span>
      <span className="tabular truncate text-[15px] font-semibold text-text">{value}</span>
      {hint && <span className="truncate text-xs text-text-3">{hint}</span>}
    </Link>
  );
}
