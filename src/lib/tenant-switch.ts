import "server-only";

import { NextResponse } from "next/server";
import { BRAND_COOKIE } from "@/lib/brand";
import { TENANT_COOKIE, tenantCookieOptions } from "@/lib/tenant-shared";

// A redirect that also switches the browser to a business. The brand picked
// in the previous business means nothing in the next one, so it is cleared.
export function redirectIntoTenant(url: URL, tenantId: string) {
  const res = NextResponse.redirect(url, { status: 303 });
  res.cookies.set(TENANT_COOKIE, tenantId, tenantCookieOptions);
  res.cookies.set(BRAND_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}

export function clearTenantCookies(res: NextResponse) {
  res.cookies.set(TENANT_COOKIE, "", { path: "/", maxAge: 0 });
  res.cookies.set(BRAND_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
