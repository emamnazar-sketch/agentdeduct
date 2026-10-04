/* AgentDeduct v2 — offline-first service worker (versioned cache). */
var CACHE = "agentdeduct-v2-3";
var CORE = [
  "/?v=3",
  "/index.html?v=3",
  "/styles.css?v=3",
  "/manifest.json?v=3",
  "/js/store.js?v=3",
  "/js/track.js?v=3",
  "/js/ocr.js?v=3",
  "/js/gps.js?v=3",
  "/js/auth.js?v=3",
  "/js/app.js?v=3",
  "/js/views-home.js?v=3",
  "/js/views-add.js?v=3",
  "/js/views-drives.js?v=3",
  "/js/views-deals.js?v=3",
  "/js/views-reports.js?v=3",
  "/js/views-settings.js?v=3",
  "/assets/icon-192.png?v=3",
  "/assets/icon-512.png?v=3",
  "/assets/agentdeduct-logo.png?v=3",
];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) { return c.addAll(CORE); }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  var url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;
  // API + auth calls always hit the network — never serve or store them from cache.
  if (url.pathname.indexOf("/api/") === 0) return;
  // Navigations: network first (fresh deploys win), fall back to cache offline.
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
        return res;
      }).catch(function () { return caches.match("/index.html?v=3"); })
    );
    return;
  }
  // Static assets: cache first, refresh in background.
  e.respondWith(
    caches.match(e.request).then(function (hit) {
      var net = fetch(e.request).then(function (res) {
        if (res && res.status === 200) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
        }
        return res;
      }).catch(function () { return hit; });
      return hit || net;
    })
  );
});
