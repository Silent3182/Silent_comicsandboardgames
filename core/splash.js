/* Ekran startowy „Kolekcja Marcina”: pokazuje się przy włączeniu i znika po 2 sekundach.
 * Kolaż składa się z okładek gier z kolekcji BGG (gdy są w pamięci) i „okładek” tomów komiksów
 * w kolorach serii. Znaczniki są w index.html (#splash), żeby ekran był widoczny od razu. */
(function () {
  const el = document.getElementById('splash');
  if (!el) return;
  const T0 = 2000;                       // ile ms od włączenia ma być widoczny
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  // kolory serii komiksów: Marvel – czerwienie, DC – granaty, Thorgal – bursztyn
  function seriesStyle(s) {
    s = String(s || '');
    if (/DC/.test(s)) return ['#0f3d8c', '#1f6fd1', 'DC'];
    if (/Thorgal/.test(s)) return ['#7a3e12', '#c9822b', 'THORGAL'];
    if (/WKKM/.test(s)) return ['#6d0f16', '#b3172a', 'WKKM'];
    if (/Origins/.test(s)) return ['#3b1d5c', '#8a2be2', 'ORIGINS'];
    if (/Now/.test(s)) return ['#8f0d1a', '#e0242f', 'MARVEL NOW'];
    if (/Fresh/.test(s)) return ['#0d5c56', '#14a89b', 'MARVEL FRESH'];
    if (/Classic/.test(s)) return ['#4a3510', '#a8742a', 'CLASSIC'];
    if (/Must/.test(s)) return ['#111', '#d4141f', 'MUST-HAVE'];
    if (/Superbohaterowie/.test(s)) return ['#122b4f', '#c8202f', 'SUPERBOHATEROWIE'];
    return ['#2b2f3a', '#5a6273', s.toUpperCase().slice(0, 14)];
  }
  function comicTile(c) {
    const [a, b, lab] = seriesStyle(c.series);
    return `<div class="sp-t sp-c" style="--a:${a};--b:${b}"><i>${esc(lab)}</i><b>${c.volume != null ? '#' + esc(c.volume) : ''}</b><span>${esc(c.title)}</span></div>`;
  }
  function gameTile(g, srcOf) {
    const src = srcOf(g);
    const h = [...String(g.title)].reduce((x, ch) => (x * 31 + ch.charCodeAt(0)) % 360, 7);
    return `<div class="sp-t sp-g" style="--h:${h}"><span>${esc(g.title)}</span>${src ? `<img alt="" src="${esc(src)}" onerror="this.remove()">` : ''}</div>`;
  }

  function draw(K, G, gameSrc) {
    const wall = el.querySelector('.sp-wall');
    if (!wall) return;
    const cnt = el.querySelector('.sp-cnt');
    if (cnt && (G.length || K.length)) cnt.textContent = `${G.length} gier · ${K.length} komiksów`;
    // przemieszane okładki: na zmianę gra i komiks, żeby kolaż był różnorodny
    // ile kolumn i kafelków potrzeba, żeby przekrzywiona ściana zakryła cały ekran
    const W = window.innerWidth || 400, H = window.innerHeight || 800;
    const colW = W > 760 ? 124 : 92, cols = Math.ceil(W * 1.8 / (colW + 10)), per = Math.ceil(H * 1.7 / (colW * 4 / 3 + 10));
    const ks = shuffle(K.slice()), gs = shuffle(G.slice()), mix = [];
    for (let i = 0; i < Math.max(ks.length, gs.length) && mix.length < cols * per; i++) { if (gs[i]) mix.push(gameTile(gs[i], gameSrc)); if (ks[i]) mix.push(comicTile(ks[i])); }
    if (!mix.length) return;
    wall.style.setProperty('--colw', colW + 'px');
    wall.innerHTML = Array.from({ length: cols }, (_, c) => { const t = Array.from({ length: per }, (_, r) => mix[(c * per + r) % mix.length]).join(''); return `<div class="sp-col">${t}${t}</div>`; }).join('');
  }
  async function fill() {
    // najpierw to, co jest w bazie (własne okładki, aktualne statusy), potem dane startowe
    let K = [], G = [];
    try {
      if (window.DB && DB.all) {
        [K, G] = await Promise.all([DB.all('comics'), DB.all('games')]);
        K = (K || []).filter(c => !c.deleted && c.status === 'owned');
        G = (G || []).filter(g => !g.deleted && !g.isExpansion && (g.status === 'owned' || g.status === 'forSale'));
      }
    } catch (e) { K = []; G = []; }
    const B = window.BGG_IMPORT;
    if (!K.length) K = (window.KOMIKSY_DANE || []).filter(c => c.status === 'owned');
    if (G.length) return draw(K, G, g => g.image || g.thumb);
    const G0 = ((B && B.rows) || []).filter(r => !r[1]).map(r => ({ title: r[2], cov: r[8] }));
    draw(K, G0, g => B && B.cover ? B.cover(g.cov) : null);
  }

  function hide() {
    el.classList.add('out');
    setTimeout(() => el.remove(), 600);
  }
  fill().catch(e => console.warn('splash', e));
  el.addEventListener('click', hide);            // dotknięcie zamyka od razu
  const since = (window.performance && performance.now()) || 0;
  if (!/zostan/.test(location.search)) setTimeout(hide, Math.max(300, T0 - since));   // ?zostan – podgląd bez znikania
})();
