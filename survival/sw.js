/* Offline Survival Library — cache the whole library on first visit.
   Cache-first for same-origin files, because nothing here changes minute to
   minute and a stick in airplane mode has no network to fall back on. */

const VERSION = "osl-v3-2026-10-24";
const ASSETS = [
  "./",
  "index.html",
  "assets/styles.css",
  "assets/app.js",
  "manifest.webmanifest",
  "data/setup.json",
  "data/skills.json",
  "data/shelf.json",
  "data/recipes.json",
  "data/drill.json",
  "data/print.json",
  "assets/img/hero.jpg",
  "assets/img/setup.jpg",
  "assets/img/water.jpg",
  "assets/img/fire.jpg",
  "assets/img/shelter.jpg",
  "assets/img/signal.jpg",
  "assets/img/stove.jpg",
  "assets/img/pantry.jpg",
  "assets/img/canning.jpg",
  "assets/img/ai.jpg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then((cache) => cache.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match("index.html", { ignoreSearch: true }));
    })
  );
});
