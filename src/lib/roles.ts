// Roles and the module map. The database (RLS) is the real gatekeeper;
// this file only decides what each role sees in the menu.

export type AppRole = "super_admin" | "manager" | "billing" | "warehouse" | "salesman";

export const ROLES: AppRole[] = ["super_admin", "manager", "billing", "warehouse", "salesman"];

export const ROLE_LABELS: Record<AppRole, string> = {
  super_admin: "Super Administrator",
  manager: "Manager",
  billing: "Office / Billing Staff",
  warehouse: "Warehouse Staff",
  salesman: "Salesman",
};

export type ModuleKey =
  | "dashboard"
  | "products"
  | "stock"
  | "retailers"
  | "sales"
  | "dispatch"
  | "payments"
  | "routes"
  | "expenses"
  | "reports"
  | "users"
  | "audit"
  | "settings";

export type ModuleDef = {
  key: ModuleKey;
  label: string;
  href: string;
  milestone: "M0" | "M1" | "M2" | "M3" | "M4" | "M5" | "M6";
  ready: boolean;
  roles: AppRole[];
  group: "main" | "admin";
  description: string;
};

const ALL: AppRole[] = [...ROLES];

export const MODULES: ModuleDef[] = [
  { key: "dashboard", label: "Dashboard", href: "/dashboard", milestone: "M0", ready: true, roles: ALL, group: "main",
    description: "Today at a glance." },
  { key: "products", label: "Products", href: "/coming/products", milestone: "M1", ready: false, roles: ALL, group: "main",
    description: "Catalogue with photos, prices, GST, barcode search." },
  { key: "stock", label: "Stock", href: "/coming/stock", milestone: "M1", ready: false,
    roles: ["super_admin", "manager", "billing", "warehouse"], group: "main",
    description: "Stock in/out, transfers, adjustments, damage, reconciliation, valuation." },
  { key: "retailers", label: "Retailers", href: "/coming/retailers", milestone: "M1", ready: false, roles: ALL, group: "main",
    description: "Retailer profiles, duplicate detection, credit terms." },
  { key: "sales", label: "Sales", href: "/coming/sales", milestone: "M2", ready: false,
    roles: ["super_admin", "manager", "billing", "salesman"], group: "main",
    description: "New order, quotations, pending dispatch, GST invoices." },
  { key: "dispatch", label: "Dispatch", href: "/coming/dispatch", milestone: "M3", ready: false,
    roles: ["super_admin", "manager", "billing", "warehouse"], group: "main",
    description: "Picking lists, dispatch, delivery confirmation." },
  { key: "payments", label: "Payments", href: "/coming/payments", milestone: "M4", ready: false,
    roles: ["super_admin", "manager", "billing", "salesman"], group: "main",
    description: "Collections, FIFO allocation, ageing, retailer statements." },
  { key: "routes", label: "Routes", href: "/coming/routes", milestone: "M5", ready: false,
    roles: ["super_admin", "manager", "salesman"], group: "main",
    description: "Routes, visit schedules, targets, field app." },
  { key: "expenses", label: "Expenses", href: "/coming/expenses", milestone: "M5", ready: false, roles: ALL, group: "main",
    description: "Expense claims with receipts and approvals." },
  { key: "reports", label: "Reports", href: "/coming/reports", milestone: "M6", ready: false, roles: ALL, group: "main",
    description: "Sales, collections, stock, ageing and profit reports." },
  { key: "users", label: "Users", href: "/admin/users", milestone: "M0", ready: true, roles: ["super_admin"], group: "admin",
    description: "Create users, assign roles, reset passwords." },
  { key: "audit", label: "Audit log", href: "/admin/audit", milestone: "M0", ready: true,
    roles: ["super_admin", "manager"], group: "admin",
    description: "Who changed what, and when." },
  { key: "settings", label: "Company", href: "/admin/settings", milestone: "M0", ready: true, roles: ["super_admin"],
    group: "admin", description: "Company details, GSTIN, document prefix." },
];

export function modulesFor(role: AppRole) {
  return MODULES.filter((m) => m.roles.includes(role));
}

export function getModule(key: string) {
  return MODULES.find((m) => m.key === key);
}
