import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SLUG_RE } from "@/lib/tenant-shared";
import { LoginScreen } from "../login-screen";

export const dynamic = "force-dynamic";

async function findOrg(slug: string) {
  if (!SLUG_RE.test(slug.toLowerCase())) return null;
  const supabase = await createClient();
  const { data } = await supabase.rpc("tenant_public_profile", { p_slug: slug });
  const row = (data as { slug: string; display_name: string }[] | null)?.[0];
  return row ? { slug: row.slug, name: row.display_name } : null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const org = await findOrg((await params).slug);
  return { title: org ? `Sign in · ${org.name}` : "Sign in" };
}

// A business's own sign-in page: /login/apex. Only its name is shown; signing
// in here opens that business, and refuses logins that do not belong to it.
export default async function OrgLoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ next?: string; error?: string; expired?: string }>;
}) {
  const [{ slug }, { next, error: err, expired }] = await Promise.all([params, searchParams]);
  const error = err ?? (expired ? "expired" : undefined);
  const org = await findOrg(slug);
  if (!org) notFound();
  return <LoginScreen next={next} error={error} org={org} />;
}
