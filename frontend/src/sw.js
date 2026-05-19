// ============================================================
//  Spendly Service Worker
//  – Caches the app shell for offline use
//  – Handles Web Share Target (POST with image or text)
// ============================================================

const CACHE_NAME = 'spendly-cache-v1';
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
        Promise.all(keys.filter((k) => k !== CACHE_NAME && k !== SHARE_CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

// Handle Web Share Target POST (images shared from GPay/PhonePe/etc.)
async function handleShareTarget(request) {
  const formData = await request.formData();
  const image = formData.get('image');
  const text = formData.get('text') || '';
  const title = formData.get('title') || '';

  if (image && image instanceof File && image.size > 0) {
    // Store the image in cache for the page to retrieve
    const cache = await caches.open(SHARE_CACHE);
    const imageResponse = new Response(image, {
      headers: { 'Content-Type': image.type || 'image/jpeg' },
    });
    await cache.put('/share-image', imageResponse);
    return Response.redirect('/expenses/new?shared=image', 303);
  }

  // Fallback: text share (if somehow a POST arrives with text)
  const params = new URLSearchParams();
  if (text) params.set('text', text);
  else if (title) params.set('title', title);
  const qs = params.toString();
  return Response.redirect(`/expenses/new${qs ? '?' + qs : ''}`, 303);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Intercept share target POST before any other handling
  if (request.method === 'POST' && url.pathname === '/expenses/new') {
    event.respondWith(handleShareTarget(request));
    return;
  }

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
