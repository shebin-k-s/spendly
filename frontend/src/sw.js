// ============================================================
//  Spendly Service Worker
//  – Caches the app shell for offline use
//  – Handles Web Share Target (POST with image or text)
// ============================================================

const CACHE_NAME = 'spendly-cache-v3';
const SHARE_CACHE = 'spendly-share';

// Injected by vite-plugin-pwa at build time
const WB_MANIFEST = self.__WB_MANIFEST || [];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  const urls = [
    '/',
    '/index.html',
    '/logo.png',
    '/logo-192.png',
    '/manifest.webmanifest',
    ...WB_MANIFEST.map((e) => (typeof e === 'string' ? e : e.url)),
  ];
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // allSettled instead of addAll — one 404 won't prevent index.html from being cached
      Promise.allSettled(urls.map((url) => cache.add(url)))
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_NAME && k !== SHARE_CACHE).map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

// Serve the SPA shell — try network first, fall back to cached index.html
async function serveSpa(request) {
  try {
    const res = await fetch(request);
    if (res.ok) return res;
  } catch { /* offline */ }
  const cached = await caches.match('/index.html') || await caches.match('/');
  return cached || new Response('<h1>You are offline</h1>', {
    headers: { 'Content-Type': 'text/html' },
  });
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // ── Web Share Target ─────────────────────────────────────────────────────
  // Android sends a POST here when the user shares to this app.
  // We process the payload, store it, then 303-redirect to the real page.
  // Using Response.redirect(303) — the spec-correct mechanism (same as Google's
  // official Web Share Target cookbook and the Squoosh PWA reference).
  if (request.method === 'POST' && url.pathname === '/expenses/new') {
    event.respondWith(
      (async () => {
        try {
          const formData = await request.formData();
          const image = formData.get('image');
          const text = (formData.get('text') || '').trim();
          const title = (formData.get('title') || '').trim();

          if (image && image instanceof File && image.size > 0) {
            const buffer = await image.arrayBuffer();
            const cache = await caches.open(SHARE_CACHE);
            await cache.put(
              '/share-image',
              new Response(buffer, { headers: { 'Content-Type': image.type || 'image/jpeg' } })
            );
            return Response.redirect('/expenses/new?shared=image', 303);
          }

          const params = new URLSearchParams();
          if (text) params.set('text', text);
          else if (title) params.set('title', title);
          const qs = params.toString();
          return Response.redirect(`/expenses/new${qs ? '?' + qs : ''}`, 303);
        } catch (err) {
          console.error('[SW] share-target error:', err);
          return Response.redirect('/expenses/new', 303);
        }
      })()
    );
    return;
  }

  // ── Skip API calls ────────────────────────────────────────────────────────
  if (url.pathname.startsWith('/api')) return;

  // ── SPA navigation ────────────────────────────────────────────────────────
  if (request.mode === 'navigate') {
    event.respondWith(serveSpa(request));
    return;
  }

  // ── Static assets — cache-first ───────────────────────────────────────────
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
