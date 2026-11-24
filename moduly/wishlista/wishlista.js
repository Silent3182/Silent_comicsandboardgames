/* Moduł „Lista życzeń” (⭐): gry, które chcę kupić (games ze statusem 'wishlist'), import z BGG i pilnowanie cen.
 * Pola w games: wishPriority (1–5 jak na BGG), cenaDocelowa (zł), ceny = { data, min, max, sklepy, url, hist: [['RRRR-MM-DD', min], …] }, promo (bool)
 * Ceny: planszeo.pl (porównywarka polskich sklepów, gra dopasowana po numerze BGG).
 *  - Android (APK): telefon sam sprawdza ceny co 3 dni (CapacitorHttp – bez blokady CORS); wynik synchronizuje się na komputer.
 *  - Przeglądarka/Windows: strony sklepów są niedostępne (CORS), widać ceny sprawdzone przez telefon + linki.
 * Promocja: najniższa cena ≤ moja cena docelowa albo co najmniej 10% taniej niż średnio wcześniej.
 */
(function () {
  const esc = s => App.ui.esc(s);
  const BGG_USER = 'Silent82';
  const PLANSZEO = 'https://planszeo.pl';
  const DZIEN = 864e5;
  const PRIO = { 1: 'Muszę mieć', 2: 'Bardzo chcę', 3: 'Chciałbym mieć', 4: 'Zastanawiam się', 5: 'Nie kupować' };
  // Lista życzeń z BGG (Silent82), odczytana 24.11.2026 – wczytywana raz, potem „Import z BGG”
  const START = [[220308, 'Gaia Project', 2017, 3], [267743, 'The Manhattan Project: Energy Empire – Cold War', 2022, 3]];

  window.IKONY = Object.assign(window.IKONY || {}, { wishlista: '<path class="f" d="M12 20.5s-8-4.6-8-10.6A4.4 4.4 0 0 1 12 7.3a4.4 4.4 0 0 1 8 2.6c0 6-8 10.6-8 10.6z"/>' });
  window.IKONY_KOLOR = Object.assign(window.IKONY_KOLOR || {}, { wishlista: '#d6336c' });

  const http = () => { const C = window.Capacitor; return C && C.isNativePlatform && C.isNativePlatform() && C.Plugins && C.Plugins.CapacitorHttp; };
  async function get(url) {
    const r = await http().get({ url, responseType: 'text', headers: { 'Accept-Language': 'pl,en;q=0.8' } });
    if (r.status >= 400) throw new Error('HTTP ' + r.status);
    return { html: String(r.data || ''), url: r.url || url };
  }
  const un = s => { const t = document.createElement('textarea'); t.innerHTML = s; return t.value; };
  const zl = v => v == null ? '' : (+v).toFixed(2).replace('.', ',') + ' zł';
  const lsGet = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } };

  function css() {
    if (document.getElementById('wl-css')) return;
    const st = document.createElement('style'); st.id = 'wl-css';
    st.textContent = `
#main .wl-li{align-items:flex-start}
#main .wl-li img,#main .wl-li .ph{width:64px;height:64px}
#main .wl-li .t{white-space:normal}
#main .wl-promo{background:var(--bad);color:#fff;border-radius:999px;padding:2px 9px;font-size:12px;font-weight:700}
#main .wl-cena{font-weight:700;font-size:16px}
#main .wl-up{color:var(--bad)} #main .wl-down{color:var(--ok)}
#main .wl-links{display:flex;flex-wrap:wrap;gap:10px;font-size:13px;margin-top:4px}
#main .wl-act{display:flex;flex-direction:column;gap:6px;flex-shrink:0}
#main .wl-pr{display:inline-block;padding:1px 8px;border-radius:999px;background:var(--surface2);font-size:12px}
#main .wl-pr.p1,#main .wl-pr.p2{background:var(--accent-2-soft)}`;
    document.head.appendChild(st);
  }

  /* ---------- import z BGG ---------- */
  function parseBgg(html) {
    const out = [];
    html.split(/id=['"]row_/).slice(1).forEach(ch => {
      const a = ch.match(/href="\/boardgame(?:expansion)?\/(\d+)\/[^"]*"\s+class=['"]primary['"]\s*>([^<]+)<\/a>/);
      if (!a) return;
      const y = ch.match(/smallerfont dull['"]>\((\d{4})\)/);
      const p = ch.match(/Wishlist\s*\((\d)\)/i) || ch.match(/Lista życzeń\s*\((\d)\)/i);
      const img = ch.match(/src="(https:\/\/cf\.geekdo-images\.com\/[^"]+)"/);
      out.push([+a[1], un(a[2]).trim(), y ? +y[1] : null, p ? +p[1] : 3, img ? img[1] : null]);
    });
    return out;
  }
  function parseWklejone(txt) {
    // tekst skopiowany ze strony listy życzeń BGG: „Gaia Project (2017)” w osobnych liniach
    const out = [];
    String(txt || '').split(/\r?\n/).forEach(l => {
      const m = l.trim().match(/^(.{2,120}?)\s*\((\d{4})\)\s*$/);
      if (m && !/^(Title|Tytuł)/i.test(m[1])) out.push([null, m[1].trim(), +m[2], 3, null]);
    });
    return out;
  }
  async function dodajZBgg(rows) {
    const games = await DB.all('games', { withDeleted: true });
    const add = [];
    for (const [bggId, title, year, prio, img] of rows) {
      const ex = games.find(g => !g.deleted && ((bggId && g.bggId === bggId) || (!bggId && g.title.toLowerCase() === title.toLowerCase())));
      if (ex) {
        if (ex.status === 'wishlist' && prio && ex.wishPriority !== prio) add.push(Object.assign({}, ex, { wishPriority: prio }));
        continue; // już mam albo już jest na liście
      }
      add.push({ id: bggId ? 'wish-' + bggId : undefined, bggId, title, year, status: 'wishlist', wishPriority: prio || 3, image: img, thumb: img, source: 'bgg-wishlist', tags: [] });
    }
    if (add.length) await DB.putMany('games', add);
    return add.filter(a => !a.createdAt).length;
  }
  async function seed() {
    if (await DB.setting('wishlistaStart')) return;
    await dodajZBgg(START.map(r => r.concat([null])));
    await DB.setting('wishlistaStart', '2026-11-24');
  }
  async function importBgg() {
    const url = `https://boardgamegeek.com/collection/user/${BGG_USER}?wishlist=1&ff=1`;
    if (http()) {
      try {
        const { html } = await get(url);
        const rows = parseBgg(html);
        if (rows.length) { const n = await dodajZBgg(rows); App.ui.toast(n ? `Dodano ${n} z BGG` : `Lista życzeń z BGG (${rows.length}) jest już w aplikacji`); return; }
      } catch (e) { console.warn(e); }
      App.ui.toast('BGG nie odpowiedział – wklej listę ręcznie');
    }
    const out = await App.ui.form('Import listy życzeń z BGG', [
      { type: 'html', html: `<p style="margin:0 0 8px">1. Otwórz <a href="${url}" target="_blank" rel="noopener">listę życzeń ${BGG_USER} na BGG ↗</a><br>2. Zaznacz całą stronę (Ctrl+A), skopiuj (Ctrl+C)<br>3. Wklej poniżej. Aplikacja weźmie linie typu „Tytuł (2017)”.</p>` },
      { name: 'txt', label: 'Wklejony tekst', type: 'textarea', rows: 8 }
    ], { ok: 'Importuj' });
    if (!out) return;
    const rows = parseWklejone(out.txt);
    if (!rows.length) { App.ui.toast('Nie znalazłem tytułów z rokiem w nawiasie'); return; }
    const n = await dodajZBgg(rows);
    App.ui.toast(`Dodano ${n} ${n === 1 ? 'grę' : 'gier'}`);
  }

  /* ---------- ceny z planszeo.pl ---------- */
  function czytajStrone(html) {
    const n = re => { const m = html.match(re); return m ? +String(m[1]).replace(',', '.') : null; };
    const bgg = html.match(/boardgamegeek\.com\/boardgame(?:expansion)?\/(\d+)/);
    const img = html.match(/https:\/\/zdjecia\.planszeo\.pl\/[a-z0-9]+/);
    return { min: n(/"lowPrice"\s*:\s*"?([\d.,]+)/), max: n(/"highPrice"\s*:\s*"?([\d.,]+)/), sklepy: n(/"offerCount"\s*:\s*"?(\d+)/), bggId: bgg ? +bgg[1] : null, img: img ? img[0] : null };
  }
  async function znajdz(g) {
    if (g.ceny && g.ceny.url) { const { html } = await get(g.ceny.url); return Object.assign({ url: g.ceny.url }, czytajStrone(html)); }
    const pytania = [...new Set([g.title, g.title.split(/[:–-]/)[0].trim(), g.plTitle].filter(Boolean))];
    for (const q of pytania) {
      const r = await get(PLANSZEO + '/szukaj?q=' + encodeURIComponent(q));
      let kand = [];
      if (/\/gry-planszowe\/[^/?#]+\/?$/.test(r.url)) kand = [r.url];
      else kand = [...new Set([...r.html.matchAll(/id="ranking-collection-([a-z0-9-]+?)-mobile"/g)].map(m => m[1]))].slice(0, 5).map(s => PLANSZEO + '/gry-planszowe/' + s);
      for (const u of kand) {
        const s = u === r.url ? czytajStrone(r.html) : czytajStrone((await get(u)).html);
        if (!g.bggId || s.bggId === g.bggId) return Object.assign({ url: u }, s);
        await new Promise(res => setTimeout(res, 300));
      }
    }
    return null;
  }
  function czyPromo(g, min) {
    if (min == null) return false;
    if (g.cenaDocelowa && min <= g.cenaDocelowa) return true;
    const stare = ((g.ceny && g.ceny.hist) || []).slice(0, -1).map(h => h[1]).filter(Boolean);
    if (!stare.length) return false;
    const sr = stare.reduce((a, b) => a + b, 0) / stare.length;
    return min <= sr * 0.9;
  }
  let trwa = false;
  async function sprawdzCeny(cicho) {
    if (!http()) { if (!cicho) App.ui.toast('Ceny sprawdza telefon (aplikacja na Androidzie). Tu widać wynik po synchronizacji.'); return 0; }
    if (trwa) return 0; trwa = true;
    let n = 0; const dzis = App.ui.today(); const nowePromo = [];
    try {
      const lista = (await DB.all('games')).filter(g => g.status === 'wishlist' && g.wishPriority !== 5);
      for (const g of lista) {
        try {
          const s = await znajdz(g);
          if (!s) { await DB.put('games', Object.assign({}, g, { ceny: Object.assign({}, g.ceny || {}, { data: dzis, brak: true }) })); continue; }
          const hist = ((g.ceny && g.ceny.hist) || []).filter(h => h[0] !== dzis).concat(s.min != null ? [[dzis, s.min]] : []).slice(-30);
          const rec = Object.assign({}, g, { ceny: { data: dzis, min: s.min, max: s.max, sklepy: s.sklepy, url: s.url, hist } });
          if (!rec.thumb && s.img) { rec.thumb = s.img; rec.image = rec.image || s.img; }
          const promo = czyPromo(rec, s.min);
          if (promo && !g.promo) nowePromo.push(rec);
          rec.promo = promo;
          await DB.put('games', rec); n++;
        } catch (e) { console.warn('cena', g.title, e); }
        await new Promise(r => setTimeout(r, 700));
      }
      lsSet('wishlista.sprawdzono', Date.now());
      if (nowePromo.length && App.has('powiadomienia.teraz')) {
        nowePromo.forEach(g => App.call('powiadomienia.teraz', '🔥 Promocja: ' + g.title, `Najtaniej ${zl(g.ceny.min)} (${g.ceny.sklepy || '?'} sklepów)${g.cenaDocelowa ? ', Twoja cena: ' + zl(g.cenaDocelowa) : ''}`, { go: 'wishlista' }));
      }
      if (!cicho) App.ui.toast(`Sprawdzono ceny: ${n}${nowePromo.length ? ` · 🔥 promocje: ${nowePromo.length}` : ''}`);
    } finally { trwa = false; }
    return n;
  }

  /* ---------- widok ---------- */
  async function edit(g) {
    const nowy = !g;
    g = g || { status: 'wishlist', wishPriority: 3 };
    const out = await App.ui.form(nowy ? 'Dodaj do listy życzeń' : g.title, [
      { name: 'title', label: 'Tytuł (najlepiej angielski z BGG)', value: g.title },
      { name: 'plTitle', label: 'Polski tytuł (pomaga znaleźć cenę)', value: g.plTitle },
      { name: 'bggId', label: 'Numer gry na BGG (z adresu strony, opcjonalnie)', type: 'number', value: g.bggId },
      { name: 'wishPriority', label: 'Jak bardzo chcę', type: 'select', value: g.wishPriority || 3, options: Object.entries(PRIO) },
      { name: 'cenaDocelowa', label: 'Kupię, gdy cena spadnie do (zł)', type: 'number', step: '0.01', value: g.cenaDocelowa },
      { name: 'url', label: 'Adres gry na planszeo.pl (jeśli aplikacja źle dopasowała)', value: g.ceny && g.ceny.url },
      { name: 'notes', label: 'Notatki', type: 'textarea', rows: 2, value: g.notes }
    ]);
    if (!out || !out.title) return false;
    const ceny = Object.assign({}, g.ceny || {});
    if ((out.url || '') !== (ceny.url || '')) { ceny.url = out.url || null; ceny.hist = []; ceny.min = null; }
    const rec = Object.assign({}, g, { title: out.title, plTitle: out.plTitle, bggId: out.bggId || null, wishPriority: +out.wishPriority, cenaDocelowa: out.cenaDocelowa, notes: out.notes, ceny });
    rec.promo = czyPromo(rec, ceny.min);
    await DB.put('games', rec);
    return true;
  }
  async function kupione(g) {
    const out = await App.ui.form('Kupiłem: ' + g.title, [
      { name: 'pricePaid', label: 'Ile zapłaciłem (zł)', type: 'number', step: '0.01', value: g.ceny && g.ceny.min },
      { name: 'acquiredAt', label: 'Kiedy', type: 'date', value: App.ui.today() }
    ], { ok: 'Do kolekcji' });
    if (!out) return false;
    await DB.put('games', Object.assign({}, g, { status: 'owned', pricePaid: out.pricePaid, acquiredAt: out.acquiredAt, promo: false }));
    App.ui.toast('🎉 ' + g.title + ' w kolekcji');
    return true;
  }

  async function render(el) {
    css();
    await seed();
    const lista = (await DB.all('games')).filter(g => g.status === 'wishlist')
      .sort((a, b) => (b.promo ? 1 : 0) - (a.promo ? 1 : 0) || (a.wishPriority || 3) - (b.wishPriority || 3) || a.title.localeCompare(b.title, 'pl'));
    const ost = lsGet('wishlista.sprawdzono', 0);
    const zmiana = g => { const h = (g.ceny && g.ceny.hist) || []; if (h.length < 2) return ''; const d = h[h.length - 1][1] - h[h.length - 2][1]; return d ? `<span class="${d > 0 ? 'wl-up' : 'wl-down'}">${d > 0 ? '▲' : '▼'} ${zl(Math.abs(d))}</span>` : ''; };
    const q = g => encodeURIComponent(g.plTitle || g.title);
    el.innerHTML = `
      <div class="row" style="align-items:center"><h2 style="margin:0">Lista życzeń</h2><span class="spacer" style="flex:1"></span>
        <button id="wlAdd" class="primary">+ Dodaj</button><button id="wlBgg">⬇ Import z BGG</button><button id="wlCeny">💲 Sprawdź ceny</button></div>
      <p class="muted">${http() ? `Telefon sprawdza ceny na planszeo.pl co 3 dni${ost ? ' (ostatnio ' + App.ui.fmtDate(new Date(ost).toISOString()) + ')' : ''} i powiadomi o promocji.` : 'Ceny sprawdza telefon (co 3 dni) – tutaj widać ostatni wynik.'} Promocja = cena ≤ Twojej docelowej albo co najmniej 10% taniej niż wcześniej.</p>
      ${lista.length ? `<div class="list">${lista.map(g => `<div class="li wl-li" data-id="${esc(g.id)}">
        ${g.thumb || g.image ? `<img loading="lazy" src="${esc(g.thumb || g.image)}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'ph',textContent:'🎲'}))">` : '<span class="ph">🎲</span>'}
        <div class="main"><div class="t">${esc(g.title)} ${g.promo ? '<span class="wl-promo">🔥 PROMOCJA</span>' : ''}</div>
          <div class="s">${[g.year, g.plTitle].filter(Boolean).map(esc).join(' · ')} <span class="wl-pr p${g.wishPriority || 3}">${PRIO[g.wishPriority || 3]}</span></div>
          <div class="s">${g.ceny && g.ceny.min != null ? `<span class="wl-cena">${zl(g.ceny.min)}</span> najtaniej${g.ceny.sklepy ? ` w ${g.ceny.sklepy} ofertach` : ''} ${zmiana(g)} · ${App.ui.fmtDate(g.ceny.data)}` : g.ceny && g.ceny.brak ? 'nie znalazłem w porównywarce' : 'cena jeszcze nie sprawdzona'}${g.cenaDocelowa ? ` · moja cena: <b>${zl(g.cenaDocelowa)}</b>` : ''}</div>
          <div class="wl-links"><a target="_blank" rel="noopener" href="${esc((g.ceny && g.ceny.url) || PLANSZEO + '/szukaj?q=' + q(g))}">Planszeo ↗</a><a target="_blank" rel="noopener" href="https://www.ceneo.pl/Gry_planszowe;szukaj-${q(g)}">Ceneo ↗</a><a target="_blank" rel="noopener" href="https://allegro.pl/listing?string=${q(g)}&order=p">Allegro ↗</a>${g.bggId ? `<a target="_blank" rel="noopener" href="https://boardgamegeek.com/boardgame/${g.bggId}">BGG ↗</a>` : ''}</div></div>
        <div class="wl-act"><button class="small primary" data-kup="${esc(g.id)}">✓ Kupiłem</button><button class="small" data-ed="${esc(g.id)}">✏️</button><button class="small ghost" data-rm="${esc(g.id)}">🗑</button></div></div>`).join('')}</div>`
        : '<div class="empty">Lista życzeń jest pusta. Dodaj grę albo zaimportuj listę z BGG.</div>'}`;
    const byId = new Map(lista.map(g => [g.id, g]));
    el.querySelector('#wlAdd').onclick = async () => { if (await edit(null)) render(el); };
    el.querySelector('#wlBgg').onclick = async () => { await importBgg(); render(el); };
    el.querySelector('#wlCeny').onclick = async e => { e.target.disabled = true; e.target.textContent = 'Sprawdzam…'; await sprawdzCeny(false); render(el); };
    el.querySelectorAll('[data-kup]').forEach(b => b.onclick = async () => { if (await kupione(byId.get(b.dataset.kup))) render(el); });
    el.querySelectorAll('[data-ed]').forEach(b => b.onclick = async () => { if (await edit(byId.get(b.dataset.ed))) render(el); });
    el.querySelectorAll('[data-rm]').forEach(b => b.onclick = async () => { const g = byId.get(b.dataset.rm); if (await App.ui.confirm(`Usunąć „${g.title}” z listy życzeń?`)) { await DB.remove('games', g.id); render(el); } });
  }

  App.registerModule({ id: 'wishlista', title: 'Lista życzeń', icon: '⭐', order: 31, render });
  App.provide('wishlista.sprawdz', sprawdzCeny);

  // telefon: ceny co 3 dni, w tle, chwilę po starcie
  setTimeout(async () => {
    try { await seed(); } catch (e) { }
    if (http() && Date.now() - lsGet('wishlista.sprawdzono', 0) > 3 * DZIEN) sprawdzCeny(true).catch(() => { });
  }, 20000);
})();
