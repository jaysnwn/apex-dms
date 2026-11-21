import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Card, cn } from "./ui";

// Kept for older call sites: tones no longer paint the tile (colour is for status only);
// an alert turns the figure red and adds a soft red edge.
export type StatTone = "blue" | "green" | "red" | "amber" | "orange" | "violet" | "teal" | "slate";

// KPI tile: quiet icon, the figure (wraps instead of being cut off), optional hint and link.
export function StatCard({
  label,
  value,
  icon: Icon,
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
    <Card
      className={cn(
        "h-full p-4 transition-[transform,box-shadow,border-color] duration-[160ms] ease-out",
        href && "hover:-translate-y-0.5 hover:border-field/40 hover:shadow-[var(--shadow-raised)] motion-reduce:hover:translate-y-0",
        alert && "border-red-200"
      )}
    >
      <div className="flex items-start gap-3">
        <span className={cn("grid size-9 shrink-0 place-items-center rounded-full", alert ? "bg-red-50 text-red-600" : "bg-sunken text-text-2")}>
          <Icon className="size-[18px]" aria-hidden />
        </span>
        <div className="min-w-0">
          <div className="text-[13px] text-text-2">{label}</div>
          <div className={cn("tabular text-lg leading-snug font-semibold tracking-[-0.015em] break-words sm:text-[22px]", alert ? "text-red-700" : "text-text")}>{value}</div>
          {hint && <div className="mt-0.5 text-xs text-text-2">{hint}</div>}
        </div>
      </div>
    </Card>
  );
  return href ? <Link href={href} className="block h-full">{body}</Link> : body;
}
