/* Moduł „Planszówki”: kolekcja gier (BGG), rozgrywki, gracze i statystyki w stylu BG Stats. */
(function () {
  const { esc } = App.ui;
  const STATUS = { owned: 'w kolekcji', forSale: 'na sprzedaż', sold: 'sprzedana', wishlist: 'chcę kupić', played: 'nie moja (grana u innych)' };
  const pl = (n, one, few, many) => n === 1 ? one : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) ? few : many;
  const num = v => (v == null || v === '' ? '' : String(v).replace('.', ','));
  const prefs = { get(k, d) { try { return localStorage.getItem('pl.' + k) || d; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem('pl.' + k, v); } catch (e) {} } };

  /* ---------- import z BGG (pierwsze uruchomienie) ---------- */
  async function importBgg(force) {
    const B = window.BGG_IMPORT;
    if (!B) return 0;
    if (!force && await DB.setting('bggImported')) return 0;
    const have = await DB.all('games', { withDeleted: true });
    const key = g => g.bggId + '|' + g.title;
    const known = new Set(have.map(key));
    const add = [];
    for (const r of B.rows) {
      const [bggId, exp, title, year, my, bggR, bggPlays, comment, cov, weight] = r;
      const g = { bggId, title };
      if (known.has(key(g))) continue;
      known.add(key(g));
      const img = B.cover(cov);
      add.push({ id: 'bgg-' + bggId + (have.concat(add).some(x => x.bggId === bggId) ? '-' + add.length : ''), bggId, title, year, isExpansion: !!exp,
        myRating: my, bggRating: bggR, bggPlays, weight, notes: comment || '', image: img, thumb: img,
        status: 'owned', minPlayers: null, maxPlayers: null, playTime: null, tags: [], source: 'bgg' });
    }
    if (add.length) await DB.putMany('games', add);
    await DB.setting('bggImported', B.date);
    const players = await DB.all('players');
    if (!players.some(p => p.isMe)) await DB.put('players', { id: 'me', name: 'Ja', isMe: true });
    return add.length;
  }

  /* ---------- wspólne ---------- */
  async function load() {
    const [games, plays, players] = await Promise.all([DB.all('games'), DB.all('plays'), DB.all('players')]);
    const byGame = new Map();
    plays.forEach(p => { if (!byGame.has(p.gameId)) byGame.set(p.gameId, []); byGame.get(p.gameId).push(p); });
    byGame.forEach(a => a.sort((x, y) => (y.date || '').localeCompare(x.date || '')));
    return { games, plays, players, byGame, gameById: new Map(games.map(g => [g.id, g])), playerById: new Map(players.map(p => [p.id, p])) };
  }
  const cover = (g, cls = '') => g && (g.thumb || g.image) ? `<img loading="lazy" class="${cls}" src="${esc(g.thumb || g.image)}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'ph',textContent:'🎲'}))">` : `<span class="ph ${cls}">🎲</span>`;
  const players = g => g.minPlayers ? (g.maxPlayers && g.maxPlayers !== g.minPlayers ? `${g.minPlayers}–${g.maxPlayers}` : `${g.minPlayers}`) + ' os.' : '';
  const statusBadge = g => g.status === 'forSale' ? '<span class="badge sale">na sprzedaż</span>' : g.status === 'sold' ? '<span class="badge sold">sprzedana</span>' : g.status === 'wishlist' ? '<span class="badge wish">chcę</span>' : '';

  /* ---------- formularz gry ---------- */
  async function editGame(g) {
    g = g || { status: 'owned' };
    const out = await App.ui.form(g.id ? 'Edytuj grę' : 'Dodaj grę', [
      { name: 'title', label: 'Tytuł', value: g.title },
      { name: 'year', label: 'Rok wydania', type: 'number', value: g.year },
      { name: 'isExpansion', label: 'To dodatek', type: 'checkbox', value: g.isExpansion },
      { name: 'status', label: 'Status', type: 'select', value: g.status, options: Object.entries(STATUS) },
      { name: 'minPlayers', label: 'Graczy od', type: 'number', value: g.minPlayers },
      { name: 'maxPlayers', label: 'Graczy do', type: 'number', value: g.maxPlayers },
      { name: 'playTime', label: 'Czas gry (min)', type: 'number', value: g.playTime },
      { name: 'myRating', label: 'Moja ocena (1–10)', type: 'number', step: '0.5', value: g.myRating },
      { name: 'publisher', label: 'Wydawca', value: g.publisher },
      { name: 'bggId', label: 'Numer gry w BGG (z adresu boardgamegeek.com/boardgame/NUMER)', type: 'number', value: g.bggId },
      { name: 'image', label: 'Adres okładki (opcjonalnie)', value: g.image, placeholder: 'https://…' },
      { name: 'acquiredAt', label: 'Data zakupu', type: 'date', value: g.acquiredAt },
      { name: 'pricePaid', label: 'Cena zakupu (zł)', type: 'number', step: '0.01', value: g.pricePaid },
      { name: 'notes', label: 'Notatki', type: 'textarea', value: g.notes }
    ]);
    if (!out) return null;
    if (!out.title) { App.ui.toast('Podaj tytuł'); return null; }
    const rec = Object.assign({}, g, out);
    if (out.image !== g.image) rec.thumb = out.image;
    const saved = await DB.put('games', rec);
    App.ui.toast(g.id ? 'Zapisano' : 'Dodano grę');
    return saved;
  }

  /* ---------- wyszukiwanie gier spoza kolekcji ----------
     API BGG wymaga klucza i nie działa z przeglądarki, więc szukamy w Wikidanych (wolne, bez klucza),
     biorąc tylko pozycje z numerem BGG (P2339). Polskie tytuły też działają (np. „Wsiąść do pociągu”). */
  async function searchOnline(q) {
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

  /* Dodatkowe dane z API BGG (bgg-dane.js): ranking, najlepsza liczba graczy, wiek, mechaniki, kategorie, autorzy */
  function bggInfo(g) {
    const d = window.BggDane && window.BggDane.get(), x = d && g.bggId && d.gry[g.bggId];
    if (!x) return '';
    const b = x.best, li = a => a && a.length ? esc(a.slice(0, 8).join(', ')) : '';
    return [
      g.bggRank ? `<dt>Ranking BGG</dt><dd>#${g.bggRank}</dd>` : '',
      b && b[0] ? `<dt>Najlepiej na</dt><dd>${b[0] === b[1] ? b[0] : b[0] + '–' + b[1]} os.</dd>` : '',
      g.minAge ? `<dt>Wiek</dt><dd>od ${g.minAge} lat</dd>` : '',
      x.d && x.d.length ? `<dt>Autorzy</dt><dd>${li(x.d)}</dd>` : '',
      x.m && x.m.length ? `<dt>Mechaniki</dt><dd>${li(x.m)}</dd>` : '',
      x.c && x.c.length ? `<dt>Kategorie</dt><dd>${li(x.c)}</dd>` : ''
    ].join('');
  }

  /* ---------- formularz rozgrywki ---------- */
  async function editPlay(play, presetGameId) {
    const d = await load();
    play = play || { date: App.ui.today(), gameId: presetGameId, players: [] };
    const gamesSorted = d.games.filter(g => g.status !== 'wishlist').sort((a, b) => a.title.localeCompare(b.title, 'pl'));
    const plist = window.KS ? KS.kolejnosc(d.players, d.plays) : d.players.slice().sort((a, b) => (b.isMe - a.isMe) || a.name.localeCompare(b.name, 'pl'));
    const rows = play.players.length ? play.players : [{ playerId: (plist.find(p => p.isMe) || {}).id }];
    const rowHtml = r => `<div class="pl-row">
      <input list="pl-names" class="pn" placeholder="Gracz" value="${esc(r.playerId && d.playerById.get(r.playerId) ? d.playerById.get(r.playerId).name : (r.name || ''))}">
      <input type="number" class="ps" placeholder="Punkty" step="any" value="${r.score == null ? '' : esc(r.score)}">
      <label title="Wygrana" class="chk" style="flex-direction:row;gap:4px"><input type="checkbox" class="pw" ${r.win ? 'checked' : ''}>🏆</label>
      <button type="button" class="ghost small prm" title="Usuń">✕</button></div>`;
    const html = `<datalist id="pl-names">${plist.map(p => `<option value="${esc(p.name)}">`).join('')}</datalist>
      <div style="font-size:13px;color:var(--muted);margin-bottom:4px">Gracze (zaznacz 🏆 zwycięzcę; jeśli nikogo nie zaznaczysz, wygrywa najwyższy wynik)</div>
      <div id="pl-rows">${rows.map(rowHtml).join('')}</div>
      <button type="button" id="pl-add" class="small">+ gracz</button>`;
    const g0 = d.gameById.get(play.gameId);
    let rowsData = null, picked = g0 || null, typed = g0 ? g0.title : '';
    const out = await App.ui.form(play.id ? 'Edytuj rozgrywkę' : 'Nowa rozgrywka', [
      { type: 'html', html: `<label style="margin:0"><span>Gra</span></label>
        <input id="pl-game" type="search" autocomplete="off" placeholder="Zacznij pisać tytuł…" value="${esc(g0 ? g0.title : '')}">
        <div id="pl-gres" class="pl-gres"></div>` },
      { name: 'date', label: 'Data', type: 'date', value: play.date },
      { name: 'durationMin', label: 'Czas (min)', type: 'number', value: play.durationMin },
      { name: 'location', label: 'Miejsce', value: play.location, placeholder: 'np. dom, u Kuby' },
      { type: 'html', html },
      { name: 'coop', label: 'Gra kooperacyjna: wygraliśmy wszyscy', type: 'checkbox', value: play.coop },
      { name: 'notes', label: 'Notatki', type: 'textarea', rows: 2, value: play.notes }
    ], {
      ok: 'Zapisz rozgrywkę',
      onMount(dlg) {
        // wybór gry: najpierw kolekcja, potem (z internetem) gry spoza kolekcji z BGG
        const gi = dlg.querySelector('#pl-game'), gres = dlg.querySelector('#pl-gres');
        let tmr = null, seq = 0;
        const pick = g => { picked = g; gi.value = g.title; seq++; clearTimeout(tmr); gres.innerHTML = App.has('polki.html') ? App.call('polki.html', 'game', g) : ''; /* gdzie stoi gra */ };
        const row = (g, i, src) => `<button type="button" class="pl-gopt" data-src="${src}" data-i="${i}">${g.thumb || g.image ? `<img src="${esc(g.thumb || g.image)}" alt="" onerror="this.style.visibility='hidden'">` : '<span class="ph">🎲</span>'}<span><b>${esc(g.title)}</b><small>${[g.year, src === 'bgg' ? 'spoza kolekcji · BGG' : (g.status !== 'owned' ? STATUS[g.status] : '')].filter(Boolean).join(' · ')}</small></span></button>`;
        let local = [], online = [];
        const draw = (note) => {
          gres.innerHTML = local.map((g, i) => row(g, i, 'col')).join('') + (note ? `<div class="pl-gnote">${note}</div>` : '') + online.map((g, i) => row(g, i, 'bgg')).join('');
        };
        gres.addEventListener('click', e => {
          const b = e.target.closest('.pl-gopt'); if (!b) return;
          const arr = b.dataset.src === 'col' ? local : online; pick(arr[+b.dataset.i]);
        });
        gi.addEventListener('input', () => {
          picked = null; const q = gi.value.trim().toLowerCase(); clearTimeout(tmr); online = [];
          if (!q) { local = []; gres.innerHTML = ''; return; }
          local = gamesSorted.filter(g => window.Tytuly ? Tytuly.pasuje(g, q) : g.title.toLowerCase().includes(q)).slice(0, 8);
          if (q.length < 3) { draw(); return; }
          if (!navigator.onLine) { draw('Bez internetu szukam tylko w kolekcji.'); return; }
          draw('Szukam też poza kolekcją…');
          const my = ++seq;
          tmr = setTimeout(async () => {
            try {
              const byBgg = new Map(d.games.filter(g => g.bggId).map(g => [g.bggId, g]));
              const all = await searchOnline(gi.value.trim());
              if (my !== seq) return;
              // polska nazwa gry, którą mam pod angielskim tytułem (np. „Wsiąść do pociągu” → Ticket to Ride)
              all.filter(g => byBgg.has(g.bggId)).forEach(g => { const mine = byBgg.get(g.bggId); if (!local.includes(mine)) local.push(mine); });
              online = all.filter(g => !byBgg.has(g.bggId)).slice(0, 10);
              draw(online.length ? 'Spoza kolekcji (z BGG):' : (local.length ? '' : 'Nic nie znaleziono. Możesz zapisać grę pod wpisaną nazwą.'));
            } catch (err) { if (my === seq) draw('Nie udało się wyszukać w internecie.'); }
          }, 450);
        });
        const box = dlg.querySelector('#pl-rows');
        dlg.querySelector('#pl-add').onclick = () => { box.insertAdjacentHTML('beforeend', rowHtml({})); };
        box.addEventListener('click', e => { if (e.target.classList.contains('prm')) e.target.closest('.pl-row').remove(); });
        dlg.addEventListener('close', () => {
          typed = gi.value.trim();
          rowsData = [...box.querySelectorAll('.pl-row')].map(r => ({ name: r.querySelector('.pn').value.trim(), score: r.querySelector('.ps').value, win: r.querySelector('.pw').checked })).filter(r => r.name);
        }, { once: true });
      }
    });
    if (!out) return null;
    let gameId = null;
    if (picked && picked.id) gameId = picked.id;
    else if (picked && picked.bggId) {
      // gra spoza kolekcji wybrana z BGG – zapisz jako „nie moja”, żeby statystyki miały tytuł i okładkę
      const ex = d.games.find(g => g.bggId === picked.bggId);
      gameId = ex ? ex.id : (await DB.put('games', Object.assign({ id: 'bgg-' + picked.bggId, status: 'played', source: 'wikidata' }, picked, { thumb: picked.image }))).id;
    } else {
      const game = typed && d.games.find(g => g.title.toLowerCase() === typed.toLowerCase());
      if (game) gameId = game.id;
      else {
        if (!typed) { App.ui.toast('Wybierz grę'); return null; }
        const mine = await App.ui.confirm(`Gry „${typed}” nie ma w kolekcji.\n\nOK – dodaj ją do mojej kolekcji\nAnuluj – zapisz jako grę spoza kolekcji`);
        gameId = (await DB.put('games', { title: typed, status: mine ? 'owned' : 'played' })).id;
      }
    }
    const ps = [];
    for (const r of rowsData || []) {
      let p = d.players.find(x => x.name.toLowerCase() === r.name.toLowerCase());
      if (!p) { p = await DB.put('players', { name: r.name }); d.players.push(p); }
      ps.push({ playerId: p.id, score: r.score === '' ? null : Number(r.score), win: r.win || !!out.coop });
    }
    if (!out.coop && ps.length && !ps.some(p => p.win) && ps.some(p => p.score != null)) {
      const max = Math.max(...ps.filter(p => p.score != null).map(p => p.score));
      ps.forEach(p => { p.win = p.score === max; });
    }
    const saved = await DB.put('plays', Object.assign({}, play, { gameId, date: out.date || App.ui.today(), durationMin: out.durationMin, location: out.location, notes: out.notes, coop: out.coop, players: ps }));
    App.ui.toast('Zapisano rozgrywkę');
    return saved;
  }

  /* ---------- widok: kolekcja ---------- */
  const SORTS = {
    title: ['Tytuł', (a, b) => a.title.localeCompare(b.title, 'pl')],
    myRating: ['Moja ocena', (a, b) => (b.myRating || 0) - (a.myRating || 0)],
    bggRating: ['Ocena BGG', (a, b) => (b.bggRating || 0) - (a.bggRating || 0)],
    weight: ['Złożoność', (a, b) => (b.weight || 0) - (a.weight || 0)],
    year: ['Rok wydania', (a, b) => (b.year || 0) - (a.year || 0)],
    plays: ['Liczba partii', (a, b) => b._plays - a._plays],
    last: ['Ostatnio grane', (a, b) => (b._last || '').localeCompare(a._last || '')],
    added: ['Ostatnio dodane', (a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')]
  };
  const FILTERS = { all: 'Wszystkie', base: 'Bez dodatków', exp: 'Dodatki', unplayed: 'Nigdy nie grane', forSale: 'Na sprzedaż', sold: 'Sprzedane', wishlist: 'Chcę kupić', played: 'Grane, nie moje' };

  // Przycisk „BGG ↗” na kafelku/wierszu: od razu strona gry na BoardGameGeek (kliknięcie w resztę kafelka = karta gry) – obsługa w out.onclick.

  async function renderList(el) {
    const d = await load();
    let przytrzymano = 0;
    let q = prefs.get('q', ''), sort = prefs.get('sort', 'title'), filter = prefs.get('filter', 'base'), view = prefs.get('view', 'grid'), dir = prefs.get('dir', '1');
    d.games.forEach(g => { const ps = d.byGame.get(g.id) || []; g._plays = ps.length + (g.bggPlays || 0); g._last = ps[0] && ps[0].date; });
    const owned = d.games.filter(g => g.status === 'owned' || g.status === 'forSale');
    el.innerHTML = `
      <div class="row" style="margin-bottom:8px"><h1 style="margin:0">Planszówki</h1><span class="muted">${owned.filter(g => !g.isExpansion).length} gier i ${owned.filter(g => g.isExpansion).length} dodatków</span><span class="spacer"></span>
        <button class="primary" id="addPlay">+ Rozgrywka</button><button id="addGame">+ Gra</button></div>
      <div class="toolbar">
        <input type="search" id="q" placeholder="Szukaj tytułu (także po polsku)…" value="${esc(q)}">
        <select id="filter">${Object.entries(FILTERS).map(([k, v]) => `<option value="${k}" ${k === filter ? 'selected' : ''}>${v}</option>`).join('')}</select>
        <select id="sort">${Object.entries(SORTS).map(([k, v]) => `<option value="${k}" ${k === sort ? 'selected' : ''}>${v[0]}</option>`).join('')}</select>
        <button id="dir" title="Odwróć kolejność">${dir === '1' ? '↓' : '↑'}</button>
        <span class="seg"><button data-v="grid" class="${view === 'grid' ? 'on' : ''}" title="Kafelki">▦</button><button data-v="list" class="${view === 'list' ? 'on' : ''}" title="Lista">☰</button></span>
      </div>
      <div id="out"></div>`;
    const $ = s => el.querySelector(s);
    function draw() {
      const ql = q.toLowerCase();
      let arr = d.games.filter(g => {
        if (ql && !(window.Tytuly ? Tytuly.pasuje(g, ql) : g.title.toLowerCase().includes(ql))) return false;
        const inCol = g.status === 'owned' || g.status === 'forSale';
        switch (filter) {
          case 'base': return inCol && !g.isExpansion;
          case 'exp': return inCol && g.isExpansion;
          case 'unplayed': return inCol && !g.isExpansion && !g._plays;
          case 'forSale': return g.status === 'forSale';
          case 'sold': return g.status === 'sold';
          case 'wishlist': return g.status === 'wishlist';
          case 'played': return g.status === 'played';
          default: return inCol;
        }
      });
      arr.sort((a, b) => SORTS[sort][1](a, b) || a.title.localeCompare(b.title, 'pl'));
      if (dir === '-1') arr.reverse();
      const sub = g => {
        const bits = [];
        if (sort === 'myRating' && g.myRating) bits.push('★ ' + num(g.myRating));
        else if (sort === 'bggRating' && g.bggRating) bits.push('BGG ' + num(g.bggRating.toFixed(1)));
        else if (sort === 'weight' && g.weight) bits.push('złożoność ' + num(g.weight));
        else if (sort === 'plays') bits.push(g._plays + ' ' + pl(g._plays, 'partia', 'partie', 'partii'));
        else if (sort === 'last') bits.push(g._last ? App.ui.fmtDate(g._last) : 'nie grano');
        else if (g.year) bits.push(g.year);
        return bits.join(' · ');
      };
      const out = $('#out');
      if (!arr.length) { out.innerHTML = '<div class="empty">Nic nie znaleziono.</div>'; return; }
      // doczytywanie: kafelki dochodzą przy przewijaniu (wydajność na telefonie); kliknięcia jednym nasłuchem
      const tile = g => `<div class="tile" data-id="${esc(g.id)}"><div class="cov">${cover(g)}${statusBadge(g)}${g.bggId ? `<button class="pl-bgg" data-bgg="${g.bggId}" title="Otwórz stronę gry na BoardGameGeek">BGG ↗</button>` : ''}</div><div class="meta"><div class="t">${esc(g.title)}</div><div class="s">${g.isExpansion ? '<span class="badge exp">dodatek</span> ' : ''}${esc(sub(g))}</div></div></div>`;
      const line = g => `<div class="li" data-id="${esc(g.id)}">${cover(g)}<div class="main"><div class="t">${esc(g.title)} ${statusBadge(g)}</div><div class="s">${[g.year, g.isExpansion ? 'dodatek' : '', players(g), g.weight ? 'złożoność ' + num(g.weight) : ''].filter(Boolean).join(' · ')}</div></div><div class="num">${g.myRating ? '★ ' + num(g.myRating) : ''}<div class="s muted">${g._plays ? g._plays + '×' : ''}</div></div>${g.bggId ? `<button class="pl-bgg pl-bgg-li" data-bgg="${g.bggId}" title="Otwórz stronę gry na BoardGameGeek">BGG ↗</button>` : ''}</div>`;
      App.ui.lista(out, arr, view === 'grid' ? tile : line, { porcja: view === 'grid' ? 48 : 80, klasa: view === 'grid' ? 'grid' : 'list' });
      out.onclick = e => {
        const b = e.target.closest('[data-bgg]');
        if (b) { e.stopPropagation(); const u = 'https://boardgamegeek.com/boardgame/' + b.dataset.bgg; const w = window.open(u, '_blank'); if (w) w.opener = null; else location.href = u; return; }
        if (Date.now() - przytrzymano < 700) return; // to był koniec przytrzymania, nie kliknięcie
        const t = e.target.closest('[data-id]'); if (t) App.go('planszowki', { gra: t.dataset.id });
      };
      // przytrzymanie okładki (ok. 0,6 s) = szybka partia: licznik punktów z tą grą i graczami z ostatniej partii.
      // Ruch palca o więcej niż kilka pikseli (przewijanie) albo puszczenie wcześniej = zwykłe przewijanie / kliknięcie.
      out.classList.add('pl-lista');
      let tm = null, x0 = 0, y0 = 0;
      const stop = () => { clearTimeout(tm); tm = null; out.querySelectorAll('.pl-hold').forEach(x => x.classList.remove('pl-hold')); };
      out.onpointerdown = e => {
        stop();
        if (e.button > 0 || e.isPrimary === false || !App.has('licznik.start') || e.target.closest('[data-bgg]')) return;
        const t = e.target.closest('[data-id]'); if (!t) return;
        x0 = e.clientX; y0 = e.clientY;
        t.classList.add('pl-hold');
        window.addEventListener('scroll', stop, { passive: true, once: true });
        tm = setTimeout(() => {
          stop(); przytrzymano = Date.now();
          try { if (navigator.vibrate) navigator.vibrate(30); } catch (er) {}
          App.call('licznik.start', t.dataset.id);
        }, 600);
      };
      out.onpointermove = e => { if (tm && Math.hypot(e.clientX - x0, e.clientY - y0) > 10) stop(); };
      out.onpointerup = out.onpointercancel = out.onpointerleave = stop;
      // bez systemowego menu „zapisz obraz” przy przytrzymaniu okładki
      out.oncontextmenu = e => { if (e.target.closest('[data-id]') && App.has('licznik.start')) e.preventDefault(); };
    }
    $('#q').oninput = e => { q = e.target.value; prefs.set('q', q); draw(); };
    $('#filter').onchange = e => { filter = e.target.value; prefs.set('filter', filter); draw(); };
    $('#sort').onchange = e => { sort = e.target.value; prefs.set('sort', sort); draw(); };
    $('#dir').onclick = e => { dir = dir === '1' ? '-1' : '1'; prefs.set('dir', dir); e.target.textContent = dir === '1' ? '↓' : '↑'; draw(); };
    el.querySelectorAll('.seg button').forEach(b => b.onclick = () => { view = b.dataset.v; prefs.set('view', view); el.querySelectorAll('.seg button').forEach(x => x.classList.toggle('on', x === b)); draw(); });
    $('#addGame').onclick = async () => { const g = await editGame(); if (g) App.go('planszowki', { gra: g.id }); };
    $('#addPlay').onclick = async () => { if (await editPlay()) App.refresh(); };
    draw();
  }

  /* ---------- widok: karta gry ---------- */
  async function renderGame(el, id) {
    const d = await load();
    const g = d.gameById.get(id);
    if (!g) { el.innerHTML = '<p>Nie ma takiej gry. <a href="#/planszowki">Wróć</a></p>'; return; }
    const ps = d.byGame.get(id) || [];
    const st = playerStats(ps, d);
    const scores = ps.flatMap(p => p.players.filter(x => x.score != null).map(x => ({ s: x.score, p: x.playerId, date: p.date })));
    const best = scores.length ? scores.reduce((a, b) => (b.s > a.s ? b : a)) : null;
    const avg = scores.length ? scores.reduce((a, b) => a + b.s, 0) / scores.length : null;
    const time = ps.reduce((a, p) => a + (p.durationMin || 0), 0);
    el.innerHTML = `
      <p><a href="#/planszowki">← Kolekcja</a></p>
      <div class="detail">
        <div>${g.image || g.thumb ? `<img class="cover" src="${esc(g.image || g.thumb)}" alt="">` : '<div class="cover" style="display:flex;align-items:center;justify-content:center;font-size:60px">🎲</div>'}</div>
        <div>
          <h1>${esc(g.title)} ${statusBadge(g)}</h1>
          <p id="plTytul" style="margin:-4px 0 6px"></p>
          <p class="muted">${[g.year, g.isExpansion ? 'dodatek' : '', players(g), g.playTime ? g.playTime + ' min' : '', STATUS[g.status]].filter(Boolean).join(' · ')}</p>
          <dl class="kv">
            ${g.myRating ? `<dt>Moja ocena</dt><dd><b>${num(g.myRating)}</b>/10</dd>` : ''}
            ${g.bggRating ? `<dt>Średnia BGG</dt><dd>${num(g.bggRating.toFixed(2))}</dd>` : ''}
            ${g.weight ? `<dt>Złożoność</dt><dd>${num(g.weight)} / 5</dd>` : ''}
            ${bggInfo(g)}
            ${g.publisher ? `<dt>Wydawca</dt><dd>${esc(g.publisher)}</dd>` : ''}
            ${g.acquiredAt ? `<dt>Kupiona</dt><dd>${App.ui.fmtDate(g.acquiredAt)}${g.pricePaid ? ' za ' + num(g.pricePaid) + ' zł' : ''}</dd>` : ''}
            ${g.bggPlays ? `<dt>Partie z BGG</dt><dd>${g.bggPlays} (zapisane wcześniej na BGG)</dd>` : ''}
            ${g.notes ? `<dt>Notatki</dt><dd>${esc(g.notes)}</dd>` : ''}
          </dl>
          <p class="row" style="margin-top:14px">
            <button class="primary" id="play">+ Rozgrywka</button>
            ${App.has('licznik.start') ? '<button id="licz">🧮 Licznik punktów</button>' : ''}
            <button id="edit">Edytuj</button>
            <button id="sell">💰 Wystaw na sprzedaż</button>
            ${App.has('wypozyczenia.przycisk') ? '<button id="lend">🤝 Pożycz</button>' : ''}
            ${App.has('polki.przycisk') && g.status !== 'wishlist' && g.status !== 'played' ? '<button id="shelf">📍 Półka</button>' : ''}
            ${g.bggId ? `<a class="btn" href="https://boardgamegeek.com/boardgame/${g.bggId}" target="_blank" rel="noopener">Otwórz BGG ↗</a>` : ''}
            <button id="del" class="danger ghost">Usuń</button>
          </p>
        </div>
      </div>
      <div id="przyGrze"></div>
      <div id="grPlus"></div>
      <h2>Statystyki</h2>
      <div class="stats">
        <div class="stat"><div class="v">${ps.length}</div><div class="l">${pl(ps.length, 'rozgrywka', 'rozgrywki', 'rozgrywek')} w aplikacji</div></div>
        <div class="stat"><div class="v" style="font-size:20px">${ps[0] ? App.ui.fmtDate(ps[0].date) : '–'}</div><div class="l">ostatnio</div></div>
        <div class="stat"><div class="v">${time ? Math.round(time / 60 * 10) / 10 + ' h' : '–'}</div><div class="l">łączny czas</div></div>
        <div class="stat"><div class="v">${best ? num(best.s) : '–'}</div><div class="l">rekord${best ? ' · ' + esc((d.playerById.get(best.p) || {}).name || '?') : ''}</div></div>
        <div class="stat"><div class="v">${avg != null ? num(Math.round(avg * 10) / 10) : '–'}</div><div class="l">średni wynik</div></div>
      </div>
      ${st.length ? `<div class="card"><table class="tbl"><thead><tr><th>Gracz</th><th class="n">Partie</th><th class="n">Wygrane</th><th class="n">% wygranych</th><th class="n">Najlepszy wynik</th></tr></thead><tbody>
        ${st.map(s => `<tr><td>${esc(s.name)}</td><td class="n">${s.plays}</td><td class="n">${s.wins}</td><td class="n">${Math.round(s.wins / s.plays * 100)}%</td><td class="n">${s.best != null ? num(s.best) : ''}</td></tr>`).join('')}
      </tbody></table></div>` : ''}
      <h2>Rozgrywki</h2>
      <div id="plays">${playsList(ps, d, false)}</div>`;
    const $ = s => el.querySelector(s);
    $('#play').onclick = async () => { if (await editPlay(null, id)) App.refresh(); };
    if ($('#licz')) $('#licz').onclick = () => App.call('licznik.start', id);
    $('#edit').onclick = async () => { if (await editGame(g)) App.refresh(); };
    $('#sell').onclick = () => App.call('sprzedaz.wystaw', { itemType: 'game', itemId: id });
    if ($('#lend')) App.call('wypozyczenia.przycisk', $('#lend'), 'game', id);
    if ($('#shelf')) App.call('polki.przycisk', $('#shelf'), 'game', id);
    if (App.has('grplus.sekcja')) App.call('grplus.sekcja', $('#grPlus'), g); // dodatki, mechaniki, pudełko, wymiana, kampanie
    if (App.has('tytuly.karta')) App.call('tytuly.karta', $('#plTytul'), g); // polskie nazwy gry
    if (App.has('przygrze.sekcja') && g.status !== 'played') App.call('przygrze.sekcja', $('#przyGrze'), g); // instrukcja, koszulki, braki
    $('#del').onclick = async () => {
      if (!await App.ui.confirm(`Usunąć „${g.title}” z kolekcji?${ps.length ? ' Rozgrywki tej gry zostaną w statystykach.' : ''}\n\nJeśli grę sprzedałeś, lepiej zmień jej status na „sprzedana” (Edytuj).`)) return;
      await DB.remove('games', id); App.ui.toast('Usunięto'); App.go('planszowki');
    };
    bindPlays(el, d);
  }

  function playsList(ps, d, showGame) {
    if (!ps.length) return '<div class="empty">Brak zapisanych rozgrywek.</div>';
    return `<div class="list">${ps.map(p => {
      const g = d.gameById.get(p.gameId);
      const who = p.players.slice().sort((a, b) => (b.score ?? -1e9) - (a.score ?? -1e9)).map(x => {
        const n = esc((d.playerById.get(x.playerId) || {}).name || '?');
        return (x.win ? '🏆 <b>' + n + '</b>' : n) + (x.score != null ? ' ' + num(x.score) : '');
      }).join(', ');
      return `<div class="li" data-play="${esc(p.id)}">${showGame ? cover(g) : ''}<div class="main"><div class="t">${showGame ? esc(g ? g.title : '(usunięta gra)') : App.ui.fmtDate(p.date)}</div><div class="s">${showGame ? App.ui.fmtDate(p.date) + ' · ' : ''}${who || 'bez graczy'}${p.durationMin ? ' · ' + p.durationMin + ' min' : ''}${p.location ? ' · ' + esc(p.location) : ''}</div></div></div>`;
    }).join('')}</div>`;
  }
  function bindPlays(el, d) {
    el.querySelectorAll('[data-play]').forEach(r => r.onclick = async () => {
      const p = d.plays.find(x => x.id === r.dataset.play);
      const g = d.gameById.get(p.gameId);
      const act = await App.ui.form(`${g ? g.title : 'Rozgrywka'} · ${App.ui.fmtDate(p.date)}`, [
        { name: 'a', label: 'Co zrobić?', type: 'select', value: 'edit', options: [['edit', 'Edytuj'], ['del', 'Usuń rozgrywkę'], ['game', 'Pokaż grę']] }
      ], { ok: 'Dalej' });
      if (!act) return;
      if (act.a === 'edit') { if (await editPlay(p)) App.refresh(); }
      else if (act.a === 'del') { if (await App.ui.confirm('Usunąć tę rozgrywkę?')) { await DB.remove('plays', p.id); App.refresh(); } }
      else App.go('planszowki', { gra: p.gameId });
    });
  }

  function playerStats(ps, d) {
    const m = new Map();
    ps.forEach(p => p.players.forEach(x => {
      const s = m.get(x.playerId) || { id: x.playerId, name: (d.playerById.get(x.playerId) || {}).name || '?', plays: 0, wins: 0, best: null, games: new Set() };
      s.plays++; if (x.win) s.wins++; if (x.score != null && (s.best == null || x.score > s.best)) s.best = x.score; s.games.add(p.gameId);
      m.set(x.playerId, s);
    }));
    return [...m.values()].sort((a, b) => b.plays - a.plays);
  }

  App.registerModule({
    id: 'planszowki', title: 'Planszówki', icon: '🎲', order: 10,
    async render(el, params) {
      const n = await importBgg(false);
      if (n) App.ui.toast(`Zaimportowano ${n} pozycji z BGG (Silent82)`, 4000);
      if (params.gra) return renderGame(el, params.gra);
      return renderList(el);
    }
  });

  /* ---------- zakładka: Rozgrywki i statystyki ---------- */
  App.registerModule({
    id: 'rozgrywki', title: 'Rozgrywki', icon: '📊', order: 11,
    async render(el, params) {
      await importBgg(false);
      const d = await load();
      const tab = params.tab || 'staty';
      const years = [...new Set(d.plays.map(p => (p.date || '').slice(0, 4)).filter(Boolean))].sort().reverse();
      const year = params.rok || '';
      el.innerHTML = `
        <div class="row" style="margin-bottom:8px"><h1 style="margin:0">Rozgrywki</h1><span class="spacer"></span>
          <select id="rok"><option value="">Cały czas</option>${years.map(y => `<option ${y === year ? 'selected' : ''}>${y}</option>`).join('')}</select>
          ${App.has('zegar.start') ? '<button id="zegPlay">⏱️ Zegar tur</button>' : ''}${App.has('licznik.start') ? '<button id="liczPlay">🧮 Licznik</button>' : ''}<button class="primary" id="addPlay">+ Rozgrywka</button></div>
        <div class="tabs">${[['staty', 'Statystyki'], ['historia', 'Historia'], ['gracze', 'Gracze'], ['polka', 'Półka wstydu']].map(([k, v]) => `<button data-t="${k}" class="${k === tab ? 'on' : ''}">${v}</button>`).join('')}</div>
        <div id="out"></div>`;
      el.querySelectorAll('.tabs button').forEach(b => b.onclick = () => App.go('rozgrywki', Object.assign({ tab: b.dataset.t }, year ? { rok: year } : {})));
      el.querySelector('#rok').onchange = e => App.go('rozgrywki', Object.assign({ tab }, e.target.value ? { rok: e.target.value } : {}));
      el.querySelector('#addPlay').onclick = async () => { if (await editPlay()) App.refresh(); };
      if (el.querySelector('#zegPlay')) el.querySelector('#zegPlay').onclick = () => App.call('zegar.start');
      if (el.querySelector('#liczPlay')) el.querySelector('#liczPlay').onclick = () => App.call('licznik.start');
      const out = el.querySelector('#out');
      const plays = d.plays.filter(p => !year || (p.date || '').startsWith(year)).sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || ''));

      if (tab === 'historia') { out.innerHTML = playsList(plays, d, true); bindPlays(out, d); return; }

      if (tab === 'gracze') {
        const st = playerStats(plays, d);
        const known = new Set(st.map(s => s.id));
        d.players.filter(p => !known.has(p.id)).forEach(p => st.push({ id: p.id, name: p.name, plays: 0, wins: 0, best: null, games: new Set() }));
        out.innerHTML = `<div class="card"><table class="tbl"><thead><tr><th>Gracz</th><th class="n">Partie</th><th class="n">Wygrane</th><th class="n">% wygranych</th><th class="n">Różnych gier</th><th></th></tr></thead><tbody>
          ${st.map(s => `<tr><td>${App.has('gracze.avatar') ? `<a href="#/gracze?gracz=${encodeURIComponent(s.id)}">${esc(s.name)}</a>` : esc(s.name)}${(d.playerById.get(s.id) || {}).isMe ? ' <span class="chip">to ja</span>' : ''}</td><td class="n">${s.plays}</td><td class="n">${s.wins}</td><td class="n">${s.plays ? Math.round(s.wins / s.plays * 100) + '%' : ''}</td><td class="n">${s.games.size}</td><td class="n"><button class="small ghost" data-ren="${esc(s.id)}">Zmień nazwę</button></td></tr>`).join('')}
          </tbody></table></div><p><button id="addP">+ Dodaj gracza</button></p>`;
        out.querySelectorAll('[data-ren]').forEach(b => b.onclick = async () => {
          const p = d.playerById.get(b.dataset.ren); if (!p) return;
          const r = await App.ui.form('Gracz', [{ name: 'name', label: 'Imię / ksywka', value: p.name }, { name: 'isMe', label: 'To ja', type: 'checkbox', value: p.isMe }]);
          if (r && r.name) { await DB.put('players', Object.assign({}, p, r)); App.refresh(); }
        });
        out.querySelector('#addP').onclick = async () => { const r = await App.ui.form('Nowy gracz', [{ name: 'name', label: 'Imię / ksywka' }]); if (r && r.name) { await DB.put('players', { name: r.name }); App.refresh(); } };
        return;
      }

      if (tab === 'polka') {
        const playedIds = new Set(d.plays.map(p => p.gameId));
        const shelf = d.games.filter(g => (g.status === 'owned') && !g.isExpansion && !playedIds.has(g.id) && !g.bggPlays).sort((a, b) => a.title.localeCompare(b.title, 'pl'));
        out.innerHTML = `<p class="muted">Gry z kolekcji, w które nie zagrałeś ani razu (ani w aplikacji, ani na BGG): ${shelf.length}.</p>
          <div class="grid">${shelf.map(g => `<div class="tile" data-id="${esc(g.id)}"><div class="cov">${cover(g)}</div><div class="meta"><div class="t">${esc(g.title)}</div><div class="s">${g.year || ''}</div></div></div>`).join('')}</div>`;
        out.querySelectorAll('[data-id]').forEach(t => t.onclick = () => App.go('planszowki', { gra: t.dataset.id }));
        return;
      }

      // statystyki ogólne
      const gameCounts = new Map();
      plays.forEach(p => gameCounts.set(p.gameId, (gameCounts.get(p.gameId) || 0) + 1));
      const counts = [...gameCounts.values()].sort((a, b) => b - a);
      let h = 0; counts.forEach((c, i) => { if (c >= i + 1) h = i + 1; });
      const mins = plays.reduce((a, p) => a + (p.durationMin || 0), 0);
      const me = d.players.find(p => p.isMe);
      const myPlays = me ? plays.filter(p => p.players.some(x => x.playerId === me.id)) : [];
      const myWins = me ? myPlays.filter(p => p.players.some(x => x.playerId === me.id && x.win)).length : 0;
      const days = new Set(plays.map(p => p.date)).size;
      const top = [...gameCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
      // wykres po miesiącach (ostatnie 12 albo wybrany rok)
      const months = [];
      if (year) for (let m = 1; m <= 12; m++) months.push(year + '-' + String(m).padStart(2, '0'));
      else { const n = new Date(); for (let i = 11; i >= 0; i--) { const dt = new Date(n.getFullYear(), n.getMonth() - i, 1); months.push(dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0')); } }
      const per = months.map(m => d.plays.filter(p => (p.date || '').startsWith(m)).length);
      const maxPer = Math.max(1, ...per);
      const MN = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];
      // dzień tygodnia
      const DN = ['nd', 'pn', 'wt', 'śr', 'cz', 'pt', 'sb'];
      const perDay = [0, 0, 0, 0, 0, 0, 0]; plays.forEach(p => { if (p.date) perDay[new Date(p.date + 'T12:00').getDay()]++; });
      const maxDay = Math.max(1, ...perDay);
      const bggTotal = d.games.reduce((a, g) => a + (g.bggPlays || 0), 0);

      out.innerHTML = !plays.length ? `<div class="empty">Nie ma jeszcze rozgrywek${year ? ' w ' + year : ''}. Dodaj pierwszą przyciskiem „+ Rozgrywka”.<br><br><span class="muted">Na BGG masz zapisane łącznie ${bggTotal} partii (widać je w kartach gier).</span></div>` : `
        <div class="stats">
          <div class="stat"><div class="v">${plays.length}</div><div class="l">${pl(plays.length, 'rozgrywka', 'rozgrywki', 'rozgrywek')}</div></div>
          <div class="stat"><div class="v">${gameCounts.size}</div><div class="l">różnych gier</div></div>
          <div class="stat"><div class="v">${h}</div><div class="l">indeks H <span title="h gier zagranych co najmniej h razy">ⓘ</span></div></div>
          <div class="stat"><div class="v">${Math.round(mins / 60)}</div><div class="l">godzin gry</div></div>
          <div class="stat"><div class="v">${days}</div><div class="l">dni z grą</div></div>
          ${me ? `<div class="stat"><div class="v">${myPlays.length ? Math.round(myWins / myPlays.length * 100) : 0}%</div><div class="l">moich wygranych (${myWins}/${myPlays.length})</div></div>` : ''}
        </div>
        <div class="card"><h3>Rozgrywki w miesiącach</h3>
          <div class="bars">${per.map((v, i) => `<div class="b" style="height:${v / maxPer * 100}%" title="${months[i]}: ${v}"></div>`).join('')}</div>
          <div class="bars-l">${months.map(m => `<span>${MN[+m.slice(5) - 1]}</span>`).join('')}</div></div>
        <div class="card"><h3>Najczęściej grane</h3><table class="tbl"><tbody>
          ${top.map(([gid, c]) => { const g = d.gameById.get(gid); return `<tr data-id="${esc(gid)}" style="cursor:pointer"><td>${esc(g ? g.title : '(usunięta)')}</td><td style="width:40%"><div class="hbar"><i style="width:${c / top[0][1] * 100}%"></i></div></td><td class="n">${c}</td></tr>`; }).join('')}
        </tbody></table></div>
        <div class="card"><h3>Dni tygodnia</h3><table class="tbl"><tbody>
          ${[1, 2, 3, 4, 5, 6, 0].map(i => `<tr><td style="width:40px">${DN[i]}</td><td><div class="hbar"><i style="width:${perDay[i] / maxDay * 100}%"></i></div></td><td class="n" style="width:40px">${perDay[i]}</td></tr>`).join('')}
        </tbody></table></div>`;
      out.querySelectorAll('tr[data-id]').forEach(t => t.onclick = () => App.go('planszowki', { gra: t.dataset.id }));
    }
  });

  window.Planszowki = { importBgg, editPlay, editGame };
  // Import przy starcie, niezależnie od otwartej zakładki (identyfikatory są stałe, więc synchronizacja ich nie zdubluje).
  window.addEventListener('load', () => importBgg(false).catch(() => {}));
})();
