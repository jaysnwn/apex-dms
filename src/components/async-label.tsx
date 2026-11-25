"use client";

import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import { Check, Loader2 } from "lucide-react";
import { duration, ease, spring } from "@/lib/motion";

// Button content that morphs: label → spinner while working → tick when done.
export function AsyncLabel({ state, label, pendingLabel, doneLabel = "Saved" }: { state: "idle" | "pending" | "done"; label: React.ReactNode; pendingLabel?: string; doneLabel?: string }) {
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <m.span
        key={state}
        className="inline-flex items-center gap-2"
        initial={{ opacity: 0, y: 6, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: duration.fast, ease: ease.out } }}
        exit={{ opacity: 0, y: -6, transition: { duration: duration.instant, ease: ease.in } }}
      >
        {state === "pending" && <Loader2 className="size-4 animate-spin" aria-hidden />}
        {state === "done" && (
          <m.span initial={{ scale: 0.4 }} animate={{ scale: 1, transition: spring.snappy }} className="grid">
            <Check className="size-4" strokeWidth={3} aria-hidden />
          </m.span>
        )}
        {state === "pending" ? pendingLabel ?? label : state === "done" ? doneLabel : label}
      </m.span>
    </AnimatePresence>
  );
}
