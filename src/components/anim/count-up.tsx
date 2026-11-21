"use client";

import { useEffect, useRef } from "react";
import { usePrefs } from "../prefs-provider";

// A number that counts up once per session (anime.js, loaded only when needed).
// The server renders the final text, so nothing shifts and screen readers get the real value.
export function CountUp({ value, format, id, className }: { value: number; format: "inr" | "inrCompact" | "int"; id: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const { reduced } = usePrefs();

  useEffect(() => {
    const el = ref.current;
    if (!el || reduced || !Number.isFinite(value) || value === 0) return;
    const key = `dms_counted_${id}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      return;
    }
    const finalText = el.textContent;
    let cancelled = false;
    let anim: { revert: () => void } | null = null;
    (async () => {
      const [{ animate }, fmt] = await Promise.all([import("animejs"), import("@/lib/format")]);
      if (cancelled) return;
      const show = (n: number) =>
        format === "inrCompact" ? fmt.inrCompact(n) : format === "inr" ? fmt.inr(n, { decimals: false }) : Math.round(n).toLocaleString("en-IN");
      const o = { n: 0 };
      anim = animate(o, {
        n: value,
        duration: 900,
        ease: "outExpo",
        onUpdate: () => {
          el.textContent = show(o.n);
        },
        onComplete: () => {
          el.textContent = finalText;
        },
      });
    })();
    return () => {
      cancelled = true;
      anim?.revert();
      if (el) el.textContent = finalText;
    };
  }, [value, format, id, reduced]);

  const text =
    format === "inrCompact"
      ? compact(value)
      : format === "inr"
        ? "₹" + Math.round(value).toLocaleString("en-IN")
        : Math.round(value).toLocaleString("en-IN");
  return (
    <span ref={ref} className={className}>
      {text}
    </span>
  );
}

// Same as lib/format inrCompact (kept here so the first paint needs no extra import).
function compact(n: number) {
  const a = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  const fix = (x: number) => x.toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: x < 100 ? 2 : 0 });
  if (a >= 1e7) return `${sign}₹${fix(a / 1e7)} Cr`;
  if (a >= 1e5) return `${sign}₹${fix(a / 1e5)} L`;
  return `${sign}₹${Math.round(a).toLocaleString("en-IN")}`;
}
