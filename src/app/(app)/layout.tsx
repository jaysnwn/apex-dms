export const dynamic = "force-dynamic";

import { Shell } from "@/components/shell";
import { requireRole } from "@/lib/auth";
import { getBrandContext } from "@/lib/brand";
import { modulesFor, ROLE_LABELS } from "@/lib/roles";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireRole();
  const { brands, current, canSeeAll } = await getBrandContext();

  return (
    <Shell
      modules={modulesFor(profile.role)}
      userName={profile.full_name}
      roleLabel={ROLE_LABELS[profile.role]}
      brands={brands.map((b) => ({ id: b.id, name: b.name, code: b.code }))}
      currentBrandId={current?.id ?? null}
      canSeeAllBrands={canSeeAll}
    >
      {children}
    </Shell>
  );
}
