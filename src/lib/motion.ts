// APEX DMS motion tokens. Every animation in the app takes its timing from here:
// no magic numbers in components. Values from docs/redesign/02-direction.md.
//
// Rules: animate transform and opacity only; exits are faster than entrances;
// nothing blocks input; reduced motion swaps to short opacity fades.
import type { Transition, Variants } from "motion/react";

export const duration = {
  instant: 0.11, // hover, press, focus
  fast: 0.16, // toggles, chips, tooltips, menus
  base: 0.24, // dialogs, drawers, tab content
  slow: 0.34, // page change, dashboard entrance (max)
} as const;

export const ease = {
  out: [0.22, 1, 0.36, 1] as [number, number, number, number],
  in: [0.4, 0, 1, 1] as [number, number, number, number],
} as const;

export const spring = {
  snappy: { type: "spring", stiffness: 500, damping: 32, mass: 1 } as Transition,
  gentle: { type: "spring", stiffness: 260, damping: 30, mass: 1 } as Transition,
} as const;

// Lists and grids: a small step per item, capped so the whole list settles in ~300ms.
export const STAGGER = 0.03;
export const STAGGER_CAP = 0.3;
export function staggerDelay(index: number) {
  return Math.min(index * STAGGER, STAGGER_CAP);
}

export const enterUp: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: duration.slow, ease: ease.out } },
  exit: { opacity: 0, y: -4, transition: { duration: duration.fast, ease: ease.in } },
};

export const fade: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: duration.fast, ease: ease.out } },
  exit: { opacity: 0, transition: { duration: duration.instant, ease: ease.in } },
};

export const pop: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  show: { opacity: 1, scale: 1, transition: { duration: duration.base, ease: ease.out } },
  exit: { opacity: 0, scale: 0.98, transition: { duration: duration.fast, ease: ease.in } },
};

export const listParent: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: STAGGER } },
};

export const listItem: Variants = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: { duration: duration.base, ease: ease.out } },
};

// Press feedback for buttons and tappable cards.
export const press = { scale: 0.97 };
