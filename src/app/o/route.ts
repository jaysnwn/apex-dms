import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { pickDefault, type TenantSummary } from "@/lib/tenant";
import { redirectIntoTenant } from "@/lib/tenant-switch";
import { safeNext } from "@/lib/tenant-shared";

export const dynamic = "force-dynamic";

// /o?next=/somewhere — open the user's default (or only) business, then go on.
// Several businesses and no default: the organisation page asks which one.
export async function GET(request: NextRequest) {
  const next = safeNext(request.nextUrl.searchParams.get("next"));
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(next)}`, request.url), { status: 303 });

  const { data } = await supabase.rpc("my_tenants");
  const pick = pickDefault((data ?? []) as TenantSummary[]);
  if (!pick) return NextResponse.redirect(new URL(`/select-org?next=${encodeURIComponent(next)}`, request.url), { status: 303 });
  return redirectIntoTenant(new URL(next, request.url), pick.id);
}
