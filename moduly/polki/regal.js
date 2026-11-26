/* Widok regału w prawdziwych wymiarach (26.11.2026, prośba Marcina):
 *  - regał rysowany w skali (Kallax: przegródka 33 × 33 cm, deski 3 cm; inne regały: wymiary z „Edytuj regał”),
 *  - pudełka w prawdziwych wymiarach: ręcznie wpisane (Pudełka i Kallax) › wydanie z BGG (bgg.json „box”) › szacunek,
 *  - przybliżanie dwoma palcami (i kółkiem myszy / przyciskami), przesuwanie jednym palcem,
 *  - dwa widoki: „Grzbiety” (tak jak naprawdę stoją) i „Okładki” (przegląd okładek w każdej przegródce),
 *  - przemeblowanie: przytrzymaj pudełko i upuść na inne = zamiana miejscami; upuść w pustym miejscu = przeniesienie.
 *    Kolejność w przegródce zapisujemy w polka.i, a „leży / stoi” w polka.lez. Przycisk „Cofnij” odwraca ostatnie ruchy.
 * Usługa: App.call('polki.regal', idRegalu)
 */
(function () {
  const W = () => window.PolkiWew;
  const esc = s => App.ui.esc(s);
  const PX = 5;                       // pikseli na centymetr przy powiększeniu 1
  const TOM = { w: 17.5, l: 26.5, h: 1.4 };   // typowy album komiksowy (szacunek)
  const GRA = { w: 29.5, l: 29.5, h: 7 };     // typowe pudełko gry (szacunek)
  const DOD = { w: 20, l: 20, h: 5 };         // typowy dodatek (szacunek)
  const num = v => String(Math.round(v * 10) / 10).replace('.', ',');

  /* ---------- geometria regału ---------- */
  const lista = (v, n, def) => { const a = (Array.isArray(v) ? v : []).map(Number).filter(x => x > 0); return Array.from({ length: n }, (_, i) => a[i] || a[a.length - 1] || def); };
  function geo(sh) {
    const rows = sh.rows || 1, cols = sh.cols || 1, wym = sh.wym || {};
    const kx = sh.kind === 'kallax';
    const t = +wym.t || (kx ? 3 : 1.8);
    const kol = lista(wym.kol, cols, kx ? 33 : 40), rz = lista(wym.rz, rows, kx ? 33 : 33);
    const xs = [], ys = [];
    let x = t; kol.forEach(w => { xs.push(x); x += w + t; });
    let y = t; rz.forEach(h => { ys.push(y); y += h + t; });
    return { rows, cols, t, kol, rz, xs, ys, W: x, H: y, d: +wym.d || (kx ? 38 : 30), kx };
  }

  /* ---------- wymiary rzeczy ---------- */
  function wymGry(g) {
    const p = g.pudelko;
    if (p && p.w && p.l && p.h) return { a: [+p.w, +p.l, +p.h], zr: 'wpisane' };
    const b = g.bggId && window.BGG_PUDELKA && window.BGG_PUDELKA[g.bggId];
    if (b) return { a: b.slice(), zr: 'BGG' };
    const s = g.isExpansion ? DOD : GRA;
    return { a: [s.w, s.l, s.h], zr: 'szac' };
  }

  /* ---------- dane: co stoi w każdej przegródce ---------- */
  const st = { sh: null, tryb: 'grzbiety', s: 1, tx: 0, ty: 0, cofnij: [], dane: null };
  async function wczytaj() {
    const P = W(); await P.reload();
    if (window.BggDane && BggDane.gotowe) await BggDane.gotowe().catch(() => null);
    const [games, comics] = await Promise.all([DB.all('games'), DB.all('comics')]);
    const gry = games.filter(g => (g.status === 'owned' || g.status === 'forSale' || !g.status) && g.polka && P.C.byId.has(g.polka.s));
    const kom = comics.filter(c => c.status === 'owned' || c.status === 'forSale');
    const rzeczy = [];
    gry.forEach(g => { const w = wymGry(g); rzeczy.push({ k: 'g:' + g.id, typ: 'game', rec: g, t: g.title, img: g.image || g.thumb, th: g.thumb || g.image, a: w.a, zr: w.zr, p: g.polka, dod: !!g.isExpansion }); });
    const serie = new Map();
    kom.forEach(c => {
      if (c.polka && P.C.byId.has(c.polka.s)) rzeczy.push({ k: 'c:' + c.id, typ: 'comic', rec: c, t: (c.series ? c.series + (c.volume != null ? ' ' + c.volume : '') + ' – ' : '') + (c.title || ''), img: c.cover || c.image || c.thumb, th: c.thumb || c.cover || c.image, a: [TOM.w, TOM.l, TOM.h], zr: 'szac', p: c.polka });
      else if (c.series && P.C.serie[c.series]) { const e = serie.get(c.series) || { n: 0, img: null }; e.n++; e.img = e.img || c.cover || c.image || c.thumb; serie.set(c.series, e); }
    });
    Object.entries(P.C.serie).forEach(([n, p]) => {
      if (!P.C.byId.has(p.s)) return;
      const e = serie.get(n) || { n: 0, img: null }, ile = Math.max(e.n, 1);
      rzeczy.push({ k: 's:' + n, typ: 'serie', rec: n, t: n, ile: e.n, img: e.img, th: e.img, a: [TOM.w, TOM.l, TOM.h * ile], zr: 'szac', p });
    });
    st.dane = rzeczy;
  }
  const wKomorce = (s, r, c) => st.dane.filter(x => x.p.s === s && (x.p.r || 0) === (r || 0) && (x.p.c || 0) === (c || 0))
    .sort((a, b) => (a.p.i != null ? a.p.i : 9999) - (b.p.i != null ? b.p.i : 9999) || a.t.localeCompare(b.t, 'pl'));

  /* ---------- układ pudełek w przegródce (cm, od lewego dolnego rogu) ---------- */
  function uloz(items, Wc, Hc) {
    let x = 0, stos = null; const out = [];
    for (const it of items) {
      const a = it.a.slice().sort((p, q) => p - q);
      const lez = it.p.lez != null ? !!it.p.lez : a[1] > Hc + 0.5;   // nie stanie nawet krótszym bokiem → leży
      let w, h;
      if (!lez) { w = a[0]; h = a[2] <= Hc ? a[2] : a[1]; stos = null; out.push({ it, x, y: 0, w, h, lez }); x += w + 0.15; continue; }
      h = a[0]; w = a[2] <= Wc ? a[2] : a[1];
      if (stos && stos.y + h <= Hc + 0.3) { out.push({ it, x: stos.x, y: stos.y, w, h, lez }); stos.y += h; stos.w = Math.max(stos.w, w); x = Math.max(x, stos.x + stos.w + 0.15); }
      else { stos = { x, y: h, w }; out.push({ it, x, y: 0, w, h, lez }); x += w + 0.15; }
    }
    out.forEach(o => { o.za = o.x + o.w > Wc + 0.5 || o.y + o.h > Hc + 0.5; });
    return { out, zajete: x, za: out.filter(o => o.za).length };
  }

  /* ---------- rysowanie ---------- */
  function css() {
    if (document.getElementById('rg-css')) return;
    const s = document.createElement('style'); s.id = 'rg-css';
    s.textContent = `
dialog.rg-dlg{position:fixed;inset:0;width:100vw;height:100dvh;max-width:none;max-height:none;margin:0;padding:0;border:0;background:var(--bg);color:var(--text);display:flex;flex-direction:column;overflow:hidden}
dialog.rg-dlg:not([open]){display:none}
dialog.rg-dlg::backdrop{background:var(--bg)}
.rg-top{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:8px 10px;padding-top:max(8px,env(safe-area-inset-top));background:var(--surface);border-bottom:2px solid var(--ink,var(--line));z-index:3}
.rg-top select{flex:1 1 160px;min-width:0;max-width:340px}
.rg-top .sp{flex:1}
.rg-top button{min-height:38px;padding:4px 10px}
.rg-seg{display:inline-flex}
.rg-seg button{border-radius:0}
.rg-seg button:first-child{border-radius:6px 0 0 6px}
.rg-seg button:last-child{border-radius:0 6px 6px 0;margin-left:-2px}
.rg-seg button.on{background:var(--accent-2);color:var(--on-yl,#16130f)}
.rg-hint{font-size:12.5px;color:var(--muted);padding:4px 12px;background:var(--surface);border-bottom:1px solid var(--line);z-index:3}
.rg-view{position:relative;flex:1;overflow:hidden;touch-action:none;user-select:none;-webkit-user-select:none;cursor:grab;background-color:var(--bg);background-image:radial-gradient(var(--dot,rgba(0,0,0,.06)) 1.2px,transparent 1.3px);background-size:9px 9px}
.rg-stage{position:absolute;left:0;top:0;transform-origin:0 0}
.rg-frame{position:absolute;border-radius:3px;background:linear-gradient(180deg,#a8794a,#8a5e35);box-shadow:0 0 0 2px var(--ink,#2a1d10),6px 6px 0 var(--sh,rgba(0,0,0,.35))}
.rg-frame.kx{background:#f3efe6}
[data-theme="dark"] .rg-frame.kx{background:#d9d3c6}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]) .rg-frame.kx{background:#d9d3c6}}
.rg-cell{position:absolute;background:linear-gradient(180deg,#3c2a1a 0,#5b4129 18%,#6a4c30);box-shadow:inset 0 6px 10px rgba(0,0,0,.45),inset 0 -1px 0 rgba(255,255,255,.12);overflow:visible}
.rg-frame.kx .rg-cell{background:linear-gradient(180deg,#bdb6a6 0,#d8d2c4 22%,#e2dccf);box-shadow:inset 0 6px 10px rgba(0,0,0,.28)}
.rg-cell.za{box-shadow:inset 0 0 0 3px #d8352a,inset 0 6px 10px rgba(0,0,0,.4)}
.rg-cell.cel{box-shadow:inset 0 0 0 4px var(--accent-2,#ffcd3c)}
.rg-cell .lb{position:absolute;left:3px;top:2px;font-size:9px;font-weight:800;color:rgba(255,255,255,.55);pointer-events:none;white-space:nowrap}
.rg-frame.kx .rg-cell .lb{color:rgba(0,0,0,.4)}
.rg-cell .bad{position:absolute;right:2px;top:2px;background:#d8352a;color:#fff;font-size:9px;font-weight:800;padding:1px 4px;border-radius:3px;pointer-events:none;z-index:2}
.rg-box{position:absolute;box-sizing:border-box;border:1px solid rgba(0,0,0,.75);border-radius:1px;background:#6d7a8a center/cover no-repeat;overflow:hidden;cursor:pointer;touch-action:none}
.rg-box::before{content:"";position:absolute;inset:0;background:linear-gradient(90deg,rgba(0,0,0,.35),rgba(0,0,0,.05) 30%,rgba(0,0,0,.05) 70%,rgba(0,0,0,.4))}
.rg-box.lez::before{background:linear-gradient(180deg,rgba(0,0,0,.3),rgba(0,0,0,.05) 35%,rgba(0,0,0,.35))}
.rg-box .tt{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;line-height:1.05;text-shadow:0 0 2px #000,0 0 3px #000;overflow:hidden;text-align:center;writing-mode:vertical-rl;white-space:nowrap;pointer-events:none}
.rg-box.lez .tt{writing-mode:horizontal-tb}
.rg-box.szac{border-style:dashed;border-color:rgba(255,255,255,.85)}
.rg-box.za{opacity:.55;outline:1.5px solid #d8352a}
.rg-box.ser{background-image:repeating-linear-gradient(90deg,#2b4a7a 0,#2b4a7a calc(var(--tom) - 1px),#132238 calc(var(--tom) - 1px),#132238 var(--tom))}
.rg-box.wyb{outline:3px solid var(--accent-2,#ffcd3c);outline-offset:1px;z-index:2}
.rg-box.ciag{opacity:.25}
.rg-box.drop{outline:3px solid var(--accent,#d8352a);outline-offset:1px;z-index:2}
.rg-cov{position:absolute;box-sizing:border-box;padding:1px;cursor:pointer;touch-action:none}
.rg-cov>i{display:block;width:100%;height:100%;background:#6d7a8a center/contain no-repeat;border-radius:1px;box-shadow:0 1px 3px rgba(0,0,0,.5)}
.rg-cov>b{position:absolute;inset:1px;display:flex;align-items:center;justify-content:center;text-align:center;color:#fff;font-size:5px;padding:2px;text-shadow:0 0 2px #000;pointer-events:none}
.rg-cov.drop>i{outline:3px solid var(--accent,#d8352a)}
.rg-ghost{position:fixed;z-index:2147483000;pointer-events:none;opacity:.85;transform:translate(-50%,-50%) rotate(-3deg);box-shadow:4px 6px 12px rgba(0,0,0,.45)}
.rg-tray{position:absolute;left:0;font-size:12px;color:var(--muted);font-weight:700}
.rg-zoom{position:absolute;right:12px;bottom:calc(14px + env(safe-area-inset-bottom));display:flex;flex-direction:column;gap:8px;z-index:3}
.rg-zoom button{width:46px;height:46px;font-size:22px;padding:0;border-radius:50%}
.rg-info{position:absolute;left:0;right:0;bottom:0;z-index:4;background:var(--surface);border-top:2.5px solid var(--ink,var(--line));box-shadow:0 -6px 18px rgba(0,0,0,.25);padding:12px 14px calc(12px + env(safe-area-inset-bottom));display:flex;gap:14px;align-items:stretch;max-height:62dvh}
.rg-info .im{flex:0 0 auto;width:min(44vw,260px);display:flex;align-items:center;justify-content:center;touch-action:pan-y}
.rg-info .im img{max-width:100%;max-height:calc(62dvh - 40px);border:2px solid var(--ink,var(--line));border-radius:4px;box-shadow:var(--shadow,0 2px 6px rgba(0,0,0,.3))}
.rg-info .tx{flex:1;min-width:0;display:flex;flex-direction:column;gap:6px;overflow:auto}
.rg-info h3{margin:0;font-size:18px;line-height:1.2}
.rg-info .bt{display:flex;flex-wrap:wrap;gap:6px;margin-top:auto}
.rg-info .bt button{min-height:38px;padding:4px 10px}
.rg-info .nav{display:flex;gap:6px;align-items:center}
@media (max-width:560px){.rg-info{flex-direction:column;gap:8px}.rg-info .im{width:100%;max-height:34dvh}.rg-info .im img{max-height:32dvh}.rg-top .lbl{display:none}}
`;
    document.head.appendChild(s);
  }

  function rysuj(dlg) {
    const P = W(), sh = P.C.byId.get(st.sh); if (!sh) return;
    const g = geo(sh), stage = dlg.querySelector('.rg-stage');
    let h = `<div class="rg-frame ${g.kx ? 'kx' : ''}" style="width:${g.W * PX}px;height:${g.H * PX}px">`;
    let zaRazem = 0;
    for (let r = 1; r <= g.rows; r++) for (let c = 1; c <= g.cols; c++) {
      const Wc = g.kol[c - 1], Hc = g.rz[r - 1];
      const items = wKomorce(sh.id, r, c);
      const nazwa = (sh.cells || {})[r + '-' + c];
      let inner = '', za = 0;
      if (st.tryb === 'okladki') inner = okladki(items, Wc, Hc);
      else { const u = uloz(items, Wc, Hc); za = u.za; zaRazem += za; inner = u.out.map(o => pudlo(o, Hc)).join(''); }
      h += `<div class="rg-cell ${za ? 'za' : ''}" data-r="${r}" data-c="${c}" style="left:${g.xs[c - 1] * PX}px;top:${g.ys[r - 1] * PX}px;width:${Wc * PX}px;height:${Hc * PX}px">
        <span class="lb">${esc(nazwa || ((g.cols > 1 ? r + '/' + c : r) + ''))}</span>${za ? `<span class="bad">za ciasno: ${za}</span>` : ''}${inner}</div>`;
    }
    h += '</div>';
    // rzeczy postawione na regale bez przegródki – pod regałem, można je przeciągnąć na półkę
    const luzem = wKomorce(sh.id, null, null);
    if (luzem.length) {
      const u = uloz(luzem, 9999, 40);
      h += `<div class="rg-tray" style="top:${(g.H + 6) * PX}px">Na regale, bez przegródki – przeciągnij na półkę:</div>
        <div class="rg-cell" data-r="0" data-c="0" style="left:0;top:${(g.H + 10) * PX}px;width:${Math.max(g.W, u.zajete + 2) * PX}px;height:${34 * PX}px;background:var(--surface2);box-shadow:none">${u.out.map(o => pudlo(o, 34)).join('')}</div>`;
    }
    stage.innerHTML = h;
    stage.style.width = g.W * PX + 'px';
    stage.dataset.h = (luzem.length ? g.H + 46 : g.H) * PX;
    const n = st.dane.filter(x => x.p.s === sh.id), szac = n.filter(x => x.zr === 'szac' && x.typ === 'game').length;
    dlg.querySelector('.rg-hint').innerHTML = `${esc(sh.name)}: ${num(g.W)} × ${num(g.H)} cm · ${n.length} poz.${szac ? ` · <span title="Brak wymiarów na BGG ani wpisanych ręcznie">${szac} pudełek o szacowanym rozmiarze (przerywana ramka)</span>` : ''}${zaRazem ? ` · <b style="color:var(--bad,#c8342a)">${zaRazem} się nie mieści</b>` : ''}
      <br>Dwa palce lub kółko myszy – przybliżanie. Przytrzymaj pudełko i przeciągnij na inne – zamiana miejscami.`;
    dlg.querySelector('[data-a="cof"]').disabled = !st.cofnij.length;
    if (st.wyb) { const b = stage.querySelector(`[data-k="${CSS.escape(st.wyb)}"]`); if (b) b.classList.add('wyb'); }
  }
  function pudlo(o, Hc) {
    const it = o.it, wpx = o.w * PX, hpx = o.h * PX;
    const dl = Math.max(it.t.length, 4);
    const fs = o.lez ? Math.min(hpx * 0.6, wpx / (dl * 0.58), 15) : Math.min(wpx * 0.62, hpx / (dl * 0.58), 15);
    const tom = it.typ === 'serie' ? `--tom:${TOM.h * PX}px;` : '';
    const bg = it.typ !== 'serie' && it.th ? `background-image:url('${String(it.th).replace(/'/g, '%27')}');` : '';
    return `<div class="rg-box ${o.lez ? 'lez' : ''} ${it.zr === 'szac' && it.typ === 'game' ? 'szac' : ''} ${o.za ? 'za' : ''} ${it.typ === 'serie' ? 'ser' : ''}" data-k="${esc(it.k)}"
      style="left:${o.x * PX}px;bottom:${o.y * PX}px;width:${wpx}px;height:${hpx}px;${tom}${bg}" title="${esc(it.t)}"><span class="tt" style="font-size:${Math.max(fs, 2.2).toFixed(1)}px">${esc(it.typ === 'serie' ? it.t + (it.ile ? ' (' + it.ile + ')' : '') : it.t)}</span></div>`;
  }
  function okladki(items, Wc, Hc) {
    if (!items.length) return '';
    const n = items.length, wp = Wc * PX, hp = Hc * PX;
    let best = { s: 0, k: 1, w: 1 };
    for (let k = 1; k <= n; k++) { const w = Math.ceil(n / k), s = Math.min(wp / k, hp / w); if (s > best.s) best = { s, k, w }; }
    const s = best.s;
    const x0 = (wp - best.k * s) / 2, y0 = hp - best.w * s;
    return items.map((it, i) => `<div class="rg-cov" data-k="${esc(it.k)}" style="left:${x0 + (i % best.k) * s}px;top:${y0 + Math.floor(i / best.k) * s}px;width:${s}px;height:${s}px" title="${esc(it.t)}"><i style="${it.th ? `background-image:url('${String(it.th).replace(/'/g, '%27')}')` : ''}"></i>${it.th ? '' : `<b>${esc(it.t)}</b>`}</div>`).join('');
  }

  /* ---------- powiększenie ---------- */
  function zastosuj(dlg) { dlg.querySelector('.rg-stage').style.transform = `translate(${st.tx}px,${st.ty}px) scale(${st.s})`; }
  function dopasuj(dlg) {
    const v = dlg.querySelector('.rg-view'), stage = dlg.querySelector('.rg-stage');
    const sw = stage.offsetWidth || 1, sh = +stage.dataset.h || 1;
    st.s = Math.min((v.clientWidth - 24) / sw, (v.clientHeight - 24) / sh, 4);
    st.tx = (v.clientWidth - sw * st.s) / 2; st.ty = Math.max(12, (v.clientHeight - sh * st.s) / 2);
    zastosuj(dlg);
  }
  function zoom(dlg, f, cx, cy) {
    const v = dlg.querySelector('.rg-view');
    if (cx == null) { cx = v.clientWidth / 2; cy = v.clientHeight / 2; }
    const s = Math.max(0.1, Math.min(14, st.s * f)); f = s / st.s;
    st.tx = cx - (cx - st.tx) * f; st.ty = cy - (cy - st.ty) * f; st.s = s; zastosuj(dlg);
  }

  /* ---------- przemeblowanie ---------- */
  const znajdz = k => st.dane.find(x => x.k === k);
  async function zapisz(zmiany, opis) {
    // zmiany: [{it, p}] – nowe miejsce każdej rzeczy; do cofania zapamiętujemy stare
    st.cofnij.push(zmiany.map(z => ({ k: z.it.k, p: Object.assign({}, z.it.p) })));
    if (st.cofnij.length > 30) st.cofnij.shift();
    await ustaw(zmiany);
    if (opis) App.ui.toast(opis);
  }
  async function ustaw(zmiany) {
    const P = W(), gry = [], kom = []; let serie = null;
    zmiany.forEach(({ it, p }) => {
      const np = { s: p.s, r: p.r || null, c: p.c || null }; if (p.i != null) np.i = p.i; if (p.lez != null) np.lez = p.lez;
      it.p = np;
      if (it.typ === 'game') { it.rec = Object.assign({}, it.rec, { polka: np }); gry.push(it.rec); }
      else if (it.typ === 'comic') { it.rec = Object.assign({}, it.rec, { polka: np }); kom.push(it.rec); }
      else { serie = serie || Object.assign({}, P.C.serie); serie[it.rec] = np; }
    });
    if (gry.length) await DB.putMany('games', gry);
    if (kom.length) await DB.putMany('comics', kom);
    if (serie) await DB.setting('polkiSerii', serie);
    await P.reload();
  }
  // nadaj kolejne numery wszystkim w przegródce (wg tego, co widać)
  const numeruj = (lst, sh, r, c) => lst.map((it, i) => ({ it, p: Object.assign({}, it.p, { s: sh, r, c, i }) }));
  async function zamien(a, b) {
    if (a === b) return;
    const pa = a.p, pb = b.p;
    const la = wKomorce(pa.s, pa.r, pa.c), lb = wKomorce(pb.s, pb.r, pb.c);
    const ia = la.indexOf(a), ib = lb.indexOf(b);
    let zm;
    if (la === lb || (pa.s === pb.s && pa.r === pb.r && pa.c === pb.c)) { la[ia] = b; la[ib] = a; zm = numeruj(la, pa.s, pa.r, pa.c); }
    else { la[ia] = b; lb[ib] = a; zm = numeruj(la, pa.s, pa.r, pa.c).concat(numeruj(lb, pb.s, pb.r, pb.c)); }
    // „leży/stoi” zostaje przy pudełku
    zm.forEach(z => { if (z.it.p.lez != null) z.p.lez = z.it.p.lez; else delete z.p.lez; });
    await zapisz(zm, `Zamieniono: „${a.t}” ↔ „${b.t}”`);
  }
  async function przenies(a, s, r, c, xcm) {
    const lst = wKomorce(s, r, c).filter(x => x !== a);
    const sh = W().C.byId.get(s), g = geo(sh);
    // miejsce wstawienia: przed pierwszym pudełkiem, którego środek jest na prawo od miejsca upuszczenia
    let idx = lst.length;
    if (xcm != null && r) { const u = uloz(lst, g.kol[c - 1], g.rz[r - 1]); const o = u.out.find(o => o.x + o.w / 2 > xcm); if (o) idx = lst.indexOf(o.it); }
    lst.splice(idx, 0, a);
    const zm = numeruj(lst, s, r || null, c || null);
    zm.forEach(z => { if (z.it.p.lez != null) z.p.lez = z.it.p.lez; else delete z.p.lez; });
    const src = a.p;
    if (src.s !== s || (src.r || 0) !== (r || 0) || (src.c || 0) !== (c || 0)) {
      const zr = wKomorce(src.s, src.r, src.c).filter(x => x !== a);
      zm.push(...numeruj(zr, src.s, src.r, src.c).map(z => { if (z.it.p.lez != null) z.p.lez = z.it.p.lez; else delete z.p.lez; return z; }));
    }
    await zapisz(zm, `Przeniesiono „${a.t}” – ${W().przegrodka(sh, r, c) || 'bez przegródki'}`);
  }

  /* ---------- okno ---------- */
  async function otworz(shId) {
    const P = W(); if (!P) return;
    css(); await P.reload();
    if (!P.C.shelves.length) { App.ui.toast('Najpierw dodaj regał'); return; }
    st.sh = P.C.byId.has(shId) ? shId : P.C.shelves[0].id; st.cofnij = []; st.wyb = null;
    try { st.tryb = (await DB.local('polki.widok')) || 'grzbiety'; } catch (e) { }
    await wczytaj();
    const dlg = document.createElement('dialog'); dlg.className = 'rg-dlg';
    dlg.innerHTML = `<div class="rg-top">
        <button type="button" data-a="zamknij" title="Zamknij">✕</button>
        <select class="rg-sel">${P.C.shelves.map(s => `<option value="${esc(s.id)}">${esc(s.name)}${s.place ? ' – ' + esc(s.place) : ''}</option>`).join('')}</select>
        <span class="rg-seg"><button type="button" data-t="grzbiety">Grzbiety</button><button type="button" data-t="okladki">Okładki</button></span>
        <button type="button" data-a="cof" title="Cofnij ostatnią zmianę">↶ <span class="lbl">Cofnij</span></button>
        <button type="button" data-a="wym" title="Wymiary regału">📏 <span class="lbl">Wymiary</span></button>
      </div>
      <div class="rg-hint"></div>
      <div class="rg-view"><div class="rg-stage"></div>
        <div class="rg-zoom"><button type="button" data-a="plus" title="Przybliż">+</button><button type="button" data-a="minus" title="Oddal">−</button><button type="button" data-a="fit" title="Cały regał">⤢</button></div>
      </div>`;
    document.body.appendChild(dlg);
    const sel = dlg.querySelector('.rg-sel'); sel.value = st.sh;
    const segUstaw = () => dlg.querySelectorAll('[data-t]').forEach(b => b.classList.toggle('on', b.dataset.t === st.tryb));
    segUstaw();
    const odswiez = () => rysuj(dlg);
    sel.onchange = () => { st.sh = sel.value; st.wyb = null; zamknijInfo(); rysuj(dlg); dopasuj(dlg); };
    dlg.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { st.tryb = b.dataset.t; segUstaw(); try { DB.local('polki.widok', st.tryb); } catch (e) { } rysuj(dlg); });
    dlg.querySelector('[data-a="zamknij"]').onclick = () => dlg.close();
    dlg.querySelector('[data-a="plus"]').onclick = () => zoom(dlg, 1.5);
    dlg.querySelector('[data-a="minus"]').onclick = () => zoom(dlg, 1 / 1.5);
    dlg.querySelector('[data-a="fit"]').onclick = () => dopasuj(dlg);
    dlg.querySelector('[data-a="cof"]').onclick = async () => {
      const z = st.cofnij.pop(); if (!z) return;
      await ustaw(z.map(x => ({ it: znajdz(x.k), p: x.p })).filter(x => x.it)); App.ui.toast('Cofnięto'); odswiez();
    };
    dlg.querySelector('[data-a="wym"]').onclick = async () => { const sh = P.C.byId.get(st.sh); if (await wymiaryRegalu(sh)) { rysuj(dlg); dopasuj(dlg); } };
    dlg.addEventListener('close', () => { dlg.remove(); if (st.poZamknieciu) st.poZamknieciu(); });
    dlg.addEventListener('cancel', e => { if (dlg.querySelector('.rg-info')) { e.preventDefault(); zamknijInfo(); } });
    dlg.showModal();
    rysuj(dlg); dopasuj(dlg);
    gesty(dlg);
    window.addEventListener('resize', () => { if (dlg.open) dopasuj(dlg); });

    /* ----- karta pudełka (okładka w dużym rozmiarze, przeglądanie w obrębie przegródki) ----- */
    function zamknijInfo() { const i = dlg.querySelector('.rg-info'); if (i) i.remove(); st.wyb = null; dlg.querySelectorAll('.wyb').forEach(b => b.classList.remove('wyb')); }
    st.info = k => {
      const it = znajdz(k); if (!it) return;
      zamknijInfo(); st.wyb = k;
      const el = dlg.querySelector(`[data-k="${CSS.escape(k)}"]`); if (el) el.classList.add('wyb');
      const sh = P.C.byId.get(it.p.s), lst = wKomorce(it.p.s, it.p.r, it.p.c), i = lst.indexOf(it);
      const a = it.a.slice().sort((x, y) => y - x);
      const box = document.createElement('div'); box.className = 'rg-info';
      box.innerHTML = `<div class="im">${it.img ? `<img src="${esc(it.img)}" alt="" onerror="this.src='${esc(it.th || '')}'">` : '<div class="muted">brak okładki</div>'}</div>
        <div class="tx"><h3>${esc(it.t)}</h3>
          <div class="muted">📍 ${esc(sh.name)}${it.p.r ? ' · ' + esc(P.przegrodka(sh, it.p.r, it.p.c)) : ''} · ${i + 1}. z ${lst.length}</div>
          <div>${it.typ === 'serie' ? `${it.ile || 0} ${it.ile === 1 ? 'tom' : 'tomów'} · ok. ${num(a[2] / 1)} cm grzbietów` : `Pudełko ${num(a[0])} × ${num(a[1])} × ${num(a[2])} cm`}
            <small class="muted">(${it.zr === 'BGG' ? 'wymiary z BGG' : it.zr === 'wpisane' ? 'wpisane ręcznie' : 'szacunek – brak wymiarów'})</small></div>
          <div class="nav"><button type="button" data-n="-1" ${i ? '' : 'disabled'}>‹ Poprzednie</button><button type="button" data-n="1" ${i < lst.length - 1 ? '' : 'disabled'}>Następne ›</button></div>
          <div class="bt">
            <button type="button" data-b="lez">${(it.p.lez != null ? it.p.lez : null) ? '⬆ Postaw' : '⬇ Połóż'}</button>
            ${it.typ === 'game' && App.has('pudelka.edytuj') ? '<button type="button" data-b="wym">📏 Wymiary pudełka</button>' : ''}
            ${it.typ !== 'serie' ? '<button type="button" data-b="karta">Otwórz kartę</button>' : ''}
            <button type="button" data-b="x" class="primary">Zamknij</button></div></div>`;
      dlg.querySelector('.rg-view').appendChild(box);
      const lezyTeraz = () => { const sorted = it.a.slice().sort((x, y) => x - y), g = geo(sh); return it.p.lez != null ? !!it.p.lez : (it.p.r ? sorted[1] > g.rz[it.p.r - 1] + 0.5 : false); };
      box.querySelector('[data-b="lez"]').textContent = lezyTeraz() ? '⬆ Postaw' : '⬇ Połóż';
      box.querySelectorAll('[data-n]').forEach(b => b.onclick = () => st.info(lst[i + +b.dataset.n].k));
      box.querySelector('[data-b="x"]').onclick = zamknijInfo;
      box.querySelector('[data-b="lez"]').onclick = async () => { await zapisz([{ it, p: Object.assign({}, it.p, { lez: !lezyTeraz() }) }]); odswiez(); st.info(k); };
      const bw = box.querySelector('[data-b="wym"]');
      if (bw) bw.onclick = async () => { if (await App.call('pudelka.edytuj', it.rec.id)) { await wczytaj(); odswiez(); st.info(k); } };
      const bk = box.querySelector('[data-b="karta"]');
      if (bk) bk.onclick = () => { st.poZamknieciu = () => { st.poZamknieciu = null; it.typ === 'game' ? App.go('planszowki', { gra: it.rec.id }) : App.go('komiksy', { id: it.rec.id }); }; dlg.close(); };
      // przesunięcie palcem po okładce = następne / poprzednie
      const im = box.querySelector('.im'); let sx = null;
      im.addEventListener('pointerdown', e => { sx = e.clientX; });
      im.addEventListener('pointerup', e => { if (sx == null) return; const d = e.clientX - sx; sx = null; if (Math.abs(d) > 40) { const j = i + (d < 0 ? 1 : -1); if (lst[j]) st.info(lst[j].k); } });
    };
    st.odswiez = odswiez;
  }

  /* ---------- gesty: przesuwanie, przybliżanie, przeciąganie pudełek ---------- */
  function gesty(dlg) {
    const v = dlg.querySelector('.rg-view');
    const pts = new Map();
    let pan = null, pinch = null, drag = null, tap = null, timer = null;
    const rel = e => { const r = v.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const pod = (x, y) => { const el = document.elementFromPoint(x, y); return el ? el.closest('.rg-box,.rg-cov,.rg-cell') : null; };
    const czysc = () => { v.querySelectorAll('.drop,.cel').forEach(x => x.classList.remove('drop', 'cel')); };

    function startDrag(e, el) {
      clearTimeout(timer); timer = null;
      const it = znajdz(el.dataset.k); if (!it) return;
      const r = el.getBoundingClientRect();
      const gh = el.cloneNode(true); gh.classList.add('rg-ghost'); gh.classList.remove('wyb');
      gh.style.left = e.clientX + 'px'; gh.style.top = e.clientY + 'px'; gh.style.bottom = 'auto';
      gh.style.width = r.width + 'px'; gh.style.height = r.height + 'px';
      document.body.appendChild(gh); dlg.appendChild(gh);
      el.classList.add('ciag');
      drag = { it, el, gh }; pan = null; tap = null;
      if (navigator.vibrate) try { navigator.vibrate(15); } catch (x) { }
    }
    function ruchDrag(e) {
      drag.gh.style.left = e.clientX + 'px'; drag.gh.style.top = e.clientY + 'px';
      czysc();
      const t = pod(e.clientX, e.clientY);
      if (!t || t === drag.el) return;
      t.classList.add(t.classList.contains('rg-cell') ? 'cel' : 'drop');
      // przy krawędzi okna przesuwaj widok
      const p = rel(e), m = 40, sp = 14;
      if (p.x < m) st.tx += sp; else if (p.x > v.clientWidth - m) st.tx -= sp;
      if (p.y < m) st.ty += sp; else if (p.y > v.clientHeight - m) st.ty -= sp;
      zastosuj(dlg);
    }
    async function koniecDrag(e) {
      const d = drag; drag = null; czysc(); d.gh.remove(); d.el.classList.remove('ciag');
      const t = pod(e.clientX, e.clientY);
      if (!t || t === d.el) return;
      if (t.dataset.k) { const b = znajdz(t.dataset.k); if (b) await zamien(d.it, b); }
      else if (t.classList.contains('rg-cell')) {
        const r = +t.dataset.r || null, c = +t.dataset.c || null;
        const rc = t.getBoundingClientRect(), xcm = (e.clientX - rc.left) / (st.s * PX);
        await przenies(d.it, st.sh, r, c, xcm);
      }
      st.odswiez();
    }

    v.addEventListener('pointerdown', e => {
      if (e.target.closest('.rg-zoom,.rg-info')) return;
      pts.set(e.pointerId, rel(e));
      try { v.setPointerCapture(e.pointerId); } catch (x) { }
      if (pts.size === 2) {
        clearTimeout(timer); timer = null; tap = null; if (drag) { drag.gh.remove(); drag.el.classList.remove('ciag'); drag = null; czysc(); }
        const [a, b] = [...pts.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, s: st.s, tx: st.tx, ty: st.ty, m: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
        pan = null; return;
      }
      if (pts.size > 2) return;
      const p = rel(e);
      pan = { x: p.x, y: p.y, tx: st.tx, ty: st.ty };
      const el = e.target.closest('.rg-box,.rg-cov');
      tap = { x: e.clientX, y: e.clientY, t: Date.now(), el, typ: e.pointerType };
      if (el && e.pointerType !== 'mouse') timer = setTimeout(() => { if (tap && tap.el === el) startDrag(e, el); }, 380);
    });
    v.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, rel(e));
      if (drag) { ruchDrag(e); return; }
      if (pinch && pts.size >= 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y), m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const s = Math.max(0.1, Math.min(14, pinch.s * d / pinch.d));
        const sx = (pinch.m.x - pinch.tx) / pinch.s, sy = (pinch.m.y - pinch.ty) / pinch.s;
        st.s = s; st.tx = m.x - sx * s; st.ty = m.y - sy * s; zastosuj(dlg); return;
      }
      const ruch = tap ? Math.hypot(e.clientX - tap.x, e.clientY - tap.y) : 99;
      if (tap && tap.el && tap.typ === 'mouse' && ruch > 6) { startDrag(e, tap.el); ruchDrag(e); return; }
      if (ruch > 8) { clearTimeout(timer); timer = null; tap = null; }
      if (pan) { const p = rel(e); st.tx = pan.tx + p.x - pan.x; st.ty = pan.ty + p.y - pan.y; zastosuj(dlg); v.style.cursor = 'grabbing'; }
    });
    const up = async e => {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId); v.style.cursor = '';
      clearTimeout(timer); timer = null;
      if (drag) { await koniecDrag(e); pan = null; tap = null; return; }
      if (pts.size < 2) pinch = null;
      if (pts.size === 1) { const p = [...pts.values()][0]; pan = { x: p.x, y: p.y, tx: st.tx, ty: st.ty }; return; }
      if (tap && e.type === 'pointerup' && Date.now() - tap.t < 600) {
        if (tap.el) st.info(tap.el.dataset.k);
        else {
          // podwójne stuknięcie w puste miejsce = przybliż
          const p = rel(e);
          if (st.ostTap && Date.now() - st.ostTap < 320) { zoom(dlg, 2, p.x, p.y); st.ostTap = 0; } else st.ostTap = Date.now();
        }
      }
      tap = null; pan = null;
    };
    v.addEventListener('pointerup', up); v.addEventListener('pointercancel', up);
    v.addEventListener('wheel', e => { e.preventDefault(); const p = rel(e); zoom(dlg, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), p.x, p.y); }, { passive: false });
    v.addEventListener('contextmenu', e => e.preventDefault());
  }

  /* ---------- wymiary regału ---------- */
  async function wymiaryRegalu(sh) {
    const g = geo(sh);
    const lst = a => a.map(num).join('; ');
    const out = await App.ui.form('Wymiary: ' + sh.name, [
      { name: 'kol', label: `Szerokość przegródek od lewej (cm, ${g.cols} ${g.cols === 1 ? 'kolumna' : 'kolumn'}; jedna liczba = wszystkie takie same)`, value: lst(g.kol) },
      { name: 'rz', label: `Wysokość półek od góry (cm, ${g.rows} ${g.rows === 1 ? 'półka' : 'półek'})`, value: lst(g.rz) },
      { name: 'd', label: 'Głębokość (cm)', type: 'number', step: '0.5', value: g.d },
      { name: 't', label: 'Grubość desek (cm)', type: 'number', step: '0.1', value: g.t }
    ], { ok: 'Zapisz' });
    if (!out) return false;
    const liczby = s => String(s || '').split(/[;\s]+|,\s+/).map(x => parseFloat(x.replace(',', '.'))).filter(x => x > 0 && x < 500);
    const wym = { kol: liczby(out.kol), rz: liczby(out.rz), d: +out.d || null, t: +out.t || null };
    await DB.put('shelves', Object.assign({}, sh, { wym }));
    await W().reload();
    return true;
  }

  App.provide('polki.regal', otworz);
  App.provide('polki.wymiary', wymiaryRegalu);
  window.PolkiRegal = { geo, uloz, wymGry };
})();
