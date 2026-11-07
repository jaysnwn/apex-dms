import { requireRole } from "@/lib/auth";
import { Tabs } from "@/components/tabs";

export default async function PaymentsLayout({ children }: { children: React.ReactNode }) {
  await requireRole("super_admin", "manager", "billing", "salesman");
  return (
    <>
      <h1 className="mb-4 text-xl font-semibold tracking-tight sm:text-2xl">Payments</h1>
      <Tabs
        items={[
          { href: "/payments", label: "Collections", exact: true },
          { href: "/payments/verify", label: "Verify collections" },
          { href: "/payments/new", label: "Record payment" },
          { href: "/payments/outstanding", label: "Outstanding & ageing" },
          { href: "/payments/promises", label: "Payment promises" },
        ]}
      />
      {children}
    </>
  );
}
