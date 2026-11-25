/* Ekran startowy „Kolekcja Marcina”: pokazuje się przy włączeniu i znika po 2 sekundach (dotknięcie zamyka od razu).
 * Kolaż składa się wyłącznie z prawdziwych okładek gier i komiksów z kolekcji (bez zastępczych kafelków).
 * Znaczniki są w index.html (#splash), żeby ekran był widoczny od razu. */
(function () {
  const el = document.getElementById('splash');
  if (!el) return;
  // ile ms od włączenia ma być widoczny: z Ustawień › Wygląd (localStorage „wyglad”.splash, sekundy), domyślnie 2 s
  let sek = 2;
  try { const v = JSON.parse(localStorage.getItem('wyglad') || '{}').splash; if (v != null && !isNaN(Number(v))) sek = Number(v); } catch (e) {}
  if (sek <= 0 && !/zostan/.test(location.search)) { el.remove(); return; }   // wyłączony
  const T0 = sek * 1000;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  // tylko prawdziwe okładki; obrazek, który się nie wczyta (np. bez internetu), znika z kolażu
  const tile = src => `<div class="sp-t"><img alt="" src="${esc(src)}" onload="this.parentNode.classList.add('ok')" onerror="this.parentNode.remove()"></div>`;

  function draw(srcs, nG, nK) {
    const cnt = el.querySelector('.sp-cnt');
    const parts = [nG ? `${nG} gier` : '', nK ? `${nK} komiksów` : ''].filter(Boolean);
    if (cnt && parts.length) cnt.textContent = parts.join(' · ');
    const wall = el.querySelector('.sp-wall');
    if (!wall || !srcs.length) return;
    // ile kolumn i kafelków potrzeba, żeby przekrzywiona ściana zakryła cały ekran
    const W = window.innerWidth || 400, H = window.innerHeight || 800;
    const colW = W > 760 ? 124 : 92, cols = Math.ceil(W * 1.8 / (colW + 10)), per = Math.ceil(H * 1.7 / (colW * 4 / 3 + 10));
    const mix = shuffle(srcs.slice());
    wall.style.setProperty('--colw', colW + 'px');
    wall.innerHTML = Array.from({ length: cols }, (_, c) => { const t = Array.from({ length: per }, (_, r) => tile(mix[(c * per + r) % mix.length])).join(''); return `<div class="sp-col">${t}${t}</div>`; }).join('');
  }
  async function fill() {
    // okładki gier i komiksów z bazy (także dodane własnoręcznie), a gdy baza pusta – z danych startowych BGG
    let K = [], G = [];
    try {
      if (window.DB && DB.all) {
        [K, G] = await Promise.all([DB.all('comics'), DB.all('games')]);
        K = (K || []).filter(c => !c.deleted && c.status === 'owned');
        G = (G || []).filter(g => !g.deleted && !g.isExpansion && (g.status === 'owned' || g.status === 'forSale'));
      }
    } catch (e) { K = []; G = []; }
    const B = window.BGG_IMPORT;
    const nK = K.length || (window.KOMIKSY_DANE || []).filter(c => c.status === 'owned').length;
    // gry: miniatura (okładki z API BGG w „image” to oryginały, często po kilka MB)
    let srcs = [...G.map(g => g.thumb || g.image), ...K.map(c => c.image || c.thumb)].filter(Boolean);
    if (!G.length && B && B.rows) srcs = srcs.concat(B.rows.filter(r => !r[1] && r[8]).map(r => B.cover(r[8])));
    draw([...new Set(srcs)], G.length || (B && B.rows ? B.rows.filter(r => !r[1]).length : 0), nK);
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
