/* Service worker: aplikacja działa offline, okładki zapamiętywane po pierwszym wyświetleniu. */
const VERSION = 'v1';
const FILES = [
  './', 'index.html', 'style.css', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
  'core/db.js', 'core/app.js', 'core/sync.js',
  'moduly/planszowki/dane-bgg.js', 'moduly/planszowki/planszowki.js'
  , 'moduly/sprzedaz/sprzedaz.js', 'moduly/sprzedaz/sprzedaz-ui.js'
  ,'moduly/komiksy/komiksy.js', 'moduly/komiksy/dane-komiksy.js', 'moduly/komiksy/dane-mro.js'
  // moduły dopisują tu swoje pliki
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open('app-' + VERSION).then(c => Promise.all(FILES.map(f => c.add(f).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('app-') && k !== 'app-' + VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.destination === 'image') {
    // okładki: najpierw z pamięci, potem z sieci (i zapamiętaj)
    e.respondWith(caches.open('okladki').then(async c => {
      const hit = await c.match(req);
      if (hit) return hit;
      try { const res = await fetch(req); if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res; }
      catch (err) { return hit || Response.error(); }
    }));
    return;
  }
  if (url.origin === location.origin) {
    // pliki aplikacji: najpierw sieć (żeby dostawać aktualizacje), offline z pamięci
    e.respondWith(fetch(req).then(res => { const cp = res.clone(); caches.open('app-' + VERSION).then(c => c.put(req, cp)); return res; })
      .catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
  }
});
