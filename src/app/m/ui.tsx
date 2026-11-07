"use client";

import { useEffect, type ReactNode } from "react";
import { Minus, Plus, X } from "lucide-react";
import { cn } from "@/components/ui";

export function initials(name: string) {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (!p.length) return "?";
  return (p[0][0] + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
}

export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-accent-400 to-accent-600 font-bold text-white shadow-sm ring-2 ring-white"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials(name)}
    </span>
  );
}

// Bottom sheet: slides up from the bottom on phones, centred card on desktop.
export function Sheet({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", esc);
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button aria-label="Close" className="absolute inset-0 bg-slate-900/50" onClick={onClose} />
      <div className="relative flex max-h-[92dvh] w-full max-w-md flex-col rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
        <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-slate-200 sm:hidden" />
        <div className="flex items-center justify-between px-5 pt-3 pb-2">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="grid size-9 place-items-center rounded-full bg-slate-100 text-slate-600" aria-label="Close"><X className="size-5" /></button>
        </div>
        <div className="overflow-y-auto px-5 pb-4">{children}</div>
        {footer && <div className="border-t border-slate-100 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </div>
  );
}

// Big touch-friendly − qty + control. max = stock available.
export function Stepper({ value, max, onChange, size = "md" }: { value: number; max: number; onChange: (v: number) => void; size?: "md" | "lg" }) {
  const h = size === "lg" ? "h-12" : "h-10";
  return (
    <div className={cn("flex items-center overflow-hidden rounded-xl border border-slate-300 bg-white", h)}>
      <button type="button" onClick={() => onChange(Math.max(0, value - 1))} className={cn("grid h-full place-items-center text-slate-700 active:bg-slate-100", size === "lg" ? "w-12" : "w-10")} aria-label="Less">
        <Minus className="size-4" />
      </button>
      <input
        type="number"
        inputMode="numeric"
        value={value || ""}
        onChange={(e) => onChange(Math.max(0, Math.min(max, Math.floor(Number(e.target.value) || 0))))}
        className="tabular h-full w-12 border-x border-slate-200 text-center text-base font-semibold outline-none"
        aria-label="Quantity"
      />
      <button type="button" disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))} className={cn("grid h-full place-items-center bg-accent-500 text-white active:opacity-80 disabled:bg-slate-300", size === "lg" ? "w-12" : "w-10")} aria-label="More">
        <Plus className="size-4" />
      </button>
    </div>
  );
}

// Circular progress for the target card.
export function Ring({ pct, size = 132, stroke = 12, color }: { pct: number; size?: number; stroke?: number; color: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, pct));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - p / 100)} style={{ transition: "stroke-dashoffset 0.8s ease" }} />
    </svg>
  );
}
