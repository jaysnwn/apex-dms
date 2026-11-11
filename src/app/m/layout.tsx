export const dynamic = "force-dynamic";

import type { Metadata, Viewport } from "next";
import { requireRole } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/roles";
import { MobileShell } from "./mobile-shell";
import { ErrorListener } from "@/components/error-listener";
import { getCompanyLogoUrl } from "@/lib/branding";

export const metadata: Metadata = { title: { default: "DMS Sales", template: "%s · DMS Sales" } };
export const viewport: Viewport = { themeColor: "#ffffff", width: "device-width", initialScale: 1, viewportFit: "cover" };

// The salesman app. Managers and the Super Admin can open it too, to see what salesmen see.
export default async function FieldLayout({ children }: { children: React.ReactNode }) {
  const [{ profile, tenant }, logoUrl] = await Promise.all([requireRole("salesman", "manager", "super_admin"), getCompanyLogoUrl()]);
  return (
    <MobileShell name={profile.full_name || "Salesman"} roleLabel={ROLE_LABELS[profile.role]} orgName={tenant.display_name} logoUrl={logoUrl} tenantId={tenant.id}>
      <ErrorListener />
      {children}
    </MobileShell>
  );
}
