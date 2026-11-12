export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext, isOpenTenant } from "@/lib/tenant";
import { ROLE_LABELS } from "@/lib/roles";
import { PLATFORM_NAME, safeNext } from "@/lib/tenant-shared";
import { Alert } from "@/components/ui";
import { SignOutButton } from "@/components/sign-out-button";
import { logoUrl } from "@/lib/branding";

export const metadata: Metadata = { title: "Choose organization" };

// Which business to work in. Shown after sign-in to people who work for
// several businesses, and to anyone whose chosen business is not available.
export default async function SelectOrgPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { tenants, chosen } = await getTenantContext();
  // each business's logo, as on its own sign-in page
  const logos = new Map(
    await Promise.all(tenants.map(async (t) => {
      const { data } = await supabase.rpc("tenant_public_profile", { p_slug: t.slug });
      return [t.id, logoUrl((data as { logo_path: string | null }[] | null)?.[0]?.logo_path)] as const;
    })),
  );
  const goto = safeNext(next);
  const problem =
    error === "denied" ? "You do not have access to that organization."
    : chosen && !tenants.some((t) => t.id === chosen && isOpenTenant(t)) ? "The organization you were working in is not available to you any more."
    : null;

  return (
    <main className="grid min-h-dvh place-items-center bg-slate-50 p-6">
      <div className="w-full max-w-md">
        <div className="mb-6 text-sm font-semibold tracking-[0.2em] text-slate-500">{PLATFORM_NAME}</div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Choose an organization</h1>
        <p className="mt-1 mb-6 text-sm text-slate-500">Signed in as {user.email}.</p>
        {problem && <div className="mb-4"><Alert>{problem}</Alert></div>}

        {tenants.length === 0 ? (
          <Alert>Your login is not active in any organization. Ask your administrator to enable it.</Alert>
        ) : (
          <ul className="space-y-2">
            {tenants.map((t) => {
              const open = isOpenTenant(t);
              const body = (
                <>
                  {logos.get(t.id) ? (
                    <span className="grid h-10 w-24 shrink-0 place-items-center rounded-lg bg-white ring-1 ring-slate-200">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={logos.get(t.id)!} alt="" className="max-h-8 max-w-20 object-contain" />
                    </span>
                  ) : (
                    <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600"><Building2 className="size-5" /></span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-slate-900">{t.display_name}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {ROLE_LABELS[t.role]}{open ? "" : " · suspended"}
                    </span>
                  </span>
                  {open && <ChevronRight className="size-4 text-slate-400" />}
                </>
              );
              return (
                <li key={t.id}>
                  {open ? (
                    <Link href={`/o/${t.slug}?next=${encodeURIComponent(goto)}`} prefetch={false}
                      className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 hover:border-slate-300 hover:shadow-sm">
                      {body}
                    </Link>
                  ) : (
                    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-100 p-3 opacity-70">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-8">
          <SignOutButton className="text-sm font-medium text-slate-600 underline-offset-4 hover:underline">Sign out</SignOutButton>
        </div>
      </div>
    </main>
  );
}
