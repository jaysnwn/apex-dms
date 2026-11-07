import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Tabs } from "@/components/tabs";

export default async function PurchasesLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireRole("super_admin", "manager", "billing", "warehouse");
  const supabase = await createClient();
  const isWarehouse = profile.role === "warehouse";
  const { data: toReceive } = await supabase.from("purchase_receipts").select("purchase_id").eq("status", "ordered");
  const pending = new Set((toReceive ?? []).map((r) => r.purchase_id as string)).size;
  return (
    <>
      <h1 className="mb-4 text-xl font-semibold tracking-tight sm:text-2xl">Purchases</h1>
      <Tabs
        items={isWarehouse ? [
          { href: "/purchases/receive", label: "Goods to receive", count: pending },
        ] : [
          { href: "/purchases/reorder", label: "Reorder list" },
          { href: "/purchases/new", label: "New purchase" },
          { href: "/purchases/orders", label: "Orders to receive", count: pending },
          { href: "/purchases/bills", label: "Supplier bills" },
          { href: "/purchases/payments", label: "Supplier payments" },
          { href: "/purchases/payables", label: "Payables" },
          { href: "/purchases/suppliers", label: "Suppliers" },
        ]}
      />
      {children}
    </>
  );
}
