export const dynamic = "force-dynamic";

import type { Metadata, Viewport } from "next";
import { requireRole } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/roles";
import { MobileShell } from "./mobile-shell";

export const metadata: Metadata = { title: { default: "APEX Sales", template: "%s · APEX Sales" } };
export const viewport: Viewport = { themeColor: "#ffffff", width: "device-width", initialScale: 1, viewportFit: "cover" };

// The salesman app. Managers and the Super Admin can open it too, to see what salesmen see.
export default async function FieldLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireRole("salesman", "manager", "super_admin");
  return <MobileShell name={profile.full_name || "Salesman"} roleLabel={ROLE_LABELS[profile.role]}>{children}</MobileShell>;
}
