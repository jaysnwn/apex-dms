import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { getModule } from "@/lib/roles";
import { Card, PageHeader } from "@/components/ui";

export default async function ComingSoonPage({ params }: { params: Promise<{ module: string }> }) {
  const { profile } = await requireRole();
  const { module } = await params;
  const mod = getModule(module);
  if (!mod) notFound();
  if (!mod.roles.includes(profile.role)) redirect("/dashboard?denied=1");

  return (
    <>
      <PageHeader title={mod.label} description={mod.description} />
      <Card className="p-8 text-center">
        <div className="mx-auto max-w-md">
          <div className="text-sm font-semibold text-accent-700">Milestone {mod.milestone}</div>
          <p className="mt-2 text-slate-600">
            This module is planned for {mod.milestone}. Its database tables and access rules already exist, so it
            will plug straight in.
          </p>
          <Link href="/dashboard" className="mt-6 inline-block text-sm font-medium text-ink-900 underline">
            Back to dashboard
          </Link>
        </div>
      </Card>
    </>
  );
}
