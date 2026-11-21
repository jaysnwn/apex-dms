"use client";

import { Tabs } from "@/components/tabs";

const TABS = [
  { href: "/stock", label: "Dashboard", exact: true },
  { href: "/stock/entry", label: "Stock entry", write: true },
  { href: "/stock/movements", label: "Movement history" },
  { href: "/stock/counts", label: "Stock verification" },
  { href: "/stock/reports", label: "Stock reports" },
  { href: "/stock/warehouses", label: "Warehouses" },
];

export function StockNav({ canWrite }: { canWrite: boolean }) {
  return <Tabs items={TABS.filter((t) => canWrite || !t.write).map(({ href, label, exact }) => ({ href, label, exact }))} />;
}
