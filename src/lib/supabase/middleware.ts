import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./env";

const PUBLIC_PATHS = ["/login", "/auth", "/sw.js", "/manifest.webmanifest", "/icons"];

// Refreshes the auth session on every request and sends signed-out users to /login.
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
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + "/"));

  // Server actions (POST with a Next-Action header) must not be redirected here:
  // the browser would get an HTML page instead of an action result. The action
  // itself calls requireRole(), which redirects to /login in a way Next.js handles.
  const isServerAction = request.method === "POST" && request.headers.has("next-action");

  if (!user && !isPublic && !isServerAction) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = path && path !== "/" ? `?next=${encodeURIComponent(path)}` : "";
    return NextResponse.redirect(url);
  }

  if (user && path === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
