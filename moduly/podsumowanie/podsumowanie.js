/* Moduł „Podsumowanie roku”: rozgrywki, przeczytane komiksy, zakupy i sprzedaże z wybranego roku
 * na jednym ekranie + obrazek (PNG 1080×1920, format „story”) do udostępnienia.
 * Zakupy = gry i komiksy z datą zakupu (acquiredAt) w danym roku; sprzedaże = ogłoszenia oznaczone jako sprzedane (soldAt).
 * Przeczytane = odznaczenia w Master Reading Order i kartach komiksów (bez odznaczeń hurtowych z importu).
 */
(function () {
  const { esc } = App.ui;
  const K = () => window.KS;

  window.IKONY = window.IKONY || {};
  window.IKONY.podsumowanie = '<rect class="f" x="3.5" y="4.5" width="17" height="16" rx="3"/><path d="M3.5 9h17M8 2.5v4M16 2.5v4M8 13.5l2.5 2.5 5-5"/>';
  if (window.IKONY_KOLOR) window.IKONY_KOLOR.podsumowanie = '#f06a24';

  const MIES = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];
  const zl = v => Math.round(v).toLocaleString('pl-PL') + ' zł';

  async function policz(rok) {
    const [d, czyt, listings, comics, ro] = await Promise.all([K().dane(), K().odczyty(), DB.all('listings'), DB.all('comics'), DB.all('readingOrder')]);
    const inY = s => (s || '').startsWith(rok);
    const me = K().ja(d.players);
    const ps = d.plays.filter(p => inY(p.date));
    const cnt = new Map(); ps.forEach(p => cnt.set(p.gameId, (cnt.get(p.gameId) || 0) + 1));
    const top = [...cnt.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, n]) => ({ g: d.gameById.get(id) || { title: '?' }, n }));
    const pierwsza = new Map(); d.plays.forEach(p => { if (!pierwsza.has(p.gameId) || (p.date || '') < pierwsza.get(p.gameId)) pierwsza.set(p.gameId, p.date || ''); });
    const nowe = [...cnt.keys()].filter(id => inY(pierwsza.get(id)) && !((d.gameById.get(id) || {}).bggPlays)).length;
    const godz = ps.reduce((a, p) => a + (p.durationMin || 0), 0) / 60;
    const moje = me ? ps.filter(p => p.players.some(x => x.playerId === me.id)) : [];
    const wygr = me ? moje.filter(p => p.players.some(x => x.playerId === me.id && x.win)).length : 0;
    const wsp = new Map(); moje.forEach(p => p.players.forEach(x => { if (x.playerId !== me.id) wsp.set(x.playerId, (wsp.get(x.playerId) || 0) + 1); }));
    const kumpel = [...wsp.entries()].sort((a, b) => b[1] - a[1])[0];
    const rywal = kumpel ? Object.assign({ p: d.playerById.get(kumpel[0]) }, K().h2h(ps, me.id, kumpel[0])) : null;
    const miesiace = MIES.map((m, i) => ps.filter(p => (p.date || '').slice(5, 7) === String(i + 1).padStart(2, '0')).length);
    const dni = new Set(ps.map(p => p.date)).size;
    // komiksy
    const przecz = czyt.filter(r => inY(r.d));
    const czytM = MIES.map((m, i) => przecz.filter(r => r.d.slice(5, 7) === String(i + 1).padStart(2, '0')).length);
    const mroAll = ro.length, mroRead = ro.filter(r => r.read).length;
    // zakupy
    const kupGry = d.games.filter(g => inY(g.acquiredAt) && g.status !== 'played' && g.status !== 'wishlist');
    const kupKom = comics.filter(c => inY(c.acquiredAt));
    const wydane = kupGry.concat(kupKom).reduce((a, x) => a + (Number(x.pricePaid) || 0), 0);
    // sprzedaże
    const sprz = listings.filter(l => l.status === 'sold' && inY(l.soldAt || l.updatedAt));
    const zysk = sprz.reduce((a, l) => a + (Number(l.soldPrice != null ? l.soldPrice : l.price) || 0), 0);
    const wyz = App.has('wyzwania.lista') && String(new Date().getFullYear()) === rok ? (await App.call('wyzwania.lista')).filter(x => x.c.period !== 'month') : [];
    return { rok, ps, top, nowe, godz, gier: cnt.size, moje, wygr, rywal, me, miesiace, dni, przecz, czytM, mroAll, mroRead, kupGry, kupKom, wydane, sprz, zysk, wyz };
  }

  const bars = (arr, kolor) => { const mx = Math.max(1, ...arr); return `<div class="bars" style="height:90px">${arr.map((v, i) => `<div class="b" style="height:${v / mx * 100}%;${kolor ? 'background:' + kolor : ''}" title="${MIES[i]}: ${v}"></div>`).join('')}</div><div class="bars-l">${MIES.map(m => `<span>${m}</span>`).join('')}</div>`; };

  /* ---------- obrazek ---------- */
  function obrazek(s) {
    const W = 1080, H = 1920, c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d');
    if (!x.roundRect) x.roundRect = function (a, b, w, h) { this.rect(a, b, w, h); };
    const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#16263d'); g.addColorStop(.55, '#1f3f68'); g.addColorStop(1, '#3b2a14');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    // kropki w tle
    x.fillStyle = 'rgba(255,255,255,.04)'; for (let i = 0; i < 60; i++) { x.beginPath(); x.arc((i * 197) % W, (i * 331) % H, 30 + (i * 13) % 60, 0, 7); x.fill(); }
    const F = (w, sz) => `${w} ${sz}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
    const t = (txt, X, Y, sz, col = '#fff', w = 700, al = 'left') => { x.font = F(w, sz); x.fillStyle = col; x.textAlign = al; x.fillText(txt, X, Y); };
    const fit = (txt, max, sz, w = 600) => { x.font = F(w, sz); let s = txt; while (x.measureText(s).width > max && s.length > 3) s = s.slice(0, -2); return s === txt ? s : s.trim() + '…'; };
    t('MOJE KOLEKCJE', 80, 140, 34, '#f0b45a', 800);
    t('Podsumowanie ' + s.rok, 80, 230, 84, '#fff', 800);
    // kafelki
    const tiles = [
      [s.ps.length, 'rozgrywek'], [Math.round(s.godz), 'godzin|przy stole'], [s.gier, 'różnych|gier'],
      [s.przecz.length, 'przeczytanych|komiksów'], [s.kupGry.length + s.kupKom.length, 'nowych|w kolekcji'], [s.sprz.length, 'sprzedanych|ogłoszeń']
    ];
    tiles.forEach(([v, l], i) => {
      const cx = 80 + (i % 3) * 315, cy = 300 + Math.floor(i / 3) * 225;
      x.fillStyle = 'rgba(255,255,255,.09)'; x.beginPath(); x.roundRect(cx, cy, 290, 200, 28); x.fill();
      t(String(v), cx + 28, cy + 95, 76, '#fff', 800);
      l.split('|').forEach((ln, k) => t(fit(ln, 240, 28, 500), cx + 28, cy + 140 + k * 34, 28, 'rgba(255,255,255,.75)', 500));
    });
    let y = 830;
    t('Najczęściej grane', 80, y, 40, '#f0b45a', 800); y += 30;
    const mx = Math.max(1, ...s.top.map(a => a.n));
    s.top.forEach((a, i) => {
      y += 84;
      x.fillStyle = 'rgba(255,255,255,.12)'; x.beginPath(); x.roundRect(80, y - 46, 920, 60, 16); x.fill();
      x.fillStyle = 'rgba(240,180,90,.55)'; x.beginPath(); x.roundRect(80, y - 46, Math.max(60, 920 * a.n / mx), 60, 16); x.fill();
      t((i + 1) + '. ' + fit(a.g.title, 760, 34, 650), 104, y - 4, 34, '#fff', 650);
      t(a.n + '×', 980, y - 4, 34, '#fff', 800, 'right');
    });
    if (!s.top.length) { y += 70; t('Brak zapisanych rozgrywek', 80, y, 32, 'rgba(255,255,255,.7)', 500); }
    y += 110;
    const linie = [];
    if (s.me && s.moje.length) linie.push(['🏆', `Wygrane: ${s.wygr} z ${s.moje.length} (${Math.round(s.wygr / s.moje.length * 100)}%)`]);
    if (s.rywal && s.rywal.p) linie.push(['⚔️', `Najczęstszy rywal: ${s.rywal.p.name} · bilans ${s.rywal.a}:${s.rywal.b}`]);
    if (s.nowe) linie.push(['✨', `Pierwszy raz zagrane: ${s.nowe} ${K().pl(s.nowe, 'gra', 'gry', 'gier')}`]);
    if (s.mroAll) linie.push(['📖', `Master Reading Order: ${Math.round(s.mroRead / s.mroAll * 1000) / 10}% przeczytane`]);
    if (s.wydane) linie.push(['🛒', `Na kolekcję: ${zl(s.wydane)}`]);
    if (s.zysk) linie.push(['💰', `Ze sprzedaży: ${zl(s.zysk)}`]);
    s.wyz.slice(0, 2).forEach(w => linie.push([w.n >= w.target ? '🏅' : '🎯', `${w.c.title}: ${w.n}/${w.target}`]));
    linie.slice(0, 8).forEach(([ik, tx]) => { t(ik, 80, y, 40, '#fff', 400); t(fit(tx, 840, 36, 600), 150, y, 36, '#fff', 600); y += 84; });
    t('Kolekcja Marcina · ' + new Date().toLocaleDateString('pl-PL'), W / 2, H - 70, 28, 'rgba(255,255,255,.55)', 500, 'center');
    return c;
  }

  async function render(el, params) {
    const [plays, comics, listings] = await Promise.all([DB.all('plays'), DB.all('comics'), DB.all('listings')]);
    const lata = new Set([String(new Date().getFullYear())]);
    plays.forEach(p => p.date && lata.add(p.date.slice(0, 4)));
    comics.forEach(c => c.acquiredAt && lata.add(c.acquiredAt.slice(0, 4)));
    listings.forEach(l => l.soldAt && lata.add(l.soldAt.slice(0, 4)));
    const rok = params.rok || String(new Date().getFullYear());
    const s = await policz(rok);
    el.innerHTML = `
      <div class="row" style="margin-bottom:10px"><h1 style="margin:0">Podsumowanie roku</h1><span class="spacer"></span>
        <select id="ps-rok">${[...lata].filter(Boolean).sort().reverse().map(y => `<option ${y === rok ? 'selected' : ''}>${y}</option>`).join('')}</select>
        <button class="primary" id="ps-share">📤 Udostępnij obrazek</button></div>
      <h2>🎲 Planszówki</h2>
      <div class="stats">
        <div class="stat"><div class="v">${s.ps.length}</div><div class="l">${K().pl(s.ps.length, 'rozgrywka', 'rozgrywki', 'rozgrywek')}</div></div>
        <div class="stat"><div class="v">${K().num(s.godz)} h</div><div class="l">przy stole</div></div>
        <div class="stat"><div class="v">${s.gier}</div><div class="l">różnych gier</div></div>
        <div class="stat"><div class="v">${s.nowe}</div><div class="l">zagranych pierwszy raz</div></div>
        <div class="stat"><div class="v">${s.dni}</div><div class="l">dni z grami</div></div>
        ${s.me && s.moje.length ? `<div class="stat"><div class="v">${Math.round(s.wygr / s.moje.length * 100)}%</div><div class="l">moich wygranych (${s.wygr}/${s.moje.length})</div></div>` : ''}
      </div>
      ${s.ps.length ? `<div class="card">${bars(s.miesiace)}</div>` : ''}
      ${s.top.length ? `<h3 style="margin-top:14px">Najczęściej grane</h3><div class="list">${s.top.map((a, i) => `<div class="li" data-g="${esc(a.g.id || '')}"><b style="width:20px">${i + 1}.</b>${a.g.thumb || a.g.image ? `<img src="${esc(a.g.thumb || a.g.image)}" alt="" loading="lazy">` : '<span class="ph">🎲</span>'}<div class="main"><div class="t">${esc(a.g.title)}</div></div><div class="num">${a.n}×</div></div>`).join('')}</div>` : ''}
      ${s.rywal && s.rywal.p ? `<p style="margin-top:10px">⚔️ Najczęstszy rywal: <b>${esc(s.rywal.p.name)}</b> (${s.rywal.razem}×), bilans <b>${s.rywal.a} : ${s.rywal.b}</b>.</p>` : ''}
      <h2>📚 Komiksy</h2>
      <div class="stats">
        <div class="stat"><div class="v">${s.przecz.length}</div><div class="l">przeczytanych</div></div>
        ${s.mroAll ? `<div class="stat"><div class="v">${K().num(s.mroRead / s.mroAll * 100)}%</div><div class="l">Master Reading Order</div></div>` : ''}
        <div class="stat"><div class="v">${s.kupKom.length}</div><div class="l">nowych komiksów</div></div>
      </div>
      ${s.przecz.length ? `<div class="card">${bars(s.czytM, 'var(--ok)')}</div>` : ''}
      <h2>🛒 Zakupy i 💰 sprzedaż</h2>
      <div class="stats">
        <div class="stat"><div class="v">${s.kupGry.length}</div><div class="l">kupionych gier</div></div>
        <div class="stat"><div class="v">${s.kupKom.length}</div><div class="l">kupionych komiksów</div></div>
        <div class="stat"><div class="v" style="font-size:22px">${zl(s.wydane)}</div><div class="l">wydane (z cen zakupu)</div></div>
        <div class="stat"><div class="v">${s.sprz.length}</div><div class="l">sprzedanych ogłoszeń</div></div>
        <div class="stat"><div class="v" style="font-size:22px">${zl(s.zysk)}</div><div class="l">ze sprzedaży</div></div>
      </div>
      ${s.wyz.length ? `<h2>🏅 Wyzwania</h2><div class="ks-cards">${s.wyz.map(w => `<div class="ks-card"><b>${esc(w.c.title)}</b><div class="row" style="margin:6px 0"><b>${w.n}/${w.target}</b><span class="spacer"></span>${Math.min(100, Math.round(w.n / w.target * 100))}%</div><div class="ks-bar ${w.n >= w.target ? 'done' : ''}"><i style="width:${Math.min(100, w.n / w.target * 100)}%"></i></div></div>`).join('')}</div>` : ''}
      <p class="ks-sub" style="margin-top:16px">Zakupy liczą się z „Daty zakupu” w kartach gier i komiksów, sprzedaże z ogłoszeń oznaczonych jako sprzedane.</p>
      <h2>Podgląd obrazka</h2><div id="ps-prev" style="max-width:320px"></div>`;
    const cv = obrazek(s);
    const img = new Image(); img.src = cv.toDataURL('image/png'); img.style.cssText = 'width:100%;border-radius:14px;box-shadow:var(--shadow-lg)';
    el.querySelector('#ps-prev').appendChild(img);
    el.querySelector('#ps-rok').onchange = e => App.go('podsumowanie', { rok: e.target.value });
    el.querySelector('#ps-share').onclick = () => K().zapiszObraz(cv, `podsumowanie-${rok}.png`);
    el.querySelectorAll('[data-g]').forEach(r => r.onclick = () => r.dataset.g && App.go('planszowki', { gra: r.dataset.g }));
  }

  App.registerModule({ id: 'podsumowanie', title: 'Podsumowanie roku', icon: '📅', order: 15, render });
})();
