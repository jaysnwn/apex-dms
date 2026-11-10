import "server-only";

import { headers } from "next/headers";

// Counts attempts in the database (rate_limit_hit, migration 0027; server
// only). Returns false when the limit is reached. If the counter cannot be
// reached (no service key, network), the action is allowed and the failure is
// logged: a broken counter must not lock everyone out.
export async function allowAttempt(key: string, max: number, windowSeconds: number): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) return true;
  try {
    const res = await fetch(`${url}/rest/v1/rpc/rate_limit_hit`, {
      method: "POST",
      headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_key: key, p_max: max, p_window_seconds: windowSeconds }),
      signal: AbortSignal.timeout(3000),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`rate limit HTTP ${res.status}`);
    return (await res.json()) !== false;
  } catch (e) {
    console.error(JSON.stringify({ level: "error", at: new Date().toISOString(), what: "rate limit unavailable", message: String(e).slice(0, 200) }));
    return true;
  }
}

// The caller's IP address as the hosting reports it.
export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0] ?? "unknown").trim().slice(0, 64);
}

export const TOO_MANY = "Too many attempts. Wait 15 minutes and try again.";
