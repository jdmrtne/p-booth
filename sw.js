// p-booth Service Worker v1
const CACHE_NAME = 'pbooth-v1';
const ASSETS = [
  './',
  './index.html',
  './camera.html',
  './result.html',
  './manifest.json',
  './css/style.css',
  './js/camera.js',
  './js/canvas.js',
  './js/layout.js',
  './icon-192.svg',
  './icon-512.svg',
];

// Install: cache all shell assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate: clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch: cache-first for shell assets, network-first for fonts/external
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Skip non-GET and cross-origin requests (e.g. Google Fonts)
  if (event.request.method !== 'GET') return;
  if (url.origin !== location.origin) {
    // For cross-origin (fonts, etc.): network with cache fallback
    event.respondWith(
      fetch(event.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Same-origin: cache-first
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        return res;
      });
    })
  );
});
