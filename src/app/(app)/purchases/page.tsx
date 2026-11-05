import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";

export default async function PurchasesIndex() {
  const { profile } = await requireRole("super_admin", "manager", "billing", "warehouse");
  redirect(profile.role === "warehouse" ? "/purchases/receive" : "/purchases/orders");
}
