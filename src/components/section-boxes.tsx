import Link from "next/link";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { cn } from "@/components/ui";

export type Box = { href: string; label: string; icon: LucideIcon; line: string; count?: number; primary?: boolean };

// The big boxes on a section start page (Sales, Expenses). Inside each page the same
// links show as tabs.
export function SectionBoxes({ boxes }: { boxes: Box[] }) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {boxes.map((b) => {
        const Icon = b.icon;
        return (
          <li key={b.href}>
            <Link
              href={b.href}
              className={cn(
                "group flex h-full min-h-40 flex-col justify-between gap-6 rounded-[var(--radius-sheet)] border p-5 shadow-[var(--shadow-card)] sm:p-6",
                "transition-[transform,box-shadow,border-color] duration-[160ms] ease-out hover:-translate-y-0.5 hover:shadow-[var(--shadow-raised)] motion-reduce:hover:translate-y-0",
                b.primary ? "border-primary/30 bg-primary-soft hover:border-primary/50" : "border-line bg-surface hover:border-field/40",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <span className={cn("grid size-11 place-items-center rounded-xl", b.primary ? "bg-primary text-on-fill" : "bg-sunken text-text")}>
                  <Icon className="size-5" aria-hidden />
                </span>
                {b.count !== undefined && b.count > 0 && (
                  <span className="tabular rounded-full bg-sunken px-2.5 text-sm leading-7 font-semibold text-text">{b.count}</span>
                )}
              </div>
              <div>
                <div className="flex items-center gap-1.5 text-lg font-semibold tracking-[-0.01em] text-text">
                  {b.label}
                  <ChevronRight className="size-4 text-text-3 transition-transform duration-[160ms] group-hover:translate-x-0.5" aria-hidden />
                </div>
                <p className="mt-1 text-sm text-text-2">{b.line}</p>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
