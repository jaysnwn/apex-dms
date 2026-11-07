import { requireRole } from "@/lib/auth";
import { StockNav } from "./stock-nav";

export default async function StockLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireRole("super_admin", "manager", "billing", "warehouse");
  const canWrite = profile.role !== "billing";
  return (
    <>
      <h1 className="mb-4 text-xl font-semibold tracking-tight sm:text-2xl">Inventory</h1>
      <StockNav canWrite={canWrite} />
      {children}
    </>
  );
}
