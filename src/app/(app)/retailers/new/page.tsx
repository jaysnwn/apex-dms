import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { RetailerForm } from "../retailer-form";
import { retailerFormOptions } from "../data";

export const metadata: Metadata = { title: "Add retailer" };

export default async function NewRetailerPage() {
  const { user, profile } = await requireRole("super_admin", "manager", "billing", "salesman");
  const options = await retailerFormOptions(profile.role, user.id);
  return (
    <>
      <PageHeader title="Add retailer" description="A retailer ID is created automatically. You'll be warned if the shop already exists." />
      <div className="max-w-3xl">
        <RetailerForm {...options} isSalesman={profile.role === "salesman"} />
      </div>
    </>
  );
}
