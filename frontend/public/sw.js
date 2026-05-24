const CACHE = 'factureasy-v2';
const SHELL = ['/', '/index.html'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;

  // API → Network-First (pas de cache d'assets JS/CSS ici)
  if (/^\/(factures|finances|auth|stats|sirene|relances|admin|stripe)/.test(url.pathname)) {
    e.respondWith(
      fetch(e.request.clone()).then(r => {
        if (r.ok) {
          const rClone = r.clone();
          caches.open(CACHE).then(c => c.put(e.request, rClone));
        }
        return r;
      }).catch(() =>
        caches.match(e.request).then(c =>
          c || new Response(
            JSON.stringify({ error: 'Hors ligne', offline: true }),
            { status: 503, headers: { 'Content-Type': 'application/json' } }
          )
        )
      )
    );
    return;
  }

  // Assets statiques → Cache-First avec clone correct
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(r => {
        if (r.ok) {
          const rClone = r.clone(); // cloner AVANT de retourner
          caches.open(CACHE).then(cache => cache.put(e.request, rClone));
        }
        return r;
      }).catch(() => caches.match('/index.html'));
    })
  );
});
