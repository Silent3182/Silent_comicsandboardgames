/* Wyszukiwarka gier spoza kolekcji i dodawanie ich do aplikacji (window.SzukajGier).
 * Źródła (bez klucza API w przeglądarce – zasady BGG):
 *  - bgg-gry.json: lista gier z oficjalnego zrzutu rankingów BGG (id, nazwa, rok, ranking, liczba ocen, dodatek),
 *    odświeżana raz w tygodniu przez GitHub Actions (pobierz_bgg.py). Zapamiętana w urządzeniu – działa też offline.
 *  - Wikidane: polskie tytuły i okładki (np. „Wsiąść do pociągu” → Ticket to Ride), tylko z internetem.
 * Dodana gra dostaje id 'bgg-<numer BGG>'. Szczegóły (gracze, czas, okładka) dociągnie bgg-dane.js, gdy gra trafi
 * do kolekcji na BGG (API BGG pozwala tylko czytać – zaznaczyć „own” trzeba na stronie BGG, przycisk „Otwórz na BGG”).
 *
 *   SzukajGier.szukaj(q, { online: true, limit: 12 }) -> [{ bggId, title, alt, year, rank, exp, image, minPlayers, maxPlayers }]
 *   SzukajGier.dodaj(hit, status)  -> rekord gry ('owned' | 'wishlist' | 'played'); istniejącą grę zwraca (i ewentualnie przenosi do kolekcji)
 *   SzukajGier.wiersz(hit, przyciski) -> HTML wiersza wyniku
 */
