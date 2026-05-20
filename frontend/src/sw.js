// ============================================================
//  Spendly Service Worker
//  – Caches the app shell for offline use
//  – Handles Web Share Target (POST with image or text)
//  – Background AI parse + push notification when app is closed
// ============================================================

const CACHE_NAME  = 'spendly-cache-v3';
const SHARE_CACHE = 'spendly-share';
const AUTH_CACHE  = 'spendly-auth-v1';

// Injected by vite-plugin-pwa at build time
const WB_MANIFEST = self.__WB_MANIFEST || [];

// ── Install ───────────────────────────────────────────────────────────────────
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
      Promise.allSettled(urls.map((url) => cache.add(url)))
    )
  );
});

// ── Activate ──────────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== CACHE_NAME && k !== SHARE_CACHE && k !== AUTH_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ── Auth token helpers ────────────────────────────────────────────────────────
async function saveAuth(token, apiBase) {
  const cache = await caches.open(AUTH_CACHE);
  await cache.put('/_auth', new Response(JSON.stringify({ token, apiBase }), {
    headers: { 'Content-Type': 'application/json' },
  }));
}

async function getAuth() {
  try {
    const cache = await caches.open(AUTH_CACHE);
    const res = await cache.match('/_auth');
    if (!res) return null;
    return res.json();
  } catch {
    return null;
  }
}

