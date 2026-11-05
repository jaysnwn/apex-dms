import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Tabs } from "@/components/tabs";

export default async function SalesLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireRole("super_admin", "manager", "billing", "salesman", "warehouse");
  const supabase = await createClient();
  const [q, p] = await Promise.all([
    supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", "quotation"),
    supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", "invoiced"),
  ]);
  return (
    <>
      <h1 className="mb-4 text-xl font-semibold tracking-tight sm:text-2xl">Sales</h1>
      <Tabs
        items={profile.role === "warehouse" ? [
          { href: "/sales/pending", label: "Pending for dispatch", count: p.count ?? 0 },
          { href: "/sales/invoices", label: "Invoices" },
        ] : [
          { href: "/sales/new", label: "New order" },
          { href: "/sales/quotations", label: "Quotations", count: q.count ?? 0 },
          { href: "/sales/pending", label: "Pending for dispatch", count: p.count ?? 0 },
          { href: "/sales/invoices", label: profile.role === "salesman" ? "My invoices" : "Invoices" },
        ]}
      />
      {children}
    </>
  );
}