(function () {
  const PAGES = 'https://silent3182.github.io/Silent_comicsandboardgames/';
  const URL_JSON = /github\.io$/.test(location.hostname) ? 'bgg-gry.json' : PAGES + 'bgg-gry.json';
  const esc = s => App.ui.esc(s);
  let lista = null, wczyt = null;

  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l')
    .replace(/[^a-z0-9]+/g, ' ').trim();

  /* Lista gier BGG: z pamięci urządzenia, a co tydzień (albo gdy brak) świeża z sieci */
  function wczytaj() {
    if (lista) return Promise.resolve(lista);
    return wczyt || (wczyt = (async () => {
      let d = await DB.local('bggGry').catch(() => null);
      const stara = !d || Date.now() - (d.sprawdzono || 0) > 7 * 864e5;
      if (stara && navigator.onLine !== false) {
        try {
          const r = await fetch(URL_JSON + '?t=' + Date.now(), { cache: 'no-store' });
          if (r.ok) { const n = await r.json(); if (n && n.gry) { d = { pobrano: n.pobrano, gry: n.gry, sprawdzono: Date.now() }; DB.local('bggGry', d).catch(() => {}); } }
        } catch (e) { }
      }
      lista = d && d.gry ? d.gry.map(g => ({ g, n: norm(g[1]) })) : [];
      return lista;
    })().finally(() => { wczyt = null; }));
  }

  /* Szukanie w liście BGG: dokładnie > początek tytułu > początek słowa > fragment; gry przed dodatkami; potem popularność (liczba ocen) */
  function wLiscie(q, limit) {
    const f = norm(q); if (!f || !lista) return [];
    const wyn = [];
    for (const x of lista) {
      const i = x.n.indexOf(f); if (i < 0) continue;
      const pkt = x.n === f ? 0 : i === 0 ? 1 : x.n[i - 1] === ' ' ? 2 : 3;
      wyn.push([pkt, x.g]);
      if (wyn.length > 4000) break;
    }
    wyn.sort((a, b) => a[0] - b[0] || a[1][5] - b[1][5] || b[1][4] - a[1][4]); // gry przed dodatkami
    return wyn.slice(0, limit).map(([, g]) => ({ bggId: g[0], title: g[1], year: g[2] || null, rank: g[3] || null, exp: !!g[5] }));
  }

  /* Wikidane – polskie tytuły i okładki (tylko pozycje z numerem BGG, P2339) */
  async function wikidane(q) {
    const W = 'https://www.wikidata.org/w/api.php?format=json&origin=*';
    const s = await (await fetch(`${W}&action=wbsearchentities&type=item&limit=25&language=pl&uselang=pl&search=${encodeURIComponent(q)}`)).json();
    const ids = (s.search || []).map(x => x.id);
    if (!ids.length) return [];
    const e = await (await fetch(`${W}&action=wbgetentities&props=claims|labels&languages=pl|en|mul|de|fr&ids=${ids.join('|')}`)).json();
    const val = (x, p) => x.claims[p] && x.claims[p][0].mainsnak.datavalue ? x.claims[p][0].mainsnak.datavalue.value : null;
    return ids.map(id => e.entities[id]).filter(x => x && x.claims && x.claims.P2339).map(x => {
      const t = val(x, 'P577'), img = val(x, 'P18'), mn = val(x, 'P1872'), mx = val(x, 'P1873');
      return { bggId: Number(val(x, 'P2339')), title: (x.labels.pl || x.labels.en || x.labels.mul || x.labels.de || x.labels.fr || {}).value || '',
        year: t && t.time ? Number(t.time.slice(1, 5)) : null,
        image: img ? 'https://commons.wikimedia.org/wiki/Special:FilePath/' + encodeURIComponent(img) + '?width=300' : null,
        minPlayers: mn ? Number(mn.amount) : null, maxPlayers: mx ? Number(mx.amount) : null };
    }).filter(g => g.bggId && g.title);
  }

  async function szukaj(q, opt = {}) {
    const limit = opt.limit || 12;
    await wczytaj();
    const zListy = wLiscie(q, limit);
    let zWiki = [];
    if (opt.online !== false && navigator.onLine !== false && norm(q).length >= 3) { try { zWiki = await wikidane(q); } catch (e) { } }
    // scal po numerze BGG: tytuł z BGG, polski tytuł z Wikidanych jako drugi, okładka i gracze z Wikidanych
    const m = new Map();
    zWiki.forEach(w => m.set(w.bggId, Object.assign({}, w)));
    zListy.forEach(b => {
      const w = m.get(b.bggId);
      if (w) { const alt = norm(w.title) !== norm(b.title) ? w.title : null; m.set(b.bggId, Object.assign(w, b, { alt })); }
      else m.set(b.bggId, b);
    });
    // najpierw to, co pasuje z listy BGG (popularność), potem reszta z Wikidanych
    const kol = zListy.map(b => m.get(b.bggId)).concat(zWiki.filter(w => !zListy.some(b => b.bggId === w.bggId)).map(w => m.get(w.bggId)));
    return kol.slice(0, limit);
  }

  async function dodaj(hit, status) {
    status = status || 'owned';
    const gry = await DB.all('games');
    const ex = gry.find(g => g.bggId === hit.bggId);
    if (ex) {
      // gra była zapisana jako „grana u innych” – teraz trafia do kolekcji / na listę życzeń
      if (status !== 'played' && (ex.status === 'played' || (ex.status === 'wishlist' && status === 'owned'))) return DB.put('games', Object.assign({}, ex, { status }));
      return ex;
    }
    const rec = { id: 'bgg-' + hit.bggId, bggId: hit.bggId, title: hit.title, year: hit.year || null, isExpansion: !!hit.exp, status,
      notes: '', tags: [], source: 'bgg-szukaj', minPlayers: hit.minPlayers || null, maxPlayers: hit.maxPlayers || null, playTime: null,
      image: hit.image || null, thumb: hit.image || null };
    if (hit.alt) rec.altTitle = hit.alt;
    const usun = (await DB.all('games', { withDeleted: true })).find(g => g.id === rec.id);
    if (usun) rec.createdAt = usun.createdAt;   // wcześniej usunięta – przywracamy pod tym samym id
    const zapis = await DB.put('games', Object.assign({}, usun || {}, rec, { deleted: false }));
    // gdy bgg.json zna już tę grę (np. jest na BGG w kolekcji), od razu uzupełnij szczegóły
    if (window.BggDane && window.BggDane.get()) window.BggDane.zastosuj(window.BggDane.get(), true).catch(() => {});
    return zapis;
  }

  function wiersz(hit, przyciski) {
    const opis = [hit.alt ? esc(hit.alt) : '', hit.year || '', hit.exp ? 'dodatek' : '', hit.rank ? 'ranking #' + hit.rank : ''].filter(Boolean).join(' · ');
    return `<div class="sg-w">${hit.image ? `<img src="${esc(hit.image)}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'ph',textContent:'🎲'}))">` : '<span class="ph">🎲</span>'}
      <span class="sg-t"><b>${esc(hit.title)}</b>${opis ? `<small>${opis}</small>` : ''}</span><span class="sg-b">${przyciski || ''}</span></div>`;
  }
  function css() {
    if (document.getElementById('sg-css')) return;
    const st = document.createElement('style'); st.id = 'sg-css';
    st.textContent = '.sg-w{display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--line)}'
      + '.sg-w img,.sg-w .ph{width:44px;height:44px;flex:0 0 44px;object-fit:contain;border-radius:8px;background:var(--surface2);display:flex;align-items:center;justify-content:center}'
      + '.sg-t{flex:1;min-width:0;display:flex;flex-direction:column}.sg-t b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sg-t small{color:var(--muted);font-size:12.5px}'
      + '.sg-b{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}.sg-b button{white-space:nowrap}.sg-head{margin:14px 0 4px;font-size:13px;color:var(--muted)}'
      + '@media (max-width:640px){.sg-w{flex-wrap:wrap}.sg-b{flex-basis:100%;padding-left:54px;justify-content:flex-start}}';
    document.head.appendChild(st);
  }
  const otworzBgg = id => { const u = 'https://boardgamegeek.com/boardgame/' + id; const w = window.open(u, '_blank'); if (w) w.opener = null; else location.href = u; };

  window.SzukajGier = { szukaj, dodaj, wiersz, css, wczytaj, otworzBgg, norm };
})();
