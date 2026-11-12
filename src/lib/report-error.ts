"use client";

import { createClient } from "@/lib/supabase/client";

// Sends an error seen in this browser to the error log (System health page).
// Never throws, never blocks the screen, and sends the same error at most once
// a minute. No form data or record contents are sent: only the message, the
// page address and a short code.
const sent = new Map<string, number>();

export function reportError(error: unknown, extra: { digest?: string; detail?: string } = {}) {
  try {
    const e = error as { message?: string; stack?: string; digest?: string } | undefined;
    const message = (e?.message ?? String(error ?? "Unknown error")).slice(0, 500);
    const key = `${message}|${location.pathname}`;
    const now = Date.now();
    if ((sent.get(key) ?? 0) > now - 60_000) return;
    sent.set(key, now);
    if (!navigator.onLine) return;
    void createClient()
      .rpc("report_app_error", {
        p_source: "browser",
        p_message: message,
        p_digest: extra.digest ?? e?.digest ?? null,
        p_path: location.pathname,
        p_detail: (extra.detail ?? e?.stack ?? "").slice(0, 2000) || null,
      })
      .then(() => undefined, () => undefined);
  } catch {
    /* reporting must never break the page */
  }
}
