import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { TENANT_COOKIE, UUID_RE } from "@/lib/tenant-shared";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./env";

const PUBLIC_PATHS = ["/login", "/auth", "/d", "/sw.js", "/manifest.webmanifest", "/icons"];
// Pages that decide or change the business themselves.
const TENANT_PATHS = ["/o", "/select-org"];

const under = (path: string, prefixes: string[]) => prefixes.some((p) => path === p || path.startsWith(p + "/"));

// Refreshes the auth session on every request, sends signed-out users to
// /login, and makes sure a signed-in browser has a business chosen.
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return response;

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic = under(path, PUBLIC_PATHS);

  // Server actions (POST with a Next-Action header) must not be redirected here:
  // the browser would get an HTML page instead of an action result. The action
  // itself calls requireRole(), which redirects in a way Next.js handles.
  const isServerAction = request.method === "POST" && request.headers.has("next-action");

  if (!user && !isPublic && !isServerAction) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = path && path !== "/" ? `?next=${encodeURIComponent(path)}` : "";
    return NextResponse.redirect(url);
  }

  // Signed in already: a business's own sign-in page opens that business.
  if (user && (path === "/login" || path.startsWith("/login/"))) {
    const url = request.nextUrl.clone();
    const slug = path.startsWith("/login/") ? path.slice("/login/".length).split("/")[0] : "";
    url.pathname = slug ? `/o/${slug}` : "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Signed in without a business chosen (e.g. signed in before businesses
  // existed): open the default business once, then come back.
  const chosen = request.cookies.get(TENANT_COOKIE)?.value;
  if (user && request.method === "GET" && !isPublic && !under(path, TENANT_PATHS) && !(chosen && UUID_RE.test(chosen))) {
    const url = request.nextUrl.clone();
    url.pathname = "/o";
    url.search = `?next=${encodeURIComponent(path + request.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }

  return response;
}
