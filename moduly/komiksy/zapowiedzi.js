/* Zapowiedzi Egmontu (część modułu komiksów).
 * Źródło: egmont.pl/zapowiedzi.
 * - Android (APK): aplikacja sama czyta stronę Egmontu przez natywne zapytanie (CapacitorHttp – bez blokady CORS),
 *   najwyżej raz w tygodniu, i zapisuje wynik w ustawieniach (synchronizują się na komputer).
 * - Przeglądarka/Windows: strona Egmontu jest niedostępna z przeglądarki (CORS), więc bierzemy nowszą z dwóch wersji:
 *   zsynchronizowaną z telefonu albo plik zapowiedzi.json z repozytorium aplikacji.
 * Pozycje z serii, które użytkownik zbiera, są proponowane do listy zakupów.
 */
(function () {
  const PAGES = 'https://silent3182.github.io/Silent_comicsandboardgames/';
  const URL_ZAP = /github\.io$/.test(location.hostname) ? 'zapowiedzi.json' : PAGES + 'zapowiedzi.json';
  const EGMONT = 'https://egmont.pl';
  const DZIEN = 24 * 3600 * 1000, TYDZIEN = 7 * DZIEN;
  // serie-kolekcje z kiosku/prenumeraty – nie wydaje ich Egmont, nie szukamy po nich
  const NIE_EGMONT = /^(WKKM|Superbohaterowie Marvela|Marvel Origins|Bohaterowie i Złoczyńcy DC|Wielkie Pojedynki|Marvel Must-Have.*|Marvel Limited)$/i;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nz = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l').replace(/[^a-z0-9]+/g, ' ').trim();
  // „Amazing Spider-Man. Pierwsze łowy. Tom 8” -> „amazing spider man”
  const glowa = t => nz(String(t || '').split(/\.\s|:\s|\s[–-]\s/)[0].replace(/\s*(tom|część|cz\.)\s*\d+.*$/i, ''));

  /* ---- czytanie egmont.pl (tylko w APK) ---- */
  const http = () => { const C = window.Capacitor; return C && C.isNativePlatform && C.isNativePlatform() && C.Plugins && C.Plugins.CapacitorHttp; };
  async function get(url) { const r = await http().get({ url, responseType: 'text' }); if (r.status >= 400) throw new Error(r.status); return String(r.data || ''); }
  const un = s => { const t = document.createElement('textarea'); t.innerHTML = s; return t.value; };
  const txt = s => un(String(s || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
  const MIES = { sty: 1, lut: 2, mar: 3, kwi: 4, maj: 5, cze: 6, lip: 7, sie: 8, wrz: 9, 'paź': 10, paz: 10, lis: 11, gru: 12 };
  const dataPl = s => { const m = String(s || '').match(/(\d{1,2})\s+([a-ząćęłńóśźż]{3})\S*\s+(\d{4})/i); const mm = m && MIES[m[2].toLowerCase()]; return mm ? `${m[3]}-${String(mm).padStart(2, '0')}-${m[1].padStart(2, '0')}` : ''; };
  const detal = (h, n) => { const m = h.match(new RegExp(n.replace('/', '\\/') + '\\s*</dt>\\s*<dd[^>]*>([\\s\\S]*?)</dd>')); return m ? txt(m[1]) : ''; };
  async function zEgmontu(stare) {
    const znane = new Map((stare || []).map(p => [p.id, p])), poz = [], seen = new Set(), dzis = App.ui.today();
    for (let p = 1; p < 15; p++) {
      const h = await get(EGMONT + '/zapowiedzi' + (p > 1 ? '?p=' + p : '')); let n = 0;
      for (const m of h.matchAll(/class="product-item-link"\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
        const s = m[1].match(/-(\d+)\.html/); if (!s || seen.has(s[1])) continue;
        seen.add(s[1]); n++; poz.push({ id: s[1], title: txt(m[2]), url: m[1] });
      }
      if (!n) break;
    }
    for (const x of poz) {
      const z = znane.get(x.id);
      if (z && z.release) { Object.assign(x, { series: z.series, release: z.release, price: z.price, img: z.img, dodano: z.dodano }); continue; }
      try {
        const h = await get(x.url); const img = h.match(/property="og:image"\s+content="([^"]+)"/); const c = h.match(/product:price:amount"\s+content="([\d.]+)"/);
        Object.assign(x, { series: detal(h, 'Seria/Cykl'), release: dataPl(detal(h, 'Data wydania')), price: c ? +c[1] : null, img: img ? img[1] : '', dodano: dzis });
      } catch (e) { x.dodano = dzis; }
      await new Promise(r => setTimeout(r, 400));
    }
    return poz.sort((a, b) => ((a.release || '9999') + a.title).localeCompare((b.release || '9999') + b.title));
  }

  let pamiec = null;
  async function wczytaj(wymus) {
    let st = null;
    try { st = await DB.local('zapowiedzi'); } catch (e) { }
    const swieze = st && st.sprawdzono && Date.now() - new Date(st.sprawdzono).getTime() < DZIEN;
    if (!wymus && swieze) return (pamiec = st);
    const kandydaci = [];
    const syn = await DB.setting('zapowiedziDane');           // z telefonu (synchronizowane)
    if (syn && syn.pozycje) kandydaci.push(syn);
    if (http() && (wymus || !syn || Date.now() - new Date(syn.pobrano || 0).getTime() > TYDZIEN)) {
      try {
        const pozycje = await zEgmontu(syn && syn.pozycje);
        if (pozycje.length) { const d = { data: App.ui.today(), pobrano: new Date().toISOString(), pozycje }; await DB.setting('zapowiedziDane', d); kandydaci.push(d); }
      } catch (e) { if (wymus) App.ui.toast('Nie udało się odczytać egmont.pl'); }
    }
    try {
      const r = await fetch(URL_ZAP + '?t=' + Date.now(), { cache: 'no-store' });
      if (r.ok) kandydaci.push(await r.json());
    } catch (e) { }
    if (kandydaci.length) {
      const best = kandydaci.sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')))[0];
      st = { sprawdzono: new Date().toISOString(), data: best.data, pozycje: best.pozycje || [] };
      try { await DB.local('zapowiedzi', st); } catch (e) { }
    } else if (wymus) App.ui.toast('Nie udało się pobrać zapowiedzi (brak internetu?)');
    return (pamiec = st || { pozycje: [] });
  }

  async function ustawienia() {
    return Object.assign({ slowa: '', ukryte: [], widziane: [] }, (await DB.setting('zapowiedzi')) || {});
  }
  async function zapiszUst(u) { await DB.setting('zapowiedzi', u); }

  // co zbieram: serie z kolekcji + „głowy” tytułów posiadanych tomów + własne słowa
  async function obserwowane(u) {
    const comics = await DB.all('comics');
    const serie = new Set(), glowy = new Set();
    comics.forEach(c => {
      if (c.series && !NIE_EGMONT.test(c.series)) serie.add(nz(c.series).replace(/\s\d.*$/, ''));
      if (c.status === 'owned' || c.status === 'missing') { const g = glowa(c.title); if (g.length >= 4) glowy.add(g); }
    });
    const slowa = String(u.slowa || '').split(',').map(nz).filter(s => s.length >= 3);
    return { serie, glowy, slowa };
  }
  function dlaczego(p, ob) {
    const s = nz(p.series), t = nz(p.title), g = glowa(p.title);
    for (const w of ob.slowa) if (t.includes(w) || s.includes(w)) return 'obserwujesz: ' + w;
    for (const x of ob.serie) if (x && s && (s === x || s.includes(x))) return 'seria ' + p.series;
    if (g.length >= 4 && ob.glowy.has(g)) return 'masz tomy „' + p.title.split(/\.\s/)[0] + '”';
    return '';
  }

  async function przygotuj(wymus) {
    const [st, u, lista] = await Promise.all([wczytaj(wymus), ustawienia(), DB.all('shoppingList')]);
    const ob = await obserwowane(u);
    const naLiscie = new Set(lista.flatMap(x => [x.id, x.url]).filter(Boolean));
    const dzis = App.ui.today();
    const poz = (st.pozycje || []).map(p => Object.assign({}, p, {
      powod: dlaczego(p, ob), naLiscie: naLiscie.has('egm-' + p.id) || naLiscie.has(p.url), ukryta: u.ukryte.includes(p.id), wyszla: p.release && p.release <= dzis
    }));
    return { st, u, poz };
  }

  async function doListy(p, ob) {
    await DB.put('shoppingList', {
      id: 'egm-' + p.id, title: p.title, itemType: 'comic', publisher: 'Egmont', releaseDate: p.release || '',
      price: p.price || '', url: p.url, image: p.img || '', bought: false, notes: 'Z zapowiedzi Egmontu' + (p.series ? ' · ' + p.series : '')
    });
  }

  let filtr = 'moje', otwarte = null;
  async function render(el) {
    const { st, u, poz } = await przygotuj(false);
    const moje = poz.filter(p => p.powod && !p.ukryta);
    const widoczne = filtr === 'moje' ? moje : filtr === 'ukryte' ? poz.filter(p => p.ukryta) : poz.filter(p => !p.ukryta);
    const nowe = moje.filter(p => !u.widziane.includes(p.id) && !p.naLiscie).length;
    const karta = p => `<div class="kx-row ${p.naLiscie ? 'read' : ''}">
      <img src="${esc(p.img)}" alt="" loading="lazy" style="width:52px;height:74px;object-fit:cover;border-radius:4px;flex:none;background:#e9edf2">
      <div class="kx-main"><div class="kx-tt"><a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.title)}</a></div>
        <div class="kx-muted">${p.series ? esc(p.series) + ' · ' : ''}${p.release ? 'premiera ' + App.ui.fmtDate(p.release) : ''}${p.price ? ' · ' + (+p.price).toFixed(2) + ' zł' : ''}
        ${p.wyszla ? ' <span class="kx-b own">już jest</span>' : ''}${!u.widziane.includes(p.id) && p.powod && !p.naLiscie ? ' <span class="kx-b must">nowe</span>' : ''}</div>
        ${p.powod ? `<div class="kx-muted">⭐ ${esc(p.powod)}</div>` : ''}</div>
      ${p.naLiscie ? '<span class="kx-b own">na liście</span>' : `<button class="ghost" data-zd="${esc(p.id)}" title="Dodaj do listy zakupów">➕</button>`}
      <button class="ghost" data-zu="${esc(p.id)}" title="${p.ukryta ? 'Przywróć' : 'Ukryj'}">${p.ukryta ? '↩' : '✕'}</button></div>`;
    if (otwarte === null) otwarte = nowe > 0;
    el.innerHTML = `<details ${otwarte ? 'open' : ''}><summary><b>🆕 Zapowiedzi Egmontu</b> ${nowe ? `<span class="kx-b must">${nowe} nowe z Twoich serii</span>` : ''}</summary>
      <p class="kx-muted">${st.data ? 'Stan z ' + App.ui.fmtDate(st.data) + (window.Capacitor ? ' (telefon sprawdza egmont.pl co tydzień)' : ' (aktualizuje telefon raz w tygodniu)') : 'Brak danych – połącz się z internetem'}.
        ⭐ = pasuje do serii, które zbierasz. ➕ dodaje do listy zakupów z datą premiery i ceną.</p>
      <div class="kx-chips">
        <button class="kx-chip ${filtr === 'moje' ? 'on' : ''}" data-zf="moje">Z moich serii (${moje.length})</button>
        <button class="kx-chip ${filtr === 'wszystkie' ? 'on' : ''}" data-zf="wszystkie">Wszystkie (${poz.filter(p => !p.ukryta).length})</button>
        <button class="kx-chip ${filtr === 'ukryte' ? 'on' : ''}" data-zf="ukryte">Ukryte (${poz.filter(p => p.ukryta).length})</button>
      </div>
      <div class="kx-btns">${moje.some(p => !p.naLiscie) ? `<button class="pri" id="zall">➕ Dodaj wszystkie z moich serii (${moje.filter(p => !p.naLiscie).length})</button>` : ''}
        <button id="zslowa">⭐ Obserwowane serie…</button><button id="zodsw">⟳ Sprawdź teraz</button>
        <a href="https://egmont.pl/zapowiedzi" target="_blank" rel="noopener">egmont.pl/zapowiedzi ↗</a></div>
      <div>${widoczne.map(karta).join('') || '<p class="kx-muted">Nic tu nie ma.</p>'}</div></details>`;
    el.querySelector('details').ontoggle = e => { otwarte = e.target.open; };
    const odswiez = () => render(el);
    el.querySelectorAll('[data-zf]').forEach(b => b.onclick = () => { filtr = b.dataset.zf; odswiez(); });
    el.querySelectorAll('[data-zd]').forEach(b => b.onclick = async () => { await doListy(poz.find(p => p.id === b.dataset.zd)); App.ui.toast('Dodano do listy zakupów'); App.refresh(); });
    el.querySelectorAll('[data-zu]').forEach(b => b.onclick = async () => {
      const id = b.dataset.zu; u.ukryte = u.ukryte.includes(id) ? u.ukryte.filter(x => x !== id) : u.ukryte.concat(id); await zapiszUst(u); odswiez();
    });
    const all = el.querySelector('#zall');
    if (all) all.onclick = async () => { for (const p of moje.filter(p => !p.naLiscie)) await doListy(p); App.ui.toast('Dodano do listy zakupów'); App.refresh(); };
    el.querySelector('#zodsw').onclick = async () => { await wczytaj(true); odswiez(); };
    el.querySelector('#zslowa').onclick = async () => {
      const ob = await obserwowane(u);
      const out = await App.ui.form('Obserwowane serie', [
        { name: 'slowa', label: 'Dodatkowe słowa (po przecinku), np. Star Wars, Asteriks, Batman', value: u.slowa },
        { name: 'info', label: 'Automatycznie z Twojej kolekcji', type: 'textarea', rows: 3, value: [...ob.serie].join(', ') }
      ]);
      if (out) { u.slowa = out.slowa || ''; await zapiszUst(u); odswiez(); }
    };
    // to, co użytkownik zobaczył, nie jest już „nowe” przy następnym starcie
    const ids = moje.map(p => p.id).filter(id => !u.widziane.includes(id));
    if (ids.length) { u.widziane = u.widziane.concat(ids).slice(-1000); zapiszUst(u); }
  }

  // przy starcie aplikacji: raz na dobę sprawdź i powiedz, jeśli są nowości z moich serii
  async function przyStarcie() {
    try {
      const { u, poz } = await przygotuj(false);
      const nowe = poz.filter(p => p.powod && !p.ukryta && !p.naLiscie && !u.widziane.includes(p.id));
      if (nowe.length) App.ui.toast(`🆕 Egmont: ${nowe.length} ${nowe.length === 1 ? 'nowa zapowiedź' : 'nowe zapowiedzi'} z Twoich serii – zobacz w zakładce Zakupy`, 6000);
    } catch (e) { }
  }
  setTimeout(przyStarcie, 4000);

  window.KXZapowiedzi = { render, wczytaj };
})();
