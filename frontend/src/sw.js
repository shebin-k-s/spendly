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
let activeShareTakeover = false;

// In-memory heartbeat (set by app via postMessage)
let lastAppHeartbeat = 0;

async function saveHeartbeat() {
  lastAppHeartbeat = Date.now();
  const cache = await caches.open(AUTH_CACHE);
  await cache.put('/_heartbeat', new Response(String(lastAppHeartbeat), {
    headers: { 'Content-Type': 'text/plain' },
  }));
}

async function getHeartbeatAge() {
  if (lastAppHeartbeat > 0) return Date.now() - lastAppHeartbeat;
  try {
    const cache = await caches.open(AUTH_CACHE);
    const res = await cache.match('/_heartbeat');
    if (!res) return Infinity;
    const ts = parseInt(await res.text(), 10);
    lastAppHeartbeat = ts;
    return Date.now() - ts;
  } catch {
    return Infinity;
  }
}

// ── Install ───────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  self.skipWaiting();
  const urls = [
    '/',
    '/index.html',
    '/share-processing',
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
  } else if (event.data?.type === 'APP_HEARTBEAT') {
    saveHeartbeat().catch(() => {});
  } else if (event.data?.type === 'APP_TAKEN_OVER_SHARE') {
    console.log('[SW] App has taken over share flow, will skip notification');
    activeShareTakeover = true;
  }
});

// ── SPA shell ─────────────────────────────────────────────────────────────────
async function serveSpa(request) {
  const cached = await caches.match('/index.html') || await caches.match('/');
  if (cached) {
    // Revalidate in the background without blocking the response
    fetch(request).then((res) => {
      if (res.ok) caches.open(CACHE_NAME).then((c) => c.put('/index.html', res));
    }).catch(() => {});
    return cached;
  }
  try {
    const res = await fetch(request);
    if (res.ok) return res;
  } catch { /* offline */ }
  return new Response('<h1>You are offline</h1>', {
    headers: { 'Content-Type': 'text/html' },
  });
}

// ── Notification content builder ─────────────────────────────────────────────
const METHOD_LABEL = {
  upi: 'UPI', card: 'Card', cash: 'Cash',
  bank_transfer: 'Bank Transfer', other: 'Other',
};

function fmtDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function fmtAmount(amount) {
  const n = parseFloat(amount);
  if (isNaN(n)) return amount || '?';
  return n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function buildNotifContent(parsed, personKnown = null) {
  const amount     = fmtAmount(parsed.amount);
  const method     = METHOD_LABEL[parsed.payment_method] || parsed.payment_method || '';
  const date       = fmtDate(parsed.date);
  const time       = parsed.time || '';
  const isTransfer = parsed.suggested_flow === 'transfer' && parsed.transfer_person;

  if (isTransfer) {
    const isSent     = parsed.transfer_direction === 'sent';
    const verb       = isSent ? 'Gave' : 'Received';
    const prep       = isSent ? 'to' : 'from';
    const personName = cleanPersonName(parsed.transfer_person);
    const title      = `Lending · ${verb} ₹${amount} ${prep} ${personName}`;

    const lines = [];
    if (personKnown === false) lines.push('New Contact');
    const meta = [method, date, time].filter(Boolean).join(' · ');
    if (meta)        lines.push(meta);
    if (parsed.note) lines.push(`Note: ${parsed.note}`);

    const body    = lines.join('\n') || 'Tap to log this transfer';
    const actions = [
      { action: 'save',   title: 'Log it' },
      { action: 'review', title: 'Review' },
    ];
    return { title, body, actions };
  }

  // ── Expense ──
  const title = `Expense · ₹${fmtAmount(parsed.amount)}`;
  const lines = [];

  if (parsed.description) lines.push(parsed.description);

  const meta = [parsed.category_name, method, date, time].filter(Boolean).join(' · ');
  if (meta) lines.push(meta);

  if (parsed.cashback) {
    const net = parseFloat(parsed.amount || '0') - parseFloat(parsed.cashback);
    lines.push(`Cashback ₹${fmtAmount(parsed.cashback)} → Net ₹${fmtAmount(net)}`);
  }

  if (parsed.note) lines.push(`Note: ${parsed.note}`);

  const body    = lines.join('\n') || 'Tap to review before saving';
  const actions = [
    { action: 'save',   title: 'Save'   },
    { action: 'review', title: 'Review' },
  ];
  return { title, body, actions };
}

// ── Person name cleanup ───────────────────────────────────────────────────────
// Strips @domain from UPI IDs and removes any UPI fragment mixed into a name.
// "rahul@okaxis"          → "Rahul"
// "Rahul Kumar rahul@ok"  → "Rahul Kumar"
// "Rahul Kumar"           → "Rahul Kumar"
function cleanPersonName(raw) {
  if (!raw) return raw;
  const trimmed = raw.trim();
  // Pure UPI ID — take prefix, capitalise first letter
  if (/^[a-z0-9._-]+@[a-z]+$/i.test(trimmed)) {
    const prefix = trimmed.split('@')[0].replace(/[._-]/g, ' ').trim();
    return prefix.charAt(0).toUpperCase() + prefix.slice(1);
  }
  // Name with a UPI fragment appended — strip the @... part and surrounding space/brackets
  return trimmed.replace(/\s*[\(\[]?[a-z0-9._-]+@[a-z]+[\)\]]?\s*/gi, '').trim() || trimmed;
}

// ── Person matching helper (shared by auto-save and person-check) ─────────────
function findPersonMatch(transferPerson, people, phone = null) {
  const q        = (transferPerson || '').toLowerCase().trim();
  if (!q) return null;
  const qCompact = q.replace(/[\s._\-]/g, '');
  const qDigits  = q.replace(/\D/g, '');

  // 1. Explicit phone — strongest signal
  if (phone) {
    const pd = phone.replace(/\D/g, '');
    if (pd.length >= 6) {
      const m = people.find(p => p.phoneNumber && p.phoneNumber.replace(/\D/g, '').includes(pd));
      if (m) return m;
    }
  }

  // 2. Phone digits embedded in name string (UPI ID like "9876543210@okaxis")
  if (qDigits.length >= 6) {
    const m = people.find(p => p.phoneNumber && p.phoneNumber.replace(/\D/g, '').includes(qDigits));
    if (m) return m;
  }

  // 3. Exact name
  const exact = people.find(p => p.name.toLowerCase() === q);
  if (exact) return exact;

  // 4. Compact name (ignore spaces / dots / dashes)
  if (qCompact.length > 3) {
    const compact = people.find(p => p.name.toLowerCase().replace(/[\s._\-]/g, '') === qCompact);
    if (compact) return compact;
  }

  // 5. UPI prefix
  if (q.includes('@')) {
    const upiPrefix = q.split('@')[0];
    const upiCompact = upiPrefix.replace(/[\s._\-]/g, '');
    const upi = people.find(p => {
      const n = p.name.toLowerCase();
      return n === upiPrefix || n.replace(/[\s._\-]/g, '') === upiCompact;
    });
    if (upi) return upi;
  }

  // 6. Partial name
  return people.find(p => {
    const name = p.name.toLowerCase();
    return name.includes(q) || q.includes(name);
  }) ?? null;
}

// Returns true/false if list loaded, null if the check failed (network/auth)
async function checkPersonKnown(transferPerson, transferPhone = null) {
  try {
    const res = await callApi('/people', { method: 'GET' });
    if (!res.ok) return null;
    const people = await res.json();
    return !!findPersonMatch(transferPerson, people, transferPhone);
  } catch {
    return null;
  }
}

// ── Auto-save transfer via people API ─────────────────────────────────────────
async function autoSaveTransfer(data) {
  const res = await callApi('/people', { method: 'GET' });
  if (!res.ok) throw new Error('people-fetch-failed');
  const people = await res.json();

  let person = findPersonMatch(data.transfer_person, people, data.transfer_phone ?? null);
  let isNew  = false;

  if (!person) {
    // Person not in list — auto-create so the transaction can be saved immediately
    const createRes = await callApi('/people', {
      method: 'POST',
      body: JSON.stringify({
        name: cleanPersonName(data.transfer_person),
        ...(data.transfer_phone ? { phoneNumber: data.transfer_phone } : {}),
      }),
    });
    if (!createRes.ok) throw new Error('person-create-failed');
    person = await createRes.json();
    isNew  = true;
  }

  const type  = data.transfer_direction === 'received' ? 'RETURNED' : 'GIVEN';
  const txRes = await callApi(`/people/${person.id}/transactions`, {
    method: 'POST',
    body: JSON.stringify({
      amount: parseFloat(data.amount),
      type,
      date: data.date || new Date().toISOString().split('T')[0],
      note: data.note || undefined,
    }),
  });
  if (!txRes.ok) throw new Error('transaction-failed');
  return { person, type, isNew };
}

// ── Notification click ────────────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};

  // Tapping a success notification → go to the relevant list page
  if (data.successRoute) {
    event.waitUntil(openWindow(data.successRoute));
    return;
  }

  if (event.action === 'save') {
    event.waitUntil(
      (async () => {
        const icon  = new URL('/logo-192.png', self.location.origin).href;
        const badge = new URL('/badge.svg',    self.location.origin).href;

        if (data.suggested_flow === 'transfer' && data.transfer_person) {
          try {
            const { person, type, isNew } = await autoSaveTransfer(data);
            await removeShareByTs(data.shareTs);
            navigator.clearAppBadge?.().catch?.(() => {});
            const isSent  = type === 'GIVEN';
            const verb    = isSent ? 'Gave' : 'Received';
            const prep    = isSent ? 'to' : 'from';
            const method  = METHOD_LABEL[data.paymentMethod] || data.paymentMethod || '';
            const date    = fmtDate(data.date);
            const meta    = [method, date].filter(Boolean).join(' · ');
            const lines   = [];
            if (isNew)     lines.push('New contact added to your people list');
            if (meta)      lines.push(meta);
            if (data.note) lines.push(`Note: ${data.note}`);
            await self.registration.showNotification(`Lending saved · ${verb} ₹${fmtAmount(data.amount)} ${prep} ${person.name}`, {
              body: lines.join('\n'),
              icon, badge,
              data: { successRoute: `/people/${person.id}` },
            });
          } catch (err) {
            const isAuth = err?.message === 'no-auth' || err?.message === 'auth-expired';
            await self.registration.showNotification('Could not save lending', {
              body: isAuth ? 'Session expired — open app to save manually' : 'Tap to review and save manually',
              icon, badge,
              data: { shareTs: data.shareTs, shareType: data.shareType, suggested_flow: 'transfer' },
            });
          }
          return;
        }

        // ── Expense ──
        try {
          const res = await callApi('/expenses', {
            method: 'POST',
            body: JSON.stringify({
              amount:        parseFloat(data.amount),
              description:   data.description,
              date:          data.date,
              time:          data.time          || undefined,
              paymentMethod: data.paymentMethod || 'upi',
              categoryId:    data.categoryId    || undefined,
              note:          data.note          || undefined,
              cashback:      data.cashback ? parseFloat(data.cashback) : undefined,
            }),
          });
          if (!res.ok) throw new Error('save-failed');
          await removeShareByTs(data.shareTs);
          navigator.clearAppBadge?.().catch?.(() => {});
          const method   = METHOD_LABEL[data.paymentMethod] || data.paymentMethod || '';
          const date     = fmtDate(data.date);
          const category = data.categoryName || '';
          const meta     = [category, method, date].filter(Boolean).join(' · ');
          const lines    = [];
          if (data.description) lines.push(data.description);
          if (meta)             lines.push(meta);
          if (data.cashback) {
            const net = parseFloat(data.amount) - parseFloat(data.cashback);
            lines.push(`Cashback ₹${fmtAmount(data.cashback)} → Net ₹${fmtAmount(net)}`);
          }
          if (data.note) lines.push(`Note: ${data.note}`);
          await self.registration.showNotification(`Expense saved · ₹${fmtAmount(data.amount)}`, {
            body: lines.join('\n'),
            icon, badge,
            data: { successRoute: '/expenses' },
          });
        } catch (err) {
          const isAuth = err?.message === 'no-auth' || err?.message === 'auth-expired';
          await self.registration.showNotification('Could not save expense', {
            body: isAuth ? 'Session expired — open app to save manually' : 'Tap to review and save manually',
            icon, badge,
            data: { shareTs: data.shareTs, shareType: data.shareType },
          });
        }
      })()
    );
    return;
  }

  // "review" action or plain tap
  event.waitUntil(openReviewWindow(data.shareTs, data.shareType || 'image'));
});

