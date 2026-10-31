// SafeSCADA HSE Audit service worker — cache-first app shell, network-first for API/sync paths.
const VERSION = 'safescada-v1.0.0';
const SHELL = ['/', '/index.html', '/offline.html', '/manifest.webmanifest', '/favicon.svg', '/favicon.ico', '/apple-touch-icon.png',
  '/css/tokens.css', '/css/layout.css', '/css/components.css',
  '/js/app.js', '/js/db.js', '/js/audit-engine.js', '/js/ui.js',
  '/icons/icon-96.png', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)));
  // No automatic skipWaiting: the page prompts the user, then posts SKIP_WAITING.
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
    if (self.registration.navigationPreload) await self.registration.navigationPreload.enable().catch(() => {});
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });

async function networkFirst(req, fallbackUrl) {
  const cache = await caches.open(VERSION);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    return (await cache.match(req, { ignoreSearch: true })) || (fallbackUrl && (await cache.match(fallbackUrl))) || Response.error();
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(req, { ignoreSearch: true });
  const refresh = fetch(req).then((res) => { if (res && res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
  if (hit) { refresh.catch(() => {}); return hit; }
  return (await refresh) || Response.error();
}

self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const res = (await e.preloadResponse) || (await fetch(req));
        const cache = await caches.open(VERSION); cache.put('/index.html', res.clone());
        return res;
      } catch (err) {
        const cache = await caches.open(VERSION);
        return (await cache.match('/index.html')) || (await cache.match('/offline.html')) || Response.error();
      }
    })());
    return;
  }
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/sync')) { e.respondWith(networkFirst(req)); return; }
  e.respondWith(cacheFirst(req));
});

// Background Sync hook: tells open clients that connectivity is back so they can flush any queued exports/uploads.
self.addEventListener('sync', (e) => {
  if (e.tag === 'safescada-sync') e.waitUntil(self.clients.matchAll().then((cs) => cs.forEach((c) => c.postMessage({ type: 'SYNC' }))));
});
