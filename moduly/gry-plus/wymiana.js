/* „Wymienię” – lista gier na wymianę i gotowy tekst do wklejenia na forum (BBCode, np. gry-planszowe.pl)
 * albo zwykły tekst (Facebook, Discord). Opcjonalnie sekcja „Szukam” z listy życzeń.
 * Pola w games: wymiana (true), wymianaCena (zł, gdy też sprzedam), wymianaUwagi (stan, kompletność).
 * Ustawienie 'wymianaTekst' = { naglowek, stopka, miasto, format, szukam } (synchronizowane).
 * Usługa: App.call('wymiana.przelacz', gameId)
 */
(function () {
  const G = window.GP, { esc, pl, num } = G;

  async function przelacz(id) {
    const g = await DB.get('games', id); if (!g) return;
    if (g.wymiana) { await DB.put('games', Object.assign({}, g, { wymiana: false })); App.ui.toast('Usunięto z listy „Wymienię”'); return; }
    const o = await App.ui.form('Wymienię: ' + g.title, [
      { name: 'wymianaUwagi', label: 'Stan / uwagi (np. „koszulki, kompletna, PL”)', value: g.wymianaUwagi || '' },
      { name: 'wymianaCena', label: 'Cena, jeśli też sprzedasz (zł, opcjonalnie)', type: 'number', step: '1', value: g.wymianaCena }
    ], { ok: 'Dodaj do wymiany' });
    if (!o) return;
    await DB.put('games', Object.assign({}, g, o, { wymiana: true }));
    App.ui.toast('Dodano do listy „Wymienię” 🔁');
  }

  function tekst(cfg, gry, szukam) {
    const bb = cfg.format !== 'txt';
    const B = s => bb ? `[b]${s}[/b]` : s;
    const url = g => g.bggId ? (bb ? `[url=https://boardgamegeek.com/boardgame/${g.bggId}]${g.title}[/url]` : g.title) : g.title;
    const poz = g => `${url(g)}${g.year ? ` (${g.year})` : ''}${g.wymianaUwagi ? ' – ' + g.wymianaUwagi : ''}${g.wymianaCena ? ' – ' + num(g.wymianaCena) + ' zł' : ''}`;
    const lista = arr => bb ? '[list]\n' + arr.map(x => '[*]' + x).join('\n') + '\n[/list]' : arr.map(x => '• ' + x).join('\n');
    const out = [];
    if (cfg.naglowek) out.push(cfg.naglowek);
    out.push(B('Wymienię:'));
    out.push(lista(gry.map(poz)));
    if (cfg.szukam && szukam.length) { out.push(''); out.push(B('Szukam:')); out.push(lista(szukam.map(g => g.plTitle || g.title))); }
    const st = [cfg.miasto ? 'Odbiór osobisty: ' + cfg.miasto : '', 'Wysyłka paczkomatem InPost.'].filter(Boolean).join(' ');
    out.push(''); out.push(st);
    if (cfg.stopka) out.push(cfg.stopka);
    return out.join('\n');
  }

  async function render(el) {
    G.css();
    const d = await G.dane();
    const cfg = Object.assign({ naglowek: 'Cześć! Mam kilka gier na wymianę, chętnie też sprzedam.', stopka: 'Propozycje proszę na PW.', miasto: '', format: 'bb', szukam: true }, (await DB.setting('wymianaTekst')) || {});
    const gry = d.games.filter(g => g.wymiana && (g.status === 'owned' || g.status === 'forSale')).sort((a, b) => a.title.localeCompare(b.title, 'pl'));
    const szukam = d.games.filter(g => g.status === 'wishlist').sort((a, b) => (a.wishPriority || 9) - (b.wishPriority || 9) || a.title.localeCompare(b.title, 'pl')).slice(0, 25);
    // podpowiedzi: dawno niegrane i nisko ocenione
    const rok = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
    const podp = G.posiadane(d.games).filter(g => !g.wymiana && !g.isExpansion && ((g.myRating && g.myRating <= 6) || (d.partie(g) === 0) || ((d.ostatnia(g) || '') && d.ostatnia(g) < rok)) && !g.zostaje).slice(0, 40);
    el.innerHTML = `
      <h1>Wymienię</h1>
      <div class="card">
        <div class="row"><h3 style="margin:0;flex:1">Na wymianę: ${gry.length} ${pl(gry.length, 'gra', 'gry', 'gier')}</h3><button class="primary small" id="wmAdd">+ Dodaj grę</button></div>
        ${gry.length ? `<div class="list" style="margin-top:8px">${gry.map(g => `<div class="li" data-g="${esc(g.id)}">${G.okladka(g)}<div class="main"><div class="t">${esc(g.title)}</div><div class="s">${esc([g.wymianaUwagi, g.wymianaCena ? num(g.wymianaCena) + ' zł' : ''].filter(Boolean).join(' · '))}</div></div><button class="ghost small" data-rm="${esc(g.id)}" title="Usuń z wymiany">✕</button></div>`).join('')}</div>` : '<p class="muted">Dodaj gry przyciskiem powyżej albo w karcie gry („🔁 Wymienię”).</p>'}
      </div>
      ${podp.length ? `<details class="card" style="margin-top:10px"><summary>Może te? (nisko ocenione, niegrane albo nie grane od roku): ${podp.length}</summary><div class="gp-chips" style="margin-top:8px">${podp.map(g => `<button class="gp-chip" data-p="${esc(g.id)}">+ ${esc(g.title)}</button>`).join('')}</div></details>` : ''}
      <div class="card" style="margin-top:10px">
        <h3 style="margin:0 0 8px">Tekst na forum</h3>
        <div class="row" style="gap:10px;flex-wrap:wrap">
          <select id="wmF"><option value="bb">Forum (BBCode)</option><option value="txt" ${cfg.format === 'txt' ? 'selected' : ''}>Zwykły tekst (Facebook)</option></select>
          <label class="row" style="gap:6px"><input type="checkbox" id="wmS" ${cfg.szukam ? 'checked' : ''}> dopisz „Szukam” z listy życzeń (${szukam.length})</label>
          <button class="small ghost" id="wmCfg">✏️ Nagłówek, miasto, stopka</button>
        </div>
        <div class="gp-pre" id="wmT" style="margin-top:10px"></div>
        <p class="row" style="margin-top:10px"><button class="primary" id="wmC">📋 Kopiuj</button><a class="btn" href="https://www.gry-planszowe.pl/" target="_blank" rel="noopener">Forum gry-planszowe.pl ↗</a></p>
      </div>`;
    const $ = s => el.querySelector(s);
    const pokaz = () => { $('#wmT').textContent = gry.length ? tekst(cfg, gry, szukam) : 'Najpierw dodaj gry na wymianę.'; };
    pokaz();
    const zapisz = async () => { await DB.setting('wymianaTekst', cfg); pokaz(); };
    $('#wmF').onchange = e => { cfg.format = e.target.value; zapisz(); };
    $('#wmS').onchange = e => { cfg.szukam = e.target.checked; zapisz(); };
    $('#wmC').onclick = () => gry.length && G.kopiuj(tekst(cfg, gry, szukam));
    $('#wmCfg').onclick = async () => {
      const o = await App.ui.form('Tekst ogłoszenia', [
        { name: 'naglowek', label: 'Nagłówek', type: 'textarea', rows: 2, value: cfg.naglowek },
        { name: 'miasto', label: 'Miasto (odbiór osobisty)', value: cfg.miasto },
        { name: 'stopka', label: 'Stopka', type: 'textarea', rows: 2, value: cfg.stopka }]);
      if (o) { Object.assign(cfg, o); zapisz(); }
    };
    $('#wmAdd').onclick = async () => {
      const kand = G.posiadane(d.games).filter(g => !g.wymiana).sort((a, b) => a.title.localeCompare(b.title, 'pl'));
      const o = await App.ui.form('Dodaj grę do wymiany', [{ name: 'g', label: 'Gra', type: 'select', options: kand.map(g => [g.id, g.title + (g.isExpansion ? ' (dodatek)' : '')]) }], { ok: 'Dalej' });
      if (o && o.g) { await przelacz(o.g); render(el); }
    };
    el.querySelectorAll('[data-p]').forEach(b => b.onclick = async () => { await przelacz(b.dataset.p); render(el); });
    el.querySelectorAll('[data-rm]').forEach(b => b.onclick = async e => { e.stopPropagation(); await przelacz(b.dataset.rm); render(el); });
    el.querySelectorAll('.li[data-g]').forEach(li => li.onclick = () => App.go('planszowki', { gra: li.dataset.g }));
  }

  App.provide('wymiana.przelacz', przelacz);
  App.registerModule({ id: 'wymiana', title: 'Wymienię', icon: '🔁', order: 33, render });
})();
