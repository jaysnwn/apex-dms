"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/ui";

const TABS = [
  { href: "/stock", label: "Dashboard", exact: true },
  { href: "/stock/entry", label: "Stock entry", write: true },
  { href: "/stock/movements", label: "Movement history" },
  { href: "/stock/counts", label: "Stock verification" },
  { href: "/stock/reports", label: "Stock reports" },
  { href: "/stock/warehouses", label: "Warehouses" },
];

export function StockNav({ canWrite }: { canWrite: boolean }) {
  const pathname = usePathname();
  return (
    <nav className="-mx-4 mb-6 overflow-x-auto border-b border-slate-200 px-4 sm:mx-0 sm:px-0">
      <ul className="flex gap-1">
        {TABS.filter((t) => canWrite || !t.write).map((t) => {
          const active = t.exact ? pathname === t.href : pathname.startsWith(t.href);
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                className={cn(
                  "block border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap",
                  active ? "border-accent-500 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800"
                )}
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
