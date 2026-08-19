/* Light CRM minimal offline shell — network-first for HTML so deploys are not stuck. */
const CACHE = "light-crm-shell-v2";
const ASSETS = ["/manifest.webmanifest", "/favicon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.pathname.startsWith("/api")) return;

  // Always try network first for navigations / HTML so cold-start UX and new builds appear.
  const isNavigation = req.mode === "navigate" || url.pathname === "/" || req.headers.get("accept")?.includes("text/html");
  if (isNavigation) {
    event.respondWith(
      fetch(req)
        .then((res) => res)
        .catch(() => caches.match("/") || caches.match(req))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).catch(() => caches.match("/")))
  );
});
