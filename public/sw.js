// DMS service worker: keeps the salesman app usable with weak or no network.
// - App code (/_next/static) and icons are cached on first use.
// - Salesman app pages (/m/...) and "Today's route" are network-first, falling
//   back to the last copy seen on this phone when offline or after 6 seconds
//   on a weak signal. Data (catalogue, outlets, route)
//   is also kept in the page's local storage, and orders/visits/payments made
//   offline are queued and sent later.
const STATIC = "dms-static-v3";
const PAGES = "dms-pages-v3";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) =>
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== STATIC && k !== PAGES).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
);

// How long a page may take before the copy saved on this phone is shown instead.
const SLOW_MS = 6000;

const OFFLINE_PAGES = ["/m", "/m/order", "/m/route", "/m/outlets", "/m/orders", "/m/expenses", "/m/more", "/routes/today"];

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

  if (req.mode === "navigate" && OFFLINE_PAGES.includes(url.pathname)) {
    const key = url.pathname;
    const offline = () =>
      caches.open(PAGES)
        .then((c) => c.match(key))
        .then((r) => r || caches.open(PAGES).then((c) => c.match("/m")))
        .then((r) => r || new Response("You are offline and this page has not been opened on this phone yet.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } }));
    const network = fetch(req).then((res) => {
      if (res.ok && !res.redirected) {
        const copy = res.clone();
        caches.open(PAGES).then((c) => c.put(key, copy));
      }
      return res;
    });
    // On a weak signal the network can hang for a long time before failing.
    // After SLOW_MS show the copy last seen on this phone (if there is one);
    // the network answer still updates that copy for next time.
    const slow = new Promise((resolve) => setTimeout(resolve, SLOW_MS))
      .then(() => caches.open(PAGES).then((c) => c.match(key)))
      .then((hit) => hit || network);
    event.respondWith(Promise.race([network, slow]).catch(offline));
    event.waitUntil(network.catch(() => null));
  }
});
