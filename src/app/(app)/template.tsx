"use client";

import { usePathname } from "next/navigation";
import * as m from "motion/react-m";
import { ease } from "@/lib/motion";

// Page change: a quick fade with an 8px rise when you move to another section.
// Switching tabs inside a section (same first path segment) swaps instantly.
let lastSection: string | null = null;

export default function Template({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const section = pathname.split("/")[1] ?? "";
  const animate = lastSection !== null && lastSection !== section;
  lastSection = section;
  if (!animate) return <>{children}</>;
  return (
    <m.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: ease.out }}>
      {children}
    </m.div>
  );
}

