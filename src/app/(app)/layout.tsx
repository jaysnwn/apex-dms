export const dynamic = "force-dynamic";

import { ErrorListener } from "@/components/error-listener";
import { Shell } from "@/components/shell";
import { requireRole } from "@/lib/auth";
import { getBrandContext } from "@/lib/brand";
import { modulesFor, ROLE_LABELS } from "@/lib/roles";
import { getTenantContext } from "@/lib/tenant";
import { stopwatch } from "@/lib/timing";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const sw = stopwatch("layout.app");
  const { profile, tenant } = await requireRole();
  sw.mark("auth");
  const [{ brands, current, canSeeAll }, { open }] = await Promise.all([getBrandContext(), getTenantContext()]);
  sw.mark("brands");
  sw.done();

  return (
    <Shell
      modules={modulesFor(profile.role)}
      userName={profile.full_name}
      roleLabel={ROLE_LABELS[profile.role]}
      orgName={tenant.display_name}
      canSwitchOrg={open.length > 1}
      brands={brands.map((b) => ({ id: b.id, name: b.name, code: b.code }))}
      currentBrandId={current?.id ?? null}
      canSeeAllBrands={canSeeAll}
    >
      <ErrorListener />
      {children}
    </Shell>
  );
}
