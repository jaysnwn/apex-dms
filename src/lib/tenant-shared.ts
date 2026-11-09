// Shared by server and browser code. No secrets here.

// The platform's own name (shared login page, browser tab, platform admin).
// Each business shows its own name inside the app.
export const PLATFORM_NAME = "DMS";
export const PLATFORM_TAGLINE = "Distribution Management System";

// The business (tenant) a browser is working in. It only says which business
// the user ASKS for: the database accepts it only if the user is an active
// member of that business (current_tenant_id()). A forged value sees nothing.
// Readable by the page's own scripts so the browser client can send it too.
export const TENANT_COOKIE = "dms_tenant";
export const TENANT_HEADER = "x-tenant-id";

// APEX TRADING CO. (tenant 1). Used only to move offline data saved on phones
// before multi-tenancy into Apex's own space, once.
export const APEX_TENANT_ID = "a9e70000-0000-4000-8000-000000000001";

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const SLUG_RE = /^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$/;

export const tenantCookieOptions = {
  path: "/",
  sameSite: "lax" as const,
  httpOnly: false,
  secure: process.env.NODE_ENV === "production",
  maxAge: 60 * 60 * 24 * 365,
};

// Only same-site paths may be used as "go here after".
export function safeNext(next: string | null | undefined, fallback = "/dashboard") {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : fallback;
}

// An upload path sent by the browser must sit in the organization's own folder
// (`<tenant_id>/...`). Files stored before multi-tenancy have no such folder and
// belong to Apex, so Apex still accepts them. Storage policies enforce the same
// rule in the database; this only stops a bad path from being recorded.
export function isTenantPath(tenantId: string, path: string | null | undefined): boolean {
  if (path == null || path === "") return true;
  if (path.includes("..") || path.startsWith("/")) return false;
  if (path.startsWith(`${tenantId}/`)) return true;
  return tenantId === APEX_TENANT_ID;
}