async function openWindow(path) {
  const target  = new URL(path, self.location.origin).href;
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const any     = clients[0];
  if (any) { any.navigate(target); any.focus(); return; }
  await self.clients.openWindow(target);
}

async function openReviewWindow(shareTs, shareType = 'image') {
  // When we have a shareTs the item is already in the queue — load by ts only.
  // Omitting ?shared= prevents the raw-share useEffect in AddExpensePage from
  // firing alongside the loadFromQueue effect (double-population race).
  // Without a shareTs (parse-failed fallback) we send ?shared= so the page can
  // still try to read any raw image/text left in the cache.
  const urlStr = shareTs
    ? `/expenses/new?shareTs=${shareTs}`
    : `/expenses/new?shared=${shareType}`;
  const target = new URL(urlStr, self.location.origin).href;
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const existing = clients.find((c) => c.url.includes('/expenses/new'));
  if (existing) { existing.navigate(target); existing.focus(); return; }
  const any = clients[0];
  if (any) { any.navigate(target); any.focus(); return; }
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

          // ── Heartbeat check (shared by text and image paths) ─────────────
          const APP_HEARTBEAT_TTL = 10_000;
          const heartbeatAge = await getHeartbeatAge();
          const appWasOpen = heartbeatAge < APP_HEARTBEAT_TTL;
          console.log('[SW] Heartbeat age:', heartbeatAge === Infinity ? '∞' : `${heartbeatAge}ms`, '→ app was', appWasOpen ? 'OPEN' : 'CLOSED');

          // ── Text share ────────────────────────────────────────────────────
          if (!image || !(image instanceof File) || image.size === 0) {
            const shareText = text || title;
            if (!shareText) {
              return Response.redirect(new URL('/expenses/new', self.location.origin).href, 303);
            }
            // Store text so the app can read it from cache (same pattern as image)
            const textCache = await caches.open(SHARE_CACHE);
            await textCache.put('/share-text', new Response(shareText, {
              headers: { 'Content-Type': 'text/plain' },
            }));
            if (appWasOpen) {
              return Response.redirect(new URL('/expenses/new?shared=text', self.location.origin).href, 303);
            }
            activeShareTakeover = false;
            event.waitUntil(backgroundTextParseAndNotify(shareText));
            return Response.redirect(new URL('/share-processing', self.location.origin).href, 303);
          }

          // ── Image share ───────────────────────────────────────────────────
          const buffer = await image.arrayBuffer();
          const imageCache = await caches.open(SHARE_CACHE);
          await imageCache.put('/share-image', new Response(buffer, {
            headers: { 'Content-Type': image.type || 'image/jpeg' },
          }));

          if (appWasOpen) {
            return Response.redirect(new URL('/expenses/new?shared=image', self.location.origin).href, 303);
          }
          activeShareTakeover = false;
          event.waitUntil(backgroundParseAndNotify(buffer, image.type));
          return Response.redirect(new URL('/share-processing', self.location.origin).href, 303);

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

// ── Share queue helpers ───────────────────────────────────────────────────────
async function removeShareByTs(ts) {
  if (!ts) return;
  try {
    const cache = await caches.open(SHARE_CACHE);
    const res = await cache.match('/share-queue');
    if (!res) return;
    const queue = await res.json();
    const next = queue.filter((item) => item.ts !== ts);
    if (next.length === 0) {
      await cache.delete('/share-queue');
    } else {
      await cache.put('/share-queue', new Response(JSON.stringify(next), {
        headers: { 'Content-Type': 'application/json' },
      }));
    }
  } catch { /* ignore */ }
}

async function appendShareQueue(parsed, type, extra = {}) {
  const cache = await caches.open(SHARE_CACHE);
  const existing = await cache.match('/share-queue');
  const queue = existing ? await existing.json() : [];
  const item = { type, result: parsed, ts: Date.now(), ...extra };
  queue.push(item);
  await cache.put('/share-queue', new Response(JSON.stringify(queue), {
    headers: { 'Content-Type': 'application/json' },
  }));
  navigator.setAppBadge?.(queue.length).catch?.(() => {});
  return item;
}

async function generateThumbnail(buffer, mimeType) {
  try {
    const blob = new Blob([buffer], { type: mimeType || 'image/jpeg' });
    const bitmap = await createImageBitmap(blob);
    const MAX = 480;
    const scale = Math.min(MAX / bitmap.width, MAX / bitmap.height, 1);
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = new OffscreenCanvas(w, h);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const thumbBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.45 });
    const bytes = new Uint8Array(await thumbBlob.arrayBuffer());
    // Chunked encode — character-by-character is O(n²) and hangs on large buffers
    const CHUNK = 8192;
    let bin = '';
    for (let i = 0; i < bytes.length; i += CHUNK) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return `data:image/jpeg;base64,${btoa(bin)}`;
  } catch {
    return null;
  }
}

