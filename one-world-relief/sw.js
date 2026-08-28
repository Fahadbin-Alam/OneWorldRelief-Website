// Author: Fahadbin Alam (fma52), 5/13/26
// Mod by Codex, 5/13/26
// One World Relief offline fallback cache.
const CACHE_NAME = "owr-offline-v29";
const APP_SHELL = [
  "/",
  "/index.html",
  "/offline.html",
  "/one-world-relief.css",
  "/one-world-relief-home-v2.css",
  "/one-world-relief.js",
  "/donation-programs.js",
  "/donation-checkout.js",
  "/zakat.html",
  "/zakat-calculator.js",
  "/favicon.png",
  "/apple-touch-icon.png",
  "/site.webmanifest",
  "/assets/one-world-relief-icon-192.png",
];
const APP_SHELL_PATHS = new Set(APP_SHELL);

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/offline.html")));
    return;
  }

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);
  const isSameOriginShell = url.origin === self.location.origin
    && APP_SHELL_PATHS.has(url.pathname);
  if (!isSameOriginShell || request.headers.has("range")) {
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cachedResponse = await cache.match(url.pathname);
      const networkResponse = fetch(request).then(async (response) => {
        if (response.ok && response.type === "basic") {
          await cache.put(url.pathname, response.clone());
        }
        return response;
      });

      if (cachedResponse) {
        event.waitUntil(networkResponse.catch(() => {}));
        return cachedResponse;
      }

      return networkResponse;
    })
  );
});
