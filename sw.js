/* Service worker: aplikacja działa offline, okładki zapamiętywane po pierwszym wyświetleniu. */
const VERSION = 'v28';
const FILES = [
  './', 'index.html', 'style.css', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/powered-by-bgg.png', 'icons/icon-maskable-512.png',
  'core/db.js', 'core/app.js', 'core/sync.js', 'core/ikony.js', 'core/start.js', 'core/wyglad.js', 'core/splash.js', 'core/przewijanie.js', 'core/lista.js', 'core/okladki.js',
  'moduly/planszowki/dane-bgg.js', 'moduly/tytuly/dane-tytuly.js', 'moduly/tytuly/tytuly.js', 'moduly/planszowki/planszowki.js', 'moduly/planszowki/bgg-dane.js', 'moduly/planszowki/szukaj-gier.js'
  , 'moduly/sprzedaz/sprzedaz.js', 'moduly/sprzedaz/sprzedaz-ui.js'
  ,'moduly/komiksy/komiksy.js', 'moduly/komiksy/dane-komiksy.js', 'moduly/komiksy/dane-mro.js', 'moduly/komiksy/zapowiedzi.js'
  ,'moduly/wieczor/dane-gracze.js', 'moduly/wieczor/wieczor.js', 'moduly/wieczor/kto-zaczyna.js', 'moduly/postep/postep.js', 'moduly/kopia/kopia.js'
  ,'moduly/sklep/skaner.js', 'moduly/sklep/sklep.js', 'moduly/sklep/zxing.min.js', 'moduly/wypozyczenia/wypozyczenia.js', 'moduly/wartosc/wyceny.js', 'moduly/wartosc/wartosc.js'
  ,'moduly/gracze/wspolne.js', 'moduly/gracze/gracze.js', 'moduly/licznik/licznik.js', 'moduly/zegar/zegar.js', 'moduly/wyzwania/wyzwania.js', 'moduly/podsumowanie/podsumowanie.js', 'moduly/skroty/skroty.js'
  ,'moduly/polki/polki.js', 'moduly/polki/zdjecia.js', 'moduly/wishlista/wishlista.js', 'moduly/powiadomienia/powiadomienia.js', 'moduly/widzet/widzet.js'
  ,'moduly/kalendarz/kalendarz.js'
  ,'moduly/przy-grze/rozmiary.js', 'moduly/przy-grze/aparat.js', 'moduly/przy-grze/import-partii.js', 'moduly/przy-grze/przy-grze.js'
  ,'moduly/historia/historia.js', 'moduly/udostepnij/udostepnij.js', 'moduly/asystent/asystent.js', 'kolekcja.html'
  ,'moduly/gry-plus/dane-gry.js', 'moduly/gry-plus/wspolne.js', 'moduly/gry-plus/rekomendacje.js', 'moduly/gry-plus/dodatki.js', 'moduly/gry-plus/kampanie.js', 'moduly/gry-plus/wymiana.js', 'moduly/gry-plus/przypomnienia.js', 'moduly/gry-plus/pudelka.js', 'moduly/gry-plus/ciemny-stol.js'
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
    e.respondWith(fetch(req, { cache: 'no-cache' }).then(res => { const cp = res.clone(); caches.open('app-' + VERSION).then(c => c.put(req, cp)); return res; })
      .catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
  }
});
// kliknięcie powiadomienia (moduł powiadomienia): otwórz aplikację na właściwej zakładce
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const go = e.notification.data && e.notification.data.go;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const c = list[0];
    if (c) { c.postMessage({ go }); return c.focus(); }
    return self.clients.openWindow(go ? './#/' + go : './');
  }));
});
