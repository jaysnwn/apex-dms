"use client";

import { usePathname } from "next/navigation";
import { Tabs, type TabItem } from "@/components/tabs";

// Sales heading and tabs. The start page (/sales) shows the heading over its four
// boxes; the three lists show the tabs; a quotation being made, a quotation and its
// invoice draft show neither, so the work starts at the top (the breadcrumb leads back).
export function SalesHeader({ items }: { items: TabItem[] }) {
  const pathname = usePathname();
  if (pathname === "/sales/new" || pathname.startsWith("/sales/orders/")) return null;
  return (
    <>
      <h1 className="mb-4 text-xl font-semibold tracking-tight sm:text-2xl">Sales</h1>
      {pathname !== "/sales" && <Tabs items={items} />}
    </>
  );
}
