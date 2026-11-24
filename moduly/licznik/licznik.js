/* Moduł „Licznik punktów”: punkty wpisywane przy stole w trakcie gry.
 * Po „Zakończ grę” rozgrywka zapisuje się sama (plays) ze zwycięzcą, czasem gry i wynikami.
 * Trwająca gra jest pamiętana na tym urządzeniu (localStorage), więc przeżyje zamknięcie aplikacji.
 * Usługa: App.call('licznik.start', gameId) – otwiera licznik z wybraną grą.
 */
(function () {
  const { esc } = App.ui;
  const K = () => window.KS;
  const KEY = 'licznik.stan';
  const wczytaj = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } };
  const zapisz = s => { try { if (s) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY); } catch (e) {} };
  let tick = null;

  window.IKONY = window.IKONY || {};
  window.IKONY.licznik = '<rect class="f" x="4.5" y="3" width="15" height="18" rx="3"/><path d="M8 7.5h8M8.5 12h1M11.5 12h1M14.5 12h1M8.5 16h1M11.5 16h1M14.5 16h1"/>';
  if (window.IKONY_KOLOR) window.IKONY_KOLOR.licznik = '#e0242f';

  const css = document.createElement('style');
  css.textContent = `
  .lc-pl{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px}
  .lc-card{background:var(--surface);border:1px solid var(--line);border-top:5px solid var(--pc);border-radius:var(--radius);padding:12px 14px;box-shadow:var(--shadow);position:relative}
  .lc-card.lead{box-shadow:0 0 0 2px var(--accent-2),var(--shadow)}
  .lc-top{display:flex;align-items:center;gap:10px}
  .lc-name{font-weight:700;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .lc-score{font-size:46px;font-weight:800;text-align:center;font-variant-numeric:tabular-nums;line-height:1.1;margin:6px 0;cursor:pointer;letter-spacing:-.02em}
  .lc-btns{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
  .lc-btns button{min-height:44px;font-size:17px;font-weight:700;padding:0}
  .lc-add{display:flex;gap:6px;margin-top:6px}.lc-add input{flex:1;min-width:0;text-align:center;font-size:17px}
  .lc-hist{font-size:12px;color:var(--muted);margin-top:6px;min-height:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .lc-time{font-variant-numeric:tabular-nums;font-weight:700;font-size:20px}
  .lc-sel{display:flex;flex-wrap:wrap;gap:8px}
  .lc-sel button{display:flex;align-items:center;gap:8px;border-radius:999px;padding:4px 12px 4px 4px}
  .lc-sel button.on{background:var(--accent-soft);border-color:var(--accent);font-weight:700}
  .lc-gres{display:flex;flex-direction:column;gap:2px;margin-top:4px;max-height:260px;overflow:auto}
  .lc-gres button{justify-content:flex-start;text-align:left;border:0;background:none;display:flex;gap:10px;align-items:center}
  .lc-gres img{width:36px;height:36px;object-fit:contain;border-radius:6px;background:var(--surface2)}
  .lc-crown{position:absolute;top:-14px;right:12px;font-size:22px}
  `;
  document.head.appendChild(css);

  const czas = ms => { const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s % 60).padStart(2, '0'); };
  const lider = st => { const sc = st.players.map(p => p.score); if (!sc.some(v => v !== 0)) return []; const best = st.lowWins ? Math.min(...sc) : Math.max(...sc); return st.players.filter(p => p.score === best).map(p => p.key); };

  /* ---------- ekran przygotowania ---------- */
  async function przygotuj(el, params) {
    const d = await K().dane();
    const gry = d.games.filter(g => g.status !== 'wishlist' && !g.isExpansion).sort((a, b) => a.title.localeCompare(b.title, 'pl'));
    const last = new Map(); d.plays.forEach(p => { if ((p.date || '') > (last.get(p.gameId) || '')) last.set(p.gameId, p.date); });
    const ostatnie = [...last.entries()].sort((a, b) => b[1].localeCompare(a[1])).map(([id]) => d.gameById.get(id)).filter(Boolean).slice(0, 6);
    let gra = params.gra ? d.gameById.get(params.gra) || null : null;
    const czestosc = new Map(); d.plays.forEach(p => p.players.forEach(x => czestosc.set(x.playerId, (czestosc.get(x.playerId) || 0) + 1)));
    const gracze = d.players.slice().sort((a, b) => (b.isMe - a.isMe) || (czestosc.get(b.id) || 0) - (czestosc.get(a.id) || 0) || a.name.localeCompare(b.name, 'pl'));
    const wyb = []; const me = K().ja(d.players); if (me) wyb.push(me.id);
    const nowi = [];
    el.innerHTML = `
      <h1>Licznik punktów</h1>
      <div class="card" style="max-width:760px">
        <h3>1. Gra</h3>
        <div id="lc-gwyb"></div>
        <input type="search" id="lc-g" placeholder="Wpisz tytuł gry…" autocomplete="off">
        <div class="lc-gres" id="lc-gres"></div>
        ${ostatnie.length ? `<div class="ks-sub" style="margin-top:8px">Ostatnio grane:</div><div class="row" style="margin-top:4px">${ostatnie.map(g => `<button class="small" data-last="${esc(g.id)}">${esc(g.title)}</button>`).join('')}</div>` : ''}
        <h3 style="margin-top:18px">2. Gracze <span class="ks-sub" style="font-weight:400">(kolejność kliknięć = kolejność przy stole)</span></h3>
        <div class="lc-sel" id="lc-sel"></div>
        <div class="row" style="margin-top:8px"><input id="lc-new" placeholder="Nowy gracz – imię" style="flex:1;min-width:160px"><button id="lc-newb">+ Dodaj</button></div>
        <h3 style="margin-top:18px">3. Zasady</h3>
        <label class="row" style="gap:8px"><input type="checkbox" id="lc-low"> Wygrywa najmniej punktów (np. golf, Hearts)</label>
        <p class="row" style="margin-top:18px"><button class="primary" id="lc-start">▶ Zaczynamy</button></p>
      </div>`;
    const $ = s => el.querySelector(s);
    const gres = $('#lc-gres'), gi = $('#lc-g');
    const pokazGre = () => { $('#lc-gwyb').innerHTML = gra ? `<div class="row" style="margin-bottom:8px">${gra.thumb || gra.image ? `<img src="${esc(gra.thumb || gra.image)}" alt="" style="width:44px;height:44px;object-fit:contain;border-radius:8px">` : '🎲'}<b>${esc(gra.title)}</b></div>` : ''; };
    pokazGre();
    gi.oninput = () => {
      const q = gi.value.trim().toLowerCase(); gra = null; pokazGre();
      gres.innerHTML = !q ? '' : gry.filter(g => (window.Tytuly ? Tytuly.pasuje(g, q) : g.title.toLowerCase().includes(q))).slice(0, 8).map(g => `<button data-g="${esc(g.id)}">${g.thumb || g.image ? `<img src="${esc(g.thumb || g.image)}" alt="">` : '<span>🎲</span>'}<span>${esc(g.title)}</span></button>`).join('')
        + `<div class="ks-sub" style="padding:4px 8px">Nie ma na liście? Zostaw wpisany tytuł – zapiszę grę jako „spoza kolekcji”.</div>`;
    };
    gres.onclick = e => { const b = e.target.closest('[data-g]'); if (!b) return; gra = d.gameById.get(b.dataset.g); gi.value = ''; gres.innerHTML = ''; pokazGre(); };
    el.querySelectorAll('[data-last]').forEach(b => b.onclick = () => { gra = d.gameById.get(b.dataset.last); gi.value = ''; gres.innerHTML = ''; pokazGre(); });
    const rysuj = () => {
      const wszyscy = gracze.concat(nowi);
      $('#lc-sel').innerHTML = wszyscy.map(p => { const i = wyb.indexOf(p.id); return `<button class="${i >= 0 ? 'on' : ''}" data-p="${esc(p.id)}">${K().avatar(p, 30)}${esc(p.name)}${i >= 0 ? ` <span class="chip">${i + 1}</span>` : ''}</button>`; }).join('');
    };
    rysuj();
    $('#lc-sel').onclick = e => { const b = e.target.closest('[data-p]'); if (!b) return; const i = wyb.indexOf(b.dataset.p); if (i >= 0) wyb.splice(i, 1); else wyb.push(b.dataset.p); rysuj(); };
    const dodaj = () => { const n = $('#lc-new').value.trim(); if (!n) return; const ex = gracze.concat(nowi).find(p => p.name.toLowerCase() === n.toLowerCase()); const id = ex ? ex.id : 'nowy-' + DB.uid(); if (!ex) nowi.push({ id, name: n, _new: true }); if (!wyb.includes(id)) wyb.push(id); $('#lc-new').value = ''; rysuj(); };
    $('#lc-newb').onclick = dodaj; $('#lc-new').onkeydown = e => { if (e.key === 'Enter') dodaj(); };
    $('#lc-start').onclick = () => {
      const typed = gi.value.trim();
      if (!gra && !typed) { App.ui.toast('Wybierz grę'); return; }
      if (!wyb.length) { App.ui.toast('Wybierz graczy'); return; }
      const all = gracze.concat(nowi);
      const st = {
        gameId: gra ? gra.id : null, gameTitle: gra ? gra.title : typed, startedAt: Date.now(), lowWins: $('#lc-low').checked, round: 1, undo: [],
        players: wyb.map(id => { const p = all.find(x => x.id === id); return { key: id, playerId: p._new ? null : p.id, name: p.name, color: K().kolor(p), photo: p.photo || null, score: 0, hist: [] }; })
      };
      zapisz(st); App.go('licznik');
    };
  }

  /* ---------- ekran gry ---------- */
  function gra(el, st) {
    const rysuj = () => {
      const lead = lider(st);
      el.innerHTML = `
        <div class="row" style="margin-bottom:12px"><div style="flex:1;min-width:0"><div class="ks-sub">Licznik punktów · runda ${st.round}</div><h1 style="margin:0">${esc(st.gameTitle)}</h1></div>
          <span class="lc-time" id="lc-t">${czas(Date.now() - st.startedAt)}</span></div>
        <div class="lc-pl">${st.players.map((p, i) => `<div class="lc-card ${lead.includes(p.key) ? 'lead' : ''}" style="--pc:${esc(p.color)}" data-i="${i}">
          ${lead.includes(p.key) ? '<span class="lc-crown">👑</span>' : ''}
          <div class="lc-top">${K().avatar({ name: p.name, color: p.color, photo: p.photo }, 34)}<span class="lc-name">${esc(p.name)}</span></div>
          <div class="lc-score" data-set="${i}" title="Kliknij, żeby wpisać wynik">${K().num(p.score)}</div>
          <div class="lc-btns"><button data-d="-1">−1</button><button data-d="1">+1</button><button data-d="5">+5</button><button data-d="10">+10</button></div>
          <div class="lc-add"><input type="number" inputmode="decimal" step="any" placeholder="np. 12 lub -3" data-in="${i}"><button class="primary" data-ok="${i}">Dodaj</button></div>
          <div class="lc-hist">${p.hist.slice(-12).map(h => (h > 0 ? '+' : '') + K().num(h)).join(' ')}</div></div>`).join('')}</div>
        <div class="row" style="margin-top:14px">
          <button id="lc-round">↻ Następna runda</button>
          <button id="lc-undo" ${st.undo.length ? '' : 'disabled'}>↶ Cofnij</button>
          <span class="spacer"></span>
          <button class="ghost danger" id="lc-cancel">Przerwij bez zapisu</button>
          <button class="primary" id="lc-end">🏁 Zakończ grę</button></div>
        <p class="ks-sub" style="margin-top:10px">${st.lowWins ? 'Wygrywa najmniej punktów. ' : ''}Gra jest pamiętana na tym urządzeniu – możesz zamknąć aplikację i wrócić.</p>`;
      el.querySelectorAll('.lc-card').forEach(c => {
        const i = +c.dataset.i;
        c.querySelectorAll('[data-d]').forEach(b => b.onclick = () => dodaj(i, Number(b.dataset.d)));
        const inp = c.querySelector('[data-in]');
        const ok = () => { const v = Number(String(inp.value).replace(',', '.')); if (inp.value !== '' && !isNaN(v) && v !== 0) dodaj(i, v); };
        c.querySelector('[data-ok]').onclick = ok; inp.onkeydown = e => { if (e.key === 'Enter') ok(); };
        c.querySelector('[data-set]').onclick = async () => {
          const r = await App.ui.form(st.players[i].name + ' – wynik', [{ name: 'v', label: 'Aktualny wynik', type: 'number', step: 'any', value: st.players[i].score }]);
          if (r && r.v != null) dodaj(i, r.v - st.players[i].score);
        };
      });
      el.querySelector('#lc-round').onclick = () => { st.round++; zapisz(st); rysuj(); };
      el.querySelector('#lc-undo').onclick = () => { const u = st.undo.pop(); if (!u) return; st.players[u.i].score -= u.v; st.players[u.i].hist.pop(); zapisz(st); rysuj(); };
      el.querySelector('#lc-cancel').onclick = async () => { if (await App.ui.confirm('Przerwać grę? Wyniki nie zostaną zapisane.')) { zapisz(null); App.go('licznik'); } };
      el.querySelector('#lc-end').onclick = () => koniec(st);
    };
    const dodaj = (i, v) => { st.players[i].score = Math.round((st.players[i].score + v) * 100) / 100; st.players[i].hist.push(v); st.undo.push({ i, v }); if (st.undo.length > 200) st.undo.shift(); zapisz(st); rysuj(); };
    rysuj();
    clearInterval(tick);
    tick = setInterval(() => { const t = document.getElementById('lc-t'); if (!t) { clearInterval(tick); return; } t.textContent = czas(Date.now() - st.startedAt); }, 1000);
  }

  async function koniec(st) {
    const lead = lider(st);
    const ranking = st.players.slice().sort((a, b) => st.lowWins ? a.score - b.score : b.score - a.score);
    const min = Math.max(1, Math.round((Date.now() - st.startedAt) / 60000));
    const out = await App.ui.form('Koniec gry: ' + st.gameTitle, [
      { type: 'html', html: `<div class="list">${ranking.map((p, i) => `<div class="li" style="cursor:default"><b style="width:22px">${i + 1}.</b>${K().avatar({ name: p.name, color: p.color, photo: p.photo }, 30)}<div class="main"><div class="t">${esc(p.name)}</div></div><div class="num">${K().num(p.score)}</div></div>`).join('')}</div>` },
      { name: 'win', label: 'Zwycięzca', type: 'select', value: lead.length === 1 ? lead[0] : (lead.length ? '__auto' : ''), options: [['__auto', lead.length > 1 ? 'Remis: ' + st.players.filter(p => lead.includes(p.key)).map(p => p.name).join(', ') : 'Według punktów'], ...st.players.map(p => [p.key, p.name]), ['__all', 'Wszyscy (kooperacja – wygraliśmy)'], ['__none', 'Nikt (kooperacja – przegraliśmy)']] },
      { name: 'durationMin', label: 'Czas gry (min)', type: 'number', value: min },
      { name: 'date', label: 'Data', type: 'date', value: App.ui.today() },
      { name: 'location', label: 'Miejsce', placeholder: 'np. dom' },
      { name: 'notes', label: 'Notatki', type: 'textarea', rows: 2 }
    ], { ok: 'Zapisz rozgrywkę' });
    if (!out) return;
    // gra: z kolekcji albo nowa „spoza kolekcji”
    let gameId = st.gameId;
    if (!gameId) {
      const ex = (await DB.all('games')).find(g => g.title.toLowerCase() === st.gameTitle.toLowerCase());
      gameId = ex ? ex.id : (await DB.put('games', { title: st.gameTitle, status: 'played' })).id;
    }
    const all = await DB.all('players');
    const ps = [];
    for (const p of st.players) {
      let pid = p.playerId && all.some(x => x.id === p.playerId) ? p.playerId : null;
      if (!pid) { const ex = all.find(x => x.name.toLowerCase() === p.name.toLowerCase()); pid = ex ? ex.id : (await DB.put('players', { name: p.name, color: p.color })).id; }
      const win = out.win === '__all' ? true : out.win === '__none' ? false : out.win === '__auto' || !out.win ? lead.includes(p.key) : out.win === p.key;
      ps.push({ playerId: pid, score: p.score, win });
    }
    const play = await DB.put('plays', { gameId, date: out.date || App.ui.today(), durationMin: out.durationMin, location: out.location, notes: [out.notes, 'Zapisane z licznika punktów' + (st.round > 1 ? ' (' + st.round + ' rund)' : '')].filter(Boolean).join('\n'), coop: out.win === '__all' || out.win === '__none', lowWins: st.lowWins || undefined, players: ps });
    zapisz(null);
    const w = st.players.filter((p, i) => ps[i].win).map(p => p.name);
    App.ui.toast(w.length ? '🏆 Zapisano! Wygrywa: ' + w.join(', ') : 'Zapisano rozgrywkę', 4000);
    App.go('planszowki', { gra: play.gameId });
  }

  App.provide('licznik.start', async gameId => {
    const st = wczytaj();
    if (st) {
      // „Wróć” jest bezpieczne (także po Esc / kliknięciu obok), nowa gra kasuje trwającą
      if (await App.ui.confirm('Trwa już gra w „' + st.gameTitle + '”. Przerwać ją i zacząć nową?', { ok: 'Przerwij i zacznij nową', cancel: 'Wróć do gry' })) zapisz(null);
      else return App.go('licznik');
    }
    App.go('licznik', gameId ? { gra: gameId } : undefined);
  });
  App.registerModule({
    id: 'licznik', title: 'Licznik punktów', icon: '🧮', order: 12.5,
    render(el, params) { const st = wczytaj(); return st ? gra(el, st) : przygotuj(el, params); }
  });
})();
