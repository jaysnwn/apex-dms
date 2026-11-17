"use client";

import { useEffect, useRef } from "react";
import { usePrefs } from "../prefs-provider";

// Tiny trend line for a KPI tile. The line draws itself in once (anime.js createDrawable).
export function Sparkline({ values, className, label }: { values: number[]; className?: string; label?: string }) {
  const ref = useRef<SVGPathElement>(null);
  const { reduced } = usePrefs();
  const W = 120, H = 32, pad = 2;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const pts = values.map((v, i) => [pad + (i * (W - pad * 2)) / Math.max(values.length - 1, 1), H - pad - ((v - min) / span) * (H - pad * 2)]);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${d} L${pts.at(-1)?.[0] ?? W},${H} L${pts[0]?.[0] ?? 0},${H} Z`;

  useEffect(() => {
    const el = ref.current;
    if (!el || reduced || values.length < 2) return;
    let anim: { revert: () => void } | null = null;
    let cancelled = false;
    (async () => {
      const { animate, svg } = await import("animejs");
      if (cancelled) return;
      anim = animate(svg.createDrawable(el), { draw: ["0 0", "0 1"], duration: 700, delay: 120, ease: "outQuad" });
    })();
    return () => {
      cancelled = true;
      anim?.revert();
    };
  }, [reduced, values.length]);

  if (values.length < 2) return null;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <path d={area} fill="var(--blue-600)" opacity={0.08} />
      <path ref={ref} d={d} fill="none" stroke="var(--blue-600)" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
