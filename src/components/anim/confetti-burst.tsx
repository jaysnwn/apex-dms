"use client";

import { useEffect, useRef } from "react";
import { usePrefs } from "../prefs-provider";

const COLORS = ["#FFFFFF", "#A9D4FF", "#6EE7A8", "#FFD38A", "#5AA2FF"];

// A short burst of confetti for a real milestone (monthly target reached), once per
// milestone on this device. Never for routine saves. Skipped with reduced motion.
export function ConfettiBurst({ id }: { id: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const { reduced } = usePrefs();
  useEffect(() => {
    const host = ref.current;
    if (!host || reduced) return;
    const key = `dms_confetti_${id}`;
    try {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, "1");
    } catch {
      return;
    }
    const bits: HTMLSpanElement[] = [];
    for (let i = 0; i < 28; i++) {
      const b = document.createElement("span");
      b.style.cssText = `position:absolute;left:50%;top:40%;width:${6 + (i % 3) * 2}px;height:${4 + (i % 2) * 4}px;border-radius:2px;background:${COLORS[i % COLORS.length]};will-change:transform,opacity`;
      host.appendChild(b);
      bits.push(b);
    }
    let anim: { revert: () => void } | null = null;
    (async () => {
      const { animate, stagger, utils } = await import("animejs");
      anim = animate(bits, {
        x: () => utils.random(-150, 150),
        y: () => [0, utils.random(-120, 40)],
        rotate: () => utils.random(-360, 360),
        opacity: [1, 0],
        duration: () => utils.random(900, 1400),
        delay: stagger(12),
        ease: "outQuad",
        onComplete: () => bits.forEach((b) => b.remove()),
      });
    })();
    return () => {
      anim?.revert();
      bits.forEach((b) => b.remove());
    };
  }, [id, reduced]);
  return <div ref={ref} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden" />;
}