// ── API call helper (handles 401 refresh automatically) ───────────────────────
async function callApi(path, options = {}) {
  const auth = await getAuth();
  if (!auth) {
    console.error('[SW] callApi: no auth found in cache');
    throw new Error('no-auth');
  }

  const isFormData = options.body instanceof FormData;
  const makeRequest = (token) => fetch(`${auth.apiBase}${path}`, {
    ...options,
    headers: {
      ...(!isFormData ? { 'Content-Type': 'application/json' } : {}),
      'Authorization': `Bearer ${token}`,
      ...(options.headers || {}),
    },
    credentials: 'include',
  });

  console.log(`[SW] API call: ${path}`);
  let res;
  try {
    res = await makeRequest(auth.token);
  } catch (err) {
    console.error(`[SW] API fetch failed for ${path}:`, err);
    throw err;
  }

  if (res.status === 401) {
    console.log('[SW] 401 Unauthorized, attempting token refresh...');
    // Try refresh
    const refreshRes = await fetch(`${auth.apiBase}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!refreshRes.ok) {
      console.error('[SW] Token refresh failed');
      throw new Error('auth-expired');
    }
    const { accessToken } = await refreshRes.json();
    await saveAuth(accessToken, auth.apiBase);
    res = await makeRequest(accessToken);
  }

  return res;
}

// ── Message listener (app → SW) ───────────────────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'AUTH_UPDATE') {
    saveAuth(event.data.token, event.data.apiBase).catch(() => {});
  }
});

// ── SPA shell ─────────────────────────────────────────────────────────────────
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

// ── Notification click ────────────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};

  if (event.action === 'save') {
    event.waitUntil(
      (async () => {
        try {
          const res = await callApi('/expenses', {
            method: 'POST',
            body: JSON.stringify({
              amount:        parseFloat(data.amount),
              description:   data.description,
              date:          data.date,
              time:          data.time   || undefined,
              paymentMethod: data.paymentMethod || 'upi',
              categoryId:    data.categoryId    || undefined,
              note:          data.note          || undefined,
              cashback:      data.cashback ? parseFloat(data.cashback) : undefined,
            }),
          });
          if (!res.ok) throw new Error('save-failed');
          await self.registration.showNotification('Expense saved', {
            body: `₹${data.amount} · ${data.description}`,
            icon: '/logo-192.png',
            badge: '/badge.svg',
          });
        } catch {
          // Fallback: open review form
          await openReviewWindow();
        }
      })()
    );
    return;
  }

  // "review" action or plain tap → open / focus the add-expense form
  event.waitUntil(openReviewWindow());
});

async function openReviewWindow() {
  const target = new URL('/expenses/new?shared=image', self.location.origin).href;
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const existing = clients.find((c) => c.url.includes('/expenses/new'));
  if (existing) {
    console.log('[SW] Found existing Add Expense window, focusing...');
    existing.focus();
    return;
  }
  const any = clients[0];
  if (any) {
    console.log('[SW] Navigating existing window to review...');
    any.navigate(target);
    any.focus();
    return;
  }
  console.log('[SW] Opening new window for review...');
  await self.clients.openWindow(target);
}

// ── Fetch (share target + SPA + assets) ──────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // ── Web Share Target ──────────────────────────────────────────────────────
  if (request.method === 'POST' && url.pathname === '/expenses/new') {
    event.respondWith(
      (async () => {
        try {
          const formData = await request.formData();
          const image = formData.get('image');
          const text  = (formData.get('text')  || '').trim();
          const title = (formData.get('title') || '').trim();

          // ── Text share → existing flow unchanged ──────────────────────────
          if (!image || !(image instanceof File) || image.size === 0) {
            console.log('[SW] Text share detected:', { text, title });
            const params = new URLSearchParams();
            if (text)  params.set('text',  text);
            else if (title) params.set('title', title);
            const qs = params.toString();
            const target = new URL(`/expenses/new${qs ? '?' + qs : ''}`, self.location.origin).href;
            console.log('[SW] Redirecting text share to:', target);
            return Response.redirect(target, 303);
          }

          // Store image for the review flow
          const buffer = await image.arrayBuffer();
          const imageCache = await caches.open(SHARE_CACHE);
          await imageCache.put('/share-image', new Response(buffer, {
            headers: { 'Content-Type': image.type || 'image/jpeg' },
          }));

          // ── Check if app was already open ─────────────────────────────────
          // event.clientId is non-empty only when an existing controlled window
          // initiated this navigation (app was open and Android navigated it to
          // the share URL). For a brand-new PWA window opened by Android for a
          // closed app, there is no originating client → clientId is ''.
          const appWasAlreadyOpen = Boolean(event.clientId);

          if (appWasAlreadyOpen) {
            console.log('[SW] App already open, redirecting to Add Expense page');
            return Response.redirect(new URL('/expenses/new?shared=image', self.location.origin).href, 303);
          }

          // ── App was closed → background parse + notification ──────────────
          console.log('[SW] App closed, initiating background parse and notify');
          event.waitUntil(backgroundParseAndNotify(buffer, image.type));
          
          // Redirect to home so the app doesn't open straight to the expense form
          // This allows the background notification to handle the "Review" action
          return Response.redirect(new URL('/', self.location.origin).href, 303);

        } catch (err) {
          console.error('[SW] share-target error:', err);
          return Response.redirect(new URL('/expenses/new', self.location.origin).href, 303);
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

// ── Background parse helper ───────────────────────────────────────────────────
async function backgroundParseAndNotify(buffer, mimeType) {
  console.log('[SW] backgroundParseAndNotify: starting...');
  try {
    const blob = new Blob([buffer], { type: mimeType || 'image/jpeg' });
    const fd = new FormData();
    fd.append('image', blob, 'receipt.jpg');

    const res = await callApi('/expenses/parse-image', { method: 'POST', body: fd });
    if (!res.ok) throw new Error('parse-failed');
    const parsed = await res.json();

    const amount   = parsed.amount      || '?';
    const desc     = parsed.description || 'Expense';
    const category = parsed.category_name || '';
    const method   = parsed.payment_method || '';
    const bodyParts = [category, method].filter(Boolean).join(' · ');

    console.log('[SW] backgroundParseAndNotify: showing success notification');
    await self.registration.showNotification(`₹${amount} · ${desc}`, {
      body:             bodyParts || 'Tap to review before saving',
      icon:             new URL('/logo-192.png', self.location.origin).href,
      badge:            new URL('/badge.svg', self.location.origin).href,
      requireInteraction: true,
      actions: [
        { action: 'save',   title: 'Save'   },
        { action: 'review', title: 'Review' },
      ],
      data: {
        amount:        parsed.amount,
        description:   parsed.description,
        paymentMethod: parsed.payment_method,
        categoryId:    parsed.category_id,
        date:          parsed.date,
        time:          parsed.time,
        note:          parsed.note,
        cashback:      parsed.cashback,
      },
    });
    console.log('[SW] backgroundParseAndNotify: notification shown');
  } catch (err) {
    console.error('[SW] backgroundParseAndNotify failed:', err);
    // Auth missing or parse failed — show a simple tap-to-add notification
    const isNoAuth = err?.message === 'no-auth' || err?.message === 'auth-expired';
    await self.registration.showNotification('Receipt ready', {
      body:  isNoAuth ? 'Open Spendly to add this expense' : 'Tap to review and add',
      icon:  new URL('/logo-192.png', self.location.origin).href,
      badge: new URL('/badge.svg', self.location.origin).href,
      data:  { url: new URL('/expenses/new?shared=image', self.location.origin).href },
    });
  }
}
