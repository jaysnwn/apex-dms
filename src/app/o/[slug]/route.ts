import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isOpenTenant, type TenantSummary } from "@/lib/tenant";
import { redirectIntoTenant } from "@/lib/tenant-switch";
import { safeNext, SLUG_RE } from "@/lib/tenant-shared";

export const dynamic = "force-dynamic";

// /o/<slug> — work in that business, if this user is an active member of it.
// The address is a convenience: the database checks the membership again on
// every request, whatever the browser sends.
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const next = safeNext(request.nextUrl.searchParams.get("next"));
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    const login = SLUG_RE.test(slug) ? `/login/${slug}` : "/login";
    return NextResponse.redirect(new URL(`${login}?next=${encodeURIComponent(next)}`, request.url), { status: 303 });
  }

  const { data } = await supabase.rpc("my_tenants");
  const tenant = ((data ?? []) as TenantSummary[]).find((t) => t.slug === slug.toLowerCase() && isOpenTenant(t));
  if (!tenant) return NextResponse.redirect(new URL("/select-org?error=denied", request.url), { status: 303 });
  return redirectIntoTenant(new URL(next, request.url), tenant.id);
}
