"use client";

import * as m from "motion/react-m";
import { Check } from "lucide-react";
import { cn } from "./ui";
import { duration, ease, spring } from "@/lib/motion";

export type TimelineStep = { label: string; done: boolean; when?: string };

// Invoiced → Dispatched → Delivered → Paid. The progress line draws up to the latest
// finished step; finished steps pop in one after another. Down the page on phones,
// across on larger screens.
export function OrderTimeline({ steps }: { steps: TimelineStep[] }) {
  const last = steps.reduce((i, s, k) => (s.done ? k : i), -1);
  const progress = steps.length > 1 ? Math.max(last, 0) / (steps.length - 1) : 0;
  return (
    <div className="relative">
      {/* track + progress (horizontal from sm, vertical below) */}
      <div aria-hidden className="absolute top-3 left-3 h-[calc(100%-24px)] w-0.5 rounded-full bg-line sm:top-3 sm:right-[12.5%] sm:left-[12.5%] sm:h-0.5 sm:w-auto" />
      <m.div
        aria-hidden
        className="absolute top-3 left-3 h-[calc(100%-24px)] w-0.5 origin-top rounded-full bg-emerald-600 sm:hidden"
        initial={{ scaleY: 0 }}
        animate={{ scaleY: progress }}
        transition={{ duration: 0.6, ease: ease.out, delay: 0.1 }}
      />
      <m.div
        aria-hidden
        className="absolute top-3 left-[12.5%] hidden h-0.5 w-[75%] origin-left rounded-full bg-emerald-600 sm:block"
        initial={{ scaleX: 0 }}
        animate={{ scaleX: progress }}
        transition={{ duration: 0.6, ease: ease.out, delay: 0.1 }}
      />
      <ol className="relative grid gap-5 sm:grid-cols-4 sm:gap-2">
        {steps.map((s, i) => (
          <li key={s.label} className="flex items-start gap-3 sm:flex-col sm:items-center sm:text-center">
            <m.span
              className={cn("grid size-6 shrink-0 place-items-center rounded-full ring-4 ring-surface", s.done ? "bg-emerald-600 text-on-fill" : "border-2 border-line bg-surface")}
              initial={s.done ? { scale: 0.5, opacity: 0 } : false}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ ...spring.snappy, delay: 0.1 + i * 0.12 }}
            >
              {s.done && <Check className="size-3.5" strokeWidth={3} aria-hidden />}
            </m.span>
            <span className="sm:mt-1">
              <span className={cn("block text-sm font-medium", s.done ? "text-text" : "text-text-2")}>
                {s.label}
                <span className="sr-only">{s.done ? " — done" : " — not yet"}</span>
              </span>
              {s.when && (
                <m.span className="block text-xs text-text-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: duration.base, delay: 0.2 + i * 0.12 }}>
                  {s.when}
                </m.span>
              )}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
