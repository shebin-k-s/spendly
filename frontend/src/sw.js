// ============================================================
//  Spendly Service Worker
//  – Caches the app shell for offline use
// ============================================================

const CACHE_NAME = 'spendly-cache-v1';

// Injected by vite-plugin-pwa at build time — versioned asset URLs for precaching
const WB_MANIFEST = self.__WB_MANIFEST || [];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  const precacheUrls = [
    '/', '/index.html', '/logo.png', '/manifest.webmanifest',
    ...WB_MANIFEST.map((entry) => (typeof entry === 'string' ? entry : entry.url)),
  ];
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(precacheUrls)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (url.pathname.startsWith('/api')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match('/index.html').then(
          (cached) =>
            cached ||
            new Response('<h1>You are offline</h1>', {
              headers: { 'Content-Type': 'text/html' },
            })
        )
      )
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (!response || response.status !== 200 || response.type === 'opaque') return response;
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        return response;
      });
    })
  );
});
