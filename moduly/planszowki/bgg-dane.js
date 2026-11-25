/* Dane z oficjalnego API BoardGameGeek (plik bgg.json, odświeżany raz dziennie przez GitHub Actions – .github/workflows/bgg.yml).
 * Klucz API BGG jest tylko w sekrecie repozytorium (MOJA_KOLEKCJA), aplikacja go nie zna: czyta gotowy plik bgg.json z GitHub Pages.
 *
 * Co robi z danymi:
 *  - uzupełnia karty gier: pełna okładka, liczba graczy, czas gry, wiek, ciężar, ocena BGG, partie i Twoja ocena z BGG,
 *    gra bazowa dodatku. Pola zmienione ręcznie w aplikacji NIE są nadpisywane (pamiętamy w g.bggAuto, co wpisało BGG).
 *  - dodaje nowe gry z kolekcji BGG (posiadane i z listy życzeń), których nie ma w aplikacji (ani nie zostały w niej usunięte).
 *  - podmienia przybliżone dane Wieczoru gier (dane-gracze.js) i dokłada aktualne mechaniki, kategorie, autorów i dodatki
 *    do danych „Gry plus” (dane-gry.js, stan z 2022) – window.WIECZOR_DANE i window.GRY_DANE.
 * Dane trzymamy też lokalnie (DB.local 'bggDane'), więc działa bez internetu.
 */
