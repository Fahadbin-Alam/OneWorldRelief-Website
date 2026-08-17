// Author: Fahadbin Alam (fma52), 5/13/26
// Mod by Codex, 5/13/26
// One World Relief offline fallback cache.
const CACHE_NAME = "owr-offline-v7";
const APP_SHELL = [
  "/",
  "/index.html",
  "/offline.html",
  "/one-world-relief.css",
  "/one-world-relief.js",
  "/donation-programs.js",
  "/donation-checkout.js",
  "/favicon.png",
  "/apple-touch-icon.png",
  "/site.webmanifest",
  "/assets/one-world-relief-icon.png",
  "/assets/one-world-relief-icon-192.png",
];

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

  event.respondWith(
    fetch(request)
      .then((response) => {
        const responseCopy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, responseCopy));
        return response;
      })
      .catch(() => caches.match(request))
  );
});
