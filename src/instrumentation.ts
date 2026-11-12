// Server errors: one structured log line for the hosting's logs, and a row in
// the error log (System health page). The business is recorded only if the
// signed-in user really is a member of it; the database checks that.
// Never logs cookies, tokens, request bodies or record contents.
import type { Instrumentation } from "next";

export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const e = err as Error & { digest?: string };
  const cookie = (request.headers.cookie as string | undefined) ?? "";
  const read = (name: string) => cookie.match(new RegExp(`(?:^|; )${name}=([0-9a-f-]{36})`))?.[1] ?? null;
  const path = request.path.split("?")[0];
  console.error(JSON.stringify({
    level: "error", at: new Date().toISOString(), digest: e.digest ?? null, path, method: request.method,
    route: context.routePath, kind: context.routeType, message: (e.message ?? "").slice(0, 300),
  }));
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return;
    await fetch(`${url}/rest/v1/rpc/report_app_error`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        p_source: "server", p_message: e.message ?? "Server error", p_digest: e.digest ?? null, p_path: path,
        p_detail: `${context.routeType} ${context.routePath}`, p_user: read("dms_uid"), p_tenant: read("dms_tenant"),
      }),
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    /* logging must never make things worse */
  }
};
