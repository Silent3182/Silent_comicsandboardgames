/* „Co kupić?” – podpowiedzi gier na podstawie moich ocen, liczby partii, mechanik i autorów
 * oraz „Mechaniki i autorzy” – jakie typy gier mam, a w jakie gram najczęściej.
 * Kandydaci: 2000 najwyżej ocenianych gier BGG (dane ze stycznia 2022, plik dane-gry.js).
 * Ukryte podpowiedzi: ustawienie 'rekoUkryte' (lista bggId, synchronizowane).
 */
(function () {
  const { esc, pl, num } = window.GP;
  const st = { gracze: '', czas: '', tylko: '', ile: 30, widok: 'mech', pokaz: null };

  /* Profil gustu: waga mechaniki/autora/kategorii = suma „sympatii” do gier, które je mają. */
  function profil(d) {
    const G = window.GP, dd = G.D();
    const mech = new Map(), kat = new Map(), aut = new Map(), zrodla = [];
    G.posiadane(d.games).concat(d.games.filter(g => g.status === 'sold' || g.status === 'played')).forEach(g => {
      if (g.isExpansion) return;
      const x = g.bggId && dd.gry[g.bggId]; if (!x) return;
      const n = d.partie(g), r = g.myRating;
      let w = 0;
      if (r) w += r >= 9 ? 3 : r >= 8 ? 2 : r >= 7 ? 1 : r >= 6 ? 0 : -1.5;
      w += Math.min(3, Math.log2(1 + n)); // często grane = lubiane
      if (g.status === 'sold' && !(r >= 8)) w -= 1;
      if (w <= 0) return;
      zrodla.push({ g, w, x });
      x.m.forEach(i => mech.set(i, (mech.get(i) || 0) + w));
      x.c.forEach(i => kat.set(i, (kat.get(i) || 0) + w * .5));
      x.d.forEach(i => aut.set(i, (aut.get(i) || 0) + w));
    });
    // rzadkie mechaniki są bardziej znaczące niż „Zarządzanie ręką”, które ma prawie każda gra
    const czest = new Map(); dd.kand.forEach(k => k[5].forEach(i => czest.set(i, (czest.get(i) || 0) + 1)));
    const idf = i => Math.log(1 + dd.kand.length / (1 + (czest.get(i) || 0)));
    return { mech, kat, aut, zrodla, idf };
  }

  function oceniaj(d, P) {
    const dd = window.GP.D();
    const mam = new Set(d.games.filter(g => g.status !== 'wishlist').map(g => g.bggId).filter(Boolean));
    const chce = new Set(d.games.filter(g => g.status === 'wishlist').map(g => g.bggId).filter(Boolean));
    const ukryte = new Set(d.ukryte || []);
    const maxM = Math.max(1, ...P.mech.values()), maxA = Math.max(1, ...P.aut.values()), maxK = Math.max(1, ...P.kat.values());
    const out = [];
    for (const k of dd.kand) {
      const [id, tytul, rok, ocena, rank, m, c, a, gr, czas, img] = k;
      if (mam.has(id) || ukryte.has(id)) continue;
      let s = 0;
      m.forEach(i => { s += (P.mech.get(i) || 0) / maxM * P.idf(i); });
      s = s / Math.sqrt(Math.max(3, m.length));
      let sa = 0; a.forEach(i => { sa += (P.aut.get(i) || 0) / maxA; });
      let sk = 0; c.forEach(i => { sk += (P.kat.get(i) || 0) / maxK; });
      s += sa * 1.6 + sk * .25 + (ocena - 6.5) * .45;
      // najbardziej podobna gra z kolekcji (do uzasadnienia)
      let best = null, bw = 0;
      for (const z of P.zrodla) {
        const wsp = z.x.m.filter(i => m.includes(i));
        const wa = z.x.d.filter(i => a.includes(i));
        const w = (wsp.reduce((t, i) => t + P.idf(i), 0) + wa.length * 4) * z.w;
        if (w > bw) { bw = w; best = { g: z.g, wsp, wa }; }
      }
      out.push({ id, tytul, rok, ocena, rank, m, c, a, gr, czas, img, s, best, chce: chce.has(id) });
    }
    return out.sort((x, y) => y.s - x.s);
  }

  function dlaczego(r) {
    const dd = window.GP.D(), G = window.GP;
    const parts = [];
    if (r.best) {
      const g = r.best.g;
      parts.push(`lubisz <b>${esc(g.title)}</b>${g.myRating ? ` (${num(g.myRating)}★)` : ''}`);
      if (r.best.wa.length) parts.push('ten sam autor: ' + esc(r.best.wa.map(i => dd.aut[i]).join(', ')));
      const top = r.best.wsp.slice().sort((a, b) => b - a).slice(0, 3).map(i => G.mechNazwa(dd.mech[i]));
      if (top.length) parts.push('wspólne: ' + esc(top.join(', ')));
    }
    return parts.join(' · ');
  }

  async function naListe(r) {
    const istn = (await DB.all('games')).find(g => g.bggId === r.id);
    if (istn) { App.ui.toast('Ta gra już jest w aplikacji (' + (istn.status === 'wishlist' ? 'lista życzeń' : 'kolekcja') + ')'); return; }
    await DB.put('games', { id: 'wish-' + r.id, bggId: r.id, title: r.tytul, year: r.rok || null, status: 'wishlist', wishPriority: 3, bggRating: r.ocena,
      minPlayers: r.gr[0] || null, maxPlayers: r.gr[1] || null, playTime: r.czas || null, image: r.img || null, thumb: r.img || null, isExpansion: false, tags: [], source: 'reko',
      notes: 'Dodane z „Co kupić?”' });
    App.ui.toast('Dodano do listy życzeń ⭐');
  }

  async function renderReko(el) {
    window.GP.css();
    const d = await window.GP.dane();
    d.ukryte = (await DB.setting('rekoUkryte')) || [];
    const P = profil(d);
    const dd = window.GP.D();
    if (!dd.kand.length) { el.innerHTML = '<h1>Co kupić?</h1><p class="muted">Brak danych o grach (plik dane-gry.js).</p>'; return; }
    const wszystkie = oceniaj(d, P);
    const topMech = [...P.mech.entries()].map(([i, w]) => [i, w * P.idf(i)]).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([i]) => window.GP.mechNazwa(dd.mech[i]));
    const draw = () => {
      let lista = wszystkie;
      const ng = Number(st.gracze); if (ng) lista = lista.filter(r => (!r.gr[0] || r.gr[0] <= ng) && (!r.gr[1] || r.gr[1] >= ng));
      const cz = Number(st.czas); if (cz) lista = lista.filter(r => !r.czas || r.czas <= cz);
      if (st.tylko === 'nowe') lista = lista.filter(r => r.rok >= 2018);
      if (st.tylko === 'solo') lista = lista.filter(r => r.m.includes(dd.mech.indexOf('Solo / Solitaire Game')));
      if (st.tylko === 'koop') lista = lista.filter(r => r.m.includes(dd.mech.indexOf('Cooperative Game')));
      const pokaz = lista.slice(0, st.ile);
      el.querySelector('#rkL').innerHTML = pokaz.length ? `<div class="list">${pokaz.map(r => `<div class="li" style="cursor:default"><div class="gp-reko" style="flex:1;min-width:0">
          ${r.img ? `<img loading="lazy" src="${esc(r.img)}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'ph',textContent:'🎲'}))">` : '<span class="ph">🎲</span>'}
          <div style="min-width:0"><div class="t"><b>${esc(r.tytul)}</b> <span class="muted">${r.rok || ''}</span> ${r.chce ? '<span class="badge wish">na liście życzeń</span>' : ''}</div>
          <div class="s muted" style="font-size:13px">BGG ${num(r.ocena)} · #${r.rank}${r.gr[0] ? ' · ' + r.gr[0] + (r.gr[1] > r.gr[0] ? '–' + r.gr[1] : '') + ' os.' : ''}${r.czas ? ' · ' + r.czas + ' min' : ''}</div>
          <div class="why">${dlaczego(r) || ''}</div>
          <div class="row" style="margin-top:6px;gap:6px">${r.chce ? '' : `<button class="small primary" data-w="${r.id}">⭐ Na listę życzeń</button>`}<a class="btn small" href="https://boardgamegeek.com/boardgame/${r.id}" target="_blank" rel="noopener">BGG ↗</a><button class="small ghost" data-x="${r.id}" title="Nie pokazuj więcej">Nie interesuje mnie</button></div></div></div></div>`).join('')}</div>
          ${lista.length > st.ile ? '<p class="row" style="margin-top:10px"><button id="rkMore">Pokaż więcej</button></p>' : ''}` : '<p class="muted">Nic nie pasuje do filtrów.</p>';
      el.querySelectorAll('[data-w]').forEach(b => b.onclick = async () => { await naListe(wszystkie.find(r => r.id === +b.dataset.w)); const r = wszystkie.find(x => x.id === +b.dataset.w); r.chce = true; draw(); });
      el.querySelectorAll('[data-x]').forEach(b => b.onclick = async () => {
        const id = +b.dataset.x; d.ukryte = d.ukryte.concat(id); await DB.setting('rekoUkryte', d.ukryte);
        const i = wszystkie.findIndex(r => r.id === id); if (i >= 0) wszystkie.splice(i, 1); draw();
      });
      const more = el.querySelector('#rkMore'); if (more) more.onclick = () => { st.ile += 30; draw(); };
    };
    el.innerHTML = `
      <h1>Co kupić?</h1>
      <p class="muted" style="margin-top:-6px">Podpowiedzi z Twoich ocen i najczęściej granych gier. Najbardziej lubisz: ${esc(topMech.join(', ') || '– oceń kilka gier –')}.</p>
      <div class="toolbar">
        <select id="rkG"><option value="">Dowolna liczba graczy</option>${[1, 2, 3, 4, 5, 6].map(n => `<option value="${n}" ${String(n) === st.gracze ? 'selected' : ''}>dla ${n} ${pl(n, 'osoby', 'osób', 'osób')}</option>`).join('')}</select>
        <select id="rkC"><option value="">Dowolny czas</option>${[30, 60, 90, 120].map(n => `<option value="${n}" ${String(n) === st.czas ? 'selected' : ''}>do ${n} min</option>`).join('')}</select>
        <select id="rkT"><option value="">Wszystkie</option><option value="nowe" ${st.tylko === 'nowe' ? 'selected' : ''}>Wydane od 2018</option><option value="solo" ${st.tylko === 'solo' ? 'selected' : ''}>Z trybem solo</option><option value="koop" ${st.tylko === 'koop' ? 'selected' : ''}>Kooperacyjne</option></select>
        ${d.ukryte.length ? `<button class="ghost small" id="rkReset">Przywróć ukryte (${d.ukryte.length})</button>` : ''}
      </div>
      <div id="rkL"></div>
      <p class="muted" style="font-size:12.5px;margin-top:12px">Dane: ${esc(dd.zrodlo || 'BoardGameGeek')}. Gry wydane później nie są jeszcze podpowiadane.</p>`;
    el.querySelector('#rkG').onchange = e => { st.gracze = e.target.value; st.ile = 30; draw(); };
    el.querySelector('#rkC').onchange = e => { st.czas = e.target.value; st.ile = 30; draw(); };
    el.querySelector('#rkT').onchange = e => { st.tylko = e.target.value; st.ile = 30; draw(); };
    const rs = el.querySelector('#rkReset'); if (rs) rs.onclick = async () => { await DB.setting('rekoUkryte', []); App.refresh(); };
    draw();
  }

  /* ---------- Mechaniki i autorzy ---------- */
  async function renderMech(el) {
    const G = window.GP; G.css();
    const d = await G.dane(); const dd = G.D();
    const gry = G.posiadane(d.games).filter(g => !g.isExpansion);
    const zDanymi = gry.filter(g => g.bggId && dd.gry[g.bggId]);
    const klucz = { mech: 'm', kat: 'c', aut: 'd' }[st.widok];
    const slownik = { mech: dd.mech, kat: dd.kat, aut: dd.aut }[st.widok];
    const nazwa = st.widok === 'mech' ? G.mechNazwa : st.widok === 'kat' ? G.katNazwa : (x => x);
    const agg = new Map();
    let sumP = 0;
    zDanymi.forEach(g => {
      const n = d.partie(g); sumP += n;
      dd.gry[g.bggId][klucz].forEach(i => {
        const a = agg.get(i) || { gry: [], partie: 0, oceny: [] };
        a.gry.push(g); a.partie += n; if (g.myRating) a.oceny.push(g.myRating);
        agg.set(i, a);
      });
    });
    const rows = [...agg.entries()].map(([i, a]) => ({ i, n: nazwa(slownik[i]), ...a, sr: a.oceny.length ? a.oceny.reduce((x, y) => x + y, 0) / a.oceny.length : null }))
      .filter(r => st.widok !== 'aut' || r.gry.length >= 2 || r.partie >= 3)
      .sort((a, b) => st.sort === 'partie' ? b.partie - a.partie : st.sort === 'ocena' ? (b.sr || 0) - (a.sr || 0) : b.gry.length - a.gry.length);
    const maxG = Math.max(1, ...rows.map(r => r.gry.length)), maxP = Math.max(1, ...rows.map(r => r.partie));
    // „mam dużo, gram mało” i odwrotnie
    const udzM = r => r.gry.length / zDanymi.length, udzP = r => sumP ? r.partie / sumP : 0;
    const zaniedbane = rows.filter(r => r.gry.length >= 4 && udzP(r) < udzM(r) * .5).slice(0, 4);
    const ulubione = rows.filter(r => r.gry.length >= 2 && udzP(r) > udzM(r) * 1.6).slice(0, 4);
    el.innerHTML = `
      <h1>Mechaniki i autorzy</h1>
      <p class="muted" style="margin-top:-6px">${zDanymi.length} z ${gry.length} gier ma dane z BGG. Partie = zapisane w aplikacji + wcześniej na BGG.</p>
      <div class="gp-tabs">${[['mech', 'Mechaniki'], ['kat', 'Kategorie'], ['aut', 'Autorzy']].map(([k, l]) => `<button class="gp-chip ${st.widok === k ? 'on' : ''}" data-v="${k}">${l}</button>`).join('')}
        <span class="spacer"></span><select id="mcS"><option value="gry">wg liczby gier</option><option value="partie" ${st.sort === 'partie' ? 'selected' : ''}>wg partii</option><option value="ocena" ${st.sort === 'ocena' ? 'selected' : ''}>wg mojej oceny</option></select></div>
      ${ulubione.length || zaniedbane.length ? `<div class="card" style="margin-bottom:12px">
        ${ulubione.length ? `<p style="margin:0 0 6px">🔥 <b>Grasz w nie częściej, niż wynikałoby z kolekcji:</b> ${esc(ulubione.map(r => r.n).join(', '))}</p>` : ''}
        ${zaniedbane.length ? `<p style="margin:0">💤 <b>Masz ich dużo, a grasz rzadko:</b> ${esc(zaniedbane.map(r => r.n).join(', '))}</p>` : ''}</div>` : ''}
      <div class="card"><div class="muted" style="font-size:12.5px;margin-bottom:6px">Pasek niebieski = liczba gier w kolekcji, pomarańczowa kreska = liczba partii.</div>
        ${rows.slice(0, st.wszystkie ? 999 : 30).map(r => `<div class="gp-bar" data-i="${r.i}" style="cursor:pointer"><span class="lab" title="${esc(r.n)}">${esc(r.n)}</span>
          <span class="tr"><i style="width:${r.gry.length / maxG * 100}%"></i><b style="width:${r.partie / maxP * 100}%"></b></span>
          <span class="v">${r.gry.length} ${pl(r.gry.length, 'gra', 'gry', 'gier')} · ${r.partie} ${pl(r.partie, 'partia', 'partie', 'partii')}${r.sr ? ' · ' + num(r.sr) + '★' : ''}</span></div>
          ${st.pokaz === st.widok + r.i ? `<div class="gp-chips" style="margin:2px 0 10px">${r.gry.sort((a, b) => d.partie(b) - d.partie(a)).map(g => `<a class="gp-chip" href="#/planszowki?gra=${encodeURIComponent(g.id)}">${esc(g.title)}${d.partie(g) ? ' · ' + d.partie(g) + '×' : ''}</a>`).join('')}</div>` : ''}`).join('')}
        ${rows.length > 30 && !st.wszystkie ? `<p class="row" style="margin-top:8px"><button class="small" id="mcAll">Pokaż wszystkie (${rows.length})</button></p>` : ''}
      </div>
      ${gry.length - zDanymi.length ? `<details class="card" style="margin-top:12px"><summary>Gry bez danych BGG: ${gry.length - zDanymi.length}</summary><p class="muted">${esc(gry.filter(g => !zDanymi.includes(g)).map(g => g.title).join(', '))}</p></details>` : ''}`;
    el.querySelectorAll('[data-v]').forEach(b => b.onclick = () => { st.widok = b.dataset.v; st.pokaz = null; st.wszystkie = false; renderMech(el); });
    el.querySelector('#mcS').onchange = e => { st.sort = e.target.value; renderMech(el); };
    el.querySelectorAll('.gp-bar[data-i]').forEach(b => b.onclick = () => { const k = st.widok + b.dataset.i; st.pokaz = st.pokaz === k ? null : k; renderMech(el); });
    const all = el.querySelector('#mcAll'); if (all) all.onclick = () => { st.wszystkie = true; renderMech(el); };
  }

  App.registerModule({ id: 'rekomendacje', title: 'Co kupić?', icon: '🛍️', order: 31.5, render: renderReko });
  App.registerModule({ id: 'mechaniki', title: 'Mechaniki i autorzy', icon: '⚙️', order: 15.5, render: renderMech });
})();
