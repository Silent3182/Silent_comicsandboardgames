/* Zakładka „Start”: ekran główny z kafelkami funkcji. Kafelki można ukrywać, dodawać i przestawiać
 * (przycisk „Edytuj kafelki”). Układ jest zapisany w tym urządzeniu (localStorage „startKafelki”).
 * Nowe moduły pojawiają się same jako kafelki na końcu. Ikony z core/ikony.js (styl A/B/C z Ustawień). */
(function () {
  const KEY = 'startKafelki';
  const OPIS = {
    planszowki: 'Kolekcja gier z BGG', rozgrywki: 'Partie i statystyki', wieczor: 'Co dziś zagramy?', licznik: 'Liczenie punktów',
    zegar: 'Czas na turę', przygrze: 'Koszulki, braki, import partii', gracze: 'Osoby i wyniki', wyzwania: 'Cele na rok', podsumowanie: 'Rok w liczbach',
    komiksy: 'Tomy i serie', czytanie: 'Master Reading Order', postep: 'Ile już przeczytane', sklep: 'Skaner i „czy to mam?”',
    zakupy: 'Lista zakupów', wishlista: 'Na co poluję', wypozyczenia: 'Komu pożyczone', polki: 'Gdzie co stoi',
    wartosc: 'Ile warta kolekcja', sprzedaz: 'Ogłoszenia', skroty: 'BGA, fora, linki', kalendarz: 'Imprezy i premiery',
    koszulki: 'Koszulki na karty', sleeve: 'Koszulki na karty', sleeves: 'Koszulki na karty', udostepnianie: 'Pokaż kolekcję innym', udostepnij: 'Pokaż kolekcję innym', asystent: 'Zapytaj głosem',
    rekomendacje: 'Podpowiedzi z Twoich ocen', mechaniki: 'Jakie gry masz i grasz', dodatki: 'Grane i brakujące', kampanie: 'Scenariusz, drużyna, naklejki',
    wymiana: 'Lista na forum', przypomnienia: 'Rocznice i zapomniane gry', pudelka: 'Czy zmieści się w Kallaxie?',
    powiadomienia: 'Przypomnienia', kopie: 'Kopie zapasowe', ustawienia: 'Synchronizacja i wygląd'
  };
  let edit = false;
  const esc = s => App.ui.esc(s);
  function cfg() { try { return Object.assign({ order: [], hidden: [] }, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { return { order: [], hidden: [] }; } }
  function save(c) { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {} }
  function lista() {
    const c = cfg(), mods = App.modules.filter(m => m.id !== 'start');
    const pos = id => { const i = c.order.indexOf(id); return i < 0 ? 1e6 : i; };
    const all = mods.slice().sort((a, b) => pos(a.id) - pos(b.id) || (a.order || 100) - (b.order || 100));
    return { c, shown: all.filter(m => !c.hidden.includes(m.id)), hidden: all.filter(m => c.hidden.includes(m.id)) };
  }
  // kafelki w działach (Gry planszowe, Komiksy, …) z App.grupy; w dziale kolejność użytkownika
  const gr = id => App.grupa ? App.grupa(id) : { id: 'all', title: '' };
  function dzialy(list) {
    const out = [];
    (App.grupy || []).concat([{ id: 'inne', title: 'Inne' }]).forEach(g => { const ms = list.filter(m => gr(m.id).id === g.id); if (ms.length) out.push([g, ms]); });
    return App.grupy ? out : [[{ title: '' }, list]];
  }
  const ico = m => window.ikona ? window.ikona(m.id, `<span class="st-emo">${m.icon || '•'}</span>`) : `<span class="st-emo">${m.icon || '•'}</span>`;
  function tile(m, i, n, ukryty) {
    const ctl = !edit ? '' : ukryty
      ? `<span class="st-ctl"><span class="st-add" title="Dodaj">＋</span></span>`
      : `<span class="st-ctl"><span class="st-del" title="Ukryj">✕</span></span>`;
    const mv = edit && !ukryty ? `<span class="st-mvs"><span class="st-mv" data-d="-1" title="Wcześniej" ${i === 0 ? 'data-off' : ''}>‹</span><span class="st-mv" data-d="1" title="Dalej" ${i === n - 1 ? 'data-off' : ''}>›</span></span>` : '';
    return `<div class="st-tile ${edit ? 'edit' : ''}" data-id="${esc(m.id)}" role="button" tabindex="0" style="--ik:${(window.IKONY_KOLOR || {})[m.id] || 'var(--accent)'}">
      ${ctl}<span class="st-ic">${ico(m)}</span><b>${esc(m.title)}</b><small data-info="${esc(m.id)}">${esc(OPIS[m.id] || '')}</small>${mv}</div>`;
  }
  async function render(el) {
    const { c, shown, hidden } = lista();
    el.innerHTML = `
      <div class="st-head"><div><small>Moje kolekcje</small><h1>Kolekcja Marcina</h1></div>
        <button id="stEdit" class="${edit ? 'primary' : ''}">${edit ? '✓ Gotowe' : 'Edytuj kafelki'}</button></div>
      ${edit ? '<p class="muted st-hint">Strzałki zmieniają kolejność w dziale, ✕ ukrywa kafelek. Ukryte kafelki są na dole, dotknij, aby dodać z powrotem.</p>' : ''}
      ${dzialy(shown).map(([g, ms]) => `<h3 class="st-sub">${esc(g.title)}</h3><div class="st-grid">${ms.map((m, i) => tile(m, i, ms.length)).join('')}</div>`).join('')}
      ${edit && hidden.length ? `<h3 class="st-sub">Ukryte kafelki</h3><div class="st-grid st-off">${hidden.map(m => tile(m, 0, 0, true)).join('')}</div>` : ''}
      ${edit ? '<p class="row" style="margin-top:14px"><button id="stReset" class="ghost">Przywróć domyślny układ</button></p>' : ''}
      ${!edit && hidden.length ? `<p class="muted st-hint">Ukryte: ${hidden.length}. Dodasz je przyciskiem „Edytuj kafelki”.</p>` : ''}`;
    el.querySelector('#stEdit').onclick = () => { edit = !edit; render(el); };
    const reset = el.querySelector('#stReset'); if (reset) reset.onclick = () => { save({ order: [], hidden: [] }); render(el); };
    el.querySelectorAll('.st-tile').forEach(t => {
      const id = t.dataset.id;
      t.onclick = e => {
        if (!edit) return App.go(id);
        const cc = cfg(); cc.order = lista().shown.map(m => m.id).concat(lista().hidden.map(m => m.id));
        if (e.target.closest('.st-del')) cc.hidden = cc.hidden.concat(id);
        else if (e.target.closest('.st-mv')) {
          const vis = cc.order.filter(x => !cc.hidden.includes(x)), i = vis.indexOf(id), d = Number(e.target.closest('.st-mv').dataset.d);
          let j = i + d; while (j >= 0 && j < vis.length && gr(vis[j]).id !== gr(id).id) j += d;   // sąsiad z tego samego działu
          if (j < 0 || j >= vis.length || e.target.closest('.st-mv').hasAttribute('data-off')) return;
          [vis[i], vis[j]] = [vis[j], vis[i]]; cc.order = vis.concat(cc.order.filter(x => cc.hidden.includes(x)));
        } else if (cc.hidden.includes(id)) cc.hidden = cc.hidden.filter(x => x !== id);
        else return;
        save(cc); render(el);
      };
      t.onkeydown = e => { if (e.key === 'Enter') t.click(); };
    });
    // drobna informacja na żywo: następny komiks do przeczytania
    if (!edit && App.has && App.has('komiksy.nastepny')) {
      try { const nx = await App.call('komiksy.nastepny'); const s = el.querySelector('[data-info="czytanie"]'); if (nx && s) s.textContent = 'Dalej: ' + nx.title; } catch (e) {}
    }
    // moduły z funkcją info() podają krótką informację na żywo pod nazwą kafelka
    if (!edit) for (const m of shown) if (typeof m.info === 'function') {
      try { const t = await m.info(); const s = el.querySelector(`[data-info="${m.id}"]`); if (t && s) s.textContent = t; } catch (e) {}
    }
  }
  App.registerModule({ id: 'start', title: 'Start', icon: '🏠', order: 1, render });
})();
