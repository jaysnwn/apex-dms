import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SalesHeader } from "./sales-header";

export default async function SalesLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireRole("super_admin", "manager", "billing", "salesman", "warehouse");
  const supabase = await createClient();
  const [q, p] = await Promise.all([
    supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", "quotation"),
    supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", "invoiced"),
  ]);
  return (
    <>
      <SalesHeader
        items={profile.role === "warehouse" ? [
          { href: "/sales/pending", label: "Pending for dispatch", count: p.count ?? 0 },
          { href: "/sales/invoices", label: "Invoices" },
        ] : [
          { href: "/sales/new", label: profile.role === "salesman" ? "New order" : "New sale" },
          { href: "/sales/quotations", label: "Quotations", count: q.count ?? 0 },
          { href: "/sales/pending", label: "Pending for dispatch", count: p.count ?? 0 },
          { href: "/sales/invoices", label: profile.role === "salesman" ? "My invoices" : "Invoices" },
        ]}
      />
      {children}
    </>
  );
}
