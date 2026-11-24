/* Moduł „Historia cen” (📈): zapisuje ceny z zakupów, wycen, ogłoszeń, sprzedaży i sklepów (lista życzeń)
 * oraz codzienny stan wartości kolekcji, i rysuje wykres wartości w czasie.
 * Kolekcja bazy: priceHistory
 *   { itemType ('game'|'comic'|'kolekcja'), itemId, title, kind, price, date ('RRRR-MM-DD') }
 *   kind: 'zakup' | 'wycena' | 'ogloszenie' | 'sprzedaz' | 'rynek' (ceny sklepów) | 'snap' (stan kolekcji dnia)
 *   Rekord 'snap': id 'snap-RRRR-MM-DD', value (wartość szacowana), paid (wydane), count (pozycji).
 * Identyfikatory są wyliczane z treści (np. ph-zakup-<id>-<data>), więc dwa urządzenia po synchronizacji
 * nie dublują wpisów. Zmiany są wychwytywane same: po każdej zmianie gier/komiksów/ogłoszeń/ustawień.
 * Wartość kolekcji liczy moduł „Wartość kolekcji” (usługa wartosc.dane).
 */
(function () {
  const esc = s => App.ui.esc(s);
  const zl = n => n == null ? '–' : (Math.round(n * 100) / 100).toLocaleString('pl-PL', { maximumFractionDigits: 2 }) + ' zł';
  const zlk = n => Math.abs(n) >= 10000 ? (Math.round(n / 100) / 10).toLocaleString('pl-PL') + ' tys.' : Math.round(n).toLocaleString('pl-PL');
  const has = v => v != null && v !== '' && !isNaN(+v);
  const dzis = () => App.ui.today();
  const dzien = iso => iso ? String(iso).slice(0, 10) : null;
  const RODZ = { zakup: 'zakup', wycena: 'moja wycena', ogloszenie: 'ogłoszenie', sprzedaz: 'sprzedane', rynek: 'cena w sklepach', snap: 'stan kolekcji' };
  const IK = { zakup: '🛒', wycena: '✍️', ogloszenie: '📣', sprzedaz: '💰', rynek: '🏷️' };

  window.IKONY = window.IKONY || {};
  window.IKONY['historia-cen'] = '<path d="M4 20h16"/><path class="f" d="M5 17l4-5 3.5 2.5L19 6v11z" stroke="none"/><path d="M5 17l4-5 3.5 2.5L19 6"/><circle cx="19" cy="6" r="1.4" fill="currentColor"/>';
  if (window.IKONY_KOLOR) window.IKONY_KOLOR['historia-cen'] = '#2c9a57';

  function css() {
    if (document.getElementById('hc-css')) return;
    const st = document.createElement('style'); st.id = 'hc-css';
    st.textContent = `
.hc-chart{position:relative;margin-top:6px}
.hc-chart svg{width:100%;height:auto;display:block;overflow:visible}
.hc-chart .grid line{stroke:var(--line);stroke-width:1}
.hc-chart .ax text{fill:var(--muted);font-size:11px;font-variant-numeric:tabular-nums}
.hc-chart .ln{fill:none;stroke-width:2;stroke-linejoin:round;stroke-linecap:round}
.hc-chart .pt{stroke:var(--surface);stroke-width:2}
.hc-chart .xh{stroke:var(--muted);stroke-width:1;stroke-dasharray:3 3}
.hc-tip{position:absolute;pointer-events:none;background:var(--surface);border:1px solid var(--line);border-radius:10px;box-shadow:var(--shadow-lg);padding:8px 10px;font-size:13px;white-space:nowrap;transform:translate(-50%,-100%);display:none;z-index:5}
.hc-tip b{font-variant-numeric:tabular-nums}
.hc-tip .k{display:inline-block;width:10px;height:3px;border-radius:2px;vertical-align:middle;margin-right:6px}
.hc-leg{display:flex;gap:16px;flex-wrap:wrap;font-size:13px;color:var(--muted);margin-top:4px}
.hc-leg i{display:inline-block;width:14px;height:3px;border-radius:2px;vertical-align:middle;margin-right:6px}
.hc-rng{display:flex;gap:6px;flex-wrap:wrap}
.hc-rng button.on{background:var(--accent-soft);border-color:var(--accent);font-weight:700}
.hc-up{color:var(--ok);font-weight:700}.hc-down{color:var(--bad);font-weight:700}
.hc-note{color:var(--muted);font-size:13px;margin:6px 0 10px}
.hc-ev .num{white-space:nowrap}
`;
    document.head.appendChild(st);
  }

  /* ---------- zbieranie cen ---------- */
  let biegnie = null, czekaj = null;
  function pozniej(ms = 3000) { clearTimeout(czekaj); czekaj = setTimeout(() => zbierz().catch(e => console.warn('historia cen', e)), ms); }

  async function zbierz() {
    if (biegnie) return biegnie;
    biegnie = (async () => {
      const [games, comics, listings, hist] = await Promise.all([DB.all('games'), DB.all('comics'), DB.all('listings').catch(() => []), DB.all('priceHistory', { withDeleted: true })]);
      const ost = new Map(); // klucz typ:id:rodzaj -> najnowszy wpis
      hist.forEach(h => { if (h.kind === 'snap' || h.deleted || h.manual) return; const k = h.itemType + ':' + h.itemId + ':' + h.kind; const o = ost.get(k); if (!o || (h.date || '') > (o.date || '') || ((h.date || '') === (o.date || '') && (h.updatedAt || '') > (o.updatedAt || ''))) ost.set(k, h); });
      const znane = new Set(hist.map(h => h.id));
      const nowe = [];
      const t = dzis();
      const dodaj = (rec) => { if (!znane.has(rec.id)) { znane.add(rec.id); nowe.push(rec); } };
      const zmiana = (itemType, item, kind, price, dataStart) => {
        if (!has(price)) return;
        price = +price;
        const k = itemType + ':' + item.id + ':' + kind, o = ost.get(k);
        if (o && +o.price === price) return;
        const date = o ? t : (dataStart || t);
        const title = item.title || ((item.series || '') + ' ' + (item.volume || '')).trim();
        const rec = { id: `ph-${kind}-${item.id}-${date}`, itemType, itemId: item.id, title, kind, price, date };
        // ta sama pozycja i dzień: nadpisujemy (np. poprawiona cena)
        const i = nowe.findIndex(x => x.id === rec.id); if (i >= 0) nowe.splice(i, 1);
        znane.delete(rec.id); dodaj(rec); ost.set(k, rec);
      };
      games.forEach(g => {
        zmiana('game', g, 'zakup', g.pricePaid, dzien(g.acquiredAt) || dzien(g.createdAt));
        zmiana('game', g, 'wycena', g.estValue, dzien(g.updatedAt));
        const h = (g.ceny && g.ceny.hist) || [];
        h.forEach(([d, v]) => { if (has(v) && d) dodaj({ id: `ph-rynek-${g.id}-${d}`, itemType: 'game', itemId: g.id, title: g.title, kind: 'rynek', price: +v, date: d }); });
      });
      comics.forEach(c => {
        zmiana('comic', c, 'zakup', c.pricePaid, dzien(c.acquiredAt) || dzien(c.createdAt));
        zmiana('comic', c, 'wycena', c.estValue, dzien(c.updatedAt));
      });
      const byId = new Map(games.map(g => ['game:' + g.id, g]).concat(comics.map(c => ['comic:' + c.id, c])));
      listings.forEach(l => {
        const it = byId.get(l.itemType + ':' + l.itemId);
        const title = (it && (it.title || ((it.series || '') + ' ' + (it.volume || '')).trim())) || l.title || 'Ogłoszenie';
        if (has(l.price) && l.status !== 'draft') dodaj({ id: `ph-ogl-${l.id}-${+l.price}`, itemType: l.itemType, itemId: l.itemId, title, kind: 'ogloszenie', price: +l.price, date: dzien(l.createdAt) || t, platform: l.platform });
        if (l.status === 'sold' && (has(l.soldPrice) || has(l.price))) dodaj({ id: `ph-sold-${l.id}`, itemType: l.itemType, itemId: l.itemId, title, kind: 'sprzedaz', price: +(has(l.soldPrice) ? l.soldPrice : l.price), date: dzien(l.soldAt) || dzien(l.updatedAt) || t, platform: l.platform });
      });
      // stan kolekcji dziś
      if (App.has('wartosc.dane')) {
        const { items } = await App.call('wartosc.dane');
        const value = Math.round(items.reduce((a, x) => a + (x.val || 0), 0) * 100) / 100;
        const paid = Math.round(items.reduce((a, x) => a + (x.paid || 0), 0) * 100) / 100;
        const snap = hist.find(h => h.id === 'snap-' + t);
        if (!snap || snap.value !== value || snap.paid !== paid || snap.count !== items.length)
          nowe.push({ id: 'snap-' + t, itemType: 'kolekcja', itemId: 'kolekcja', title: 'Cała kolekcja', kind: 'snap', price: value, value, paid, count: items.length, date: t, createdAt: snap && snap.createdAt });
      }
      if (nowe.length) await DB.putMany('priceHistory', nowe);
      return nowe.length;
    })();
    try { return await biegnie; } finally { biegnie = null; }
  }

  ['games', 'comics', 'listings', 'settings'].forEach(s => DB.on(s, () => pozniej()));
  // pierwszy przegląd po starcie (gdy dane startowe już się wczytały)
  setTimeout(() => pozniej(0), 6000);

  /* ---------- wykres liniowy (SVG, jedna oś) ---------- */
  function wykres(series, opt = {}) {
    const W = 720, H = opt.h || 260, L = 54, R = 14, T = 14, B = 28;
    const pts = series.flatMap(s => s.points);
    if (!pts.length) return '<p class="hc-note">Brak danych do wykresu.</p>';
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    let x0 = Math.min(...xs), x1 = Math.max(...xs); if (x0 === x1) { x0 -= 86400000 * 3; x1 += 86400000 * 3; }
    let y1 = Math.max(...ys, 0); const y0 = 0;
    const step = (() => { const raw = (y1 - y0) / 4 || 1; const p = Math.pow(10, Math.floor(Math.log10(raw))); return [1, 2, 2.5, 5, 10].map(m => m * p).find(s => s >= raw); })();
    y1 = Math.ceil(y1 / step) * step || step;
    const X = v => L + (v - x0) / (x1 - x0) * (W - L - R), Y = v => T + (1 - (v - y0) / (y1 - y0)) * (H - T - B);
    const ticks = []; for (let v = y0; v <= y1 + 1e-9; v += step) ticks.push(v);
    const span = x1 - x0, nX = 5, xt = [];
    for (let i = 0; i <= nX; i++) xt.push(x0 + span * i / nX);
    const fx = ms => { const d = new Date(ms); return span > 86400000 * 400 ? d.toLocaleDateString('pl-PL', { month: 'short', year: '2-digit' }) : d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' }); };
    const path = s => s.points.map((p, i) => (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1)).join(' ');
    const id = 'hc' + Math.random().toString(36).slice(2, 8);
    const html = `<div class="hc-chart" id="${id}"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opt.label || 'Wykres')}">
      <g class="grid">${ticks.map(v => `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}"/>`).join('')}</g>
      <g class="ax">${ticks.map(v => `<text x="${L - 8}" y="${Y(v) + 4}" text-anchor="end">${zlk(v)}</text>`).join('')}
        ${xt.map((v, i) => `<text x="${X(v)}" y="${H - 8}" text-anchor="${i === 0 ? 'start' : i === nX ? 'end' : 'middle'}">${fx(v)}</text>`).join('')}</g>
      ${series.map(s => s.points.length > 1 ? `<path class="ln" d="${path(s)}" stroke="${s.color}" ${s.step ? '' : ''}/>` : '').join('')}
      ${series.map(s => s.points.length <= 1 || s.dots ? s.points.map(p => `<circle class="pt" cx="${X(p[0])}" cy="${Y(p[1])}" r="${s.points.length <= 1 ? 5 : 3.5}" fill="${s.color}"/>`).join('') : '').join('')}
      <line class="xh" y1="${T}" y2="${H - B}" style="display:none"/><g class="hv"></g>
      <rect x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" fill="transparent" class="hit"/>
    </svg><div class="hc-tip"></div></div>`;
    // obsługa najechania (wywoływana po wstawieniu)
    const podepnij = root => {
      const box = root.querySelector('#' + id); if (!box) return;
      const svg = box.querySelector('svg'), tip = box.querySelector('.hc-tip'), xh = svg.querySelector('.xh'), hv = svg.querySelector('.hv');
      const all = [...new Set(pts.map(p => p[0]))].sort((a, b) => a - b);
      const wartosc = (s, t) => { let v = null; for (const p of s.points) { if (p[0] <= t) v = p[1]; else break; } return v; };
      const show = ev => {
        const r = svg.getBoundingClientRect(); const sx = (ev.clientX - r.left) / r.width * W;
        const t = x0 + (sx - L) / (W - L - R) * (x1 - x0);
        let best = all[0]; all.forEach(a => { if (Math.abs(a - t) < Math.abs(best - t)) best = a; });
        const cx = X(best);
        xh.setAttribute('x1', cx); xh.setAttribute('x2', cx); xh.style.display = '';
        const rows = series.map(s => ({ s, v: wartosc(s, best) })).filter(o => o.v != null);
        hv.innerHTML = rows.map(o => `<circle class="pt" cx="${cx}" cy="${Y(o.v)}" r="5" fill="${o.s.color}"/>`).join('');
        tip.innerHTML = `<div style="color:var(--muted);margin-bottom:3px">${new Date(best).toLocaleDateString('pl-PL')}</div>` + rows.map(o => `<div><span class="k" style="background:${o.s.color}"></span>${esc(o.s.name)}: <b>${zl(o.v)}</b></div>`).join('');
        tip.style.display = 'block';
        tip.style.left = Math.min(Math.max(cx / W * r.width, 80), r.width - 80) + 'px';
        tip.style.top = (Math.min(...rows.map(o => Y(o.v))) / H * r.height - 10) + 'px';
      };
      const hide = () => { tip.style.display = 'none'; xh.style.display = 'none'; hv.innerHTML = ''; };
      svg.addEventListener('pointermove', show); svg.addEventListener('pointerdown', show); svg.addEventListener('pointerleave', hide);
    };
    return { html, podepnij };
  }

  const ms = d => new Date(d + 'T12:00:00').getTime();

  /* ---------- widok ---------- */
  async function render(el, params) {
    css();
    await zbierz().catch(e => console.warn(e));
    const hist = (await DB.all('priceHistory')).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const snaps = hist.filter(h => h.kind === 'snap');
    const ev = hist.filter(h => h.kind !== 'snap');
    const dane = App.has('wartosc.dane') ? await App.call('wartosc.dane') : { items: [] };
    const items = dane.items || [];
    const teraz = snaps.length ? snaps[snaps.length - 1] : { value: items.reduce((a, x) => a + (x.val || 0), 0), paid: items.reduce((a, x) => a + (x.paid || 0), 0) };

    if (params.poz) return pozycja(el, params.poz, ev);

    const rng = params.zakres || 'rok';
    const od = rng === 'all' ? '' : new Date(Date.now() - (rng === '3m' ? 92 : 366) * 86400000).toISOString().slice(0, 10);
    // wydane narastająco – z dat zakupu (znane ceny)
    const zak = items.filter(x => x.paid != null).map(x => [dzien(x.rec.acquiredAt) || dzien(x.rec.createdAt) || dzis(), x.paid]).sort((a, b) => a[0].localeCompare(b[0]));
    const wyd = []; let suma = 0; zak.forEach(([d, v]) => { suma += v; const last = wyd[wyd.length - 1]; if (last && last[0] === d) last[1] = suma; else wyd.push([d, suma]); });
    const przed = wyd.filter(p => p[0] < od); const startW = przed.length ? przed[przed.length - 1][1] : null;
    const wydPts = (od && startW != null ? [[od, startW]] : []).concat(wyd.filter(p => !od || p[0] >= od)).map(([d, v]) => [ms(d), v]);
    if (wydPts.length && wydPts[wydPts.length - 1][0] < ms(dzis())) wydPts.push([ms(dzis()), wydPts[wydPts.length - 1][1]]);
    const valPts = snaps.filter(s => !od || s.date >= od).map(s => [ms(s.date), s.value]);
    const sprzedane = ev.filter(e => e.kind === 'sprzedaz');
    const sumaSprz = sprzedane.reduce((a, e) => a + e.price, 0);
    const m30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const s30 = snaps.filter(s => s.date <= m30).pop() || snaps[0];
    const zm = s30 && snaps.length > 1 ? teraz.value - s30.value : null;

    const ch = wykres([
      { name: 'Wartość kolekcji', color: 'var(--accent)', points: valPts, dots: valPts.length < 15 },
      { name: 'Wydane łącznie', color: 'var(--accent-2)', points: wydPts }
    ], { label: 'Wartość kolekcji i wydatki w czasie' });

    const q = (params.q || '').toLowerCase();
    const lista = ev.slice().reverse().filter(e => !q || (e.title || '').toLowerCase().includes(q)).slice(0, q ? 200 : 60);

    el.innerHTML = `<div class="row"><h1 style="margin:0">Historia cen</h1><span class="spacer"></span><button id="hcadd">+ Zapisz cenę</button></div>
      <div class="stats" style="margin-top:12px">
        <div class="stat"><div class="v">${zl(teraz.value)}</div><div class="l">wartość kolekcji dziś</div></div>
        <div class="stat"><div class="v">${zm == null ? '–' : `<span class="${zm >= 0 ? 'hc-up' : 'hc-down'}">${zm >= 0 ? '▲' : '▼'} ${zl(Math.abs(zm))}</span>`}</div><div class="l">zmiana od ${s30 && snaps.length > 1 ? App.ui.fmtDate(s30.date) : 'miesiąca'}</div></div>
        <div class="stat"><div class="v">${zl(teraz.paid)}</div><div class="l">wydane (znane ceny)</div></div>
        <div class="stat"><div class="v">${zl(sumaSprz)}</div><div class="l">sprzedane (${sprzedane.length})</div></div>
      </div>
      <div class="card">
        <div class="row"><h3 style="margin:0">Wartość kolekcji w czasie</h3><span class="spacer"></span>
          <div class="hc-rng">${[['3m', '3 mies.'], ['rok', 'Rok'], ['all', 'Wszystko']].map(([k, l]) => `<button class="small ${rng === k ? 'on' : ''}" data-r="${k}">${l}</button>`).join('')}</div></div>
        ${typeof ch === 'string' ? ch : ch.html}
        <div class="hc-leg"><span><i style="background:var(--accent)"></i>Wartość kolekcji (zapisywana codziennie)</span><span><i style="background:var(--accent-2)"></i>Wydane łącznie (wg dat zakupu)</span></div>
        ${snaps.length < 3 ? `<p class="hc-note">Wartość zapisuje się raz dziennie od ${snaps[0] ? App.ui.fmtDate(snaps[0].date) : 'dziś'} – linia wartości wydłuży się z każdym dniem. Wydatki z przeszłości wynikają z dat zakupu wpisanych przy grach i komiksach.</p>` : ''}
      </div>
      <h2>Zmiany cen</h2>
      <div class="toolbar"><input type="search" id="hcq" placeholder="Szukaj pozycji" value="${esc(params.q || '')}"></div>
      ${lista.length ? `<div class="list hc-ev">${lista.map(e => `<div class="li" data-poz="${esc(e.itemType + ':' + e.itemId)}"><div class="ph">${IK[e.kind] || '•'}</div><div class="main"><div class="t">${esc(e.title)}</div><div class="s">${esc(RODZ[e.kind] || e.kind)}${e.platform ? ' · ' + esc(e.platform) : ''} · ${App.ui.fmtDate(e.date)}</div></div><div class="num">${zl(e.price)}</div></div>`).join('')}</div>`
        : `<p class="hc-note">Nie ma jeszcze zapisanych cen. Ceny trafiają tu same, gdy wpiszesz cenę zakupu lub wycenę (zakładka „Wartość kolekcji”), wystawisz ogłoszenie albo sprawdzisz ceny na liście życzeń.</p>`}`;
    if (ch.podepnij) ch.podepnij(el);
    el.querySelectorAll('[data-r]').forEach(b => b.onclick = () => App.go('historia-cen', { zakres: b.dataset.r }));
    const qi = el.querySelector('#hcq');
    qi.onchange = () => App.go('historia-cen', Object.assign({ zakres: rng }, qi.value.trim() ? { q: qi.value.trim() } : {}));
    el.querySelectorAll('[data-poz]').forEach(r => r.onclick = () => App.go('historia-cen', { poz: r.dataset.poz }));
    el.querySelector('#hcadd').onclick = () => dodajRecznie();
  }

  async function pozycja(el, key, ev) {
    const [itemType, itemId] = key.split(/:(.+)/);
    const rec = await DB.get(itemType === 'game' ? 'games' : 'comics', itemId);
    const moje = ev.filter(e => e.itemType === itemType && e.itemId === itemId);
    const title = rec ? (rec.title || ((rec.series || '') + ' ' + (rec.volume || '')).trim()) : (moje[0] && moje[0].title) || 'Pozycja';
    const rodzaje = ['rynek', 'ogloszenie', 'sprzedaz', 'wycena', 'zakup'].filter(k => moje.some(e => e.kind === k));
    const KOL = { zakup: 'var(--accent-2)', wycena: 'var(--accent)', ogloszenie: '#8a3ffc', sprzedaz: 'var(--ok)', rynek: '#14a89b' };
    const ch = wykres(rodzaje.map(k => ({ name: RODZ[k], color: KOL[k], points: moje.filter(e => e.kind === k).map(e => [ms(e.date), e.price]), dots: true })), { h: 220, label: 'Ceny: ' + title });
    el.innerHTML = `<p><button class="ghost small" id="hcb">← Historia cen</button></p>
      <div class="row">${rec && (rec.thumb || rec.image) ? `<img src="${esc(rec.thumb || rec.image)}" alt="" style="width:56px;height:56px;object-fit:contain;border-radius:10px">` : ''}<h1 style="margin:0">${esc(title)}</h1><span class="spacer"></span><button id="hcadd">+ Zapisz cenę</button></div>
      <div class="card" style="margin-top:12px">${typeof ch === 'string' ? ch : ch.html}
        <div class="hc-leg">${rodzaje.map(k => `<span><i style="background:${KOL[k]}"></i>${RODZ[k]}</span>`).join('')}</div></div>
      <div class="card"><table class="tbl"><thead><tr><th>Data</th><th>Rodzaj</th><th class="n">Cena</th></tr></thead><tbody>
      ${moje.slice().reverse().map(e => `<tr><td>${App.ui.fmtDate(e.date)}</td><td>${IK[e.kind] || ''} ${esc(RODZ[e.kind] || e.kind)}${e.platform ? ' · ' + esc(e.platform) : ''}${e.note ? `<div class="muted" style="font-size:12px">${esc(e.note)}</div>` : ''}</td><td class="n">${zl(e.price)}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">Brak zapisanych cen.</td></tr>'}
      </tbody></table></div>
      ${rec ? `<p><button class="ghost" id="hcgo">Otwórz kartę ${itemType === 'game' ? 'gry' : 'komiksu'}</button></p>` : ''}`;
    if (ch.podepnij) ch.podepnij(el);
    el.querySelector('#hcb').onclick = () => App.go('historia-cen');
    el.querySelector('#hcadd').onclick = () => dodajRecznie(itemType, itemId, title);
    const g = el.querySelector('#hcgo'); if (g) g.onclick = () => App.go(itemType === 'game' ? 'planszowki' : 'komiksy', itemType === 'game' ? { gra: itemId } : { id: itemId });
  }

  /* Ręczny wpis, np. cena zobaczona na OLX albo w sklepie. */
  async function dodajRecznie(itemType, itemId, title) {
    let wyb = itemType ? { itemType, itemId, title } : null;
    let opcje = [];
    if (!wyb) {
      const [games, comics] = await Promise.all([DB.all('games'), DB.all('comics')]);
      opcje = games.filter(g => g.status !== 'sold').map(g => ({ itemType: 'game', itemId: g.id, title: g.title }))
        .concat(comics.filter(c => c.status === 'owned' || c.status === 'forSale').map(c => ({ itemType: 'comic', itemId: c.id, title: c.title || ((c.series || '') + ' ' + (c.volume || '')).trim() })));
    }
    const dl = 'hc-dl-' + Date.now();
    const f = await App.ui.form('Zapisz cenę', [
      ...(wyb ? [{ type: 'html', html: `<b>${esc(wyb.title)}</b>` }] : [{ type: 'html', html: `<datalist id="${dl}">${opcje.slice(0, 2000).map(o => `<option value="${esc(o.title)}">`).join('')}</datalist>` }, { name: 't', label: 'Gra lub komiks', list: dl, placeholder: 'zacznij pisać tytuł' }]),
      { name: 'kind', label: 'Rodzaj ceny', type: 'select', value: 'rynek', options: [['rynek', 'Cena w sklepach / na rynku'], ['ogloszenie', 'Cena z czyjegoś ogłoszenia'], ['sprzedaz', 'Sprzedałem za'], ['zakup', 'Kupiłem za'], ['wycena', 'Moja wycena']] },
      { name: 'price', label: 'Cena (zł)', type: 'number', step: '0.01' },
      { name: 'date', label: 'Data', type: 'date', value: dzis() },
      { name: 'note', label: 'Gdzie / uwagi (opcjonalnie)', placeholder: 'np. OLX, stan bardzo dobry' }
    ]);
    if (!f) return;
    if (!wyb) { wyb = opcje.find(o => o.title.toLowerCase() === (f.t || '').toLowerCase()); if (!wyb) return App.ui.toast('Nie znalazłem takiej pozycji w kolekcji'); }
    if (f.price == null || isNaN(f.price)) return App.ui.toast('Wpisz cenę');
    const date = f.date || dzis();
    await DB.put('priceHistory', { id: `ph-${f.kind}-${wyb.itemId}-${date}-r${Date.now().toString(36)}`, itemType: wyb.itemType, itemId: wyb.itemId, title: wyb.title, kind: f.kind, price: +f.price, date, note: f.note || undefined, manual: true });
    App.ui.toast('Zapisano cenę');
    App.go('historia-cen', { poz: wyb.itemType + ':' + wyb.itemId });
  }

  App.provide('historia.zbierz', zbierz);
  App.provide('historia.pozycji', async (itemType, itemId) => (await DB.all('priceHistory')).filter(h => h.itemType === itemType && h.itemId === itemId).sort((a, b) => a.date.localeCompare(b.date)));
  App.registerModule({ id: 'historia-cen', title: 'Historia cen', icon: '📈', order: 46, render });
})();
