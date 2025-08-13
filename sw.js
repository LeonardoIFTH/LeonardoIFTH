
const CACHE='ifth-metais-v5';
const ASSETS=['./','./index.html','./styles.css','./app.js','./db.js','./manifest.json','./icons/icon-192.png','./icons/icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))); self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.map(k=>k===CACHE?null:caches.delete(k))))); self.clients.claim();});
self.addEventListener('fetch',e=>{ if(e.request.method!=='GET') return;
  e.respondWith((async()=>{ const cached=await caches.match(e.request); if(cached) return cached; try{ const r=await fetch(e.request); const url=new URL(e.request.url); if(url.origin===location.origin){ const c=await caches.open(CACHE); c.put(e.request, r.clone()); } return r; }catch{ return cached || new Response('Offline',{status:503}); } })());
});
