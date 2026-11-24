/* Moduł „Półki” (📍): własne regały (Kallaxy z przegródkami i inne regały) i to, co na nich stoi.
 * Kolekcja shelves: { name, kind ('kallax'|'regal'), rows, cols, place, notes, cells: {'r-c': 'nazwa przegródki'}, order }
 * Miejsce rzeczy: pole polka = { s: id regału, r: rząd od góry (1…), c: kolumna od lewej (1…) } w games i comics.
 * Komiksy mogą stać całymi seriami: ustawienie polkiSerii = { 'WKKM': {s, r, c} } (pojedynczy tom ma pierwszeństwo).
 * Usługi dla innych modułów:
 *   App.call('polki.tekst', itemType, item)        -> 'Kallax salon · rząd 2, kol. 3' albo ''
 *   App.call('polki.html', itemType, item)         -> znaczek <span class="pk-loc">📍 …</span> albo ''
 *   App.call('polki.przycisk', button, itemType, id) -> przycisk „📍 Półka” w szczegółach gry/komiksu
 *   App.call('polki.wybierz', itemType, id)        -> okno „Gdzie stoi?”
 */
(function () {
  const esc = s => App.ui.esc(s);
  const pl = (n, one, few, many) => n === 1 ? one : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) ? few : many;
  const KALLAX = [['1x4', 'Kallax 1×4 (wąski, pionowy)', 4, 1], ['4x1', 'Kallax 4×1 (poziomy)', 1, 4], ['2x2', 'Kallax 2×2', 2, 2], ['2x4', 'Kallax 2×4 (pionowy)', 4, 2], ['4x2', 'Kallax 4×2 (poziomy)', 2, 4], ['4x4', 'Kallax 4×4', 4, 4], ['5x5', 'Kallax 5×5', 5, 5]];

  window.IKONY = Object.assign(window.IKONY || {}, { polki: '<rect class="f" x="4" y="3.5" width="16" height="17" rx="1.5"/><path d="M4 9.2h16M4 14.8h16M12 3.5v17"/>' });
  window.IKONY_KOLOR = Object.assign(window.IKONY_KOLOR || {}, { polki: '#a0662b' });

  /* ---------- pamięć podręczna (żeby inne moduły mogły pytać synchronicznie) ---------- */
  const C = { shelves: [], byId: new Map(), serie: {} };
  async function reload() {
    try {
      C.shelves = (await DB.all('shelves')).sort((a, b) => (a.order || 0) - (b.order || 0) || a.name.localeCompare(b.name, 'pl'));
      C.byId = new Map(C.shelves.map(s => [s.id, s]));
      C.serie = (await DB.setting('polkiSerii')) || {};
    } catch (e) { console.warn('półki', e); }
  }
  const ready = reload();
  DB.on('shelves', reload); DB.on('settings', reload);

  function miejsce(itemType, item) {
    if (!item) return null;
    let p = item.polka, seria = false;
    if ((!p || !p.s) && itemType === 'comic' && item.series && C.serie[item.series]) { p = C.serie[item.series]; seria = true; }
    if (!p || !p.s) return null;
    const sh = C.byId.get(p.s);
    return sh ? { sh, r: p.r || null, c: p.c || null, seria } : null;
  }
  function przegrodka(sh, r, c) {
    if (!r) return '';
    const nazwa = sh.cells && sh.cells[r + '-' + c];
    const gdzie = (sh.cols || 1) > 1 ? ((sh.rows || 1) > 1 ? `rząd ${r}, kol. ${c}` : `przegroda ${c}`) : `półka ${r}`;
    return gdzie + (nazwa ? ` („${nazwa}”)` : '');
  }
  function tekst(itemType, item) {
    const m = miejsce(itemType, item);
    if (!m) return '';
    const p = przegrodka(m.sh, m.r, m.c);
    return m.sh.name + (m.sh.place ? ` (${m.sh.place})` : '') + (p ? ' · ' + p : '');
  }
  const html = (itemType, item) => { const t = tekst(itemType, item); return t ? `<span class="pk-loc" title="Gdzie stoi">📍 ${esc(t)}</span>` : ''; };

  function css() {
    if (document.getElementById('pk-css')) return;
    const st = document.createElement('style'); st.id = 'pk-css';
    st.textContent = `
.pk-loc{display:inline-block;padding:2px 9px;border-radius:999px;background:var(--accent-2-soft);color:var(--text);font-size:12.5px;font-weight:600;line-height:1.5}
.pk-loc.big{font-size:15px;padding:6px 12px;margin:6px 0}
.pk-grid{display:grid;gap:5px;padding:7px;background:#8b6a45;border-radius:10px;margin-top:8px}
.pk-grid.kallax{background:#e9e4da}
[data-theme="dark"] .pk-grid.kallax{background:#3a3f46}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]) .pk-grid.kallax{background:#3a3f46}}
.pk-cell{position:relative;aspect-ratio:1;min-height:54px;border-radius:6px;background:var(--surface);border:1px solid var(--line);padding:5px;display:flex;flex-direction:column;justify-content:flex-end;align-items:stretch;text-align:left;cursor:pointer;overflow:hidden;font:inherit;color:inherit}
.pk-grid.regal .pk-cell{aspect-ratio:auto;min-height:48px}
.pk-cell:hover{border-color:var(--accent)}
.pk-cell.on{outline:3px solid var(--accent-2);outline-offset:-1px}
.pk-cell.here{background:var(--accent-2-soft);border-color:var(--accent-2)}
.pk-cell .n{position:absolute;top:4px;right:6px;font-size:11px;color:var(--muted);font-weight:600}
.pk-cell .lab{font-size:11px;font-weight:650;line-height:1.2;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pk-cell .cnt{font-size:18px;font-weight:700;line-height:1.1}
.pk-cell .th{display:flex;gap:2px;margin-bottom:auto;flex-wrap:wrap;max-height:60%;overflow:hidden}
.pk-cell .th img{width:22px;height:22px;object-fit:cover;border-radius:3px}
.pk-head{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.pk-head h3{margin:0}
.pk-head .spacer{flex:1}
.pk-shelves{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:14px}
.pk-shelves .card{margin:0}
.pk-dlg .pk-grid{max-width:420px}
.pk-pick{max-height:46vh;overflow:auto;border:1px solid var(--line);border-radius:10px;margin:8px 0}
.pk-pick label{display:flex;flex-direction:row;align-items:center;gap:8px;padding:7px 10px;border-bottom:1px solid var(--line);margin:0;font-weight:500}
.pk-pick label small{color:var(--muted);margin-left:auto;text-align:right;font-size:11.5px}
.pk-pick input{width:auto;min-height:0}
.pk-tabs{display:flex;gap:6px;flex-wrap:wrap}
.pk-tabs button.on{background:var(--accent);color:var(--on-accent);border-color:var(--accent)}
`;
    document.head.appendChild(st);
  }

  /* ---------- formularz regału ---------- */
  async function editShelf(sh) {
    const s = sh || {};
    const preset = s.kind === 'kallax' ? (KALLAX.find(k => k[2] === s.rows && k[3] === s.cols) || [])[0] : (s.id ? 'inny' : '4x4');
    const out = await App.ui.form(sh ? 'Edytuj regał' : 'Nowy regał', [
      { name: 'name', label: 'Nazwa', value: s.name, placeholder: 'np. Kallax salon, Regał w sypialni' },
      { name: 'typ', label: 'Rodzaj', type: 'select', value: preset || 'inny', options: KALLAX.map(k => [k[0], k[1]]).concat([['inny', 'Inny regał / szafa (podaj półki niżej)']]) },
      { name: 'rows', label: 'Inny regał: ile półek (rzędów, licząc od góry)', type: 'number', value: s.kind === 'regal' ? s.rows : 5 },
      { name: 'cols', label: 'Inny regał: ile kolumn (zwykle 1)', type: 'number', value: s.kind === 'regal' ? s.cols : 1 },
      { name: 'place', label: 'Gdzie stoi (pokój)', value: s.place, placeholder: 'np. salon, piwnica' },
      { name: 'notes', label: 'Notatki', type: 'textarea', rows: 2, value: s.notes }
    ]);
    if (!out) return null;
    if (!out.name) { App.ui.toast('Podaj nazwę regału'); return null; }
    const k = KALLAX.find(x => x[0] === out.typ);
    const rec = Object.assign({}, s, {
      name: out.name, place: out.place, notes: out.notes,
      kind: k ? 'kallax' : 'regal',
      rows: k ? k[2] : Math.max(1, Math.min(20, out.rows || 1)),
      cols: k ? k[3] : Math.max(1, Math.min(10, out.cols || 1)),
      cells: s.cells || {}, order: s.order != null ? s.order : C.shelves.length
    });
    const saved = await DB.put('shelves', rec); await reload();
    return saved;
  }

  async function usunRegal(sh) {
    if (!await App.ui.confirm(`Usunąć regał „${sh.name}”? Gry i komiksy z niego stracą zapisane miejsce.`)) return false;
    const [games, comics] = await Promise.all([DB.all('games'), DB.all('comics')]);
    const g = games.filter(x => x.polka && x.polka.s === sh.id).map(x => Object.assign({}, x, { polka: null }));
    const c = comics.filter(x => x.polka && x.polka.s === sh.id).map(x => Object.assign({}, x, { polka: null }));
    if (g.length) await DB.putMany('games', g);
    if (c.length) await DB.putMany('comics', c);
    const serie = Object.assign({}, C.serie); Object.keys(serie).forEach(k => { if (serie[k].s === sh.id) delete serie[k]; });
    await DB.setting('polkiSerii', serie);
    await DB.remove('shelves', sh.id); await reload();
    return true;
  }

  /* ---------- zawartość ---------- */
  async function zawartosc() {
    const [games, comics] = await Promise.all([DB.all('games'), DB.all('comics')]);
    const gry = games.filter(g => g.status === 'owned' || g.status === 'forSale' || !g.status);
    const kom = comics.filter(c => c.status === 'owned' || c.status === 'forSale');
    const cell = new Map(); // 's|r|c' -> {gry:[], serie:{name:n}, tomy:[]}
    const key = (s, r, c) => s + '|' + (r || 0) + '|' + (c || 0);
    const get = k => { if (!cell.has(k)) cell.set(k, { gry: [], serie: new Map(), tomy: [] }); return cell.get(k); };
    gry.forEach(g => { if (g.polka && C.byId.has(g.polka.s)) get(key(g.polka.s, g.polka.r, g.polka.c)).gry.push(g); });
    kom.forEach(c => {
      if (c.polka && C.byId.has(c.polka.s)) get(key(c.polka.s, c.polka.r, c.polka.c)).tomy.push(c);
      else if (c.series && C.serie[c.series] && C.byId.has(C.serie[c.series].s)) { const p = C.serie[c.series]; const x = get(key(p.s, p.r, p.c)); x.serie.set(c.series, (x.serie.get(c.series) || 0) + 1); }
    });
    // serie bez posiadanych tomów i tak pokazujemy
    Object.entries(C.serie).forEach(([n, p]) => { if (C.byId.has(p.s)) { const x = get(key(p.s, p.r, p.c)); if (!x.serie.has(n)) x.serie.set(n, 0); } });
    const ile = x => x ? x.gry.length + x.tomy.length + [...x.serie.values()].reduce((a, b) => a + Math.max(b, 1), 0) : 0;
    return { gry, kom, cell, key, ile };
  }

  function siatka(sh, Z, opt = {}) {
    let h = `<div class="pk-grid ${sh.kind}" style="grid-template-columns:repeat(${sh.cols || 1},minmax(0,1fr))">`;
    for (let r = 1; r <= (sh.rows || 1); r++) for (let c = 1; c <= (sh.cols || 1); c++) {
      const x = Z ? Z.cell.get(Z.key(sh.id, r, c)) : null;
      const n = Z ? Z.ile(x) : 0;
      const th = x ? x.gry.concat(x.tomy).filter(i => i.thumb || i.image).slice(0, opt.small ? 0 : 6) : [];
      const nazwa = sh.cells && sh.cells[r + '-' + c];
      const cls = (opt.on && opt.on.r === r && opt.on.c === c) ? 'on' : (opt.here && opt.here.r === r && opt.here.c === c ? 'here' : '');
      h += `<button type="button" class="pk-cell ${cls}" data-r="${r}" data-c="${c}" title="${esc(przegrodka(sh, r, c))}">
        <span class="n">${(sh.cols || 1) > 1 ? r + '/' + c : r}</span>
        ${th.length ? `<span class="th">${th.map(i => `<img loading="lazy" src="${esc(i.thumb || i.image)}" alt="" onerror="this.remove()">`).join('')}</span>` : ''}
        ${Z ? `<span class="cnt">${n || ''}</span>` : ''}<span class="lab">${esc(nazwa || (Z && !n ? 'pusto' : ''))}</span></button>`;
    }
    return h + '</div>';
  }

  /* ---------- okno „Gdzie stoi?” dla jednej rzeczy ---------- */
  async function wybierz(itemType, itemId, opt = {}) {
    css(); await ready;
    const store = itemType === 'game' ? 'games' : 'comics';
    const item = await DB.get(store, itemId);
    if (!item) return null;
    if (!C.shelves.length) {
      if (!await App.ui.confirm('Nie masz jeszcze żadnego regału. Dodać pierwszy (np. Kallax)?')) return null;
      if (!await editShelf()) return null;
    }
    const Z = await zawartosc();
    const m = miejsce(itemType, item);
    let shId = (m && m.sh.id) || (await DB.local('polki.ostatni').catch(() => null)) || C.shelves[0].id;
    if (!C.byId.has(shId)) shId = C.shelves[0].id;
    return new Promise(resolve => {
      const dlg = document.createElement('dialog'); dlg.className = 'dlg pk-dlg';
      const tytul = item.title || ((item.series || '') + (item.volume != null ? ' ' + item.volume : ''));
      dlg.innerHTML = `<form method="dialog"><h3>Gdzie stoi „${esc(tytul)}”?</h3>
        ${m ? `<p>Teraz: ${html(itemType, item)}${m.seria ? ' <small class="muted">(miejsce całej serii)</small>' : ''}</p>` : ''}
        <label><span>Regał</span><select id="pk-s">${C.shelves.map(s => `<option value="${esc(s.id)}">${esc(s.name)}${s.place ? ' – ' + esc(s.place) : ''}</option>`).join('')}<option value="__new">+ Nowy regał…</option></select></label>
        <div class="muted" style="font-size:13px">Kliknij przegródkę (rzędy liczone od góry, kolumny od lewej).</div>
        <div id="pk-g"></div>
        ${itemType === 'comic' && item.series ? `<label class="chk"><input type="checkbox" id="pk-ser" ${opt.seria || (m && m.seria) ? 'checked' : ''}> <span>Cała seria „${esc(item.series)}” stoi w tym miejscu</span></label>` : ''}
        <div class="dlg-btns">${m ? '<button value="del" class="ghost danger">Usuń z półki</button>' : ''}<button value="whole" class="ghost">Cały regał (bez przegródki)</button><button value="cancel" class="primary">Zamknij</button></div></form>`;
      document.body.appendChild(dlg);
      const sel = dlg.querySelector('#pk-s'); sel.value = shId;
      const draw = () => {
        const sh = C.byId.get(shId);
        dlg.querySelector('#pk-g').innerHTML = siatka(sh, Z, { here: m && m.sh.id === shId ? m : null });
      };
      draw();
      let wynik = null;
      const zapisz = async (r, c) => {
        const polka = { s: shId, r, c };
        const ser = dlg.querySelector('#pk-ser');
        if (ser && ser.checked) {
          const serie = Object.assign({}, C.serie, { [item.series]: polka }); await DB.setting('polkiSerii', serie);
          if (item.polka) await DB.put(store, Object.assign({}, item, { polka: null }));
        } else await DB.put(store, Object.assign({}, item, { polka }));
        try { await DB.local('polki.ostatni', shId); } catch (e) { }
        await reload();
        wynik = polka; App.ui.toast('📍 ' + tekst(itemType, Object.assign({}, item, ser && ser.checked ? {} : { polka })));
        dlg.close('ok');
      };
      sel.onchange = async () => {
        if (sel.value === '__new') { const s = await editShelf(); if (s) shId = s.id; sel.innerHTML = C.shelves.map(s => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('') + '<option value="__new">+ Nowy regał…</option>'; sel.value = shId; }
        else shId = sel.value;
        draw();
      };
      dlg.querySelector('#pk-g').addEventListener('click', e => { const b = e.target.closest('.pk-cell'); if (b) zapisz(+b.dataset.r, +b.dataset.c); });
      dlg.addEventListener('close', async () => {
        if (dlg.returnValue === 'whole') await zapisz(null, null);
        if (dlg.returnValue === 'del') {
          if (m && m.seria) { const serie = Object.assign({}, C.serie); delete serie[item.series]; await DB.setting('polkiSerii', serie); }
          else await DB.put(store, Object.assign({}, item, { polka: null }));
          await reload(); App.ui.toast('Usunięto z półki'); wynik = false;
        }
        dlg.remove(); resolve(wynik);
      });
      dlg.showModal();
    });
  }

  async function przycisk(btn, itemType, itemId) {
    css(); await ready;
    const store = itemType === 'game' ? 'games' : 'comics';
    const ustaw = async () => { const it = await DB.get(store, itemId); const t = tekst(itemType, it); btn.textContent = t ? '📍 ' + t : '📍 Ustaw półkę'; btn.title = t ? 'Zmień miejsce' : 'Zapisz, gdzie stoi'; };
    await ustaw();
    btn.onclick = async () => { const r = await wybierz(itemType, itemId); if (r !== null) ustaw(); };
  }

  /* ---------- dodawanie wielu rzeczy do jednej przegródki ---------- */
  async function dodajDo(sh, r, c, Z) {
    const zak = { v: 'gry', q: '' };
    const serie = [...new Set(Z.kom.map(k => k.series).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pl'));
    const zazn = { gry: new Set(), serie: new Set(), tomy: new Set() };
    return new Promise(resolve => {
      const dlg = document.createElement('dialog'); dlg.className = 'dlg pk-dlg';
      dlg.innerHTML = `<form method="dialog"><h3>Dodaj: ${esc(sh.name)} · ${esc(przegrodka(sh, r, c) || 'cały regał')}</h3>
        <div class="pk-tabs"><button type="button" data-v="gry" class="on">Gry</button><button type="button" data-v="serie">Serie komiksów</button><button type="button" data-v="tomy">Pojedyncze tomy</button></div>
        <input type="search" id="pk-q" placeholder="Szukaj…" style="margin-top:8px">
        <label class="chk" style="margin-top:6px"><input type="checkbox" id="pk-bez"> <span>Tylko bez półki</span></label>
        <div class="pk-pick" id="pk-l"></div>
        <div class="dlg-btns"><button value="cancel" class="ghost">Anuluj</button><button value="ok" class="primary">Postaw tutaj</button></div></form>`;
      document.body.appendChild(dlg);
      const list = dlg.querySelector('#pk-l'), q = dlg.querySelector('#pk-q'), bez = dlg.querySelector('#pk-bez');
      const draw = () => {
        const f = q.value.trim().toLowerCase();
        let rows = [];
        if (zak.v === 'gry') rows = Z.gry.filter(g => !g.isExpansion || f).map(g => ({ id: g.id, t: g.title + (g.isExpansion ? ' (dodatek)' : ''), gdzie: tekst('game', g) }));
        else if (zak.v === 'serie') rows = serie.map(s => ({ id: s, t: s + ` (${Z.kom.filter(k => k.series === s).length} t.)`, gdzie: C.serie[s] ? tekst('comic', { series: s }) : '' }));
        else rows = Z.kom.map(k => ({ id: k.id, t: (k.series ? k.series + (k.volume != null ? ' ' + k.volume : '') + ' – ' : '') + (k.title || ''), gdzie: k.polka ? tekst('comic', { polka: k.polka }) : '' }));
        rows = rows.filter(x => (!f || x.t.toLowerCase().includes(f)) && (!bez.checked || !x.gdzie));
        rows.sort((a, b) => a.t.localeCompare(b.t, 'pl'));
        const set = zazn[zak.v];
        list.innerHTML = rows.slice(0, 300).map(x => `<label><input type="checkbox" data-id="${esc(x.id)}" ${set.has(x.id) ? 'checked' : ''}> <span>${esc(x.t)}</span>${x.gdzie ? `<small>📍 ${esc(x.gdzie)}</small>` : ''}</label>`).join('') + (rows.length > 300 ? `<p class="muted" style="padding:8px">…i ${rows.length - 300} więcej – zawęź wyszukiwanie.</p>` : '') || '<p class="muted" style="padding:8px">Nic nie znaleziono.</p>';
      };
      list.addEventListener('change', e => { const i = e.target.closest('input[data-id]'); if (!i) return; const set = zazn[zak.v]; i.checked ? set.add(i.dataset.id) : set.delete(i.dataset.id); });
      dlg.querySelectorAll('.pk-tabs button').forEach(b => b.onclick = () => { zak.v = b.dataset.v; dlg.querySelectorAll('.pk-tabs button').forEach(x => x.classList.toggle('on', x === b)); draw(); });
      q.oninput = draw; bez.onchange = draw; draw();
      dlg.addEventListener('close', async () => {
        if (dlg.returnValue === 'ok') {
          const polka = { s: sh.id, r, c };
          const g = Z.gry.filter(x => zazn.gry.has(x.id)).map(x => Object.assign({}, x, { polka }));
          const t = Z.kom.filter(x => zazn.tomy.has(x.id)).map(x => Object.assign({}, x, { polka }));
          if (g.length) await DB.putMany('games', g);
          if (t.length) await DB.putMany('comics', t);
          if (zazn.serie.size) { const s = Object.assign({}, C.serie); zazn.serie.forEach(n => { s[n] = polka; }); await DB.setting('polkiSerii', s); }
          await reload();
          const n = g.length + t.length + zazn.serie.size;
          if (n) App.ui.toast(`Postawiono ${n} ${pl(n, 'pozycję', 'pozycje', 'pozycji')}`);
        }
        dlg.remove(); resolve();
      });
      dlg.showModal();
    });
  }

  /* ---------- zakładka ---------- */
  const st = { szuk: '', otw: null }; // otw = {s, r, c}
  async function render(el) {
    css(); await reload();
    const Z = await zawartosc();
    const bezGier = Z.gry.filter(g => !g.isExpansion && !miejsce('game', g));
    // serie komiksów, w których żaden posiadany tom nie ma miejsca
    const serieBez = new Map();
    Z.kom.forEach(k => { if (!k.series) return; const e = serieBez.get(k.series) || { n: 0, z: 0, id: k.id }; e.n++; if (miejsce('comic', k)) e.z++; serieBez.set(k.series, e); });
    const bezSerii = [...serieBez.entries()].filter(([, e]) => !e.z).sort((a, b) => a[0].localeCompare(b[0], 'pl'));
    el.innerHTML = `
      <div class="pk-head"><h2 style="margin:0">Półki</h2><span class="spacer"></span><button class="primary" id="pkNew">+ Nowy regał</button></div>
      <div class="card" style="margin-top:12px"><input type="search" id="pkQ" style="width:100%" placeholder="Gdzie stoi…? Wpisz tytuł" value="${esc(st.szuk)}"><div id="pkWyn"></div></div>
      ${C.shelves.length ? '' : `<div class="empty">Nie masz jeszcze regałów. Dodaj swoje Kallaxy i inne regały, a potem kliknij przegródkę i wybierz, co w niej stoi.<br><br><button class="primary" id="pkNew2">+ Dodaj pierwszy regał</button></div>`}
      <div class="pk-shelves">${C.shelves.map(sh => {
        const n = [...Z.cell.entries()].filter(([k]) => k.startsWith(sh.id + '|')).reduce((a, [, x]) => a + Z.ile(x), 0);
        return `<div class="card" data-sh="${esc(sh.id)}"><div class="pk-head"><h3>${esc(sh.name)}</h3><span class="spacer"></span>${App.has('polki.zdjecia') ? `<button class="ghost small" data-foto="${esc(sh.id)}" title="Zdjęcia regału – klikaj pudełka albo rozpoznaj tytuły">📷${(sh.zdjecia || []).length ? ' ' + sh.zdjecia.length : ''}</button>` : ''}<button class="ghost small" data-ed="${esc(sh.id)}" title="Edytuj">✏️</button></div>
          <div class="muted" style="font-size:13px">${[sh.place, sh.kind === 'kallax' ? `Kallax ${sh.cols}×${sh.rows}` : `${sh.rows} ${pl(sh.rows, 'półka', 'półki', 'półek')}${sh.cols > 1 ? ' × ' + sh.cols + ' kol.' : ''}`, n + ' ' + pl(n, 'pozycja', 'pozycje', 'pozycji')].filter(Boolean).join(' · ')}</div>
          ${siatka(sh, Z, { on: st.otw && st.otw.s === sh.id ? st.otw : null })}
          ${st.otw && st.otw.s === sh.id ? '<div id="pkCell"></div>' : ''}</div>`;
      }).join('')}</div>
      ${C.shelves.length && bezGier.length ? `<details class="card" style="margin-top:14px"><summary><b>Gry bez półki: ${bezGier.length}</b></summary>
        <div class="list" style="margin-top:10px">${bezGier.sort((a, b) => a.title.localeCompare(b.title, 'pl')).map(g => `<div class="li" data-g="${esc(g.id)}"><div class="main"><div class="t">${esc(g.title)}</div></div><button class="small">📍 Ustaw</button></div>`).join('')}</div></details>` : ''}
      ${C.shelves.length && bezSerii.length ? `<details class="card" style="margin-top:14px"><summary><b>Serie komiksów bez półki: ${bezSerii.length}</b></summary>
        <div class="list" style="margin-top:10px">${bezSerii.map(([n, e]) => `<div class="li" data-ser="${esc(e.id)}"><div class="main"><div class="t">${esc(n)}</div><div class="s">${e.n} ${pl(e.n, 'tom', 'tomy', 'tomów')}</div></div><button class="small">📍 Ustaw serię</button></div>`).join('')}</div></details>` : ''}`;

    const $ = s => el.querySelector(s);
    const nowy = async () => { if (await editShelf()) render(el); };
    $('#pkNew').onclick = nowy; if ($('#pkNew2')) $('#pkNew2').onclick = nowy;
    el.querySelectorAll('[data-foto]').forEach(b => b.onclick = async () => { await App.call('polki.zdjecia', b.dataset.foto); render(el); });
    el.querySelectorAll('[data-ed]').forEach(b => b.onclick = async () => {
      const sh = C.byId.get(b.dataset.ed);
      const co = await App.ui.form(sh.name, [{ name: 'co', label: 'Co zrobić?', type: 'select', value: 'edit', options: [['edit', 'Zmień nazwę / rozmiar'], ['up', 'Przesuń wyżej na liście'], ['del', 'Usuń regał']] }], { ok: 'Dalej' });
      if (!co) return;
      if (co.co === 'edit') await editShelf(sh);
      if (co.co === 'up') { const i = C.shelves.indexOf(sh); if (i > 0) { const a = C.shelves.slice(); a.splice(i, 1); a.splice(i - 1, 0, sh); await DB.putMany('shelves', a.map((s, k) => Object.assign({}, s, { order: k }))); } }
      if (co.co === 'del') await usunRegal(sh);
      render(el);
    });
    el.querySelectorAll('.card[data-sh] .pk-grid').forEach(g => g.addEventListener('click', e => {
      const b = e.target.closest('.pk-cell'); if (!b) return;
      const s = g.closest('[data-sh]').dataset.sh, r = +b.dataset.r, c = +b.dataset.c;
      st.otw = st.otw && st.otw.s === s && st.otw.r === r && st.otw.c === c ? null : { s, r, c };
      render(el);
    }));
    el.querySelectorAll('[data-ser]').forEach(li => li.onclick = async () => { if (await wybierz('comic', li.dataset.ser, { seria: true }) !== null) render(el); });
    el.querySelectorAll('[data-g]').forEach(li => li.onclick = async () => { if (await wybierz('game', li.dataset.g) !== null) render(el); });

    // szukanie „gdzie stoi”
    const wyn = $('#pkWyn');
    const szukaj = () => {
      st.szuk = $('#pkQ').value; const f = st.szuk.trim().toLowerCase();
      if (f.length < 2) { wyn.innerHTML = ''; return; }
      const g = Z.gry.filter(x => x.title.toLowerCase().includes(f)).slice(0, 12).map(x => ({ t: x.title, typ: 'game', it: x }));
      const k = Z.kom.filter(x => ((x.title || '') + ' ' + (x.series || '')).toLowerCase().includes(f)).slice(0, 12).map(x => ({ t: (x.series ? x.series + (x.volume != null ? ' ' + x.volume : '') + ' – ' : '') + (x.title || ''), typ: 'comic', it: x }));
      const all = g.concat(k);
      wyn.innerHTML = all.length ? `<div class="list" style="margin-top:10px">${all.map((x, i) => `<div class="li" data-i="${i}"><div class="main"><div class="t">${esc(x.t)}</div><div class="s">${html(x.typ, x.it) || '<span class="muted">nie wiadomo, gdzie stoi – kliknij, żeby zapisać</span>'}</div></div></div>`).join('')}</div>` : '<p class="muted">Nic nie znaleziono.</p>';
      wyn.querySelectorAll('[data-i]').forEach(li => li.onclick = async () => { const x = all[+li.dataset.i]; if (await wybierz(x.typ, x.it.id) !== null) render(el); });
    };
    $('#pkQ').oninput = szukaj; if (st.szuk) szukaj();

    // otwarta przegródka
    const box = $('#pkCell');
    if (box && st.otw) {
      const sh = C.byId.get(st.otw.s); const { r, c } = st.otw;
      const x = Z.cell.get(Z.key(sh.id, r, c)) || { gry: [], serie: new Map(), tomy: [] };
      const nazwa = (sh.cells || {})[r + '-' + c] || '';
      const pozycje = x.gry.map(g => ({ typ: 'game', id: g.id, t: g.title })).concat([...x.serie.entries()].map(([n, ile]) => ({ typ: 'serie', id: n, t: `📚 ${n}${ile ? ` (${ile} ${pl(ile, 'tom', 'tomy', 'tomów')})` : ''}` })), x.tomy.map(k => ({ typ: 'comic', id: k.id, t: (k.series ? k.series + (k.volume != null ? ' ' + k.volume : '') + ' – ' : '') + (k.title || '') })));
      box.innerHTML = `<div style="margin-top:12px"><div class="pk-head"><b>${esc(przegrodka(sh, r, c))}</b><span class="spacer"></span><button class="small ghost" id="pkName">🏷 Nazwij</button><button class="small primary" id="pkAdd">+ Dodaj tutaj</button></div>
        ${pozycje.length ? `<div class="list" style="margin-top:8px">${pozycje.map((p, i) => `<div class="li" data-p="${i}" style="min-height:44px"><div class="main"><div class="t">${esc(p.t)}</div></div><button class="ghost small" data-rm="${i}" title="Zdejmij z półki">✕</button></div>`).join('')}</div>` : '<p class="muted">Pusto. Kliknij „+ Dodaj tutaj”.</p>'}</div>`;
      if (App.has('pudelka.przegroda')) App.call('pudelka.przegroda', box.firstElementChild, x.gry); // zajętość przegródki (moduł Pudełka i Kallax)
      box.querySelector('#pkAdd').onclick = async () => { await dodajDo(sh, r, c, Z); render(el); };
      box.querySelector('#pkName').onclick = async () => {
        const o = await App.ui.form('Nazwa przegródki', [{ name: 'n', label: 'Np. „Euro ciężkie”, „Imprezówki”, „WKKM 1–60”', value: nazwa }]);
        if (!o) return;
        const cells = Object.assign({}, sh.cells || {}); if (o.n) cells[r + '-' + c] = o.n; else delete cells[r + '-' + c];
        await DB.put('shelves', Object.assign({}, sh, { cells })); render(el);
      };
      box.querySelectorAll('[data-p]').forEach(li => li.onclick = e => {
        if (e.target.closest('[data-rm]')) return;
        const p = pozycje[+li.dataset.p];
        if (p.typ === 'game') App.go('planszowki', { gra: p.id }); else if (p.typ === 'comic') App.go('komiksy', { id: p.id });
      });
      box.querySelectorAll('[data-rm]').forEach(b => b.onclick = async () => {
        const p = pozycje[+b.dataset.rm];
        if (p.typ === 'serie') { const s = Object.assign({}, C.serie); delete s[p.id]; await DB.setting('polkiSerii', s); }
        else { const store = p.typ === 'game' ? 'games' : 'comics'; const it = await DB.get(store, p.id); if (it) await DB.put(store, Object.assign({}, it, { polka: null })); }
        render(el);
      });
    }
  }

  App.registerModule({ id: 'polki', title: 'Półki', icon: '📍', order: 40, render });
  App.provide('polki.tekst', tekst);
  App.provide('polki.html', (t, i) => { css(); return html(t, i); });
  App.provide('polki.przycisk', przycisk);
  App.provide('polki.wybierz', wybierz);
  App.provide('polki.gotowe', () => ready);
  // dla zdjęć półek (moduly/polki/zdjecia.js)
  window.PolkiWew = { C, reload, tekst, przegrodka, css, zawartosc };
})();
