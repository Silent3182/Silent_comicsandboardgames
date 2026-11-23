/* Moduł „Wypożyczenia” (🤝): komu pożyczyłem grę/komiks i kiedy (oraz co sam pożyczyłem od innych).
 * Kolekcja loans: { itemType ('game'|'comic'|'other'), itemId, title, person, direction ('out' = pożyczyłem komuś | 'in' = od kogoś),
 *                   lentAt ('RRRR-MM-DD'), dueAt, returnedAt, notes }
 * Usługi:
 *   App.call('wypozyczenia.pozycz', {itemType, itemId})        – okno „Pożycz”
 *   App.call('wypozyczenia.przycisk', button, itemType, itemId) – ustawia przycisk w szczegółach gry/komiksu
 *                                                                  („🤝 Pożycz” albo „🤝 U: Kasia – oddana?”)
 */
(function () {
  const esc = s => App.ui.esc(s);
  const today = () => App.ui.today();
  const days = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);
  const fmt = d => d ? App.ui.fmtDate(d) : '';

  function css() {
    if (document.getElementById('wp-css')) return;
    const st = document.createElement('style'); st.id = 'wp-css';
    st.textContent = `
.wp-li .s b{color:var(--text);font-weight:600}
.wp-late{color:var(--bad);font-weight:650}
.wp-li .act{flex-shrink:0}
.wp-people{display:flex;flex-wrap:wrap;gap:6px;margin:4px 0 14px}
`;
    document.head.appendChild(st);
  }

  async function active() { return (await DB.all('loans')).filter(l => !l.returnedAt); }
  async function activeFor(itemType, itemId) { return (await active()).find(l => l.itemType === itemType && l.itemId === itemId && l.direction !== 'in') || null; }

  /* katalog pozycji do wyboru w formularzu */
  async function catalog() {
    const [games, comics] = await Promise.all([DB.all('games'), DB.all('comics')]);
    const items = [];
    games.filter(g => g.status !== 'sold' && g.status !== 'wishlist').forEach(g => items.push({ itemType: 'game', itemId: g.id, label: g.title + ' (gra)', title: g.title }));
    comics.filter(c => c.status === 'owned' || c.status === 'forSale').forEach(c => {
      const t = c.title || (c.series + (c.volume != null ? ' ' + c.volume : ''));
      items.push({ itemType: 'comic', itemId: c.id, label: t + ' (komiks' + (c.series ? ', ' + c.series + (c.volume != null ? ' #' + c.volume : '') : '') + ')', title: t });
    });
    return items;
  }
  async function people() {
    const [loans, players] = await Promise.all([DB.all('loans', { withDeleted: false }), DB.all('players').catch(() => [])]);
    return [...new Set(loans.map(l => l.person).concat(players.filter(p => !p.isMe).map(p => p.name)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pl'));
  }
  function datalist(id, arr) {
    let dl = document.getElementById(id); if (!dl) { dl = document.createElement('datalist'); dl.id = id; document.body.appendChild(dl); }
    dl.innerHTML = arr.map(s => `<option value="${esc(s)}">`).join('');
  }

  async function edit(loan, pre = {}) {
    const items = await catalog();
    datalist('wp-items', items.map(i => i.label));
    datalist('wp-people', await people());
    const l = loan || {};
    let label = '';
    if (l.itemId || pre.itemId) { const f = items.find(i => i.itemId === (l.itemId || pre.itemId)); label = f ? f.label : (l.title || ''); }
    else label = l.title || '';
    const v = await App.ui.form(loan ? 'Wypożyczenie' : 'Pożycz', [
      { name: 'item', label: 'Co?', value: label, list: 'wp-items', placeholder: 'zacznij pisać tytuł' },
      { name: 'direction', label: 'Kierunek', type: 'select', value: l.direction || 'out', options: [['out', 'Pożyczam komuś'], ['in', 'Pożyczam od kogoś']] },
      { name: 'person', label: 'Komu / od kogo', value: l.person || '', list: 'wp-people' },
      { name: 'lentAt', label: 'Kiedy', type: 'date', value: l.lentAt || today() },
      { name: 'dueAt', label: 'Do kiedy (opcjonalnie)', type: 'date', value: l.dueAt || '' },
      { name: 'notes', label: 'Notatki', type: 'textarea', value: l.notes || '' },
      ...(loan ? [{ name: 'returnedAt', label: 'Oddane dnia (puste = jeszcze nie)', type: 'date', value: l.returnedAt || '' }] : [])
    ], { ok: loan ? 'Zapisz' : 'Pożycz' });
    if (!v) return null;
    if (!v.item || !v.person) { App.ui.toast('Podaj, co i komu'); return null; }
    const f = items.find(i => i.label === v.item);
    const rec = Object.assign({}, l, {
      itemType: f ? f.itemType : (l.itemType && l.title === v.item ? l.itemType : 'other'),
      itemId: f ? f.itemId : (l.title === v.item ? l.itemId : null),
      title: f ? f.title : v.item.replace(/ \((gra|komiks.*)\)$/, ''),
      person: v.person, direction: v.direction, lentAt: v.lentAt || today(), dueAt: v.dueAt || null, notes: v.notes,
      returnedAt: loan ? (v.returnedAt || null) : null
    });
    const saved = await DB.put('loans', rec);
    App.ui.toast(loan ? 'Zapisano' : (v.direction === 'in' ? 'Zapisano: pożyczone od ' : 'Pożyczone: ') + v.person);
    return saved;
  }
  async function giveBack(l) {
    await DB.put('loans', Object.assign({}, l, { returnedAt: today() }));
    App.ui.toast('Oddane: ' + l.title);
  }

  function rowHtml(l, i) {
    const d = days(l.lentAt, today());
    const late = !l.returnedAt && l.dueAt && l.dueAt < today();
    const who = l.direction === 'in' ? 'od' : 'u';
    const when = l.returnedAt ? `${fmt(l.lentAt)} – ${fmt(l.returnedAt)}` : `od ${fmt(l.lentAt)} (${d === 0 ? 'dziś' : d + ' dni'})`;
    return `<div class="li wp-li" data-i="${i}"><div class="ph">${{ game: '🎲', comic: '📚' }[l.itemType] || '📦'}</div>
      <div class="main"><div class="t">${esc(l.title)}</div>
      <div class="s">${who} <b>${esc(l.person)}</b> · ${when}${l.dueAt && !l.returnedAt ? ` · <span class="${late ? 'wp-late' : ''}">do ${fmt(l.dueAt)}${late ? ' – po terminie' : ''}</span>` : ''}${l.notes ? ' · ' + esc(l.notes) : ''}</div></div>
      ${l.returnedAt ? '' : `<button class="small act" data-back="${i}">${l.direction === 'in' ? 'Oddałem ✓' : 'Oddane ✓'}</button>`}</div>`;
  }

  async function render(el, params) {
    css();
    const all = (await DB.all('loans')).sort((a, b) => (b.lentAt || '').localeCompare(a.lentAt || ''));
    const act = all.filter(l => !l.returnedAt);
    const out = act.filter(l => l.direction !== 'in'), inn = act.filter(l => l.direction === 'in');
    const hist = all.filter(l => l.returnedAt).sort((a, b) => (b.returnedAt || '').localeCompare(a.returnedAt || ''));
    const who = params.kto || '';
    const byPerson = {}; out.forEach(l => { byPerson[l.person] = (byPerson[l.person] || 0) + 1; });
    const filt = arr => who ? arr.filter(l => l.person === who) : arr;
    const rows = []; const sec = (title, arr) => arr.length ? `<h2>${title}</h2><div class="card list">${arr.map(l => { rows.push(l); return rowHtml(l, rows.length - 1); }).join('')}</div>` : '';
    el.innerHTML = `<div class="row"><h1 style="margin:0">Wypożyczenia</h1><span class="spacer"></span><button class="primary" id="wpadd">+ Pożycz</button></div>
      <div class="stats" style="margin-top:12px">
        <div class="stat"><div class="v">${out.length}</div><div class="l">pożyczone komuś</div></div>
        <div class="stat"><div class="v">${out.filter(l => l.dueAt && l.dueAt < today()).length}</div><div class="l">po terminie</div></div>
        <div class="stat"><div class="v">${inn.length}</div><div class="l">pożyczone od innych</div></div>
        <div class="stat"><div class="v">${hist.length}</div><div class="l">oddane (historia)</div></div>
      </div>
      ${Object.keys(byPerson).length > 1 ? `<div class="wp-people"><button class="chip ${who ? '' : 'on'}" data-p="">Wszyscy</button>${Object.entries(byPerson).sort((a, b) => b[1] - a[1]).map(([p, n]) => `<button class="chip" data-p="${esc(p)}" style="${who === p ? 'background:var(--accent);color:var(--on-accent)' : ''}">${esc(p)} · ${n}</button>`).join('')}</div>` : ''}
      ${!all.length ? '<div class="empty">Nic nie jest pożyczone.<br>Pożyczysz grę albo komiks przyciskiem „+ Pożycz” albo w szczegółach gry/komiksu (🤝 Pożycz).</div>' : ''}
      ${sec('Pożyczone komuś', filt(out))}
      ${sec('Pożyczone od innych', filt(inn))}
      ${hist.length ? `<details style="margin-top:18px"><summary class="muted">Historia (${hist.length})</summary>${sec('Oddane', filt(hist).slice(0, 200))}</details>` : ''}`;
    el.querySelector('#wpadd').onclick = async () => { if (await edit(null)) App.refresh(); };
    el.querySelectorAll('[data-p]').forEach(b => b.onclick = () => App.go('wypozyczenia', b.dataset.p ? { kto: b.dataset.p } : undefined));
    el.querySelectorAll('.wp-li').forEach(r => r.onclick = async e => {
      const l = rows[+r.dataset.i];
      if (e.target.closest('[data-back]')) { await giveBack(l); return App.refresh(); }
      const choice = await App.ui.form(l.title, [{ type: 'html', html: `<p class="muted">${l.direction === 'in' ? 'od' : 'u'} ${esc(l.person)} od ${fmt(l.lentAt)}</p>` },
        { name: 'a', label: 'Co zrobić?', type: 'select', value: 'edit', options: [['edit', 'Edytuj'], ...(l.itemId ? [['open', 'Otwórz grę/komiks']] : []), ['del', 'Usuń wpis']] }], { ok: 'Dalej' });
      if (!choice) return;
      if (choice.a === 'edit') { if (await edit(l)) App.refresh(); }
      else if (choice.a === 'open') App.go(l.itemType === 'game' ? 'planszowki' : 'komiksy', l.itemType === 'game' ? { gra: l.itemId } : { id: l.itemId });
      else if (choice.a === 'del' && await App.ui.confirm('Usunąć wpis o wypożyczeniu?')) { await DB.remove('loans', l.id); App.refresh(); }
    });
  }

  App.registerModule({ id: 'wypozyczenia', title: 'Wypożyczenia', icon: '🤝', order: 32, render });
  App.provide('wypozyczenia.pozycz', async ({ itemType, itemId }) => {
    const cur = await activeFor(itemType, itemId);
    if (cur) {
      if (await App.ui.confirm(`„${cur.title}” jest u: ${cur.person} (od ${fmt(cur.lentAt)}).\n\nOznaczyć jako oddane?`)) { await giveBack(cur); return true; }
      return false;
    }
    return !!await edit(null, { itemType, itemId });
  });
  App.provide('wypozyczenia.przycisk', async (btn, itemType, itemId) => {
    if (!btn) return;
    const set = async () => {
      const cur = await activeFor(itemType, itemId);
      btn.textContent = cur ? `🤝 U: ${cur.person} – oddane?` : '🤝 Pożycz';
    };
    btn.onclick = async () => { if (await App.call('wypozyczenia.pozycz', { itemType, itemId })) set(); };
    set();
  });
  App.provide('wypozyczenia.aktywne', activeFor);
})();
