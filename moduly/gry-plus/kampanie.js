/* „Kampanie i legacy” – postęp gier kampanijnych: scenariusz, drużyna (postacie), dziennik sesji,
 * naklejki / trwałe zmiany legacy i odblokowane rzeczy.
 * Kolekcja campaigns: { gameId, title, name, status ('trwa'|'skonczona'|'porzucona'), scenario, players: [{playerId, name, character, notes}],
 *   stickers (tekst: naklejki, zniszczone karty, zmiany na planszy), unlocked (tekst), notes, startedAt, log: [{id, date, scenario, result ('wygrana'|'przegrana'|''), notes}] }
 * Usługa: App.call('kampanie.nowa', gameId)
 */
(function () {
  const G = window.GP, { esc, pl } = G;
  const STATUS = { trwa: 'w trakcie', skonczona: 'ukończona', porzucona: 'porzucona' };
  const WYNIK = { wygrana: '✓ wygrana', przegrana: '✗ przegrana', '': '' };

  async function gryKampanijne() {
    const d = await G.dane();
    const gry = d.games.filter(g => !g.isExpansion && g.status !== 'wishlist' && g.status !== 'sold');
    const kamp = gry.filter(g => { const i = G.info(g); return (i && i.mech.some(m => /Campaign|Legacy/i.test(m))) || /legacy|kampani|campaign|gloomhaven|7th continent|7th citadel/i.test(g.title); });
    return { d, gry, kamp };
  }

  async function edytuj(c, gameId) {
    const { d, gry, kamp } = await gryKampanijne();
    const nowa = !c;
    c = c || { status: 'trwa', gameId: gameId || '', players: [], log: [], startedAt: App.ui.today() };
    const opcje = kamp.concat(gry.filter(g => !kamp.includes(g))).map(g => [g.id, (kamp.includes(g) ? '📜 ' : '') + g.title]);
    const o = await App.ui.form(nowa ? 'Nowa kampania' : 'Edytuj kampanię', [
      { name: 'gameId', label: 'Gra', type: 'select', value: c.gameId, options: [['', '— wybierz —']].concat(opcje) },
      { name: 'name', label: 'Nazwa (np. „Kampania z Kasią”)', value: c.name || '' },
      { name: 'scenario', label: 'Aktualny scenariusz / rozdział / miesiąc', value: c.scenario || '' },
      { name: 'druzyna', label: 'Drużyna – jedna osoba w linii: „Imię – postać”', type: 'textarea', rows: 4, value: (c.players || []).map(p => p.name + (p.character ? ' – ' + p.character : '')).join('\n') },
      { name: 'stickers', label: 'Naklejki i trwałe zmiany (legacy)', type: 'textarea', rows: 3, value: c.stickers || '', placeholder: 'np. naklejka „Fort” na Moskwie, zniszczona karta 23…' },
      { name: 'unlocked', label: 'Odblokowane (koperty, pudełka, postacie, przedmioty)', type: 'textarea', rows: 2, value: c.unlocked || '' },
      { name: 'notes', label: 'Notatki', type: 'textarea', rows: 2, value: c.notes || '' },
      { name: 'status', label: 'Status', type: 'select', value: c.status, options: Object.entries(STATUS) },
      { name: 'startedAt', label: 'Początek', type: 'date', value: c.startedAt || '' }
    ]);
    if (!o) return null;
    if (!o.gameId) { App.ui.toast('Wybierz grę'); return null; }
    const g = d.gameById.get(o.gameId);
    const stare = new Map((c.players || []).map(p => [p.name.toLowerCase(), p]));
    const players = o.druzyna.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
      const [name, ...ch] = l.split(/\s+[–-]\s+/);
      const gr = d.players.find(p => p.name.toLowerCase() === name.trim().toLowerCase());
      return Object.assign({}, stare.get(name.trim().toLowerCase()) || {}, { name: name.trim(), character: ch.join(' – ').trim(), playerId: gr ? gr.id : null });
    });
    const rec = Object.assign({}, c, o, { id: c.id || DB.uid(), title: g ? g.title : '', players });
    delete rec.druzyna;
    await DB.put('campaigns', rec);
    return rec;
  }

  async function sesja(c, s) {
    const o = await App.ui.form(s ? 'Edytuj wpis' : 'Zapisz sesję', [
      { name: 'date', label: 'Data', type: 'date', value: (s && s.date) || App.ui.today() },
      { name: 'scenario', label: 'Scenariusz / rozdział', value: (s && s.scenario) || c.scenario || '' },
      { name: 'result', label: 'Wynik', type: 'select', value: (s && s.result) || '', options: [['', '—'], ['wygrana', 'Wygrana / zaliczony'], ['przegrana', 'Przegrana / do powtórki']] },
      { name: 'notes', label: 'Co się wydarzyło (zdobyte rzeczy, decyzje, naklejki)', type: 'textarea', rows: 4, value: (s && s.notes) || '' },
      { name: 'next', label: 'Następny scenariusz (zapisze się jako aktualny)', value: '' },
      { name: 'play', label: 'Zapisz też jako rozgrywkę w statystykach gry', type: 'checkbox', value: !s }
    ]);
    if (!o) return false;
    const log = (c.log || []).slice();
    const wpis = { id: (s && s.id) || DB.uid(), date: o.date, scenario: o.scenario, result: o.result, notes: o.notes };
    const i = log.findIndex(x => x.id === wpis.id); if (i >= 0) log[i] = wpis; else log.push(wpis);
    log.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    await DB.put('campaigns', Object.assign({}, c, { log, scenario: o.next || o.scenario || c.scenario }));
    if (o.play && c.gameId) {
      await DB.put('plays', { id: DB.uid(), gameId: c.gameId, date: o.date, notes: [c.name, o.scenario, o.notes].filter(Boolean).join(' · '), campaignId: c.id,
        players: (c.players || []).filter(p => p.playerId).map(p => ({ playerId: p.playerId, win: o.result === 'wygrana', score: null })) });
    }
    return true;
  }

  async function widok(el, c) {
    const d = await G.dane(); const g = d.gameById.get(c.gameId);
    const log = (c.log || []).slice().reverse();
    const wyg = (c.log || []).filter(x => x.result === 'wygrana').length, prz = (c.log || []).filter(x => x.result === 'przegrana').length;
    el.innerHTML = `
      <p><a href="#/kampanie">← Kampanie</a></p>
      <div class="row" style="align-items:flex-start;gap:14px">${g ? `<div style="width:84px">${G.okladka(g)}</div>` : ''}
        <div style="flex:1;min-width:0"><h1 style="margin:0">${esc(c.name || c.title)}</h1><p class="muted" style="margin:2px 0">${esc(c.name ? c.title : '')} · ${STATUS[c.status] || ''}${c.startedAt ? ' · od ' + App.ui.fmtDate(c.startedAt) : ''}</p></div></div>
      <div class="stats"><div class="stat"><div class="v" style="font-size:20px">${esc(c.scenario || '–')}</div><div class="l">aktualny scenariusz</div></div>
        <div class="stat"><div class="v">${(c.log || []).length}</div><div class="l">${pl((c.log || []).length, 'sesja', 'sesje', 'sesji')}</div></div>
        <div class="stat"><div class="v">${wyg}/${prz}</div><div class="l">wygrane / przegrane</div></div></div>
      <p class="row"><button class="primary" id="kpS">+ Zapisz sesję</button><button id="kpE">Edytuj</button><button class="ghost danger" id="kpD">Usuń</button></p>
      ${c.players && c.players.length ? `<div class="card"><h3 style="margin:0 0 6px">Drużyna</h3>${c.players.map(p => { const pp = p.playerId && d.playerById.get(p.playerId); return `<div class="row" style="margin:4px 0">${window.KS ? window.KS.avatar(pp || { name: p.name }, 30) : ''}<b>${esc(p.name)}</b>${p.character ? ' <span class="muted">– ' + esc(p.character) + '</span>' : ''}</div>`; }).join('')}</div>` : ''}
      ${c.stickers ? `<div class="card" style="margin-top:10px"><h3 style="margin:0 0 6px">Naklejki i trwałe zmiany</h3><p style="white-space:pre-wrap;margin:0">${esc(c.stickers)}</p></div>` : ''}
      ${c.unlocked ? `<div class="card" style="margin-top:10px"><h3 style="margin:0 0 6px">Odblokowane</h3><p style="white-space:pre-wrap;margin:0">${esc(c.unlocked)}</p></div>` : ''}
      ${c.notes ? `<div class="card" style="margin-top:10px"><h3 style="margin:0 0 6px">Notatki</h3><p style="white-space:pre-wrap;margin:0">${esc(c.notes)}</p></div>` : ''}
      <h2>Dziennik</h2>
      ${log.length ? log.map(s => `<div class="gp-log" data-s="${esc(s.id)}" style="cursor:pointer"><b>${App.ui.fmtDate(s.date)}</b> · ${esc(s.scenario || '')} ${s.result ? `<span class="${s.result === 'wygrana' ? 'gp-ok' : 'gp-no'}">${WYNIK[s.result]}</span>` : ''}${s.notes ? `<div style="white-space:pre-wrap;font-size:14px">${esc(s.notes)}</div>` : ''}</div>`).join('') : '<p class="muted">Jeszcze nie ma sesji. Po każdej rozgrywce kliknij „+ Zapisz sesję”.</p>'}`;
    const $ = s => el.querySelector(s);
    $('#kpS').onclick = async () => { if (await sesja(c)) App.refresh(); };
    $('#kpE').onclick = async () => { if (await edytuj(c)) App.refresh(); };
    $('#kpD').onclick = async () => { if (await App.ui.confirm(`Usunąć kampanię „${c.name || c.title}” razem z dziennikiem?`)) { await DB.remove('campaigns', c.id); App.go('kampanie'); } };
    el.querySelectorAll('[data-s]').forEach(x => x.onclick = async () => { if (await sesja(c, (c.log || []).find(s => s.id === x.dataset.s))) App.refresh(); });
  }

  async function render(el, params) {
    G.css();
    const all = (await DB.all('campaigns')).sort((a, b) => (a.status === 'trwa' ? 0 : 1) - (b.status === 'trwa' ? 0 : 1) || (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    if (params && params.id) { const c = all.find(x => x.id === params.id); if (c) return widok(el, c); }
    let lista = all;
    if (params && params.gra) lista = all.filter(c => c.gameId === params.gra);
    const { d, kamp } = await gryKampanijne();
    const bez = kamp.filter(g => !all.some(c => c.gameId === g.id));
    el.innerHTML = `
      <div class="row"><h1 style="margin:0;flex:1">Kampanie i legacy</h1><button class="primary" id="kpN">+ Nowa kampania</button></div>
      ${params && params.gra ? `<p><a href="#/kampanie">← wszystkie kampanie</a></p>` : ''}
      ${lista.length ? `<div class="list" style="margin-top:12px">${lista.map(c => { const g = d.gameById.get(c.gameId); const ost = (c.log || [])[(c.log || []).length - 1]; return `<div class="li" data-id="${esc(c.id)}">${G.okladka(g)}<div class="main"><div class="t">${esc(c.name || c.title)} ${c.status !== 'trwa' ? `<span class="badge">${STATUS[c.status]}</span>` : ''}</div>
        <div class="s">${esc([c.name ? c.title : '', c.scenario ? 'teraz: ' + c.scenario : '', (c.players || []).map(p => p.name).join(', ')].filter(Boolean).join(' · '))}</div>
        <div class="s muted">${(c.log || []).length} ${pl((c.log || []).length, 'sesja', 'sesje', 'sesji')}${ost ? ' · ostatnio ' + App.ui.fmtDate(ost.date) : ''}</div></div></div>`; }).join('')}</div>` : '<p class="muted" style="margin-top:12px">Nie masz jeszcze zapisanych kampanii.</p>'}
      ${bez.length ? `<div class="card" style="margin-top:14px"><h3 style="margin:0 0 6px">Gry kampanijne w kolekcji bez zapisanego postępu</h3><div class="gp-chips">${bez.map(g => `<button class="gp-chip" data-nowa="${esc(g.id)}">📜 ${esc(g.title)}</button>`).join('')}</div></div>` : ''}`;
    el.querySelector('#kpN').onclick = async () => { const c = await edytuj(null, params && params.gra); if (c) App.go('kampanie', { id: c.id }); };
    el.querySelectorAll('[data-id]').forEach(li => li.onclick = () => App.go('kampanie', { id: li.dataset.id }));
    el.querySelectorAll('[data-nowa]').forEach(b => b.onclick = async () => { const c = await edytuj(null, b.dataset.nowa); if (c) App.go('kampanie', { id: c.id }); });
  }

  App.provide('kampanie.nowa', async gameId => { const c = await edytuj(null, gameId); if (c) App.go('kampanie', { id: c.id }); });
  App.registerModule({ id: 'kampanie', title: 'Kampanie i legacy', icon: '📜', order: 12.8, render });
})();
