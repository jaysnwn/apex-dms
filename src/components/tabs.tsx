"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "./ui";

export type TabItem = { href: string; label: string; exact?: boolean; count?: number };

// Underlined link tabs for a section.
export function Tabs({ items }: { items: TabItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="-mx-4 mb-6 overflow-x-auto border-b border-slate-200 px-4 sm:mx-0 sm:px-0">
      <ul className="flex gap-1">
        {items.map((t) => {
          const active = t.exact ? pathname === t.href : pathname === t.href || pathname.startsWith(t.href + "/");
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                className={cn(
                  "flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap",
                  active ? "border-accent-500 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800"
                )}
              >
                {t.label}
                {t.count !== undefined && t.count > 0 && (
                  <span className="tabular rounded-full bg-slate-100 px-1.5 text-xs text-slate-600">{t.count}</span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