(function () {
  const PAGES = 'https://silent3182.github.io/Silent_comicsandboardgames/';
  const URL_JSON = /github\.io$/.test(location.hostname) ? 'bgg.json' : PAGES + 'bgg.json';
  const CO_ILE = 6 * 3600e3;   // sprawdzaj nowy plik najwyżej co 6 godzin (albo ręcznie w Ustawieniach)
  const POLA = ['image', 'thumb', 'minPlayers', 'maxPlayers', 'playTime', 'minAge', 'weight', 'bggRating', 'bggRank', 'year', 'bggPlays', 'myRating', 'baseBggId'];
  let dane = null, trwa = null;

  const pusty = v => v == null || v === '' || (typeof v === 'number' && isNaN(v));
  const zBgg = u => typeof u === 'string' && /(^|\.)geekdo-images\.com\//.test(u.replace(/^https?:\/\//, ''));

  /* Wartości z BGG dla jednej gry (x = szczegóły z bgg.json, k = wpis z kolekcji) */
  function wartosci(x, k) {
    const v = {};
    if (x) {
      if (x.img || x.th) { v.image = x.img || x.th; v.thumb = x.th || x.img; }
      if (x.p) { v.minPlayers = x.p[0] || null; v.maxPlayers = x.p[1] || x.p[0] || null; }
      v.playTime = x.czas || x.czasDo || x.czasOd || null;
      v.minAge = x.wiek || null; v.weight = x.w || null; v.bggRating = x.r || null; v.bggRank = x.rank || null; v.year = x.y || null;
      if (x.exp && x.baza && x.baza.length) v.baseBggId = x.baza[0];
    }
    if (k) { v.bggPlays = k.plays || 0; if (k.rating) v.myRating = k.rating; }
    return v;
  }

  /* Uzupełnij jedną grę; zwraca true, gdy coś się zmieniło. Nadpisujemy tylko puste pola i te, które wcześniej wpisało BGG. */
  function uzupelnij(g, v) {
    const auto = Object.assign({}, g.bggAuto || {});
    // gry z pierwszego importu z BGG (dane-bgg.js): te pola przyszły z BGG, więc można je odświeżać
    if (!g.bggAuto && g.source === 'bgg') {
      ['image', 'thumb', 'bggPlays', 'bggRating', 'weight', 'year'].concat(g.updatedAt === g.createdAt ? ['myRating'] : []).forEach(f => { if (!pusty(g[f])) auto[f] = g[f]; });
    }
    let zm = false;
    for (const f of POLA) {
      if (!(f in v) || pusty(v[f])) continue;
      const moje = !pusty(g[f]) && g[f] !== auto[f] && !((f === 'image' || f === 'thumb') && zBgg(g[f]));
      if (moje || g[f] === v[f]) { if (!moje && auto[f] !== v[f]) { auto[f] = v[f]; zm = true; } continue; }
      g[f] = v[f]; auto[f] = v[f]; zm = true;
    }
    if (zm) g.bggAuto = auto;
    return zm;
  }

  /* Zastosuj bgg.json do bazy (tylko gdy plik jest nowszy niż ostatnio zastosowany) */
  async function zastosuj(d, wymus) {
    if (!d || !d.gry) return 0;
    wzbogac(d);
    if (!wymus && await DB.local('bggDane.zastosowano') === d.pobrano) return 0;
    if (window.Planszowki && window.Planszowki.importBgg) await window.Planszowki.importBgg(false);
    const wszystkie = await DB.all('games', { withDeleted: true });
    const kol = new Map((d.kolekcja || []).map(k => [k.id, k]));
    const zmiany = [];
    for (const g of wszystkie) {
      if (g.deleted || !g.bggId) continue;
      const x = d.gry[g.bggId], k = kol.get(g.bggId);
      if (!x && !k) continue;
      const ng = Object.assign({}, g);
      let zm = uzupelnij(ng, wartosci(x, g.source === 'bgg' || g.status === 'owned' || g.status === 'forSale' ? k : null));
      if (x && g.isExpansion == null) { ng.isExpansion = !!x.exp; zm = true; }
      if (zm) zmiany.push(ng);
    }
    // nowe pozycje z kolekcji BGG
    const znane = new Set(wszystkie.map(g => g.bggId).filter(Boolean));
    for (const k of kol.values()) {
      if (znane.has(k.id) || !(k.own || k.wish || k.pre)) continue;
      const x = d.gry[k.id] || {};
      const g = { id: 'bgg-' + k.id, bggId: k.id, title: k.t || x.t || ('BGG ' + k.id), isExpansion: !!(k.exp || x.exp),
        status: k.own ? 'owned' : 'wishlist', notes: k.comment || '', tags: [], source: 'bgg',
        minPlayers: null, maxPlayers: null, playTime: null };
      uzupelnij(g, wartosci(x, k));
      zmiany.push(g);
    }
    if (zmiany.length) await DB.putMany('games', zmiany);
    await DB.local('bggDane.zastosowano', d.pobrano);
    return zmiany.length;
  }

  /* Podmień dane przybliżone (Wieczór gier) i dołóż aktualne dane do „Gry plus” */
  function wzbogac(d) {
    const W = window.WIECZOR_DANE || (window.WIECZOR_DANE = { gry: {} });
    W.zrodlo = 'BoardGameGeek'; W.data = String(d.pobrano || '').slice(0, 10);
    const G = window.GRY_DANE || (window.GRY_DANE = { mech: [], kat: [], aut: [], gry: {}, baza: {}, dodatki: {}, kand: [] });
    const idx = (lista, nazwa) => { let i = lista.indexOf(nazwa); if (i < 0) { i = lista.length; lista.push(nazwa); } return i; };
    const nazwa = {}; Object.entries(d.gry).forEach(([id, x]) => { nazwa[id] = x.t; });
    for (const [id, x] of Object.entries(d.gry)) {
      const p = x.p || [], b = x.best || [];
      if (!x.exp && (p[0] || x.czas)) W.gry[id] = [p[0] || 1, p[1] || p[0] || 99, x.czas || x.czasDo || null, b[0] || null, b[1] || null];
      if (x.m || x.c || x.d) G.gry[id] = { m: (x.m || []).map(m => idx(G.mech, m)), c: (x.c || []).map(c => idx(G.kat, c)), d: (x.d || []).map(a => idx(G.aut, a)), p: [p[0] || null, p[1] || null], t: x.czas || null };
      if (x.exp && x.baza && x.baza[0]) G.baza[id] = x.baza[0];
      if (!x.exp && x.dod && x.dod.length) G.dodatki[id] = x.dod.map(e => e[1]);
    }
    G.zrodloBgg = 'BoardGameGeek (API, ' + W.data + ')';
  }

  /* Pobierz bgg.json (najwyżej co 6 h), zapamiętaj i zastosuj. Bez internetu – dane z pamięci urządzenia. */
  async function odswiez(wymus) {
    if (trwa) return trwa;
    trwa = (async () => {
      if (!dane) dane = await DB.local('bggDane').catch(() => null) || null;
      const spr = await DB.local('bggDane.sprawdzono').catch(() => 0) || 0;
      let blad = null;
      if (wymus || !dane || Date.now() - spr > CO_ILE) {
        try {
          const r = await fetch(URL_JSON + '?t=' + Date.now(), { cache: 'no-store' });
          if (r.ok) {
            const nowe = await r.json();
            if (nowe && nowe.gry && (!dane || String(nowe.pobrano) >= String(dane.pobrano))) { dane = nowe; await DB.local('bggDane', nowe); }
          } else if (r.status === 404) blad = 'Plik z danymi BGG jeszcze nie powstał (czeka na klucz API w sekretach repozytorium).';
          else blad = 'Nie udało się pobrać danych z BGG (' + r.status + ').';
          await DB.local('bggDane.sprawdzono', Date.now());
        } catch (e) { blad = 'Brak połączenia – używam zapisanych danych z BGG.'; }
      }
      const n = dane ? await zastosuj(dane, wymus) : 0;
      return { n, blad, dane };
    })().finally(() => { trwa = null; });
    return trwa;
  }

  /* Logo „Powered by BGG” z linkiem do BoardGameGeek – wymagane przez zasady API BGG dla aplikacji, które z niego korzystają.
     Pokazujemy je tam, gdzie są dane z BGG: lista gier, karta gry, Ustawienia. */
  function logo() {
    css();
    return '<p class="bgg-logo"><a href="https://boardgamegeek.com/" target="_blank" rel="noopener" title="Dane o grach: BoardGameGeek">'
      + '<img src="icons/powered-by-bgg.png" alt="Powered by BGG" width="136" height="40"></a></p>';
  }
  function css() {
    if (document.getElementById('bgg-css')) return;
    const st = document.createElement('style'); st.id = 'bgg-css';
    st.textContent = '.bgg-logo{margin:18px 0 6px;text-align:center}.bgg-logo a{display:inline-block;padding:4px 10px;border-radius:10px;background:#fff;line-height:0}'
      + '.bgg-logo img{height:40px;width:auto;display:block}';
    document.head.appendChild(st);
  }

  /* Karta w Ustawieniach */
  function karta() {
    const d = dane;
    const ile = d ? Object.keys(d.gry || {}).length : 0;
    return `<h2>Dane z BoardGameGeek</h2>
      <div class="card bgg-karta">
        <p>${d ? `Kolekcja <b>${App.ui.esc(d.user || 'Silent82')}</b> z API BGG · ${ile} ${ile === 1 ? 'gra' : (ile % 10 >= 2 && ile % 10 <= 4 && (ile % 100 < 10 || ile % 100 >= 20)) ? 'gry' : 'gier'} · stan z ${App.ui.fmtDate(String(d.pobrano).slice(0, 10))}.`
          : 'Brak danych z API BGG. Pojawią się, gdy klucz BGG zostanie dodany jako sekret <b>MOJA_KOLEKCJA</b> w repozytorium aplikacji (odświeżanie raz dziennie).'}</p>
        <p class="muted" style="font-size:13px">Uzupełnia okładki, liczbę graczy, czas, mechaniki i dodatki oraz dodaje nowe gry z kolekcji BGG. Pola zmienione ręcznie w aplikacji zostają.</p>
        <p class="row"><button id="bggOdsw">Odśwież dane z BGG</button></p>
        <p class="muted" id="bggStan"></p>
        ${logo()}
      </div>`;
  }
  function hook() {
    const m = (App.modules || []).find(x => x.id === 'ustawienia');
    if (!m || m._bgg) return !!m;
    const orig = m.render; m._bgg = true;
    m.render = async function (el, ...rest) {
      await orig.call(this, el, ...rest);
      if (!dane) dane = await DB.local('bggDane').catch(() => null) || null;
      const box = document.createElement('div'); box.innerHTML = karta();
      const o = [...el.querySelectorAll('h2')].find(h => /O aplikacji/.test(h.textContent));
      o ? o.before(...box.childNodes) : el.append(...box.childNodes);
      const b = el.querySelector('#bggOdsw');
      if (b) b.onclick = async () => {
        b.disabled = true; el.querySelector('#bggStan').textContent = 'Sprawdzam…';
        const r = await odswiez(true);
        b.disabled = false;
        el.querySelector('#bggStan').textContent = r.blad || (r.n ? 'Zaktualizowano pozycji: ' + r.n : 'Wszystko aktualne.');
        if (!r.blad && r.n) App.ui.toast('Dane z BGG: zaktualizowano ' + r.n);
      };
    };
    return true;
  }
  if (!hook()) document.addEventListener('DOMContentLoaded', hook);

  window.BggDane = { odswiez, zastosuj, uzupelnij, logo, get: () => dane };
  window.addEventListener('load', () => setTimeout(() => odswiez(false).then(r => { if (r.n && App.refresh) App.refresh(); }).catch(() => {}), 1500));
})();
