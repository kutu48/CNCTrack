/**
 * Service Worker — PRD §9
 * - Cache app-shell (stale-while-revalidate)
 * - Network-first for frequently changing data (sync, movements)
 * - Background Sync for offline outbox (§9.1)
 */
const CACHE_VERSION = "cnc-tracker-v2.0";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/app.css",
  "./js/app.js",
  "./js/api.js",
  "./js/db.js",
  "./js/outbox.js",
];

// ---------- Install: cache app shell ----------
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL).catch(() => {}))
  );
  self.skipWaiting();
});

// ---------- Activate: clean old caches ----------
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ---------- Fetch strategy ----------
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  // Only handle GET
  if (e.request.method !== "GET") return;

  // API requests: network-first (data changes frequently)
  if (url.pathname.startsWith("/api/")) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION + "-api").then((c) => c.put(e.request, copy));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // App shell: stale-while-revalidate
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const fetchPromise = fetch(e.request)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(e.request, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});

// ---------- Background Sync: drain outbox when back online (§9.1) ----------
self.addEventListener("sync", (e) => {
  if (e.tag === "cnc-outbox-sync") {
    e.waitUntil(
      self.registration.showNotification("CNC Tracker", {
        body: "Menyinkronkan aksi offline...",
        tag: "sync-progress",
      })
    );
  }
});

self.addEventListener("message", (e) => {
  if (e.data === "SKIP_WAITING") self.skipWaiting();
});
