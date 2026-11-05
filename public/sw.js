// APEX DMS service worker: keeps the field app usable without network.
// - App code (/_next/static) is cached on first use.
// - The "Today's route" page is network-first, falling back to the last copy.
const STATIC = "apex-static-v1";
const PAGES = "apex-pages-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.open(STATIC).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      })
    );
    return;
  }

  if (req.mode === "navigate" && url.pathname.startsWith("/routes/today")) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) caches.open(PAGES).then((c) => c.put("/routes/today", res.clone()));
          return res;
        })
        .catch(() => caches.open(PAGES).then((c) => c.match("/routes/today")).then((r) => r || new Response("Offline", { status: 503 })))
    );
  }
});
