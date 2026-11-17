"use client";

import { useEffect, useRef } from "react";
import { usePrefs } from "../prefs-provider";

// A tick that draws itself once (anime.js) — for "payment recorded" and similar moments.
export function SuccessCheck({ className }: { className?: string }) {
  const ref = useRef<SVGSVGElement>(null);
  const { reduced } = usePrefs();
  useEffect(() => {
    const paths = ref.current?.querySelectorAll<SVGPathElement>("path");
    if (!paths?.length || reduced) return;
    let anim: { revert: () => void } | null = null;
    let cancelled = false;
    (async () => {
      const { animate, svg, stagger } = await import("animejs");
      if (cancelled) return;
      anim = animate(svg.createDrawable(Array.from(paths)), { draw: ["0 0", "0 1"], duration: 420, delay: stagger(220), ease: "outQuad" });
    })();
    return () => {
      cancelled = true;
      anim?.revert();
    };
  }, [reduced]);
  return (
    <svg ref={ref} viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 2.5a9.5 9.5 0 1 1 0 19 9.5 9.5 0 0 1 0-19z" />
      <path d="m7.5 12.5 3 3 6-6.5" />
    </svg>
  );
}
