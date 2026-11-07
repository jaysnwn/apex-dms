// Offline cache for the salesman app.
// Production only: in development, Next.js serves code under fixed file names,
// so a cache would keep stale code (→ "Hydration failed" errors). In development
// we remove any registered service worker and its caches instead.
export function setupServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  if (process.env.NODE_ENV === "production") {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
    return;
  }
  navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister())).catch(() => {});
  if ("caches" in window) caches.keys().then((keys) => keys.forEach((k) => caches.delete(k))).catch(() => {});
}
