
const CACHE = 'hidro-pwa-v5';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './db.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event)=>{
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event)=>{
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => k===CACHE? null : caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event)=>{
  const { request } = event;
  // Only GET
  if(request.method !== 'GET') return;
  event.respondWith((async ()=>{
    const cached = await caches.match(request);
    if(cached) return cached;
    try{
      const response = await fetch(request);
      // Cache same-origin files
      const url = new URL(request.url);
      if(url.origin === location.origin){
        const cache = await caches.open(CACHE);
        cache.put(request, response.clone());
      }
      return response;
    }catch(e){
      return cached || new Response('Offline', {status: 503, statusText:'Offline'});
    }
  })());
});
