/* AgentDeduct v2 — offline-first service worker (versioned cache). */
var CACHE = "agentdeduct-v2-5";
var CORE = [
  "/?v=5",
  "/index.html?v=5",
  "/styles.css?v=5",
  "/manifest.json?v=5",
  "/js/store.js?v=5",
  "/js/track.js?v=5",
  "/js/ocr.js?v=5",
  "/js/gps.js?v=5",
  "/js/auth.js?v=5",
  "/js/install.js?v=5",
  "/js/app.js?v=5",
  "/js/views-home.js?v=5",
  "/js/views-add.js?v=5",
  "/js/views-drives.js?v=5",
  "/js/views-deals.js?v=5",
  "/js/views-reports.js?v=5",
  "/js/views-settings.js?v=5",
  "/assets/icon-192.png?v=5",
  "/assets/icon-512.png?v=5",
  "/assets/icon-maskable-512.png",
  "/assets/agentdeduct-logo.png?v=5",
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
      }).catch(function () { return caches.match("/index.html?v=5"); })
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
