"use client";

// Removes what this device keeps for offline use, except unsent work.
// Called at sign-out and whenever the sign-in page opens, so the next person
// on a shared phone (or anyone opening the app offline after a sign-out) never
// sees the previous person's pages, outlets, catalogue or drafts.
// Unsent orders, visits and payments stay: they are kept under their author
// (see tenantKey) and are only sent when that person signs in again.
const KEEP = ["dms-m-outbox:", "dms-field-queue:", "apex-m-outbox", "apex-field-queue"];

export async function clearOfflineCopies() {
  try {
    for (const k of Object.keys(localStorage)) {
      if ((k.startsWith("dms") || k.startsWith("apex-")) && !KEEP.some((p) => k.startsWith(p))) localStorage.removeItem(k);
    }
  } catch {
    /* storage blocked */
  }
  try {
    if ("caches" in window) {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n.includes("pages")).map((n) => caches.delete(n)));
    }
  } catch {
    /* no cache storage */
  }
}

// Unsent work this person has on this device (for the sign-out warning).
export function unsentCount(userId: string | null): number {
  if (!userId) return 0;
  let n = 0;
  try {
    for (const k of Object.keys(localStorage)) {
      if ((k.startsWith("dms-m-outbox:") || k.startsWith("dms-field-queue:")) && k.endsWith(`:${userId}`)) {
        n += (JSON.parse(localStorage.getItem(k) ?? "[]") as unknown[]).length;
      }
    }
  } catch {
    /* ignore */
  }
  return n;
}
