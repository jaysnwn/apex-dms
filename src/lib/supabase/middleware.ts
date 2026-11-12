import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { IDLE_COOKIE, IDLE_LIMIT_MS, OWNER_COOKIE, TENANT_COOKIE, UUID_RE, tenantCookieOptions } from "@/lib/tenant-shared";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./env";
import type { Database } from "./database";
import { REQUEST_START_HEADER } from "@/lib/timing";

const PUBLIC_PATHS = ["/login", "/auth", "/d", "/sw.js", "/manifest.webmanifest", "/icons"];
// Pages that decide or change the business themselves.
const TENANT_PATHS = ["/o", "/select-org"];
// The "last seen" cookie is rewritten at most this often.
const SEEN_EVERY_MS = 5 * 60 * 1000;

const under = (path: string, prefixes: string[]) => prefixes.some((p) => path === p || path.startsWith(p + "/"));

// Refreshes the auth session on every request, sends signed-out users to
// /login, signs out browsers idle for 12 hours, and makes sure a signed-in
// browser has a business chosen.
export async function updateSession(request: NextRequest) {
  // When the request arrived, for the step timings (src/lib/timing.ts).
  request.headers.set(REQUEST_START_HEADER, String(Date.now()));
  let response = NextResponse.next({ request });

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return response;

  const supabase = createServerClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // Verifies the session token (locally when the project signs tokens with
  // asymmetric keys; otherwise via the auth server) and refreshes it if due.
  const t0 = Date.now();
  const { data } = await supabase.auth.getClaims();
  const claimsMs = Date.now() - t0;
  if (claimsMs > 1500 || (process.env.VERCEL_ENV === "preview" && request.method === "POST")) {
    console.log(JSON.stringify({ level: claimsMs > 1500 ? "warning" : "info", timing: "middleware.getClaims", total: claimsMs, method: request.method }));
  }
  const userId = (data?.claims?.sub as string | undefined) ?? null;

  const path = request.nextUrl.pathname;
  const isPublic = under(path, PUBLIC_PATHS);
  const isServerAction = request.method === "POST" && request.headers.has("next-action");

  // Every redirect must carry the cookies set above (a refreshed session),
  // or the browser keeps an expired one and is signed out at random.
  const redirectTo = (url: URL) => {
    const res = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => res.cookies.set(c));
    return res;
  };

  if (userId && !isPublic) {
    const seen = Number(request.cookies.get(IDLE_COOKIE)?.value ?? 0);
    const now = Date.now();
    if (seen && now - seen > IDLE_LIMIT_MS) {
      await supabase.auth.signOut();
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.search = "?expired=1";
      const res = redirectTo(url);
      for (const name of [TENANT_COOKIE, OWNER_COOKIE, IDLE_COOKIE]) res.cookies.set(name, "", { path: "/", maxAge: 0 });
      return res;
    }
    if (!seen || now - seen > SEEN_EVERY_MS) {
      response.cookies.set(IDLE_COOKIE, String(now), {
        path: "/", sameSite: "lax", httpOnly: true, secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 30,
      });
    }
  }

  // Who is signed in, for keeping data on this device per person.
  const owner = request.cookies.get(OWNER_COOKIE)?.value;
  if (userId && owner !== userId) response.cookies.set(OWNER_COOKIE, userId, tenantCookieOptions);
  if (!userId && owner) response.cookies.set(OWNER_COOKIE, "", { path: "/", maxAge: 0 });

  // Server actions (POST with a Next-Action header) must not be redirected here:
  // the browser would get an HTML page instead of an action result. The action
  // itself calls requireRole(), which redirects in a way Next.js handles.
  if (!userId && !isPublic && !isServerAction) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = path && path !== "/" ? `?next=${encodeURIComponent(path)}` : "";
    return redirectTo(url);
  }

  // Signed in already: a business's own sign-in page opens that business.
  if (userId && (path === "/login" || path.startsWith("/login/"))) {
    const url = request.nextUrl.clone();
    const slug = path.startsWith("/login/") ? path.slice("/login/".length).split("/")[0] : "";
    url.pathname = slug ? `/o/${slug}` : "/dashboard";
    url.search = "";
    return redirectTo(url);
  }

  // Signed in without a business chosen (e.g. signed in before businesses
  // existed): open the default business once, then come back.
  const chosen = request.cookies.get(TENANT_COOKIE)?.value;
  if (userId && request.method === "GET" && !isPublic && !under(path, TENANT_PATHS) && !(chosen && UUID_RE.test(chosen))) {
    const url = request.nextUrl.clone();
    url.pathname = "/o";
    url.search = `?next=${encodeURIComponent(path + request.nextUrl.search)}`;
    return redirectTo(url);
  }

  return response;
}
