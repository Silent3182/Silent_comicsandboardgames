/* „Dodatki” – dodatki pod grą bazową (grane / niegrane, brakujące z BGG) oraz sekcja w karcie gry:
 * dodatki, mechaniki i autorzy, pudełko i Kallax, wymiana, kampanie.
 * Pola w games: baseGameId (ręcznie wybrana gra bazowa dodatku), expPlayed (true = grałem z tym dodatkiem),
 *               pudelko {w,l,h} w cm, wymiana (true), wymianaCena, wymianaUwagi.
 * Usługa: App.call('grplus.sekcja', element, gra) – wywoływana w karcie gry (planszowki.js).
 */
(function () {
  const G = window.GP, { esc, pl, num } = G;
  const st = { filtr: '' };
  const grany = (d, e) => d.partie(e) > 0 || !!e.expPlayed;

  function grupy(d) {
    const gry = d.games.filter(g => g.status !== 'wishlist' && g.status !== 'sold');
    const dod = gry.filter(g => g.isExpansion);
    const map = new Map(), sieroty = [];
    dod.forEach(e => { const b = G.bazaDodatku(e, d.games); if (b) { if (!map.has(b.id)) map.set(b.id, []); map.get(b.id).push(e); } else sieroty.push(e); });
    return { map, sieroty };
  }
  function brakujace(baza, posiadane) {
    const dd = G.D(); const lista = (baza.bggId && dd.dodatki[baza.bggId]) || [];
    const mam = new Set(posiadane.map(e => e.title.toLowerCase()));
    return lista.filter(n => !mam.has(n.toLowerCase()));
  }
  async function chce(tytul) {
    const all = await DB.all('games');
    if (all.some(g => g.title.toLowerCase() === tytul.toLowerCase())) { App.ui.toast('Już jest w aplikacji'); return; }
    await DB.put('games', { id: DB.uid(), title: tytul, isExpansion: true, status: 'wishlist', wishPriority: 3, tags: [], source: 'dodatki', notes: 'Brakujący dodatek' });
    App.ui.toast('Dodano do listy życzeń ⭐');
  }
  async function wybierzBaze(e, d) {
    const bazy = d.games.filter(g => !g.isExpansion && g.status !== 'wishlist').sort((a, b) => a.title.localeCompare(b.title, 'pl'));
    const cur = G.bazaDodatku(e, d.games);
    const o = await App.ui.form('Do jakiej gry jest „' + e.title + '”?', [{ name: 'b', label: 'Gra bazowa', type: 'select', value: cur ? cur.id : '', options: [['', '— nie wiem —']].concat(bazy.map(g => [g.id, g.title])) }]);
    if (!o) return false;
    await DB.put('games', Object.assign({}, e, { baseGameId: o.b || null }));
    return true;
  }
  const dodHtml = (d, e) => `<div class="gp-dod">${G.okladka(e)}<div class="main"><a href="#/planszowki?gra=${encodeURIComponent(e.id)}">${esc(e.title)}</a>
      <div class="muted" style="font-size:12.5px">${grany(d, e) ? `<span class="gp-ok">✓ grany</span>${d.partie(e) ? ' · ' + d.partie(e) + '×' : ''}` : '<span class="gp-q">jeszcze nie grany</span>'}</div></div>
      <button class="small ghost" data-gr="${esc(e.id)}" title="Zmień oznaczenie">${e.expPlayed ? '↶ niegrany' : '✓ grałem'}</button></div>`;
  function bindDod(root, d, after) {
    root.querySelectorAll('[data-gr]').forEach(b => b.onclick = async () => {
      const e = d.gameById.get(b.dataset.gr); await DB.put('games', Object.assign({}, e, { expPlayed: !e.expPlayed })); after();
    });
    root.querySelectorAll('[data-chce]').forEach(b => b.onclick = async () => { await chce(b.dataset.chce); b.disabled = true; b.textContent = '⭐ dodano'; });
  }

  /* ---------- zakładka ---------- */
  async function render(el) {
    G.css();
    const d = await G.dane(); const { map, sieroty } = grupy(d);
    let bazy = [...map.entries()].map(([id, ex]) => ({ b: d.gameById.get(id), ex: ex.sort((a, b) => a.title.localeCompare(b.title, 'pl')) }));
    const niegranych = bazy.reduce((a, x) => a + x.ex.filter(e => !grany(d, e)).length, 0);
    const wszystkich = bazy.reduce((a, x) => a + x.ex.length, 0);
    if (st.filtr === 'niegrane') bazy = bazy.filter(x => x.ex.some(e => !grany(d, e)));
    bazy.sort((a, b) => a.b.title.localeCompare(b.b.title, 'pl'));
    el.innerHTML = `
      <h1>Dodatki</h1>
      <div class="stats"><div class="stat"><div class="v">${wszystkich}</div><div class="l">${pl(wszystkich, 'dodatek', 'dodatki', 'dodatków')} w kolekcji</div></div>
        <div class="stat"><div class="v">${map.size}</div><div class="l">${pl(map.size, 'gra', 'gry', 'gier')} z dodatkami</div></div>
        <div class="stat"><div class="v">${niegranych}</div><div class="l">jeszcze nie grane</div></div></div>
      <div class="gp-tabs"><button class="gp-chip ${!st.filtr ? 'on' : ''}" data-f="">Wszystkie</button><button class="gp-chip ${st.filtr === 'niegrane' ? 'on' : ''}" data-f="niegrane">Z niegranymi dodatkami</button></div>
      ${bazy.map(({ b, ex }) => { const br = brakujace(b, ex); return `<div class="card" style="margin-bottom:10px"><div class="row"><b style="flex:1"><a href="#/planszowki?gra=${encodeURIComponent(b.id)}">${esc(b.title)}</a></b><span class="muted" style="font-size:13px">${ex.filter(e => grany(d, e)).length}/${ex.length} granych${d.partie(b) ? ' · gra ' + d.partie(b) + '×' : ''}</span></div>
        ${ex.map(e => dodHtml(d, e)).join('')}
        ${br.length ? `<details style="margin-top:6px"><summary class="muted" style="font-size:13px">Brakujące dodatki wg BGG: ${br.length}</summary><div style="margin-top:6px">${br.map(n => `<div class="row" style="gap:6px;margin:3px 0"><span style="flex:1;font-size:14px">${esc(n)}</span><button class="small ghost" data-chce="${esc(n)}">⭐ chcę</button></div>`).join('')}</div></details>` : ''}</div>`; }).join('') || '<p class="muted">Brak dodatków przypisanych do gier.</p>'}
      ${sieroty.length ? `<details class="card" style="margin-top:12px"><summary><b>Dodatki bez gry bazowej: ${sieroty.length}</b></summary><div class="list" style="margin-top:8px">${sieroty.map(e => `<div class="li" data-baza="${esc(e.id)}"><div class="main"><div class="t">${esc(e.title)}</div></div><button class="small">Wybierz grę</button></div>`).join('')}</div></details>` : ''}
      <p class="muted" style="font-size:12.5px;margin-top:12px">„Grany” = jest partia z tym dodatkiem albo zaznaczyłeś „✓ grałem”. Lista brakujących pochodzi z BGG (stan ze stycznia 2022, bez promek).</p>`;
    el.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { st.filtr = b.dataset.f; render(el); });
    el.querySelectorAll('[data-baza]').forEach(li => li.onclick = async () => { if (await wybierzBaze(d.gameById.get(li.dataset.baza), d)) render(el); });
    bindDod(el, d, () => render(el));
  }

  /* ---------- sekcja w karcie gry ---------- */
  async function sekcja(box, g) {
    if (!box || !g) return;
    G.css();
    const d = await G.dane(); g = d.gameById.get(g.id) || g;
    const inf = G.info(g);
    const out = [];
    if (g.isExpansion) {
      const b = G.bazaDodatku(g, d.games);
      out.push(`<p>${b ? `Dodatek do: <a href="#/planszowki?gra=${encodeURIComponent(b.id)}"><b>${esc(b.title)}</b></a>` : 'Nie wiem, do jakiej gry jest ten dodatek.'} <button class="small ghost" id="gpBaza">${b ? 'Zmień' : 'Wybierz grę'}</button>
        · ${grany(d, g) ? '<span class="gp-ok">✓ grany</span>' : '<span class="gp-q">jeszcze nie grany</span>'} <button class="small ghost" id="gpGr">${g.expPlayed ? '↶ oznacz jako niegrany' : '✓ grałem z tym dodatkiem'}</button></p>`);
    } else {
      const { map } = grupy(d); const ex = (map.get(g.id) || []).sort((a, b) => a.title.localeCompare(b.title, 'pl'));
      const br = brakujace(g, ex);
      if (ex.length || br.length) out.push(`<div class="card"><h3 style="margin:0 0 4px">Dodatki${ex.length ? ` (${ex.filter(e => grany(d, e)).length}/${ex.length} granych)` : ''}</h3>
        ${ex.map(e => dodHtml(d, e)).join('') || '<p class="muted" style="margin:4px 0">Nie masz dodatków do tej gry.</p>'}
        ${br.length ? `<details style="margin-top:6px"><summary class="muted" style="font-size:13px">Brakujące wg BGG: ${br.length}</summary><div style="margin-top:6px">${br.map(n => `<div class="row" style="gap:6px;margin:3px 0"><span style="flex:1;font-size:14px">${esc(n)}</span><button class="small ghost" data-chce="${esc(n)}">⭐ chcę</button></div>`).join('')}</div></details>` : ''}</div>`);
    }
    if (inf) {
      out.push(`<div class="card" style="margin-top:10px"><h3 style="margin:0 0 4px">Mechaniki i autorzy</h3>
        <div class="gp-chips">${inf.mech.map(m => `<span class="gp-chip" style="cursor:default">${esc(G.mechNazwa(m))}</span>`).join('')}</div>
        <p class="muted" style="margin:4px 0;font-size:13.5px">${inf.aut.length ? 'Autor: ' + esc(inf.aut.join(', ')) + ' · ' : ''}${esc(inf.kat.map(G.katNazwa).join(', '))}${inf.gracze[0] ? ` · ${inf.gracze[0]}${inf.gracze[1] > inf.gracze[0] ? '–' + inf.gracze[1] : ''} os.` : ''}${inf.czas ? ` · ok. ${inf.czas} min` : ''}</p></div>`);
    }
    // pudełko i Kallax
    if (g.status !== 'wishlist' && g.status !== 'played') {
      const w = G.wymiary(g), m = G.miesci(g);
      out.push(`<div class="card" style="margin-top:10px"><div class="row"><h3 style="margin:0;flex:1">Pudełko i Kallax</h3><button class="small ghost" id="gpPud">📏 ${w.szac ? 'Wpisz wymiary' : 'Zmień'}</button></div>
        <p style="margin:6px 0 0">${w.szac ? '<span class="gp-q">Wymiary nieznane – liczę jak typowe pudełko 30×30×7 cm (szacunek).</span>' : `${num(w.w)} × ${num(w.l)} × ${num(w.h)} cm`}
        <br>Kallax: ${m.pion ? '<span class="gp-ok">✓ zmieści się na stojąco</span>' : m.poziom ? '<span class="gp-q">tylko na leżąco</span>' : '<span class="gp-no">✗ nie zmieści się</span>'}${m.pion || m.poziom ? ` · zajmie ok. ${num(m.grubosc)} cm z ${G.KALLAX.w} cm szerokości` : ''}${w.szac ? ' (szacunek)' : ''}</p></div>`);
    }
    // wymiana i kampanie
    const kamp = (await DB.all('campaigns')).filter(c => c.gameId === g.id);
    const kampGra = inf && inf.mech.some(m => /Campaign|Legacy/i.test(m)) || /legacy|kampani|campaign/i.test(g.title);
    const przyc = [];
    if (g.status === 'owned' || g.status === 'forSale') przyc.push(`<button id="gpWym" class="${g.wymiana ? 'primary' : ''}">${g.wymiana ? '🔁 Na wymianę ✓' : '🔁 Wymienię'}</button>`);
    if (kamp.length || kampGra) przyc.push(`<button id="gpKamp">📜 ${kamp.length ? `Kampanie (${kamp.length})` : 'Zacznij kampanię'}</button>`);
    if (przyc.length) out.push(`<p class="row" style="margin-top:10px">${przyc.join('')}</p>`);

    box.innerHTML = out.length ? `<div class="gp-sec">${out.join('')}</div>` : '';
    const $ = s => box.querySelector(s);
    const odswiez = () => sekcja(box, g);
    bindDod(box, d, odswiez);
    if ($('#gpBaza')) $('#gpBaza').onclick = async () => { if (await wybierzBaze(g, d)) odswiez(); };
    if ($('#gpGr')) $('#gpGr').onclick = async () => { await DB.put('games', Object.assign({}, g, { expPlayed: !g.expPlayed })); odswiez(); };
    if ($('#gpPud')) $('#gpPud').onclick = async () => { if (await App.call('pudelka.edytuj', g.id)) odswiez(); };
    if ($('#gpWym')) $('#gpWym').onclick = async () => { await App.call('wymiana.przelacz', g.id); odswiez(); };
    if ($('#gpKamp')) $('#gpKamp').onclick = () => kamp.length ? App.go('kampanie', { gra: g.id }) : App.call('kampanie.nowa', g.id);
  }

  App.provide('grplus.sekcja', sekcja);
  App.registerModule({ id: 'dodatki', title: 'Dodatki', icon: '🧩', order: 10.5, render });
})();
