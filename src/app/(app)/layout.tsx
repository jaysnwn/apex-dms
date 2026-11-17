export const dynamic = "force-dynamic";

import { ErrorListener } from "@/components/error-listener";
import { Shell } from "@/components/shell";
import { requireRole } from "@/lib/auth";
import { modulesFor, ROLE_LABELS } from "@/lib/roles";
import { getTenantContext } from "@/lib/tenant";
import { getCompanyLogoUrl } from "@/lib/branding";
import { headers } from "next/headers";
import { REQUEST_START_HEADER, stopwatch } from "@/lib/timing";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const sw = stopwatch("layout.app", (await headers()).get(REQUEST_START_HEADER));
  const { profile, tenant } = await requireRole();
  sw.mark("auth");
  const [{ open }, logoUrl] = await Promise.all([getTenantContext(), getCompanyLogoUrl()]);
  sw.mark("brands");
  sw.done();

  return (
    <Shell
      modules={modulesFor(profile.role)}
      userName={profile.full_name}
      roleLabel={ROLE_LABELS[profile.role]}
      orgName={tenant.display_name}
      logoUrl={logoUrl}
      canSwitchOrg={open.length > 1}
    >
      <ErrorListener />
      {children}
    </Shell>
  );
}
