/* Długie listy bez zacinania telefonu.
 *  App.ui.lista(box, items, html, opt) – rysuje pierwszą porcję elementów, a kolejne dokłada same, gdy
 *  dojedziesz do końca (doczytywanie). Zamiast „Pokaż więcej” i zamiast rysowania 1000 kafelków naraz.
 *    box   – element, do którego trafia lista (jego zawartość jest zastępowana)
 *    items – tablica
 *    html  – (item, i) => tekst HTML jednego elementu
 *    opt   – { porcja: 60, klasa: 'grid', przed: 'html nad listą', po: (wstawione elementy DOM) => {}, doIndeksu: n }
 *  Zwraca { pokaz(i) } – dorysowuje listę do elementu nr i (np. „skocz do następnego”).
 *  Kliknięcia najlepiej obsługiwać jednym nasłuchem na box (delegacja), bo elementy dochodzą później.
 */
(function () {
  const st = document.createElement('style');
  st.id = 'lista-css';
  st.textContent = `
.lista-dalej{height:1px}
.lista-ile{text-align:center;color:var(--muted,#888);font-size:13px;padding:10px 0 18px}
img[data-okl]{background:var(--surface2,#e9edf2)}`;
  document.head.appendChild(st);

  function lista(box, items, html, opt = {}) {
    const porcja = opt.porcja || 60;
    let n = 0;
    box.innerHTML = (opt.przed || '') + `<div class="${opt.klasa || ''}" data-lista></div><div class="lista-dalej"></div><div class="lista-ile"></div>`;
    const kont = box.querySelector('[data-lista]'), dalej = box.querySelector('.lista-dalej'), ile = box.querySelector('.lista-ile');
    let io = null;
    function dorysuj(doIle) {
      const k = Math.min(items.length, Math.max(n + porcja, doIle || 0));
      if (k <= n) return;
      const t = document.createElement('template');
      t.innerHTML = items.slice(n, k).map((x, j) => html(x, n + j)).join('');
      const nowe = [...t.content.children];
      kont.appendChild(t.content);
      n = k;
      ile.textContent = n < items.length ? `Pokazano ${n} z ${items.length} – przewiń, żeby zobaczyć więcej` : '';
      if (opt.po) opt.po(nowe);
      if (n >= items.length && io) { io.disconnect(); io = null; }
    }
    dorysuj(opt.doIndeksu != null ? opt.doIndeksu + 1 : 0);
    if (n < items.length) {
      if ('IntersectionObserver' in window) {
        io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) dorysuj(); }, { rootMargin: '800px 0px' });
        io.observe(dalej);
      } else { ile.innerHTML = '<button class="ghost">Pokaż więcej</button>'; ile.onclick = () => dorysuj(); }
      // gdy lista zniknie z ekranu (inna zakładka), obserwator przestaje działać
      const stop = new MutationObserver(() => { if (!box.isConnected || !box.contains(dalej)) { if (io) io.disconnect(); stop.disconnect(); } });
      stop.observe(document.getElementById('main') || document.body, { childList: true, subtree: false });
    }
    return { pokaz(i) { if (i >= n) dorysuj(i + 1); }, get ile() { return n; } };
  }

  App.ui.lista = lista;
})();
