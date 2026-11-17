import {
  Activity, BarChart3, Boxes, FileText, LayoutDashboard, Package, PackagePlus, Receipt, Route, ScrollText,
  Settings, ShoppingCart, Store, Truck, Upload, Users, Wallet, type LucideIcon,
} from "lucide-react";
import type { AppRole, ModuleDef, ModuleKey } from "@/lib/roles";

// How the menu is laid out. Which items each role sees still comes from src/lib/roles.ts.
export type NavItem = { key: string; module: ModuleKey; label: string; short?: string; href: string; icon: LucideIcon; match: (p: string) => boolean };
export type NavGroup = { label: string | null; items: NavItem[] };

const starts = (base: string) => (p: string) => p === base || p.startsWith(base + "/");

const ITEMS: (Omit<NavItem, "match"> & { match?: NavItem["match"]; group: string | null })[] = [
  { key: "dashboard", module: "dashboard", label: "Dashboard", short: "Home", href: "/dashboard", icon: LayoutDashboard, group: null },
  { key: "sales", module: "sales", label: "Billing", href: "/sales/new", icon: ShoppingCart, group: "Sales",
    match: (p) => p.startsWith("/sales") && !p.startsWith("/sales/invoices") },
  { key: "invoices", module: "sales", label: "Invoices", href: "/sales/invoices", icon: FileText, group: "Sales" },
  { key: "retailers", module: "retailers", label: "Retailers", href: "/retailers", icon: Store, group: "Sales" },
  { key: "routes", module: "routes", label: "Routes", href: "/routes", icon: Route, group: "Sales" },
  { key: "stock", module: "stock", label: "Inventory", short: "Stock", href: "/stock", icon: Boxes, group: "Inventory" },
  { key: "products", module: "products", label: "Products", href: "/products", icon: Package, group: "Inventory" },
  { key: "purchases", module: "purchases", label: "Purchases", href: "/purchases", icon: PackagePlus, group: "Inventory" },
  { key: "dispatch", module: "dispatch", label: "Dispatch", href: "/dispatch", icon: Truck, group: "Dispatch" },
  { key: "payments", module: "payments", label: "Payments", href: "/payments", icon: Wallet, group: "Accounts" },
  { key: "expenses", module: "expenses", label: "Expenses", href: "/expenses", icon: Receipt, group: "Accounts" },
  { key: "reports", module: "reports", label: "Reports", href: "/reports", icon: BarChart3, group: "Reports" },
  { key: "import", module: "import", label: "Import", href: "/import", icon: Upload, group: "Settings" },
  { key: "users", module: "users", label: "Users", href: "/admin/users", icon: Users, group: "Settings" },
  { key: "settings", module: "settings", label: "Company", href: "/admin/settings", icon: Settings, group: "Settings" },
  { key: "audit", module: "audit", label: "Audit log", href: "/admin/audit", icon: ScrollText, group: "Settings" },
  { key: "health", module: "health", label: "System health", href: "/admin/health", icon: Activity, group: "Settings" },
];

export function navFor(modules: ModuleDef[]): NavGroup[] {
  const allowed = new Set(modules.map((m) => m.key));
  const groups: NavGroup[] = [];
  for (const it of ITEMS) {
    if (!allowed.has(it.module)) continue;
    const item: NavItem = { ...it, match: it.match ?? starts(it.href) };
    let g = groups.find((x) => x.label === it.group);
    if (!g) groups.push((g = { label: it.group, items: [] }));
    g.items.push(item);
  }
  return groups;
}

// Phone bottom bar: the 4 most-used places for each role, then "More".
const TABS: Record<AppRole, string[]> = {
  super_admin: ["dashboard", "sales", "payments", "dispatch"],
  manager: ["dashboard", "sales", "payments", "dispatch"],
  billing: ["dashboard", "sales", "payments", "retailers"],
  warehouse: ["dashboard", "dispatch", "stock", "purchases"],
  salesman: ["dashboard", "sales", "payments", "routes"],
};

export function tabsFor(role: AppRole, groups: NavGroup[]): NavItem[] {
  const all = groups.flatMap((g) => g.items);
  return TABS[role].map((k) => all.find((i) => i.key === k)).filter((x): x is NavItem => Boolean(x));
}

// Quick actions for the command palette and shortcuts.
export type QuickAction = { key: string; label: string; href: string; module: ModuleKey; shortcut?: string; keywords?: string };
export const QUICK_ACTIONS: QuickAction[] = [
  { key: "new-invoice", label: "New invoice", href: "/sales/new", module: "sales", shortcut: "I", keywords: "bill billing sale create" },
  { key: "new-order", label: "New order / quotation", href: "/sales/new", module: "sales", shortcut: "N", keywords: "order quotation draft" },
  { key: "record-payment", label: "Record payment", href: "/payments/new", module: "payments", shortcut: "P", keywords: "collection receipt money" },
  { key: "new-retailer", label: "Add retailer", href: "/retailers/new", module: "retailers", keywords: "shop customer outlet" },
  { key: "stock-entry", label: "Stock entry", href: "/stock/entry", module: "stock", keywords: "inward outward adjust" },
  { key: "new-purchase", label: "New purchase", href: "/purchases/new", module: "purchases", keywords: "supplier order buy" },
  { key: "outstanding", label: "Outstanding & ageing", href: "/payments/outstanding", module: "payments", keywords: "overdue dues credit" },
  { key: "verify", label: "Verify collections", href: "/payments/verify", module: "payments", keywords: "salesman cash" },
];

// "G then …" jumps.
export const GO_KEYS: { key: string; nav: string; label: string }[] = [
  { key: "d", nav: "dashboard", label: "Dashboard" },
  { key: "s", nav: "sales", label: "Billing" },
  { key: "o", nav: "invoices", label: "Orders & invoices" },
  { key: "r", nav: "retailers", label: "Retailers" },
  { key: "k", nav: "stock", label: "Inventory" },
  { key: "u", nav: "products", label: "Products" },
  { key: "b", nav: "purchases", label: "Purchases" },
  { key: "x", nav: "dispatch", label: "Dispatch" },
  { key: "p", nav: "payments", label: "Payments" },
  { key: "e", nav: "expenses", label: "Expenses" },
  { key: "t", nav: "reports", label: "Reports" },
];
