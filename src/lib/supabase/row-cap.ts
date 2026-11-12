// Supabase answers a list request with at most 1,000 rows and gives no sign
// that it stopped there. Lists that feed totals page through everything
// (src/lib/all-rows.ts). This is the safety net for every other list: when an
// answer comes back exactly full and the request did not ask for a page, it
// is written to the logs and to the error log (System health page), so a list
// that has outgrown the limit is noticed the day it happens, not months later.
// Nothing about the rows themselves is logged: only the table name.
import { PAGE_ROWS } from "../all-rows";

const reported = new Map<string, number>();

export function capWatchingFetch(report: (table: string) => void): typeof fetch {
  return async (input, init) => {
    const res = await fetch(input, init);
    try {
      const method = (init?.method ?? "GET").toUpperCase();
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      const at = url.pathname.indexOf("/rest/v1/");
      if (at < 0 || (method !== "GET" && !url.pathname.includes("/rpc/"))) return res;
      if (url.searchParams.has("limit") || url.searchParams.has("offset")) return res;
      const headers = new Headers(init?.headers);
      if (headers.has("Range")) return res;
      // "0-999/*": rows 0 to 999, exactly one full page
      if (!res.headers.get("content-range")?.startsWith(`0-${PAGE_ROWS - 1}/`)) return res;
      const table = url.pathname.slice(at + "/rest/v1/".length);
      const now = Date.now();
      if ((reported.get(table) ?? 0) > now - 3_600_000) return res;
      reported.set(table, now);
      report(table);
    } catch {
      /* watching must never break a request */
    }
    return res;
  };
}
