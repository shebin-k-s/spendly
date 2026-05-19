// ============================================================
//  Spendly Service Worker
//  – Caches the app shell for offline use
//  – Handles Web Share Target (POST with image or text)
// ============================================================

const CACHE_NAME = 'spendly-cache-v2';
const SHARE_CACHE = 'spendly-share';

// Injected by vite-plugin-pwa at build time — versioned asset URLs for precaching
const WB_MANIFEST = self.__WB_MANIFEST || [];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  const precacheUrls = [
    '/', '/index.html', '/logo.png', '/logo-192.png', '/manifest.webmanifest',
    ...WB_MANIFEST.map((entry) => (typeof entry === 'string' ? entry : entry.url)),
  ];
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(precacheUrls)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== CACHE_NAME && k !== SHARE_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

// Use a JS redirect instead of Response.redirect(303) — SW redirects have browser compatibility
// issues for navigation requests; a JS redirect is universally reliable.
function htmlRedirect(url) {
  return new Response(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><script>location.replace(${JSON.stringify(url)});\x3c/script></head><body></body></html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

async function handleShareTarget(request) {
  try {
    const formData = await request.formData();
    const image = formData.get('image');
    const text = (formData.get('text') || '').trim();
    const title = (formData.get('title') || '').trim();

    if (image && image instanceof File && image.size > 0) {
      // Read into ArrayBuffer first — more reliable than passing File directly to Response
      const buffer = await image.arrayBuffer();
      const cache = await caches.open(SHARE_CACHE);
      await cache.put(
        '/share-image',
        new Response(buffer, { headers: { 'Content-Type': image.type || 'image/jpeg' } })
      );
      return htmlRedirect('/expenses/new?shared=image');
    }

    const params = new URLSearchParams();
    if (text) params.set('text', text);
    else if (title) params.set('title', title);
    const qs = params.toString();
    return htmlRedirect(`/expenses/new${qs ? '?' + qs : ''}`);
  } catch {
    return htmlRedirect('/expenses/new');
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Intercept share target POST
  if (request.method === 'POST' && url.pathname === '/expenses/new') {
    event.respondWith(handleShareTarget(request));
    return;
  }

  if (url.pathname.startsWith('/api')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          // Some static hosts return 404 for SPA sub-routes — serve cached index.html instead
          if (!res.ok) {
            return caches.match('/index.html').then((cached) => cached || res);
          }
          return res;
        })
        .catch(() =>
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
