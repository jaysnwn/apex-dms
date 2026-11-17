"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { usePrefs } from "./prefs-provider";
import { cn } from "./ui";

// Line drawings for empty lists (strokes only, so they follow the theme).
const ART = {
  receipt: ["M20 8h24v48l-4-3-4 3-4-3-4 3-4-3-4 3z", "M26 20h12", "M26 28h12", "M26 36h8"],
  box: ["M32 10 54 21v22L32 54 10 43V21z", "M10 21l22 11 22-11", "M32 32v22", "M21 15.5l22 11"],
  truck: ["M6 18h30v24H6z", "M36 26h11l9 9v7H36", "M14 46a4 4 0 1 0 0.1 0", "M46 46a4 4 0 1 0 0.1 0"],
  store: ["M10 26 14 12h36l4 14", "M10 26h44v4a6 6 0 0 1-11 3 6 6 0 0 1-10.5 0A6 6 0 0 1 21 33a6 6 0 0 1-11-3z", "M14 34v20h36V34", "M27 54V42h10v12"],
  search: ["M28 12a16 16 0 1 0 0.1 0", "M40 40l14 14", "M22 28h12"],
  check: ["M32 8a24 24 0 1 0 0.1 0", "M21 33l7 7 15-16"],
  wallet: ["M10 18h40v32H10z", "M10 18l30-8v8", "M38 30h14v8H38z"],
} as const;
export type EmptyArt = keyof typeof ART;

// A friendly empty state: a line drawing that draws itself in (anime.js), a plain
// sentence, and the next step. Use inside a table cell or a card.
export function EmptyState({
  art = "search",
  title,
  children,
  action,
  className,
}: {
  art?: EmptyArt;
  title: string;
  children?: React.ReactNode;
  action?: { href: string; label: string };
  className?: string;
}) {
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
      anim = animate(svg.createDrawable(Array.from(paths)), { draw: ["0 0", "0 1"], duration: 700, delay: stagger(90), ease: "inOutQuad" });
    })();
    return () => {
      cancelled = true;
      anim?.revert();
    };
  }, [reduced, art]);

  return (
    <div className={cn("flex flex-col items-center px-4 py-10 text-center", className)}>
      <svg ref={ref} viewBox="0 0 64 64" className="mb-3 size-14 text-text-3" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {ART[art].map((d, i) => <path key={i} d={d} />)}
      </svg>
      <p className="text-[15px] font-medium text-text">{title}</p>
      {children && <p className="mt-1 max-w-sm text-sm text-text-2">{children}</p>}
      {action && (
        <Link href={action.href} className="mt-4 inline-flex h-9 items-center rounded-[var(--radius-control)] bg-primary px-3.5 text-sm font-medium text-on-fill transition-colors hover:bg-primary-hover">
          {action.label}
        </Link>
      )}
    </div>
  );
}
