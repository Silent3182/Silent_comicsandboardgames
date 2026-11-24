/* Moduł „Wartość kolekcji” (💎): ile wydałem i ile kolekcja jest warta (np. do ubezpieczenia).
 * Pola w rekordach: pricePaid (cena zakupu), estValue (moja wycena) – w games i comics.
 * Komiksy w seriach: cena za tom ustawiana hurtem dla serii (ustawienie 'wartoscSerii' = {seria:{paid,value}}),
 * pojedynczy tom z własną ceną ma pierwszeństwo.
 * Wartość szacowana pozycji = moja wycena → cena z ogłoszenia sprzedaży → moja cena za tom serii
 *   → propozycja wyceny (moduly/wartosc/wyceny.js: ceny okładkowe komiksów, ceny gier w sklepach) → cena zakupu.
 * Propozycje są tylko w pliku danych – niczego nie zapisują w kolekcji, więc nie nadpisują cen wpisanych ręcznie.
 */
(function () {
  const esc = s => App.ui.esc(s);
  const zl = n => (Math.round((n || 0) * 100) / 100).toLocaleString('pl-PL', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' zł';
  const num = v => v === '' || v == null || isNaN(+v) ? null : +v;
  const has = v => v != null && v !== '' && !isNaN(+v);
  const W = Object.assign({ data: '', zrodla: {}, gry: {}, komiksy: {}, serie: {} }, window.WYCENY || {});
  const dataPl = d => d ? d.split('-').reverse().join('.') : '';
  const zrodlo = k => (W.zrodla[k] || k || '');
  // Propozycja wyceny: { v: cena, pewna: true/false, zr: opis źródła }
  const prop = w => w && has(w[0]) ? { v: +w[0], pewna: w[1] === 'p', zr: zrodlo(w[2]) } : null;
  function propGry(g) { return g.bggId != null ? prop(W.gry[g.bggId]) : null; }
  function propKomiksu(c) { const t = prop(W.komiksy[c.id]); if (t) return t; const s = prop(W.serie[c.series]); return s ? Object.assign(s, { seria: true }) : null; }
  const propOpis = p => `${p.pewna ? 'pewna' : 'szacunkowa'} · ${esc(p.zr)}${W.data ? ', ' + dataPl(W.data) : ''}`;

  function css() {
    if (document.getElementById('wr-css')) return;
    const st = document.createElement('style'); st.id = 'wr-css';
    st.textContent = `
.wr-tbl input{width:96px;padding:6px 8px;text-align:right;font-variant-numeric:tabular-nums}
.wr-tbl td{vertical-align:middle}
.wr-tbl .t{max-width:340px}
.wr-tbl a{font-size:12.5px;white-space:nowrap}
.wr-wrap{overflow-x:auto}
.wr-note{color:var(--muted);font-size:13px;margin:6px 0 12px}
@media (max-width:760px){ .wr-tbl input{width:66px;padding:6px} .wr-wrap .hide-s{display:none} .wr-wrap table.tbl th,.wr-wrap table.tbl td{padding:8px 5px} .wr-head{flex-wrap:wrap} }
`;
    document.head.appendChild(st);
  }

  async function data() {
    const [games, comics, listings, ser] = await Promise.all([DB.all('games'), DB.all('comics'), DB.all('listings').catch(() => []), DB.setting('wartoscSerii')]);
    const S = ser || {};
    const listPrice = new Map();
    listings.filter(l => l.status !== 'sold' && has(l.price)).forEach(l => listPrice.set(l.itemType + ':' + l.itemId, +l.price));
    const items = [];
    games.filter(g => g.status === 'owned' || g.status === 'forSale' || !g.status).forEach(g => {
      const lp = listPrice.get('game:' + g.id);
      const paid = has(g.pricePaid) ? +g.pricePaid : null;
      const pr = propGry(g);
      const val = has(g.estValue) ? +g.estValue : lp != null ? lp : pr ? pr.v : paid;
      items.push({ type: 'game', rec: g, title: g.title, group: g.isExpansion ? 'Dodatki do gier' : 'Gry planszowe', paid, val, prop: pr,
        valSrc: has(g.estValue) ? 'moja' : lp != null ? 'ogłoszenie' : pr ? 'propozycja' : paid != null ? 'zakup' : '' });
    });
    comics.filter(c => c.status === 'owned' || c.status === 'forSale').forEach(c => {
      const sd = S[c.series] || {};
      const lp = listPrice.get('comic:' + c.id);
      const paid = has(c.pricePaid) ? +c.pricePaid : has(sd.paid) ? +sd.paid : null;
      const pr = propKomiksu(c);
      const val = has(c.estValue) ? +c.estValue : lp != null ? lp : has(sd.value) ? +sd.value : pr ? pr.v : paid;
      items.push({ type: 'comic', rec: c, title: c.title || (c.series + ' ' + (c.volume || '')), series: c.series || 'Bez serii', group: 'Komiksy', paid, val, prop: pr,
        valSrc: has(c.estValue) ? 'moja' : lp != null ? 'ogłoszenie' : has(sd.value) ? 'seria' : pr ? 'propozycja' : paid != null ? 'zakup' : '' });
    });
    return { items, S };
  }

  async function saveFile(name, text, mime) {
    const native = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
    if (native && window.Capacitor.Plugins && window.Capacitor.Plugins.Filesystem) {
      const { Filesystem, Share } = window.Capacitor.Plugins;
      await Filesystem.writeFile({ path: name, data: text, directory: 'CACHE', encoding: 'utf8' });
      const { uri } = await Filesystem.getUri({ path: name, directory: 'CACHE' });
      try { await Share.share({ title: name, files: [uri], dialogTitle: 'Zapisz spis' }); } catch (e) { /* anulowano */ }
      return;
    }
    const blob = new Blob([text], { type: mime });
    const file = new File([blob], name, { type: mime });
    if (navigator.canShare && navigator.canShare({ files: [file] }) && matchMedia('(pointer:coarse)').matches) {
      try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  async function exportCsv(items) {
    const q = v => { const s = v == null ? '' : String(v); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const n = v => v == null ? '' : String(Math.round(v * 100) / 100).replace('.', ',');
    const rows = [['Rodzaj', 'Tytuł', 'Seria', 'Tom', 'Wydawca', 'Rok', 'Data zakupu', 'Cena zakupu (zł)', 'Wartość szacowana (zł)', 'Źródło wyceny', 'Kod kreskowy', 'Propozycja (zł)', 'Propozycja – pewność i źródło']];
    items.slice().sort((a, b) => a.group.localeCompare(b.group, 'pl') || (a.series || '').localeCompare(b.series || '', 'pl') || (+a.rec.volume || 0) - (+b.rec.volume || 0) || a.title.localeCompare(b.title, 'pl'))
      .forEach(x => rows.push([x.group, x.title, x.type === 'comic' ? x.rec.series : '', x.type === 'comic' ? x.rec.volume : '', x.rec.publisher || '', x.rec.year || '', x.rec.acquiredAt || '', n(x.paid), n(x.val), x.valSrc, x.rec.barcode || '', x.prop ? n(x.prop.v) : '', x.prop ? (x.prop.pewna ? 'pewna' : 'szacunkowa') + ' – ' + x.prop.zr : '']));
    const sumP = items.reduce((a, x) => a + (x.paid || 0), 0), sumV = items.reduce((a, x) => a + (x.val || 0), 0);
    rows.push([]); rows.push(['RAZEM', items.length + ' pozycji', '', '', '', '', '', n(sumP), n(sumV)]);
    rows.push(['Stan na', App.ui.today()]);
    const csv = '﻿' + rows.map(r => r.map(q).join(';')).join('\r\n');
    await saveFile('kolekcja-spis-' + App.ui.today() + '.csv', csv, 'text/csv');
  }

  async function render(el, params) {
    css();
    const tab = params.tab || 'podsumowanie';
    const { items, S } = await data();
    const sum = (arr, k) => arr.reduce((a, x) => a + (x[k] || 0), 0);
    const groups = ['Gry planszowe', 'Dodatki do gier', 'Komiksy'].map(g => { const a = items.filter(x => x.group === g); return { g, n: a.length, paid: sum(a, 'paid'), val: sum(a, 'val'), noPaid: a.filter(x => x.paid == null).length, noVal: a.filter(x => x.val == null).length }; });
    const tot = { n: items.length, paid: sum(items, 'paid'), val: sum(items, 'val'), noVal: items.filter(x => x.val == null).length };
    const zProp = items.filter(x => x.valSrc === 'propozycja'), zPropPewne = zProp.filter(x => x.prop.pewna).length;

    el.innerHTML = `<div class="row wr-head"><h1 style="margin:0">Wartość kolekcji</h1><span class="spacer"></span><button id="wrcsv">⬇ Spis do ubezpieczenia</button></div>
      <div class="stats" style="margin-top:12px">
        <div class="stat"><div class="v">${zl(tot.val)}</div><div class="l">szacowana wartość</div></div>
        <div class="stat"><div class="v">${zl(tot.paid)}</div><div class="l">wydane (znane ceny)</div></div>
        <div class="stat"><div class="v">${tot.n}</div><div class="l">pozycji w kolekcji</div></div>
        <div class="stat"><div class="v">${tot.noVal}</div><div class="l">bez żadnej ceny</div></div>
      </div>
      <div class="tabs">${[['podsumowanie', 'Podsumowanie'], ['gry', 'Gry – ceny'], ['komiksy', 'Komiksy – serie']].map(([k, l]) => `<button data-t="${k}" class="${tab === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div id="wrbody"></div>`;
    el.querySelectorAll('[data-t]').forEach(b => b.onclick = () => App.go('wartosc', { tab: b.dataset.t }));
    el.querySelector('#wrcsv').onclick = () => exportCsv(items);
    const body = el.querySelector('#wrbody');

    if (tab === 'podsumowanie') {
      const top = items.filter(x => x.val != null).sort((a, b) => b.val - a.val).slice(0, 15);
      body.innerHTML = `<div class="card wr-wrap"><table class="tbl"><thead><tr><th>Rodzaj</th><th class="n">Pozycji</th><th class="n">Wydane</th><th class="n">Wartość</th><th class="n hide-s">Bez ceny</th></tr></thead><tbody>
        ${groups.map(g => `<tr><td>${g.g}</td><td class="n">${g.n}</td><td class="n">${zl(g.paid)}</td><td class="n"><b>${zl(g.val)}</b></td><td class="n hide-s">${g.noVal}</td></tr>`).join('')}
        <tr><td><b>Razem</b></td><td class="n"><b>${tot.n}</b></td><td class="n"><b>${zl(tot.paid)}</b></td><td class="n"><b>${zl(tot.val)}</b></td><td class="n hide-s">${tot.noVal}</td></tr></tbody></table></div>
        <p class="wr-note">Wartość szacowana = Twoja wycena; jeśli jej brak – cena z ogłoszenia sprzedaży; potem cena za tom ustawiona dla serii; potem propozycja wyceny; na końcu cena zakupu.
        ${zProp.length ? `<br>Z propozycji liczone jest ${zProp.length} pozycji na ${zl(sum(zProp, 'val'))} (${zPropPewne} pewnych, ${zProp.length - zPropPewne} szacunkowych${W.data ? ', stan na ' + dataPl(W.data) : ''}). Komiksy: ceny okładkowe; gry: ceny nowych egzemplarzy w sklepach (używane zwykle są tańsze). Wpisz własną wycenę, a propozycja przestanie się liczyć.` : ''}
        ${tot.noVal ? `Uzupełnij ceny w zakładkach „Gry – ceny” i „Komiksy – serie” (dla komiksów wystarczy cena za tom dla całej serii).` : ''}</p>
        ${top.length ? `<h2>Najcenniejsze</h2><div class="card list">${top.map(x => `<div class="li" data-go="${x.type}:${esc(x.rec.id)}">${x.rec.thumb || x.rec.image ? `<img src="${esc(x.rec.thumb || x.rec.image)}" alt="" loading="lazy">` : `<div class="ph">${x.type === 'game' ? '🎲' : '📚'}</div>`}<div class="main"><div class="t">${esc(x.title)}</div><div class="s">${esc(x.group)}${x.paid != null ? ' · kupione za ' + zl(x.paid) : ''}</div></div><div class="num">${zl(x.val)}</div></div>`).join('')}</div>` : ''}`;
      body.querySelectorAll('[data-go]').forEach(r => r.onclick = () => { const [t, id] = r.dataset.go.split(/:(.+)/); App.go(t === 'game' ? 'planszowki' : 'komiksy', t === 'game' ? { gra: id } : { id }); });
    }

    if (tab === 'gry') {
      const only = params.bez === '1';
      let list = items.filter(x => x.type === 'game');
      if (only) list = list.filter(x => !has(x.rec.pricePaid) || !has(x.rec.estValue));
      list.sort((a, b) => a.title.localeCompare(b.title, 'pl'));
      body.innerHTML = `<div class="toolbar"><input type="search" id="wrq" placeholder="Szukaj gry"><label class="row" style="gap:6px"><input type="checkbox" id="wrbez" ${only ? 'checked' : ''}> tylko bez ceny lub wyceny</label></div>
        <p class="wr-note">Wpisz cenę zakupu i swoją wycenę (zapisuje się od razu). „Ceny ↗” otwiera porównanie ofert, żeby sprawdzić, ile gra kosztuje dziś.</p>
        <div class="card wr-wrap"><table class="tbl wr-tbl"><thead><tr><th>Gra</th><th class="n">Zakup (zł)</th><th class="n">Wycena (zł)</th><th class="hide-s"></th></tr></thead><tbody>
        ${list.map(x => `<tr data-id="${esc(x.rec.id)}" data-k="${esc(x.title.toLowerCase())}"><td class="t">${esc(x.title)}${x.rec.isExpansion ? ' <span class="badge exp">dodatek</span>' : ''}${!has(x.rec.estValue) && x.val != null && x.valSrc !== 'propozycja' ? `<div class="muted" style="font-size:12px">liczone: ${zl(x.val)} (${x.valSrc})</div>` : ''}${x.prop ? `<div class="muted" style="font-size:12px">propozycja: ${zl(x.prop.v)} – ${propOpis(x.prop)}</div>` : ''}</td>
          <td class="n"><input type="number" step="0.01" min="0" inputmode="decimal" data-f="pricePaid" value="${has(x.rec.pricePaid) ? x.rec.pricePaid : ''}"></td>
          <td class="n"><input type="number" step="0.01" min="0" inputmode="decimal" data-f="estValue" value="${has(x.rec.estValue) ? x.rec.estValue : ''}" placeholder="${x.prop ? x.prop.v : ''}"></td>
          <td class="hide-s"><a target="_blank" rel="noopener" href="https://www.ceneo.pl/;szukaj-${encodeURIComponent(x.title)}">Ceny ↗</a></td></tr>`).join('')}
        </tbody></table></div>`;
      body.querySelector('#wrbez').onchange = e => App.go('wartosc', e.target.checked ? { tab: 'gry', bez: '1' } : { tab: 'gry' });
      body.querySelector('#wrq').oninput = e => { const t = e.target.value.toLowerCase().trim(); body.querySelectorAll('tbody tr').forEach(r => { r.style.display = !t || r.dataset.k.includes(t) ? '' : 'none'; }); };
      body.querySelectorAll('input[data-f]').forEach(inp => inp.onchange = async () => {
        const id = inp.closest('tr').dataset.id; const g = await DB.get('games', id); if (!g) return;
        await DB.put('games', Object.assign({}, g, { [inp.dataset.f]: num(inp.value) }));
        App.ui.toast('Zapisano: ' + g.title, 1200);
      });
    }

    if (tab === 'komiksy') {
      const bySer = {};
      items.filter(x => x.type === 'comic').forEach(x => { (bySer[x.series] = bySer[x.series] || []).push(x); });
      const sers = Object.keys(bySer).sort((a, b) => bySer[b].length - bySer[a].length || a.localeCompare(b, 'pl'));
      const propSerii = a => { const p = a.filter(x => x.prop); if (!p.length) return null; const pew = p.filter(x => x.prop.pewna).length; return { sr: p.reduce((s, x) => s + x.prop.v, 0) / p.length, n: p.length, pew, zr: [...new Set(p.map(x => x.prop.zr.split(' – ')[0]))].join(', ') }; };
      body.innerHTML = `<p class="wr-note">Ustaw średnią cenę za tom dla całej serii (np. WKKM – zakup 40 zł, wartość 30 zł). Tom z własną ceną (w Edytuj komiksu albo przy dodawaniu ze skanera) ma pierwszeństwo. Jeśli nic nie wpiszesz, liczą się propozycje (ceny okładkowe tomów).</p>
        <div class="card wr-wrap"><table class="tbl wr-tbl"><thead><tr><th>Seria</th><th class="n">Tomów</th><th class="n">Zakup / tom</th><th class="n">Wartość / tom</th><th class="n hide-s">Razem wartość</th></tr></thead><tbody>
        ${sers.map(s => { const a = bySer[s]; const d = S[s] || {}; const own = a.filter(x => has(x.rec.pricePaid) || has(x.rec.estValue)).length;
          const ps = propSerii(a);
          return `<tr data-s="${esc(s)}"><td class="t">${esc(s)}${own ? `<div class="muted" style="font-size:12px">${own} z własną ceną</div>` : ''}${ps ? `<div class="muted" style="font-size:12px">propozycja: śr. ${zl(ps.sr)} / tom – ceny okładkowe (${ps.pew === ps.n ? 'pewne' : ps.pew ? ps.pew + ' z ' + ps.n + ' pewnych' : 'szacunkowe'} · ${esc(ps.zr)})</div>` : ''}</td><td class="n">${a.length}</td>
          <td class="n"><input type="number" step="0.01" min="0" inputmode="decimal" data-f="paid" value="${has(d.paid) ? d.paid : ''}"></td>
          <td class="n"><input type="number" step="0.01" min="0" inputmode="decimal" data-f="value" value="${has(d.value) ? d.value : ''}" placeholder="${has(d.paid) ? d.paid : ps ? Math.round(ps.sr * 100) / 100 : ''}"></td>
          <td class="n hide-s">${zl(sum(a, 'val'))}</td></tr>`; }).join('')}
        </tbody></table></div>`;
      body.querySelectorAll('input[data-f]').forEach(inp => inp.onchange = async () => {
        const s = inp.closest('tr').dataset.s;
        const cur = Object.assign({}, (await DB.setting('wartoscSerii')) || {});
        cur[s] = Object.assign({}, cur[s], { [inp.dataset.f]: num(inp.value) });
        await DB.setting('wartoscSerii', cur);
        App.ui.toast('Zapisano: ' + s, 1200);
      });
    }
  }

  App.provide('wartosc.dane', data); // historia cen liczy z tego stan kolekcji
  App.registerModule({ id: 'wartosc', title: 'Wartość kolekcji', icon: '💎', order: 45, render });
})();
