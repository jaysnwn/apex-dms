"use client";

import { Children, type ReactNode } from "react";
import * as m from "motion/react-m";
import { listItem, listParent } from "@/lib/motion";

// Children rise in one after another (30ms apart, the whole group within ~300ms).
// Use for card grids and the dashboard; not for tables you sort and filter.
export function Reveal({ children, className, as = "div" }: { children: ReactNode; className?: string; as?: "div" | "ul" }) {
  const Parent = as === "ul" ? m.ul : m.div;
  const Child = as === "ul" ? m.li : m.div;
  return (
    <Parent className={className} variants={listParent} initial="hidden" animate="show">
      {Children.toArray(children).slice(0, 10).map((c, i) => (
        <Child key={i} variants={listItem} className="min-w-0">
          {c}
        </Child>
      ))}
      {Children.toArray(children).slice(10)}
    </Parent>
  );
}
