"use client";

import { useEffect, useRef, useState } from "react";
import { usePrefs } from "./prefs-provider";

// Reference categorical palette (validated, fixed order — never cycled).
import { SERIES } from "@/lib/chart-colors";
export { SERIES };

const compact = (n: number) =>
  n >= 1e7 ? `${(n / 1e7).toFixed(1)}Cr` : n >= 1e5 ? `${(n / 1e5).toFixed(1)}L` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}K` : String(Math.round(n));
const money = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const m = v / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
}

// Column chart over time (one series). Hover shows the exact value.
export function ColumnChart({ data, height = 200, label = "Sales", color = "var(--blue-600)" }: { data: { label: string; value: number }[]; height?: number; label?: string; color?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const { reduced } = usePrefs();
  // Columns grow up from the baseline, one after another, once when the chart appears.
  useEffect(() => {
    const bars = svgRef.current?.querySelectorAll<SVGPathElement>("[data-bar]");
    if (!bars?.length || reduced) return;
    let anim: { revert: () => void } | null = null;
    let cancelled = false;
    (async () => {
      const { animate, stagger } = await import("animejs");
      if (cancelled) return;
      anim = animate(bars, { scaleY: [0, 1], duration: 520, delay: stagger(14), ease: "outExpo" });
    })();
    return () => {
      cancelled = true;
      anim?.revert();
    };
  }, [reduced, data.length]);
  const max = niceMax(Math.max(...data.map((d) => d.value), 0));
  const W = 720, H = height, padL = 44, padB = 22, padT = 10;
  const innerW = W - padL - 8, innerH = H - padB - padT;
  const slot = innerW / Math.max(data.length, 1);
  const bw = Math.min(24, slot * 0.7);
  const ticks = [0, max / 2, max];
  return (
    <div className="relative">
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${label} chart`}>
        {ticks.map((t) => {
          const y = padT + innerH - (t / max) * innerH;
          return (
            <g key={t}>
              <line x1={padL} x2={W - 8} y1={y} y2={y} stroke="var(--line)" strokeWidth={1} />
              <text x={padL - 6} y={y + 3} textAnchor="end" fontSize={10} fill="var(--text-2)">{compact(t)}</text>
            </g>
          );
        })}
        {data.map((d, i) => {
          const h = (d.value / max) * innerH;
          const x = padL + i * slot + (slot - bw) / 2;
          const y = padT + innerH - h;
          const r = Math.min(4, h);
          return (
            <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={padL + i * slot} y={padT} width={slot} height={innerH} fill="transparent" />
              {h > 0 && (
                <path
                  d={`M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + bw - r} Q${x + bw},${y} ${x + bw},${y + r} V${y + h} Z`}
                  data-bar
                  fill={color}
                  style={{ transformBox: "fill-box", transformOrigin: "bottom", transition: "opacity 160ms" }}
                  opacity={hover === null || hover === i ? 1 : 0.45}
                />
              )}
              {(i % Math.ceil(data.length / 8) === 0 || i === data.length - 1) && (
                <text x={padL + i * slot + slot / 2} y={H - 6} textAnchor="middle" fontSize={10} fill="var(--text-2)">{d.label}</text>
              )}
            </g>
          );
        })}
      </svg>
      {hover !== null && data[hover] && (
        <div className="pointer-events-none absolute top-0 rounded-md bg-neutral-900 px-2 py-1 text-xs text-on-fill shadow-[var(--shadow-raised)]" style={{ left: `${((padL + hover * slot + slot / 2) / W) * 100}%`, transform: "translateX(-50%)" }}>
          {data[hover].label}: <span className="tabular font-semibold">{money(data[hover].value)}</span>
        </div>
      )}
    </div>
  );
}

// Horizontal bars for ranking (brands, products, salesmen). Labels in text ink, value at the tip.
export function RankBars({ data, color = SERIES[0], format = money }: { data: { label: string; value: number; sub?: string }[]; color?: string; format?: (n: number) => string }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  if (data.length === 0) return <p className="py-6 text-center text-sm text-text-2">Nothing this month yet.</p>;
  return (
    <ul className="space-y-2.5">
      {data.map((d) => (
        <li key={d.label} title={`${d.label}: ${format(d.value)}`}>
          <div className="mb-1 flex justify-between gap-2 text-sm">
            <span className="truncate text-slate-700">{d.label}{d.sub && <span className="text-slate-400"> · {d.sub}</span>}</span>
            <span className="tabular shrink-0 font-medium text-slate-900">{format(d.value)}</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100">
            <div className="grow-x h-2 rounded-full" style={{ width: `${(d.value / max) * 100}%`, background: color }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
