import { Check } from "lucide-react";
import { cn } from "@/components/ui";

// Where a sale stands: quotation → invoice draft → invoice. Shown on the
// quotation screen, the quotation page and the invoice draft.
const STEPS = ["Quotation", "Invoice draft", "Invoice"] as const;
export type DocStep = 0 | 1 | 2;

export function DocSteps({ at, className }: { at: DocStep; className?: string }) {
  return (
    <ol aria-label="Status" className={cn("flex items-center rounded-full border border-line bg-surface p-1", className)}>
      {STEPS.map((s, i) => (
        <li
          key={s}
          aria-current={i === at ? "step" : undefined}
          className={cn(
            "flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] whitespace-nowrap",
            i === at ? "bg-primary-soft font-semibold text-primary-text" : i < at ? "text-text-2" : "text-text-3",
          )}
        >
          {i < at && <Check className="size-3.5" aria-hidden />}
          {s}
          {i < at && <span className="sr-only"> (done)</span>}
        </li>
      ))}
    </ol>
  );
}
