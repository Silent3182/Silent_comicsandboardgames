/* Rdzeń aplikacji: rejestr modułów (zakładek), nawigacja, drobne pomocniki UI.
 * Moduł rejestruje się tak:
 *   App.registerModule({ id:'planszowki', title:'Planszówki', icon:'🎲', order:10,
 *                        render(el, params, ctx) { ... } });
 * ctx = { db: DB, ui: App.ui, go: App.go }
 * Moduł może też wystawić akcje dla innych modułów:
 *   App.provide('sprzedaz.wystaw', fn)   /   App.call('sprzedaz.wystaw', {itemType:'game', itemId})
 */
(function () {
  const modules = [];
  const services = {};
  let current = null;

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- Komunikaty o błędach: zamiast systemowych (angielskich) tekstów – po polsku ---------- */
  const PL = /[ąćęłńóśźż]/i;
  const TLUMACZ = [
    [/AbortError|aborted|The user aborted|cancell?ed/i, null],
    [/Failed to fetch|NetworkError|Load failed|network ?error|ERR_INTERNET|ERR_NAME|ERR_CONNECTION|timed? ?out|TimeoutError/i, 'Brak połączenia z internetem albo serwer nie odpowiada. Spróbuj ponownie za chwilę.'],
    [/NotAllowedError|Permission denied|permission/i, 'Brak zgody na dostęp (aparat albo plik). Zezwól w ustawieniach telefonu lub przeglądarki.'],
    [/NotFoundError|Requested device not found|could not find/i, 'Nie znaleziono urządzenia ani pliku (np. aparatu).'],
    [/NotReadableError|Could not start video|in use/i, 'Aparat albo plik jest zajęty przez inną aplikację.'],
    [/QuotaExceeded|quota|storage.*full|disk.*full/i, 'Brak miejsca w pamięci urządzenia. Usuń stare kopie albo zdjęcia.'],
    [/SyntaxError|Unexpected token|Unexpected end|JSON|is not valid/i, 'Nieprawidłowy format danych (to nie jest plik z kopią aplikacji albo jest uszkodzony).'],
    [/SecurityError|insecure|not allowed by|blocked/i, 'Przeglądarka zablokowała tę operację.'],
    [/InvalidStateError|VersionError|database|IDB|transaction/i, 'Problem z pamięcią aplikacji. Zamknij i otwórz aplikację ponownie.'],
    [/Script error|ChunkLoad|Loading .*failed|load script|nie można wczytać/i, 'Nie udało się wczytać części aplikacji. Sprawdź internet i odśwież.'],
  ];
  function tlumacz(t) {
    if (PL.test(t)) return t; // komunikat już po polsku
    for (const [re, pl] of TLUMACZ) if (re.test(t)) return pl;
    // tekst wyglądający na systemowy (angielski) zamieniamy na ogólny komunikat
    if (/\b(the|failed|is not|of undefined|error|cannot|can't|undefined|null|unexpected|invalid|denied|property|reading|function|object)\b/i.test(t)) return 'Coś poszło nie tak. Spróbuj ponownie.';
    return t;
  }
  function komunikat(e) {
    if (e == null || e === '') return null;
    let t = typeof e === 'string' ? e : ((e.name && e.name !== 'Error' ? e.name + ': ' : '') + (e.message || String(e)));
    if (typeof e !== 'string' && e.name === 'AbortError') return null;
    // „Polski początek: systemowy koniec” – tłumaczymy tylko koniec
    const i = t.indexOf(': ');
    if (i > 0 && PL.test(t.slice(0, i)) && !PL.test(t.slice(i + 2))) {
      const tail = tlumacz(t.slice(i + 2));
      return tail ? t.slice(0, i) + ': ' + tail : t.slice(0, i);
    }
    return tlumacz(t);
  }

  const ui = {
    esc,
    h(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; },
    toast(msg, ms = 2500) {
      msg = komunikat(msg);
      if (!msg) return;
      const el = document.getElementById('toast');
      el.textContent = msg; el.classList.add('show');
      clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('show'), ms);
    },
    /* Błąd (obiekt Error albo tekst) -> czytelny komunikat po polsku. null = nic nie pokazywać (np. anulowany wybór pliku). */
    komunikat: (e) => komunikat(e),
    /* Pytanie Tak/Nie w oknie aplikacji (zamiast systemowego okienka przeglądarki). */
    confirm(msg, opt = {}) {
      return new Promise(resolve => {
        const dlg = document.createElement('dialog');
        dlg.className = 'dlg dlg-pyt';
        const usun = /^\s*(usun|usuń|skasow|wyczyś|rozłącz|przywróć)/i.test(msg);
        dlg.innerHTML = `<form method="dialog"><p class="dlg-msg">${esc(msg)}</p><div class="dlg-btns"><button value="cancel" class="ghost">${esc(opt.cancel || 'Anuluj')}</button><button value="ok" class="${usun ? 'danger' : 'primary'}">${esc(opt.ok || (usun ? 'Tak, usuń' : 'Tak'))}</button></div></form>`;
        if (usun && /rozłącz/i.test(msg)) dlg.querySelector('[value=ok]').textContent = opt.ok || 'Rozłącz';
        if (usun && /przywróć/i.test(msg)) dlg.querySelector('[value=ok]').textContent = opt.ok || 'Przywróć';
        document.body.appendChild(dlg);
        dlg.addEventListener('close', () => { const r = dlg.returnValue === 'ok'; dlg.remove(); resolve(r); });
        dlg.showModal();
        dlg.querySelector('[value=ok]').focus();
      });
    },
    /* Okno dialogowe z formularzem. fields: [{name,label,type,value,options,step,placeholder}] -> obiekt lub null */
    form(title, fields, opt = {}) {
      return new Promise(resolve => {
        const dlg = document.createElement('dialog');
        dlg.className = 'dlg';
        dlg.innerHTML = `<form method="dialog"><h3>${esc(title)}</h3>${fields.map(f => {
          const v = f.value == null ? '' : f.value;
          let input;
          if (f.type === 'select') input = `<select name="${f.name}">${f.options.map(o => { const [val, lab] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(val)}" ${String(val) === String(v) ? 'selected' : ''}>${esc(lab)}</option>`; }).join('')}</select>`;
          else if (f.type === 'textarea') input = `<textarea name="${f.name}" rows="${f.rows || 3}" placeholder="${esc(f.placeholder || '')}">${esc(v)}</textarea>`;
          else if (f.type === 'checkbox') input = `<input type="checkbox" name="${f.name}" ${v ? 'checked' : ''}>`;
          else if (f.type === 'html') return `<div class="field-html">${f.html}</div>`;
          else input = `<input type="${f.type || 'text'}" name="${f.name}" value="${esc(v)}" ${f.step ? `step="${f.step}"` : ''} placeholder="${esc(f.placeholder || '')}" ${f.list ? `list="${f.list}"` : ''}>`;
          return `<label class="${f.type === 'checkbox' ? 'chk' : ''}"><span>${esc(f.label)}</span>${input}</label>`;
        }).join('')}<div class="dlg-btns"><button value="cancel" class="ghost">Anuluj</button><button value="ok" class="primary">${esc(opt.ok || 'Zapisz')}</button></div></form>`;
        document.body.appendChild(dlg);
        if (opt.onMount) opt.onMount(dlg);
        dlg.addEventListener('close', () => {
          let out = null;
          if (dlg.returnValue === 'ok') {
            out = {};
            fields.forEach(f => {
              if (!f.name) return;
              const el = dlg.querySelector(`[name="${f.name}"]`);
              if (!el) return;
              if (f.type === 'checkbox') out[f.name] = el.checked;
              else if (f.type === 'number') out[f.name] = el.value === '' ? null : Number(el.value);
              else out[f.name] = el.value.trim();
            });
          }
          dlg.remove(); resolve(out);
        });
        dlg.showModal();
      });
    },
    fmtDate(iso) { if (!iso) return ''; const d = new Date(iso); return d.toLocaleDateString('pl-PL'); },
    today() { const d = new Date(); return d.toISOString().slice(0, 10); }
  };

  /* Nawigacja: na komputerze boczny pasek, na telefonie dolny pasek z 4 głównymi zakładkami
   * (NAV_MAIN) i przyciskiem „Więcej” z resztą. Krótkie podpisy na telefon: NAV_SHORT. */
  const NAV_MAIN = ['start', 'planszowki', 'komiksy', 'czytanie'];
  const NAV_SHORT = { czytanie: 'Czytanie', planszowki: 'Gry', ustawienia: 'Ustawienia', start: 'Start' };
  // Działy menu: porządkują ~40 funkcji w bocznym menu, w „Więcej” i na Starcie. Moduł spoza listy trafia do „Inne”.
  const GRUPY = [
    { id: 'gry', title: 'Gry planszowe', ids: ['planszowki', 'dodatki', 'rozgrywki', 'wieczor', 'licznik', 'zegar', 'przygrze', 'kampanie', 'przypomnienia', 'gracze', 'wyzwania', 'mechaniki', 'kalendarz'] },
    { id: 'komiksy', title: 'Komiksy', ids: ['komiksy', 'czytanie', 'postep'] },
    { id: 'zakupy', title: 'Zakupy i sprzedaż', ids: ['sklep', 'zakupy', 'wishlista', 'rekomendacje', 'historia-cen', 'sprzedaz', 'wymiana', 'wypozyczenia'] },
    { id: 'kolekcja', title: 'Kolekcja', ids: ['polki', 'pudelka', 'wartosc', 'podsumowanie', 'udostepnij', 'udostepnianie'] },
    { id: 'aplikacja', title: 'Aplikacja', ids: ['asystent', 'skroty', 'ustawienia', 'powiadomienia', 'kopie'] }
  ];
  const grupa = id => (GRUPY.find(g => g.ids.includes(id)) || { id: 'inne', title: 'Inne' });
  // moduły ułożone działami (kolejność działów jak w GRUPY, w dziale według order); Start zawsze pierwszy
  function wDzialach(list) {
    const idx = m => m.id === 'start' ? -1 : (() => { const i = GRUPY.findIndex(g => g.ids.includes(m.id)); return i < 0 ? GRUPY.length : i; })();
    return list.slice().sort((a, b) => idx(a) - idx(b) || (a.order || 100) - (b.order || 100));
  }
  function renderNav() {
    const nav = document.getElementById('nav');
    const isMain = m => NAV_MAIN.includes(m.id);
    const btn = (m) => `<button data-id="${m.id}" class="${current && current.id === m.id ? 'active' : ''} ${isMain(m) ? 'pri' : 'sec'}"><span class="ico">${window.ikona ? window.ikona(m.id, m.icon) : (m.icon || '•')}</span><span class="lab">${esc(m.title)}</span><span class="lab-s">${esc(NAV_SHORT[m.id] || m.title)}</span></button>`;
    // nagłówek działu przed pierwszym modułem z nowego działu (pri na telefonie i tak jest w dolnym pasku)
    const zNaglowkami = (list, cls) => { let last = null; return list.map(m => { const g = m.id === 'start' ? null : grupa(m.id); const h = g && g.id !== last ? `<div class="${cls}">${esc(g.title)}</div>` : ''; if (g) last = g.id; return h + btn(m); }).join(''); };
    const all = wDzialach(modules), rest = all.filter(m => !isMain(m));
    nav.innerHTML = `<div class="brand"><img src="icons/icon-192.png" alt="">Moje kolekcje</div>`
      + zNaglowkami(all, 'nav-h')
      + (rest.length ? `<button class="more ${current && !isMain(current) ? 'active' : ''}" aria-label="Więcej"><span class="ico">${window.ikona ? window.ikona('wiecej', '☰') : '☰'}</span><span class="lab-s">Więcej</span></button><div class="more-sheet">${zNaglowkami(rest, 'ms-h')}</div>` : '');
    nav.classList.remove('open');
    nav.querySelectorAll('button[data-id]').forEach(b => b.onclick = () => { nav.classList.remove('open'); App.go(b.dataset.id); });
    const more = nav.querySelector('.more');
    if (more) more.onclick = e => { e.stopPropagation(); nav.classList.toggle('open'); };
  }
  document.addEventListener('click', e => { const nav = document.getElementById('nav'); if (nav && nav.classList.contains('open') && !nav.contains(e.target)) nav.classList.remove('open'); });

  function parseHash() {
    const [id, q] = location.hash.replace(/^#\/?/, '').split('?');
    const params = Object.fromEntries(new URLSearchParams(q || ''));
    return { id, params };
  }

  /* Historia ekranów i pozycja przewijania (prośba Anety 2026-11-25):
   *  - każdy ekran (adres #/…) pamięta, gdzie był przewinięty; po powrocie (Wstecz) albo odświeżeniu wraca w to samo miejsce,
   *    a nowy ekran zaczyna od góry. Długie listy (App.ui.lista) dorysowują się po drodze.
   *  - stos = ekrany otwarte w tej sesji; Wstecz na telefonie cofa po nim (zob. App.start). */
  const pozycje = new Map(), stos = [];
  let biezacy = null;
  const scrollY = () => window.scrollY || document.documentElement.scrollTop || 0;
  window.addEventListener('scroll', () => { if (biezacy) pozycje.set(biezacy, scrollY()); }, { passive: true });
  async function przewin(h, y) {
    if (!y) { window.scrollTo(0, 0); return; }
    const t0 = Date.now();
    while (Date.now() - t0 < 2500) {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (max >= y - 2) break;
      window.scrollTo(0, max);                       // na dół: lista dorysuje kolejną porcję
      await new Promise(r => setTimeout(r, 80));
      if (biezacy !== h) return;                     // w międzyczasie inny ekran
    }
    window.scrollTo(0, y);
  }

  async function route() {
    const { id, params } = parseHash();
    const m = modules.find(x => x.id === id) || modules[0];
    if (!m) return;
    const h = location.hash || '#/';
    let wroc = 0;
    if (h === biezacy) wroc = pozycje.get(h) || 0;                                    // odświeżenie tego samego ekranu
    else if (stos.length > 1 && stos[stos.length - 2] === h) { stos.pop(); wroc = pozycje.get(h) || 0; }   // Wstecz
    else { stos.push(h); if (stos.length > 60) stos.shift(); pozycje.delete(h); }      // nowy ekran – od góry
    biezacy = null;                                  // czyszczenie ekranu nie nadpisuje zapamiętanej pozycji
    current = m;
    renderNav();
    const main = document.getElementById('main');
    main.innerHTML = '';
    main.scrollTop = 0;
    try { await m.render(main, params, { db: DB, ui, go: App.go }); }
    catch (e) { console.error(e); main.innerHTML = `<div class="err"><p><b>Nie udało się otworzyć zakładki „${esc(m.title)}”.</b></p><p>${esc(komunikat(e) || '')}</p><button class="primary" onclick="App.refresh()">Spróbuj ponownie</button></div>`; }
    if (location.hash !== h && (location.hash || '#/') !== h) return;
    biezacy = h;
    await przewin(h, wroc);
    pozycje.set(h, scrollY());
  }

  /* Przycisk Wstecz na Androidzie (APK, wtyczka @capacitor/app): zamyka okno/menu, cofa do poprzedniego ekranu,
   * z pierwszego ekranu przechodzi na Start, a na Starcie wychodzi z aplikacji dopiero po drugim naciśnięciu. */
  function wstecz() {
    const P = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
    if (!P || !P.addListener) return;
    let ostatnie = 0;
    P.addListener('backButton', () => {
      const dlg = [...document.querySelectorAll('dialog[open]')].pop();
      if (dlg) { dlg.close('cancel'); return; }
      const nav = document.getElementById('nav');
      if (nav && nav.classList.contains('open')) { nav.classList.remove('open'); return; }
      if (stos.length > 1) { history.back(); return; }
      if (current && current.id !== 'start' && modules.some(x => x.id === 'start')) { stos.length = 0; App.go('start'); return; }
      if (Date.now() - ostatnie < 2200) { P.exitApp(); return; }
      ostatnie = Date.now();
      ui.toast('Naciśnij Wstecz jeszcze raz, żeby wyjść z aplikacji', 2200);
    });
  }

  const App = {
    ui,
    modules,
    grupy: GRUPY,
    grupa,
    wDzialach,
    registerModule(m) { modules.push(m); modules.sort((a, b) => (a.order || 100) - (b.order || 100)); if (App._started) renderNav(); },
    go(id, params) {
      const q = params ? '?' + new URLSearchParams(params).toString() : '';
      const h = '#/' + id + q;
      if (location.hash === h) route(); else location.hash = h;
    },
    refresh() { route(); },
    wstecz: { stos, pozycje },
    provide(name, fn) { services[name] = fn; },
    has(name) { return !!services[name]; },
    call(name, ...args) { if (!services[name]) { ui.toast('Ta funkcja jeszcze nie jest dostępna'); return; } return services[name](...args); },
    start() {
      App._started = true;
      window.addEventListener('hashchange', route);
      if ('scrollRestoration' in history) history.scrollRestoration = 'manual';   // przewijanie przywraca route()
      route();
      wstecz();
      if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform())) navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  };
  window.App = App;

  /* ---------- Błędy nieobsłużone w modułach: zamiast milczenia/okienek systemowych – komunikat aplikacji ---------- */
  let ostatni = '', ostatniCzas = 0;
  function pokazBlad(e) {
    const t = komunikat(e);
    if (!t) return;
    const now = Date.now();
    if (t === ostatni && now - ostatniCzas < 4000) return; // bez powtarzania tego samego
    ostatni = t; ostatniCzas = now;
    (window.__bledyAplikacji = window.__bledyAplikacji || []).push(t);
    ui.toast(t, 4500);
  }
  window.addEventListener('error', ev => {
    if (!ev.error && !ev.message) return;                       // np. brak obrazka – nie przeszkadzamy
    if (/ResizeObserver loop/.test(ev.message || '')) return;   // nieszkodliwe ostrzeżenie przeglądarki
    pokazBlad(ev.error || ev.message);
  });
  window.addEventListener('unhandledrejection', ev => { pokazBlad(ev.reason); });
  // systemowe okienko „alert” zastępujemy komunikatem aplikacji
  window.alert = msg => ui.toast(String(msg), 4500);
  // informacja o sieci
  window.addEventListener('offline', () => ui.toast('Brak internetu – aplikacja działa dalej, zsynchronizuje się po powrocie sieci.', 4000));
  window.addEventListener('online', () => ui.toast('Internet wrócił.', 2000));
})();
