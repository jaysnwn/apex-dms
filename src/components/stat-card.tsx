import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Card, cn } from "./ui";

const TONES = {
  blue: "bg-sky-50 text-sky-600",
  green: "bg-emerald-50 text-emerald-600",
  red: "bg-red-50 text-red-600",
  amber: "bg-amber-50 text-amber-600",
  orange: "bg-accent-50 text-accent-600",
  violet: "bg-violet-50 text-violet-600",
  teal: "bg-teal-50 text-teal-600",
  slate: "bg-slate-100 text-slate-600",
} as const;

export type StatTone = keyof typeof TONES;

// KPI tile: coloured icon chip, big number, optional hint and link.
export function StatCard({
  label,
  value,
  icon: Icon,
  tone = "blue",
  hint,
  href,
  alert,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  tone?: StatTone;
  hint?: string;
  href?: string;
  alert?: boolean;
}) {
  const body = (
    <Card className={cn("h-full p-4 transition", href && "hover:border-slate-300 hover:shadow-sm", alert && "border-red-200 bg-red-50/40")}>
      <div className="flex items-start gap-3">
        <span className={cn("grid size-10 shrink-0 place-items-center rounded-lg", TONES[tone])}>
          <Icon className="size-5" />
        </span>
        <div className="min-w-0">
          <div className="text-sm text-slate-500">{label}</div>
          <div className={cn("tabular truncate text-xl font-semibold tracking-tight sm:text-2xl", alert && "text-red-700")}>{value}</div>
          {hint && <div className="mt-0.5 truncate text-xs text-slate-500">{hint}</div>}
        </div>
      </div>
    </Card>
  );
  return href ? <Link href={href} className="block">{body}</Link> : body;
}
