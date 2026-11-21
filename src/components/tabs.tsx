"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef } from "react";
import * as m from "motion/react-m";
import { cn } from "./ui";
import { spring } from "@/lib/motion";

export type TabItem = { href: string; label: string; exact?: boolean; count?: number };

export function isTabActive(pathname: string, t: TabItem) {
  return t.exact ? pathname === t.href : pathname === t.href || pathname.startsWith(t.href + "/");
}

// Link tabs for a section. The underline slides to the chosen tab; on a phone the row
// scrolls sideways and keeps the chosen tab in view.
export function Tabs({ items }: { items: TabItem[] }) {
  const pathname = usePathname();
  const id = useId();
  const listRef = useRef<HTMLUListElement>(null);
  const activeHref = items.find((t) => isTabActive(pathname, t))?.href;

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>("[aria-current=page]");
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeHref]);

  return (
    <nav aria-label="Section" className="relative -mx-4 mb-6 border-b border-line px-4 sm:mx-0 sm:px-0">
      <ul ref={listRef} className="no-scrollbar flex gap-1 overflow-x-auto">
        {items.map((t) => {
          const active = t.href === activeHref;
          return (
            <li key={t.href} className="relative">
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-11 items-center gap-2 rounded-t-md px-3 text-sm font-medium whitespace-nowrap transition-colors duration-[160ms]",
                  active ? "text-text" : "text-text-2 hover:text-text"
                )}
              >
                {t.label}
                {t.count !== undefined && t.count > 0 && (
                  <span
                    className={cn(
                      "tabular min-w-5 rounded-full px-1.5 text-center text-xs leading-5",
                      active ? "bg-primary-soft text-primary-text" : "bg-sunken text-text-2"
                    )}
                  >
                    {t.count}
                  </span>
                )}
              </Link>
              {active && (
                <m.span
                  layoutId={`tab-underline-${id}`}
                  className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary"
                  transition={spring.snappy}
                />
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
