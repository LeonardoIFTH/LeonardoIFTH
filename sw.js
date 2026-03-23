
const CACHE = 'ifth-metais-v7';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './db.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((k) => (k === CACHE ? null : caches.delete(k)))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isAppShell = isSameOrigin && (
    url.pathname.endsWith('/') ||
    url.pathname.endsWith('/index.html') ||
    url.pathname.endsWith('/styles.css') ||
    url.pathname.endsWith('/app.js') ||
    url.pathname.endsWith('/db.js') ||
    url.pathname.endsWith('/manifest.json')
  );

  // App shell: network-first para trazer atualizações do código.
  if (isAppShell) {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const fresh = await fetch(e.request);
        cache.put(e.request, fresh.clone());
        return fresh;
      } catch {
        const cached = await cache.match(e.request);
        return cached || new Response('Offline', { status: 503 });
      }
    })());
    return;
  }

  // Demais requests: cache-first com fallback de rede.
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(e.request);
    if (cached) return cached;
    try {
      const response = await fetch(e.request);
      if (isSameOrigin) cache.put(e.request, response.clone());
      return response;
    } catch {
      return new Response('Offline', { status: 503 });
    }
  })());
});
