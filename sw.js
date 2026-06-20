/* Service worker de Pianova (PWA). Permite instalar y funcionar offline (lo sintetizado). */
const CACHE = 'pianova-v1';
const ASSETS = ['/', '/pianova.html', '/manifest.webmanifest', '/icon.svg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  // La página (navegación): red primero, caché de respaldo (así ves siempre la última versión).
  if (r.mode === 'navigate') {
    e.respondWith(
      fetch(r).then(res => { const cp = res.clone(); caches.open(CACHE).then(c => c.put('/', cp)); return res; })
              .catch(() => caches.match('/').then(h => h || caches.match('/pianova.html')))
    );
    return;
  }
  // Resto (mismo origen): caché primero, si no, red y se cachea.
  e.respondWith(caches.match(r).then(hit => hit || fetch(r).then(res => {
    try { if (new URL(r.url).origin === location.origin) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(r, cp)); } } catch (_) {}
    return res;
  })));
});
