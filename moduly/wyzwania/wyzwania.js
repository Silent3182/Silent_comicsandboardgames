/* Moduł „Wyzwania”: cele typu „10×10 w tym roku” albo „50 zeszytów w miesiąc” z paskiem postępu.
 * Kolekcja challenges: { title, type, target, gameId, period ('month'|'year'|'custom'), from, to, archived }
 * Okres 'month'/'year' liczy się zawsze dla bieżącego miesiąca/roku (co okres od nowa), 'custom' – od–do.
 * Postęp liczony na bieżąco z rozgrywek (plays), czytania (readingOrder/comics) i sprzedaży (listings).
 */
(function () {
  const { esc } = App.ui;
  const K = () => window.KS;

  window.IKONY = window.IKONY || {};
  window.IKONY.wyzwania = '<path class="f" d="M7 3.5h10v5a5 5 0 0 1-10 0z"/><path d="M12 13.5v3M8 20.5h8M9.5 16.5h5"/><path d="M10.2 6.6l1.3 1.3 2.4-2.4"/>';
  if (window.IKONY_KOLOR) window.IKONY_KOLOR.wyzwania = '#2c9a57';

  const TYPY = {
    nxn: { nazwa: 'N×N – zagraj N razy w N różnych gier', jedn: '' },
    plays: { nazwa: 'Liczba rozgrywek', jedn: ['rozgrywka', 'rozgrywki', 'rozgrywek'] },
    distinct: { nazwa: 'Różne gry', jedn: ['gra', 'gry', 'gier'] },
    shelf: { nazwa: 'Półka wstydu – zagraj w nigdy nie grane gry', jedn: ['gra', 'gry', 'gier'] },
    game: { nazwa: 'Konkretna gra – zagraj X razy', jedn: ['partia', 'partie', 'partii'] },
    wins: { nazwa: 'Moje wygrane', jedn: ['wygrana', 'wygrane', 'wygranych'] },
    read: { nazwa: 'Przeczytane komiksy', jedn: ['zeszyt', 'zeszyty', 'zeszytów'] },
    sold: { nazwa: 'Sprzedane ogłoszenia', jedn: ['sprzedaż', 'sprzedaże', 'sprzedaży'] }
  };
  const SZABLONY = [
    { title: '10×10 w tym roku', type: 'nxn', target: 10, period: 'year' },
    { title: '50 zeszytów w miesiąc', type: 'read', target: 50, period: 'month' },
    { title: 'Półka wstydu: 10 nowych gier w roku', type: 'shelf', target: 10, period: 'year' },
    { title: '100 rozgrywek w roku', type: 'plays', target: 100, period: 'year' },
    { title: '5×5 w tym miesiącu', type: 'nxn', target: 5, period: 'month' },
    { title: 'Sprzedaj 20 rzeczy w roku', type: 'sold', target: 20, period: 'year' }
  ];
  const MIES = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];
  const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

  // okno czasowe: przesun = 0 bieżący okres, -1 poprzedni
  function okno(c, przesun = 0) {
    const t = new Date();
    if (c.period === 'month') { const a = new Date(t.getFullYear(), t.getMonth() + przesun, 1), b = new Date(a.getFullYear(), a.getMonth() + 1, 0); return { from: iso(a), to: iso(b), opis: MIES[a.getMonth()] + ' ' + a.getFullYear() }; }
    if (c.period === 'year') { const y = t.getFullYear() + przesun; return { from: y + '-01-01', to: y + '-12-31', opis: 'rok ' + y }; }
    return { from: c.from || '0000', to: c.to || '9999', opis: [c.from ? 'od ' + App.ui.fmtDate(c.from) : '', c.to ? 'do ' + App.ui.fmtDate(c.to) : ''].filter(Boolean).join(' ') || 'bez limitu czasu' };
  }

  async function zrodla() {
    const [d, czyt, listings] = await Promise.all([K().dane(), K().odczyty(), DB.all('listings')]);
    const pierwsza = new Map(); d.plays.forEach(p => { if (!pierwsza.has(p.gameId) || (p.date || '') < pierwsza.get(p.gameId)) pierwsza.set(p.gameId, p.date || ''); });
    return Object.assign(d, { czyt, listings, pierwsza, me: K().ja(d.players) });
  }

  /* { n, target, detale } */
  function postep(c, z, w) {
    const inW = dt => dt && dt >= w.from && dt <= w.to;
    const ps = z.plays.filter(p => inW(p.date));
    const cnt = new Map(); ps.forEach(p => cnt.set(p.gameId, (cnt.get(p.gameId) || 0) + 1));
    const gt = id => (z.gameById.get(id) || {}).title || '?';
    const T = c.target || 1;
    switch (c.type) {
      case 'nxn': {
        const top = [...cnt.entries()].sort((a, b) => b[1] - a[1]).slice(0, T);
        return { n: top.reduce((a, [, k]) => a + Math.min(k, T), 0), target: T * T, detale: top.map(([id, k]) => ({ t: gt(id), v: Math.min(k, T) + '/' + T, ok: k >= T })), opisN: `${top.filter(([, k]) => k >= T).length} z ${T} gier ukończonych` };
      }
      case 'plays': return { n: ps.length, target: T };
      case 'distinct': return { n: cnt.size, target: T, detale: [...cnt.keys()].slice(0, 30).map(id => ({ t: gt(id) })) };
      case 'shelf': {
        const nowe = [...cnt.keys()].filter(id => { const g = z.gameById.get(id); return g && g.status !== 'played' && !g.bggPlays && inW(z.pierwsza.get(id)); });
        return { n: nowe.length, target: T, detale: nowe.map(id => ({ t: gt(id), ok: true })) };
      }
      case 'game': return { n: cnt.get(c.gameId) || 0, target: T };
      case 'wins': return { n: z.me ? ps.filter(p => p.players.some(x => x.playerId === z.me.id && x.win)).length : 0, target: T };
      case 'read': return { n: z.czyt.filter(r => inW(r.d)).length, target: T };
      case 'sold': return { n: z.listings.filter(l => l.status === 'sold' && inW((l.soldAt || l.updatedAt || '').slice(0, 10))).length, target: T };
    }
    return { n: 0, target: T };
  }

  async function edytuj(c) {
    const games = (await DB.all('games')).filter(g => !g.isExpansion && g.status !== 'wishlist').sort((a, b) => a.title.localeCompare(b.title, 'pl'));
    const out = await App.ui.form(c.id ? 'Edytuj wyzwanie' : 'Nowe wyzwanie', [
      { name: 'title', label: 'Nazwa', value: c.title, placeholder: 'np. 10×10 w tym roku' },
      { name: 'type', label: 'Rodzaj', type: 'select', value: c.type || 'plays', options: Object.entries(TYPY).map(([k, v]) => [k, v.nazwa]) },
      { name: 'target', label: 'Cel (liczba; przy N×N – N)', type: 'number', value: c.target || 10 },
      { name: 'gameId', label: 'Gra (tylko dla „Konkretna gra”)', type: 'select', value: c.gameId || '', options: [['', '—'], ...games.map(g => [g.id, g.title])] },
      { name: 'period', label: 'Okres', type: 'select', value: c.period || 'year', options: [['month', 'Co miesiąc (bieżący miesiąc)'], ['year', 'Co rok (bieżący rok)'], ['custom', 'Własne daty']] },
      { name: 'from', label: 'Od (dla własnych dat)', type: 'date', value: c.from },
      { name: 'to', label: 'Do (dla własnych dat)', type: 'date', value: c.to }
    ]);
    if (!out) return false;
    if (!out.target || out.target < 1) { App.ui.toast('Podaj cel'); return false; }
    if (out.type === 'game' && !out.gameId) { App.ui.toast('Wybierz grę'); return false; }
    if (!out.title) out.title = TYPY[out.type].nazwa + ': ' + out.target;
    await DB.put('challenges', Object.assign({}, c, out));
    return true;
  }

  async function render(el) {
    const [list, z] = await Promise.all([DB.all('challenges'), zrodla()]);
    const akt = list.filter(c => !c.archived).sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
    const arch = list.filter(c => c.archived);
    const karta = c => {
      const w = okno(c), p = postep(c, z, w);
      const pct = Math.min(100, Math.round(p.n / p.target * 100)), done = p.n >= p.target;
      const jedn = TYPY[c.type] && TYPY[c.type].jedn;
      const poprz = c.period !== 'custom' ? (() => { const w0 = okno(c, -1), p0 = postep(c, z, w0); return `${w0.opis}: ${p0.n}/${p0.target}${p0.n >= p0.target ? ' 🏅' : ''}`; })() : '';
      const left = w.to !== '9999' ? Math.ceil((new Date(w.to + 'T23:59') - Date.now()) / 864e5) : null;
      return `<div class="ks-card" data-c="${esc(c.id)}">
        <div class="row" style="flex-wrap:nowrap"><b style="flex:1;font-size:16px">${done ? '🏅 ' : ''}${esc(c.title)}</b><button class="small ghost" data-e="${esc(c.id)}">⋯</button></div>
        <div class="ks-sub">${esc(w.opis)}${c.type === 'game' ? ' · ' + esc((z.gameById.get(c.gameId) || {}).title || '?') : ''}${left != null && left >= 0 && !done ? ' · zostało ' + left + ' ' + K().pl(left, 'dzień', 'dni', 'dni') : ''}</div>
        <div class="row" style="margin:10px 0 6px;align-items:baseline"><b style="font-size:26px">${p.n}</b><span class="ks-sub">/ ${p.target} ${Array.isArray(jedn) ? K().pl(p.target, ...jedn) : ''}</span><span class="spacer"></span><b style="color:${done ? 'var(--ok)' : 'var(--accent)'}">${pct}%</b></div>
        <div class="ks-bar ${done ? 'done' : ''}"><i style="width:${pct}%"></i></div>
        ${p.opisN ? `<div class="ks-sub" style="margin-top:6px">${p.opisN}</div>` : ''}
        ${p.detale && p.detale.length ? `<div class="row" style="margin-top:8px;gap:4px">${p.detale.map(x => `<span class="chip" style="${x.ok ? 'background:var(--ok-soft)' : ''}">${esc(x.t)}${x.v ? ' · ' + x.v : ''}</span>`).join('')}</div>` : ''}
        ${poprz ? `<div class="ks-sub" style="margin-top:8px">Poprzednio – ${esc(poprz)}</div>` : ''}
      </div>`;
    };
    el.innerHTML = `
      <div class="row" style="margin-bottom:10px"><h1 style="margin:0">Wyzwania</h1><span class="spacer"></span><button class="primary" id="wz-add">+ Wyzwanie</button></div>
      ${akt.length ? `<div class="ks-cards">${akt.map(karta).join('')}</div>` : '<div class="empty">Nie masz jeszcze wyzwań. Wybierz gotowe poniżej albo dodaj własne.</div>'}
      <h2>Gotowe pomysły</h2>
      <div class="row">${SZABLONY.map((s, i) => `<button data-s="${i}">+ ${esc(s.title)}</button>`).join('')}</div>
      ${arch.length ? `<h2>Zakończone / w archiwum</h2><div class="ks-cards" style="opacity:.75">${arch.map(karta).join('')}</div>` : ''}`;
    el.querySelector('#wz-add').onclick = async () => { if (await edytuj({})) App.refresh(); };
    el.querySelectorAll('[data-s]').forEach(b => b.onclick = async () => { const s = SZABLONY[+b.dataset.s]; await DB.put('challenges', Object.assign({}, s)); App.ui.toast('Dodano: ' + s.title); App.refresh(); });
    el.querySelectorAll('[data-e]').forEach(b => b.onclick = async () => {
      const c = list.find(x => x.id === b.dataset.e);
      const a = await App.ui.form(c.title, [{ name: 'a', label: 'Co zrobić?', type: 'select', value: 'edit', options: [['edit', 'Edytuj'], ['arch', c.archived ? 'Przywróć z archiwum' : 'Przenieś do archiwum'], ['del', 'Usuń']] }], { ok: 'Dalej' });
      if (!a) return;
      if (a.a === 'edit') { if (await edytuj(c)) App.refresh(); }
      else if (a.a === 'arch') { await DB.put('challenges', Object.assign({}, c, { archived: !c.archived })); App.refresh(); }
      else if (await App.ui.confirm('Usunąć wyzwanie „' + c.title + '”?')) { await DB.remove('challenges', c.id); App.refresh(); }
    });
  }

  App.provide('wyzwania.lista', async () => { const [list, z] = await Promise.all([DB.all('challenges'), zrodla()]); return list.filter(c => !c.archived).map(c => { const w = okno(c); return Object.assign({ c, w }, postep(c, z, w)); }); });
  App.registerModule({ id: 'wyzwania', title: 'Wyzwania', icon: '🏅', order: 14, render });
})();
