// Author: Fahadbin Alam (fma52), 5/13/26
// Mod by Codex, 5/13/26
// One World Relief offline fallback cache.
const CACHE_NAME = "owr-offline-v56";
const APP_SHELL = [
  "/project-motion-release-v1.css",
  "/project-motion-release-v1.js",
  "/one-world-relief-fit-v1.css",
  "/home-welcome-giving-v2.css",
  "/home-welcome-giving-v1.css",
  "/home-welcome-giving-v1.js",
  "/one-world-relief-giving-v1.js",
  "/donation-programs-giving-v1.js",
  "/zakat-studio-clean-v2.css",
  "/zakat-calculator-clean-v3.js",
  "/home-welcome-clean-v1.css",
  "/zakat-calculator-v2.js",
  "/zakat-studio-v1.css",
  "/zakat-studio.css",
  "/project-motion-smooth-v2.js",
  "/project-motion-smooth-v2.css",
  "/home-welcome-smooth-v3.css",
  "/one-world-relief-smooth-v3.js",
  "/",
  "/index.html",
  "/offline.html",
  "/one-world-relief.css",
  "/smooth-motion.css",
  "/home-welcome.css",
  "/home-welcome-smooth-v1.css",
  "/home-welcome-smooth-v2.css",
  "/home-welcome.js",
  "/home-welcome-smooth-v1.js",
  "/home-welcome-smooth-v2.js",
  "/project-motion.css",
  "/project-motion-smooth-v1.css",
  "/project-updates.css",
  "/project-motion.js",
  "/project-motion-smooth-v1.js",
  "/one-world-relief-home-v2.css",
  "/one-world-relief-home-v3.css",
  "/one-world-relief-responsive-v1.css",
  "/one-world-relief-simple-v1.css",
  "/one-world-relief-blue-v1.css",
  "/one-world-relief-community-v1.css",
  "/one-world-relief-community-v2.css",
  "/one-world-relief-community-v3.css",
  "/one-world-relief-community-v4.css",
  "/one-world-relief.js",
  "/one-world-relief-smooth-v1.js",
  "/one-world-relief-smooth-v2.js",
  "/supporter-board-v1.js",
  "/donation-programs.js",
  "/donation-checkout.js",
  "/donation-checkout-v2.js",
  "/donation-checkout-v3.js",
  "/donation-checkout-v4.js",
  "/interactive.css",
  "/project-filters.js",
  "/zakat.html",
  "/supporters.html",
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
