"use client";

import { usePathname } from "next/navigation";
import { BarChart3, Settings2 } from "lucide-react";
import { Tabs, type TabItem } from "@/components/tabs";
import { LinkButton } from "@/components/chip";

// Expenses heading and tabs, the same way Sales does it: the start page (/expenses)
// shows the heading over its boxes; every other page shows the tabs too. The
// categories page has its own heading and back link.
export function ExpensesHeader({ items, office, mgr }: { items: TabItem[]; office: boolean; mgr: boolean }) {
  const pathname = usePathname();
  if (pathname.startsWith("/expenses/categories")) return null;
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Expenses</h1>
        {(office || mgr) && (
          <div className="flex gap-2">
            {office && <LinkButton href="/reports#expenses"><BarChart3 className="size-4" aria-hidden /> Reports</LinkButton>}
            {mgr && <LinkButton href="/expenses/categories"><Settings2 className="size-4" aria-hidden /> Categories</LinkButton>}
          </div>
        )}
      </div>
      {pathname !== "/expenses" && <Tabs items={items} />}
    </>
  );
}
