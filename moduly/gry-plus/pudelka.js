/* „Pudełka i Kallax” – wymiary pudełek i czy gra zmieści się w przegródce Kallax (ok. 33 × 33 cm, głęb. 38 cm),
 * zajętość przegródek z modułu Półki, ile miejsca potrzeba na całą kolekcję.
 * Wymiary: pole games.pudelko = { w, l, h } w cm (szerokość, długość, wysokość/grubość), zrodlo 'reczne'.
 * BGG blokuje pobieranie danych bez klucza, więc wymiary wpisuje się ręcznie (podpowiedź: strona „Versions” gry na BGG,
 * albo gotowe typowe rozmiary). Bez wymiarów liczymy typowe pudełko 30×30×7 cm i oznaczamy jako szacunek.
 * Usługi: App.call('pudelka.edytuj', gameId) -> true/false, App.call('pudelka.przegroda', element, gry)
 */
(function () {
  const G = window.GP, { esc, pl, num } = G;
  const TYPY = [
    ['', '— własne wymiary —'],
    ['29.5x29.5x7', 'Kwadratowe standardowe 29,5 × 29,5 × 7'],
    ['29.5x29.5x10', 'Kwadratowe wysokie 29,5 × 29,5 × 10'],
    ['30x30x12', 'Kwadratowe duże (np. kampanijne) 30 × 30 × 12'],
    ['31x31x15', 'Bardzo duże 31 × 31 × 15'],
    ['40x30x10', 'Prostokątne duże 40 × 30 × 10'],
    ['32x22x7', 'Prostokątne średnie 32 × 22 × 7'],
    ['25x25x7', 'Średnie kwadratowe 25 × 25 × 7'],
    ['20x20x5', 'Małe kwadratowe 20 × 20 × 5'],
    ['20x13x5', 'Małe prostokątne 20 × 13 × 5'],
    ['12x9x3', 'Karcianka (mini) 12 × 9 × 3']
  ];
  const st = { tylko: 'bez', q: '' };

  async function edytuj(id) {
    const g = await DB.get('games', id); if (!g) return false;
    const p = g.pudelko || {};
    const o = await App.ui.form('Pudełko: ' + g.title, [
      { name: 'typ', label: 'Typowy rozmiar (cm)', type: 'select', value: '', options: TYPY },
      { name: 'w', label: 'Szerokość (cm)', type: 'number', step: '0.1', value: p.w },
      { name: 'l', label: 'Długość (cm)', type: 'number', step: '0.1', value: p.l },
      { name: 'h', label: 'Wysokość / grubość (cm)', type: 'number', step: '0.1', value: p.h },
      { type: 'html', html: g.bggId ? `<p class="muted" style="font-size:13px;margin:0">Wymiary znajdziesz na BGG w zakładce „Versions” (wydanie polskie): <a href="https://boardgamegeek.com/boardgame/${g.bggId}/versions" target="_blank" rel="noopener">otwórz BGG ↗</a>. Cale × 2,54 = cm. Puste pola = usuń wymiary.</p>` : '<p class="muted" style="font-size:13px;margin:0">Zmierz pudełko miarką. Puste pola = usuń wymiary.</p>' }
    ]);
    if (!o) return false;
    let { w, l, h } = o;
    if (o.typ) [w, l, h] = o.typ.split('x').map(Number);
    const pud = w && l && h ? { w, l, h, zrodlo: o.typ ? 'typowe' : 'reczne' } : null;
    await DB.put('games', Object.assign({}, g, { pudelko: pud }));
    return true;
  }

  const wynikHtml = g => { const m = G.miesci(g); return m.pion ? '<span class="gp-ok">✓ na stojąco</span>' : m.poziom ? '<span class="gp-q">tylko na leżąco</span>' : '<span class="gp-no">✗ nie zmieści się</span>'; };
  function pasek(z) {
    const kl = z.procent >= 100 ? 'full' : z.procent >= 85 ? 'near' : '';
    return `<div class="gp-fill ${kl}"><i style="width:${Math.min(100, z.procent)}%"></i></div><div class="muted" style="font-size:12.5px">Zajęte ok. ${num(z.cm)} z ${G.KALLAX.w} cm (${z.procent}%)${z.procent > 100 ? ' – za ciasno!' : ` – zostaje ok. ${num(Math.max(0, G.KALLAX.w - z.cm))} cm`}${z.szac ? ` · ${z.szac} ${pl(z.szac, 'pudełko szacowane', 'pudełka szacowane', 'pudełek szacowanych')}` : ''}</div>`;
  }
  /* dla modułu Półki: zajętość otwartej przegródki */
  function przegroda(box, gry) {
    if (!box || !gry || !gry.length) return;
    G.css();
    const d = document.createElement('div'); d.style.margin = '8px 0 4px';
    d.innerHTML = pasek(G.zajetosc(gry.filter(g => G.miesci(g).pion)));
    box.appendChild(d);
  }

  async function render(el) {
    G.css();
    const d = await G.dane();
    const gry = G.posiadane(d.games).filter(g => !g.isExpansion || g.pudelko);
    const znane = gry.filter(g => !G.wymiary(g).szac);
    const nie = znane.filter(g => !G.miesci(g).pion);
    const suma = G.zajetosc(gry);
    const przeg = Math.ceil(suma.cm / G.KALLAX.w);
    const shelves = (await DB.all('shelves')).filter(s => s.kind === 'kallax');
    const wKomorce = new Map();
    gry.forEach(g => { const p = g.polka; if (p && p.s && p.r) { const k = p.s + '|' + p.r + '|' + p.c; if (!wKomorce.has(k)) wKomorce.set(k, []); wKomorce.get(k).push(g); } });
    let lista = st.tylko === 'bez' ? gry.filter(g => G.wymiary(g).szac) : st.tylko === 'nie' ? nie : gry;
    if (st.q) lista = lista.filter(g => window.Tytuly ? Tytuly.pasuje(g, st.q) : g.title.toLowerCase().includes(st.q.toLowerCase()));
    lista = lista.slice().sort((a, b) => a.title.localeCompare(b.title, 'pl'));
    el.innerHTML = `
      <h1>Pudełka i Kallax</h1>
      <div class="stats">
        <div class="stat"><div class="v">${znane.length}/${gry.length}</div><div class="l">pudełek ze znanymi wymiarami</div></div>
        <div class="stat"><div class="v">${num(suma.cm / 100)} m</div><div class="l">grzbietów razem${suma.szac ? ' (część szacowana)' : ''}</div></div>
        <div class="stat"><div class="v">${przeg}</div><div class="l">${pl(przeg, 'przegródka', 'przegródki', 'przegródek')} Kallax na wszystko</div></div>
        <div class="stat"><div class="v">${nie.length}</div><div class="l">nie stanie w Kallaxie</div></div>
      </div>
      <div class="card"><h3 style="margin:0 0 6px">Czy zmieści się? (np. gra w sklepie)</h3>
        <div class="row" style="gap:6px"><input id="kxW" type="number" step="0.1" placeholder="szer. cm" style="width:90px"><input id="kxL" type="number" step="0.1" placeholder="dł. cm" style="width:90px"><input id="kxH" type="number" step="0.1" placeholder="wys. cm" style="width:90px"><span id="kxR"></span></div>
        <p class="muted" style="font-size:12.5px;margin:6px 0 0">Wnętrze przegródki Kallax: ok. ${G.KALLAX.w} × ${G.KALLAX.h} cm, głębokość ok. ${G.KALLAX.d} cm.</p></div>
      ${shelves.length ? `<h2>Twoje Kallaxy</h2>${shelves.map(sh => `<div class="card" style="margin-bottom:10px"><h3 style="margin:0 0 6px">${esc(sh.name)}</h3>
        <div style="display:grid;grid-template-columns:repeat(${sh.cols || 1},minmax(0,1fr));gap:8px">${[...Array((sh.rows || 1) * (sh.cols || 1)).keys()].map(i => { const r = Math.floor(i / (sh.cols || 1)) + 1, c = i % (sh.cols || 1) + 1; const gg = (wKomorce.get(sh.id + '|' + r + '|' + c) || []); const z = G.zajetosc(gg); const kl = z.procent >= 100 ? 'full' : z.procent >= 85 ? 'near' : '';
          return `<div style="background:var(--surface2);border-radius:8px;padding:6px;font-size:12px;min-width:0"><b>${esc((sh.cells || {})[r + '-' + c] || r + '.' + c)}</b><div class="gp-fill ${kl}" style="margin:4px 0"><i style="width:${Math.min(100, z.procent)}%"></i></div>${gg.length} ${pl(gg.length, 'gra', 'gry', 'gier')} · ${z.procent}%</div>`; }).join('')}</div></div>`).join('')}
        <p class="muted" style="font-size:12.5px">Gry przypisujesz do przegródek w zakładce Półki. Zajętość liczy grubość pudełek stojących obok siebie.</p>` : `<p class="muted">Dodaj Kallaxy w zakładce <a href="#/polki">Półki</a>, a zobaczysz tu zapełnienie przegródek.</p>`}
      <h2>Wymiary pudełek</h2>
      <div class="toolbar"><div class="gp-tabs" style="margin:0">${[['bez', 'Bez wymiarów (' + (gry.length - znane.length) + ')'], ['nie', 'Nie stanie w Kallaxie (' + nie.length + ')'], ['all', 'Wszystkie']].map(([k, l]) => `<button class="gp-chip ${st.tylko === k ? 'on' : ''}" data-t="${k}">${l}</button>`).join('')}</div><input type="search" id="kxQ" placeholder="Szukaj…" value="${esc(st.q)}" style="flex:1;min-width:120px"></div>
      <div class="list">${lista.slice(0, 120).map(g => { const w = G.wymiary(g); return `<div class="li" data-g="${esc(g.id)}">${G.okladka(g)}<div class="main"><div class="t">${esc(g.title)}</div><div class="s">${w.szac ? '<span class="gp-q">wymiary nieznane</span>' : `${num(w.w)} × ${num(w.l)} × ${num(w.h)} cm · ${wynikHtml(g)}`}</div></div><button class="small">📏</button></div>`; }).join('') || '<p class="muted">Pusto.</p>'}</div>
      ${lista.length > 120 ? `<p class="muted">Pokazano 120 z ${lista.length} – zawęź wyszukiwaniem.</p>` : ''}`;
    const $ = s => el.querySelector(s);
    const sprawdz = () => {
      const w = +$('#kxW').value, l = +$('#kxL').value, h = +$('#kxH').value;
      $('#kxR').innerHTML = w && l && h ? wynikHtml({ pudelko: { w, l, h } }) + ` · zajmie ${num(Math.min(w, l, h))} cm` : '';
    };
    ['#kxW', '#kxL', '#kxH'].forEach(s => $(s).oninput = sprawdz);
    el.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { st.tylko = b.dataset.t; render(el); });
    $('#kxQ').onchange = e => { st.q = e.target.value; render(el); };
    el.querySelectorAll('.li[data-g]').forEach(li => li.onclick = async () => { if (await edytuj(li.dataset.g)) render(el); });
  }

  App.provide('pudelka.edytuj', edytuj);
  App.provide('pudelka.przegroda', przegroda);
  App.registerModule({ id: 'pudelka', title: 'Pudełka i Kallax', icon: '📦', order: 40.5, render });
})();