// ── Background text parse helper ─────────────────────────────────────────────
async function backgroundTextParseAndNotify(text) {
  try {
    const res = await callApi('/expenses/parse-text', {
      method: 'POST',
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error('parse-failed');
    const parsed = await res.json();

    const item = await appendShareQueue(parsed, 'text', { rawText: text });
    // Clean up raw text now that it's in the queue
    const rawCache = await caches.open(SHARE_CACHE);
    await rawCache.delete('/share-text');

    const personKnown = parsed.suggested_flow === 'transfer' && parsed.transfer_person
      ? await checkPersonKnown(parsed.transfer_person, parsed.transfer_phone ?? null)
      : null;
    const { title, body, actions } = buildNotifContent(parsed, personKnown);
    await self.registration.showNotification(title, {
      body,
      icon:               new URL('/logo-192.png', self.location.origin).href,
      badge:              new URL('/badge.svg',    self.location.origin).href,
      requireInteraction: true,
      actions,
      data: {
        amount:             parsed.amount,
        description:        parsed.description,
        paymentMethod:      parsed.payment_method,
        categoryId:         parsed.category_id,
        categoryName:       parsed.category_name      || null,
        date:               parsed.date,
        time:               parsed.time,
        note:               parsed.note,
        cashback:           parsed.cashback,
        transfer_person:    parsed.transfer_person    || null,
        transfer_phone:     parsed.transfer_phone     || null,
        transfer_direction: parsed.transfer_direction || null,
        suggested_flow:     parsed.suggested_flow     || 'expense',
        shareType:          'text',
        shareTs:            item.ts,
      },
    });
  } catch (err) {
    const isNoAuth = err?.message === 'no-auth' || err?.message === 'auth-expired';
    await self.registration.showNotification('Message ready', {
      body:  isNoAuth ? 'Open Spendly to add this expense' : 'Tap to review and add',
      icon:  new URL('/logo-192.png', self.location.origin).href,
      badge: new URL('/badge.svg', self.location.origin).href,
      data:  { url: new URL('/expenses/new?shared=text', self.location.origin).href, shareType: 'text' },
    });
  }
}

// ── Background image parse helper ─────────────────────────────────────────────
async function backgroundParseAndNotify(buffer, mimeType) {
  console.log('[SW] backgroundParseAndNotify: starting...');
  console.log('[SW] Notification permission:', Notification.permission);
  
  if (Notification.permission !== 'granted') {
    console.warn('[SW] Notification permission not granted. User might not see the background result.');
  }

  try {
    const blob = new Blob([buffer], { type: mimeType || 'image/jpeg' });
    const fd = new FormData();
    fd.append('image', blob, 'receipt.jpg');

    const res = await callApi('/expenses/parse-image', { method: 'POST', body: fd });
    if (!res.ok) throw new Error('parse-failed');
    const parsed = await res.json();

    const personKnown = parsed.suggested_flow === 'transfer' && parsed.transfer_person
      ? await checkPersonKnown(parsed.transfer_person, parsed.transfer_phone ?? null)
      : null;
    const { title, body, actions } = buildNotifContent(parsed, personKnown);

    const thumbnail = await generateThumbnail(buffer, mimeType);
    const item = await appendShareQueue(parsed, 'image', thumbnail ? { thumbnail } : {});
    // Clean up raw image now that it's in the queue
    const rawCache = await caches.open(SHARE_CACHE);
    await rawCache.delete('/share-image');

    console.log('[SW] backgroundParseAndNotify: showing success notification');
    if (activeShareTakeover) {
      console.log('[SW] Skipping notification because app took over');
      return;
    }

    await self.registration.showNotification(title, {
      body,
      icon:               new URL('/logo-192.png', self.location.origin).href,
      badge:              new URL('/badge.svg',    self.location.origin).href,
      requireInteraction: true,
      actions,
      data: {
        amount:             parsed.amount,
        description:        parsed.description,
        paymentMethod:      parsed.payment_method,
        categoryId:         parsed.category_id,
        categoryName:       parsed.category_name      || null,
        date:               parsed.date,
        time:               parsed.time,
        note:               parsed.note,
        cashback:           parsed.cashback,
        transfer_person:    parsed.transfer_person    || null,
        transfer_phone:     parsed.transfer_phone     || null,
        transfer_direction: parsed.transfer_direction || null,
        suggested_flow:     parsed.suggested_flow     || 'expense',
        shareType:          'image',
        shareTs:            item.ts,
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
