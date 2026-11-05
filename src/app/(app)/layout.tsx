export const dynamic = "force-dynamic";

import { Shell } from "@/components/shell";
import { requireRole } from "@/lib/auth";
import { modulesFor, ROLE_LABELS } from "@/lib/roles";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireRole();

  return (
    <Shell modules={modulesFor(profile.role)} userName={profile.full_name} roleLabel={ROLE_LABELS[profile.role]}>
      {children}
    </Shell>
  );
}
