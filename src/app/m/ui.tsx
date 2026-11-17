"use client";

import { type ReactNode } from "react";
import * as RD from "@radix-ui/react-dialog";
import * as m from "motion/react-m";
import { useDragControls, type PanInfo } from "motion/react";
import { Minus, Plus, X } from "lucide-react";
import { cn } from "@/components/ui";
import { usePrefs } from "@/components/prefs-provider";
import { duration, ease, spring } from "@/lib/motion";

export function initials(name: string) {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (!p.length) return "?";
  return (p[0][0] + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
}

export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full bg-primary-soft font-semibold text-primary-text ring-2 ring-surface"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials(name)}
    </span>
  );
}

// Bottom sheet: springs up from the bottom (drag the handle down to close) on phones,
// a centred card on larger screens. Radix keeps focus inside and closes on Escape.
export function Sheet({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  const drag = useDragControls();
  function onDragEnd(_: unknown, info: PanInfo) {
    if (info.offset.y > 110 || info.velocity.y > 600) onClose();
  }
  return (
    <RD.Root open onOpenChange={(o) => !o && onClose()}>
      <RD.Portal>
        <RD.Overlay asChild>
          <m.div className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: duration.fast }} />
        </RD.Overlay>
        <div className="pointer-events-none fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <RD.Content asChild aria-describedby={undefined}>
            <m.div
              className="pointer-events-auto relative flex max-h-[92dvh] w-full max-w-md flex-col rounded-t-[28px] border border-line bg-raised shadow-[var(--shadow-raised)] outline-none sm:rounded-[28px]"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              transition={spring.gentle}
              drag="y"
              dragListener={false}
              dragControls={drag}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.6 }}
              onDragEnd={onDragEnd}
            >
              <div className="flex h-6 shrink-0 cursor-grab touch-none items-center justify-center sm:hidden" onPointerDown={(e) => drag.start(e)} aria-hidden>
                <span className="h-1.5 w-10 rounded-full bg-slate-300" />
              </div>
              <div className="flex items-center justify-between px-5 pt-1 pb-2 sm:pt-4">
                <RD.Title className="text-lg font-semibold text-text">{title}</RD.Title>
                <RD.Close className="grid size-11 place-items-center rounded-full bg-sunken text-text-2" aria-label="Close"><X className="size-5" /></RD.Close>
              </div>
              <div className="overflow-y-auto px-5 pb-4">{children}</div>
              {footer && <div className="border-t border-line p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{footer}</div>}
            </m.div>
          </RD.Content>
        </div>
      </RD.Portal>
    </RD.Root>
  );
}

// Big touch-friendly − qty + control. max = stock available.
export function Stepper({ value, max, onChange, size = "md" }: { value: number; max: number; onChange: (v: number) => void; size?: "md" | "lg" }) {
  const h = size === "lg" ? "h-12" : "h-10";
  return (
    <div className={cn("flex items-center overflow-hidden rounded-xl border border-field/55 bg-raised", h)}>
      <button type="button" onClick={() => onChange(Math.max(0, value - 1))} className={cn("grid h-full place-items-center text-text active:bg-sunken", size === "lg" ? "w-12" : "w-10")} aria-label="Less">
        <Minus className="size-4" />
      </button>
      <input
        type="number"
        inputMode="numeric"
        value={value || ""}
        onChange={(e) => onChange(Math.max(0, Math.min(max, Math.floor(Number(e.target.value) || 0))))}
        className="tabular h-full w-12 border-x border-line bg-transparent text-center text-base font-semibold text-text outline-none"
        aria-label="Quantity"
      />
      <button type="button" disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))} className={cn("grid h-full place-items-center bg-primary text-on-fill active:opacity-80 disabled:bg-slate-300 disabled:text-slate-500", size === "lg" ? "w-12" : "w-10")} aria-label="More">
        <Plus className="size-4" />
      </button>
    </div>
  );
}

// Circular progress for the target card: the arc sweeps from zero to the figure once.
export function Ring({ pct, size = 132, stroke = 12, color }: { pct: number; size?: number; stroke?: number; color: string }) {
  const { reduced } = usePrefs();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, pct));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth={stroke} />
      <m.circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        initial={{ strokeDashoffset: reduced ? c * (1 - p / 100) : c }}
        animate={{ strokeDashoffset: c * (1 - p / 100) }}
        transition={{ duration: 0.9, ease: ease.out, delay: 0.15 }}
      />
    </svg>
  );
}
