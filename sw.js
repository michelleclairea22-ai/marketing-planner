const CACHE = "content-planner-v4";

const ASSETS = [
  "./",
  "./index.html",
  "./css/app.css",
  "./js/app.js",
  "./js/time.js",
  "./js/model.js",
  "./js/notify.js",
  "./js/storage.js",
  "./js/api.js",
  "./js/icons.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-192-maskable.png",
  "./icons/icon-512-maskable.png",
  "./icons/favicon-32.png",
  "./icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(ASSETS.map(async (url) => {
      try {
        await cache.add(url);
      } catch {
        // A missing asset should not block the rest of the shell.
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    try {
      const fresh = await fetch(req);
      if (fresh.ok) {
        const cache = await caches.open(CACHE);
        cache.put(req, fresh.clone());
      }
      return fresh;
    } catch {
      const cached = await caches.match(req);
      if (cached) return cached;
      if (req.mode === "navigate") {
        const home = await caches.match("./index.html");
        if (home) return home;
      }
      throw new Error("offline");
    }
  })());
});
