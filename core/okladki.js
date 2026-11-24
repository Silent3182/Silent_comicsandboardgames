/* Pamięć podręczna okładek (gry z BGG, tomy z lubimyczytac.pl itd.).
 *  - Przeglądarka / komputer: okładki zapamiętuje service worker (sw.js, pamięć „okladki”) przy pierwszym wyświetleniu.
 *  - Telefon (APK): service worker tam nie działa, więc robi to ten plik: okładka wyświetlona raz trafia do pamięci
 *    (Cache Storage „okladki”, pobrana natywnie przez CapacitorHttp – bez blokady CORS), a przy następnym razie
 *    pokazuje się od razu z pamięci, także bez internetu.
 *  - Ustawienia › „Okładki offline”: ile okładek jest w pamięci, „Pobierz brakujące” (cała kolekcja naraz), „Wyczyść”.
 * Obrazki w modułach zostają zwykłymi <img loading="lazy" src="…"> – nic nie trzeba zmieniać.
 */
(function () {
  const NAZWA = 'okladki';
  const native = () => !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  const http = () => native() && window.Capacitor.Plugins && window.Capacitor.Plugins.CapacitorHttp;
  const zewn = src => !!src && /^https?:\/\//i.test(src) && !src.startsWith(location.origin);
  const mem = new Map(); // adres -> blob: URL (w tej sesji)

  async function zPamieci(url) {
    if (!('caches' in window)) return null;
    const r = await (await caches.open(NAZWA)).match(url);
    if (!r) return null;
    const b = await r.blob();
    return b.size ? URL.createObjectURL(b) : null; // pusta = zapis „opaque” z przeglądarki, w APK bezużyteczna
  }
  function b64Blob(b64, typ) {
    const s = atob(b64), u = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
    return new Blob([u], { type: typ });
  }
  /* Pobranie jednej okładki do pamięci. APK: natywnie; przeglądarka: zwykłe zapytanie (bez CORS → odpowiedź „opaque”,
   * której używa service worker). Zwraca true, gdy zapisano. */
  async function zapisz(url) {
    if (!('caches' in window)) return false;
    const c = await caches.open(NAZWA);
    const H = http();
    if (H) {
      const r = await H.get({ url, responseType: 'blob', connectTimeout: 15000, readTimeout: 20000 });
      if (r.status !== 200 || !r.data) return false;
      const h = r.headers || {}; const typ = h['Content-Type'] || h['content-type'] || 'image/jpeg';
      if (!/^image\//.test(typ)) return false;
      await c.put(url, new Response(b64Blob(r.data, typ), { headers: { 'content-type': typ } }));
      return true;
    }
    const res = await fetch(url, { mode: 'no-cors', credentials: 'omit' });
    if (!(res.ok || res.type === 'opaque')) return false;
    await c.put(new Request(url, { mode: 'no-cors' }), res);
    return true;
  }

  /* Kolejka zapisów w tle (APK), po 2 naraz, żeby nie przycinać przewijania. */
  const kolejka = [], wKolejce = new Set(); let biegnie = 0;
  function doKolejki(url) {
    if (wKolejce.has(url)) return;
    wKolejce.add(url); kolejka.push(url); dalej();
  }
  function dalej() {
    while (biegnie < 2 && kolejka.length) {
      const url = kolejka.shift(); biegnie++;
      zapisz(url).catch(() => {}).finally(() => { biegnie--; dalej(); });
    }
  }

  /* APK: każdy nowy <img> z zewnętrzną okładką najpierw szuka jej w pamięci. */
  function obsluz(img) {
    const src = img.getAttribute('src');
    if (!zewn(src) || img.dataset.okl) return;
    if (mem.has(src)) { img.src = mem.get(src); return; }
    img.dataset.okl = src;
    img.removeAttribute('src'); // zanim przeglądarka zacznie pobierać (obrazki „lazy” czekają do rysowania)
    zPamieci(src).then(u => {
      if (u) { mem.set(src, u); img.src = u; }
      else { img.src = src; if (navigator.onLine !== false) doKolejki(src); }
    }).catch(() => { img.src = src; });
  }
  function start() {
    if (!native() || !('caches' in window) || !window.MutationObserver) return;
    const mo = new MutationObserver(lista => {
      for (const m of lista) for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue;
        if (n.tagName === 'IMG') obsluz(n);
        else if (n.getElementsByTagName) { const imgs = n.getElementsByTagName('img'); for (let i = 0; i < imgs.length; i++) obsluz(imgs[i]); }
      }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
    document.querySelectorAll('img').forEach(obsluz);
  }
  start();

  /* ---------- wszystkie okładki kolekcji ---------- */
  async function adresy() {
    const out = new Set();
    const dodaj = x => { [x.thumb, x.image].forEach(u => { if (zewn(u)) out.add(u); }); };
    (await DB.all('games')).forEach(dodaj);
    (await DB.all('comics')).forEach(dodaj);
    return [...out];
  }
  async function stan() {
    const wszystkie = await adresy();
    let jest = 0;
    if ('caches' in window) {
      const c = await caches.open(NAZWA);
      const klucze = new Set((await c.keys()).map(r => r.url));
      jest = wszystkie.filter(u => klucze.has(u) || klucze.has(new URL(u).href)).length;
    }
    let mb = null;
    try { const e = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null; if (e && e.usage != null) mb = e.usage / 1048576; } catch (e) { }
    return { wszystkie, jest, mb };
  }
  let pobieranie = null;
  async function pobierzBrakujace(postep) {
    if (pobieranie) return pobieranie;
    pobieranie = (async () => {
      const c = await caches.open(NAZWA);
      const klucze = new Set((await c.keys()).map(r => r.url));
      const brak = (await adresy()).filter(u => !klucze.has(u));
      let ok = 0, zle = 0, i = 0;
      const rob = async () => { while (i < brak.length) { const u = brak[i++]; try { (await zapisz(u)) ? ok++ : zle++; } catch (e) { zle++; } if (postep) postep(ok + zle, brak.length); } };
      await Promise.all([rob(), rob(), rob(), rob()]);
      return { ok, zle, razem: brak.length };
    })();
    try { return await pobieranie; } finally { pobieranie = null; }
  }

  function karta(s) {
    const proc = s.wszystkie.length ? Math.round(s.jest / s.wszystkie.length * 100) : 100;
    return `<h2>Okładki offline</h2>
      <div class="card okl-card">
        <p>W pamięci tego urządzenia jest <b>${s.jest}</b> z ${s.wszystkie.length} okładek gier i komiksów (${proc}%).${s.mb != null ? ` Aplikacja zajmuje razem ok. ${s.mb.toFixed(s.mb < 10 ? 1 : 0).replace('.', ',')} MB.` : ''}</p>
        <p class="muted">Okładka, którą raz zobaczysz, zostaje w pamięci i potem pokazuje się od razu, także bez internetu. Możesz też pobrać wszystkie naraz, najlepiej przez Wi-Fi.</p>
        <p class="row"><button class="primary" id="oklPobierz" ${s.jest >= s.wszystkie.length ? 'disabled' : ''}>Pobierz brakujące (${s.wszystkie.length - s.jest})</button><button class="ghost" id="oklWyczysc">Wyczyść pamięć okładek</button></p>
        <p class="muted" id="oklStan"></p>
      </div>`;
  }
  async function wstaw(el) {
    if (!('caches' in window)) return;
    const box = document.createElement('div'); box.innerHTML = karta(await stan());
    el.append(...box.childNodes);
    const $ = s => el.querySelector(s);
    $('#oklPobierz').onclick = async e => {
      e.target.disabled = true;
      try {
        const r = await pobierzBrakujace((n, z) => { const p = $('#oklStan'); if (p) p.textContent = `Pobieram okładki: ${n} z ${z}…`; });
        App.ui.toast(r.zle ? `Pobrano ${r.ok} okładek, ${r.zle} się nie udało (brak internetu albo strona nie odpowiada)` : `Pobrano ${r.ok} okładek`, 4000);
      } catch (err) { App.ui.toast(err); }
      if (el.isConnected) App.refresh();
    };
    $('#oklWyczysc').onclick = async () => {
      if (!await App.ui.confirm('Wyczyścić pamięć okładek? Okładki pobiorą się znowu przy oglądaniu (potrzebny internet).')) return;
      await caches.delete(NAZWA); mem.forEach(u => URL.revokeObjectURL(u)); mem.clear();
      App.ui.toast('Wyczyszczono'); App.refresh();
    };
  }
  // karta na końcu zakładki Ustawienia (owijamy jej render, bez zmian w core/sync.js)
  function hook() {
    const m = (App.modules || []).find(x => x.id === 'ustawienia');
    if (!m || m._okladki) return !!m;
    const orig = m.render; m._okladki = true;
    m.render = async function (el, ...rest) { await orig.call(this, el, ...rest); try { await wstaw(el); } catch (e) { console.warn(e); } };
    return true;
  }
  if (!hook()) document.addEventListener('DOMContentLoaded', hook);

  window.Okladki = { zapisz, pobierzBrakujace, stan };
})();
