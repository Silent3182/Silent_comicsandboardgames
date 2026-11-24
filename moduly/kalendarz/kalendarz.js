/* Moduł „Kalendarz imprez” (📅): konwenty i festiwale planszówkowe i komiksowe w Polsce + własne wydarzenia.
 *
 * Skąd są wydarzenia:
 *  - konwenty-poludniowe.pl – największy polski kalendarz konwentów (planszówki, komiks, fantastyka, mieszane…).
 *    Nie ma RSS ani iCal, ale lista na stronie pobiera się z publicznego zapytania (getArticles) – czytamy właśnie je.
 *    · Android (APK): aplikacja czyta je sama (CapacitorHttp – bez blokady CORS), najwyżej co 3 dni,
 *      i zapisuje wynik w ustawieniach (synchronizują się na komputer).
 *    · Przeglądarka/Windows: strona nie pozwala czytać się z innej domeny (CORS), więc bierzemy nowszą z dwóch wersji:
 *      zsynchronizowaną z telefonu albo plik wydarzenia.json z repozytorium (odświeża go co tydzień GitHub Actions).
 *  - Własne kalendarze iCal (adres .ics, np. publiczny Kalendarz Google) – w Ustawieniach kalendarza.
 *  - Własne wydarzenia dodawane ręcznie.
 *  - „Przewidywane”: cykliczne imprezy z tego roku, których następnej edycji jeszcze nie ogłoszono (termin sprzed roku).
 *
 * Kolekcja events (synchronizowana):
 *   własne:  { source:'own', title, start, end ('RRRR-MM-DD'), city, place, kind ('plansz'|'komiks'|'mieszane'|'inne'), url, notes, status }
 *   oznaczenia wydarzeń z kalendarza: { id:'kp-2330' | 'ics-…', source:'mark', status ('tak'|'moze'|''), notes, hidden }
 */
(function () {
  const PAGES = 'https://silent3182.github.io/Silent_comicsandboardgames/';
  const URL_JSON = /github\.io$/.test(location.hostname) ? 'wydarzenia.json' : PAGES + 'wydarzenia.json';
  const KP = 'https://konwenty-poludniowe.pl';
  const KP_API = KP + '/index.php?option=com_ajax&plugin=konwenty&group=ajax&format=raw&task=getArticles';
  const DZIEN = 864e5;
  const esc = s => App.ui.esc(s);
  const today = () => App.ui.today();
  const MIES = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];
  const MIES_D = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];
  const MIES_K = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];

  /* Rodzaje (filtry). kat = kategoria z konwenty-poludniowe.pl */
  const RODZAJE = [
    { id: 'plansz', nazwa: 'Planszówki', ik: '🎲', kat: ['Gry planszowe'] },
    { id: 'komiks', nazwa: 'Komiks', ik: '💥', kat: ['Komiks'] },
    { id: 'mieszane', nazwa: 'Mieszane', ik: '🎪', kat: ['Mieszane'] },
    { id: 'fantastyka', nazwa: 'Fantastyka', ik: '🐉', kat: ['Fantastyka'] },
    { id: 'gry', nazwa: 'Gry / e-sport', ik: '🎮', kat: ['Gry/E-Sport'] },
    { id: 'inne', nazwa: 'Inne', ik: '✨', kat: [] }
  ];
  const rodzajKat = kat => { const k = String(kat || '').trim(); const r = RODZAJE.find(r => r.kat.includes(k)); return r ? r.id : 'inne'; };
  const rodzaj = id => RODZAJE.find(r => r.id === id) || RODZAJE[RODZAJE.length - 1];

  /* ---------- pomocniki dat ---------- */
  const d2iso = s => { const m = String(s || '').match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/); return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : ''; };
  const plusDni = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  const roznica = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / DZIEN);
  function zakres(a, b) {
    const [ra, ma, da] = a.split('-').map(Number);
    if (!b || b === a) return `${da} ${MIES_D[ma - 1]} ${ra}`;
    const [rb, mb, db] = b.split('-').map(Number);
    if (ra === rb && ma === mb) return `${da}–${db} ${MIES_D[ma - 1]} ${ra}`;
    if (ra === rb) return `${da} ${MIES_D[ma - 1]} – ${db} ${MIES_D[mb - 1]} ${ra}`;
    return `${da}.${String(ma).padStart(2, '0')}.${ra} – ${db}.${String(mb).padStart(2, '0')}.${rb}`;
  }
  const zaIle = n => n === 0 ? 'dziś' : n === 1 ? 'jutro' : n < 0 ? 'trwa' : `za ${n} dni`;

  /* ---------- konwenty-poludniowe.pl ---------- */
  const http = () => { const C = window.Capacitor; return C && C.isNativePlatform && C.isNativePlatform() && C.Plugins && C.Plugins.CapacitorHttp; };
  const un = s => { const t = document.createElement('textarea'); t.innerHTML = s; return t.value; };
  const txt = s => un(String(s || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
  /* Wiersze tabeli <tr> z getArticles -> wydarzenia (ten sam format daje narzedzia/pobierz.py) */
  function parsujKP(html) {
    const out = [];
    for (const m of String(html).matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
      const c = [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(x => x[1]);
      if (c.length < 5) continue;
      const daty = txt(c[0]).split(' - ');
      const a = c[1].match(/href="(\/konwenty\/kalendarz\/(\d+)[^"]*)"/);
      if (!a) continue;
      const start = d2iso(daty[0]); let end = d2iso(daty[1] || daty[0]) || start;
      if (!start) continue;
      if (end < start) end = start;
      const size = (c[2].match(/title="([^"]+)"/) || [])[1] || '';
      const title = txt(c[1]);
      out.push({ id: 'kp-' + a[2], title, start, end, city: txt(c[3]), kat: txt(c[4]), size: size === 'brak danych' ? '' : size,
        free: /Darmowy/i.test(c[2]), cancelled: /\(Odwołane\)/i.test(title), url: KP + a[1] });
    }
    return out;
  }
  async function zKP() {
    const r = new Date().getFullYear();
    const body = 'search_words=' + [r, r + 1, r + 2].map(y => '&rokval%5B%5D=' + y).join('');
    const res = await http().post({ url: KP_API, headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' }, data: body, responseType: 'text' });
    if (res.status >= 400) throw new Error('HTTP ' + res.status);
    return parsujKP(String(res.data || ''));
  }

  /* ---------- iCal (.ics) ---------- */
  function icsData(v) {
    const m = String(v || '').match(/(\d{4})(\d{2})(\d{2})/);
    return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
  }
  function parsujICS(text, src) {
    const lines = String(text).replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
    const out = []; let ev = null;
    const unesc = s => String(s || '').replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').trim();
    for (const l of lines) {
      if (l === 'BEGIN:VEVENT') { ev = {}; continue; }
      if (l === 'END:VEVENT') {
        if (ev && ev.start && ev.title) {
          let end = ev.end || ev.start;
          if (ev.allDay && ev.end && ev.end > ev.start) end = plusDni(ev.end, -1); // w iCal koniec dnia całodniowego jest „wyłączny”
          out.push({ id: 'ics-' + src.id + '-' + (ev.uid || ev.start + ev.title).replace(/[^\w@.-]/g, '').slice(0, 80), title: ev.title, start: ev.start, end: end < ev.start ? ev.start : end,
            city: ev.loc || '', kat: '', ical: src.name, url: ev.url || '' });
        }
        ev = null; continue;
      }
      if (!ev) continue;
      const i = l.indexOf(':'); if (i < 0) continue;
      const key = l.slice(0, i), val = l.slice(i + 1), name = key.split(';')[0].toUpperCase();
      if (name === 'SUMMARY') ev.title = unesc(val);
      else if (name === 'DTSTART') { ev.start = icsData(val); ev.allDay = /VALUE=DATE(?!-)/i.test(key) || /^\d{8}$/.test(val.trim()); }
      else if (name === 'DTEND') ev.end = icsData(val);
      else if (name === 'LOCATION') ev.loc = unesc(val);
      else if (name === 'URL') ev.url = val.trim();
      else if (name === 'UID') ev.uid = val.trim();
    }
    return out;
  }
  async function pobierzICS(url) {
    url = url.replace(/^webcal:/i, 'https:');
    if (http()) {
      const r = await http().get({ url, responseType: 'text' });
      if (r.status >= 400) throw new Error('HTTP ' + r.status);
      return String(r.data || '');
    }
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.text();
  }

  /* ---------- ustawienia i dane ---------- */
  async function ustawienia() {
    return Object.assign({ rodzaje: ['plansz', 'komiks', 'mieszane'], ical: [], minione: false }, (await DB.setting('kalendarz')) || {});
  }
  const zapiszUst = u => DB.setting('kalendarz', u);

  let pamiec = null;
  /* Zwraca { pobrano, wydarzenia } – wydarzenia z konwenty-poludniowe.pl */
  async function wczytaj(wymus) {
    let st = null;
    try { st = await DB.local('kalendarz'); } catch (e) { }
    if (!wymus && pamiec) return pamiec;
    if (!wymus && st && st.sprawdzono && Date.now() - new Date(st.sprawdzono).getTime() < DZIEN) return (pamiec = st);
    const kandydaci = [];
    const syn = await DB.setting('kalendarzDane'); // z telefonu (synchronizowane)
    if (syn && syn.wydarzenia) kandydaci.push(syn);
    let blad = '';
    if (http() && (wymus || !syn || Date.now() - new Date(syn.pobrano || 0).getTime() > 3 * DZIEN)) {
      try {
        const w = await zKP();
        if (w.length) { const d = { zrodlo: KP, pobrano: new Date().toISOString(), wydarzenia: w }; await DB.setting('kalendarzDane', d); kandydaci.push(d); }
        else blad = 'konwenty-poludniowe.pl nie zwróciło żadnych wydarzeń – możliwe, że zmienili stronę.';
      } catch (e) { blad = 'Nie udało się odczytać konwenty-poludniowe.pl (' + e.message + '). Sprawdź internet.'; }
    }
    try {
      const r = await fetch(URL_JSON + '?t=' + Date.now(), { cache: 'no-store' });
      if (r.ok) kandydaci.push(await r.json());
    } catch (e) { }
    if (kandydaci.length) {
      const best = kandydaci.sort((a, b) => String(b.pobrano || '').localeCompare(String(a.pobrano || '')))[0];
      st = { sprawdzono: new Date().toISOString(), pobrano: best.pobrano, wydarzenia: best.wydarzenia || [] };
      try { await DB.local('kalendarz', st); } catch (e) { }
    } else if (!st && !blad) blad = 'Nie udało się pobrać kalendarza imprez (brak internetu?). Własne wydarzenia działają dalej.';
    if (wymus && blad) App.ui.toast(blad, 4500);
    return (pamiec = Object.assign({ wydarzenia: [] }, st || {}, { blad }));
  }

  async function odswiezICS(u, tylko) {
    const dane = (await DB.setting('kalendarzIcal')) || {};
    let bledy = 0;
    for (const s of u.ical) {
      if (tylko && s.id !== tylko) continue;
      try {
        const w = parsujICS(await pobierzICS(s.url), s);
        const od = plusDni(today(), -60);
        dane[s.id] = { pobrano: new Date().toISOString(), wydarzenia: w.filter(e => e.end >= od).slice(0, 400) };
      } catch (e) {
        bledy++;
        App.ui.toast(http() ? `Nie udało się pobrać kalendarza „${s.name}” (${e.message}). Sprawdź adres.`
          : `Kalendarz „${s.name}” nie pozwala czytać się z przeglądarki. Odśwież go w aplikacji na telefonie – dane przyjdą tu przez synchronizację.`, 5000);
      }
    }
    Object.keys(dane).forEach(k => { if (!u.ical.some(s => s.id === k)) delete dane[k]; });
    await DB.setting('kalendarzIcal', dane);
    return bledy;
  }

  /* klucz serii do przewidywania kolejnej edycji: „37. Międzynarodowy Festiwal … 2026” -> „miedzynarodowy festiwal …” */
  const RZYM = /^(?:[ivxlc]+)$/;
  const klucz = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l')
    .replace(/\(.*?\)/g, ' ').split(/[^a-z0-9]+/).filter(w => w && !/^\d+$/.test(w) && !RZYM.test(w) && !/^(edycja|edycji|edition|vol|wiosna|jesien|zima|lato)$/.test(w)).join(' ');

  async function przygotuj(wymus) {
    const [st, u, wlasne, icsDane] = await Promise.all([wczytaj(wymus), ustawienia(), DB.all('events'), DB.setting('kalendarzIcal')]);
    const marks = new Map(wlasne.filter(e => e.source === 'mark').map(e => [e.id, e]));
    const dzis = today();
    const zKal = (st.wydarzenia || []).map(e => Object.assign({}, e, { rodzaj: rodzajKat(e.kat), zrodlo: 'kp' }));
    const zIcs = [];
    Object.values(icsDane || {}).forEach(d => (d.wydarzenia || []).forEach(e => zIcs.push(Object.assign({}, e, { rodzaj: 'ical', zrodlo: 'ical' }))));
    const moje = wlasne.filter(e => e.source === 'own').map(e => Object.assign({}, e, { rodzaj: e.kind || 'inne', zrodlo: 'own', end: e.end || e.start }));
    // przewidywane: edycja z ostatnich 12 miesięcy, której nowej edycji nie ma na liście
    const przyszle = new Set(zKal.filter(e => e.start >= dzis).map(e => klucz(e.title)));
    const przew = [];
    const widziane = new Set();
    zKal.filter(e => e.end < dzis && e.start >= plusDni(dzis, -365) && !e.cancelled).sort((a, b) => b.start.localeCompare(a.start)).forEach(e => {
      const k = klucz(e.title);
      if (!k || przyszle.has(k) || widziane.has(k)) return;
      widziane.add(k);
      const s = plusDni(e.start, 364), en = plusDni(e.end, 364); // ten sam dzień tygodnia rok później
      przew.push(Object.assign({}, e, { id: 'przew-' + e.id, przew: true, poprzednio: e, start: s, end: en, title: e.title.replace(/\b20\d\d\b/, String(+s.slice(0, 4))) }));
    });
    const wszystkie = zKal.concat(zIcs, moje, przew).map(e => {
      const m = marks.get(e.przew ? e.poprzednio.id : e.id) || null;
      return Object.assign(e, { status: e.zrodlo === 'own' ? (e.status == null ? 'tak' : e.status) : (m && m.status) || '', notes: e.zrodlo === 'own' ? e.notes : (m && m.notes) || '', hidden: !!(m && m.hidden), mark: m });
    });
    return { st, u, wszystkie, dzis };
  }

  /* ---------- wygląd ---------- */
  function css() {
    if (document.getElementById('kal-css')) return;
    const st = document.createElement('style'); st.id = 'kal-css';
    st.textContent = `
.kal-filters{display:flex;flex-wrap:wrap;gap:6px;margin:4px 0 12px}
.kal-f{min-height:34px;padding:4px 12px;border-radius:999px;font-size:13.5px;font-weight:550}
.kal-f.on{background:var(--accent);color:var(--on-accent);border-color:var(--accent)}
.kal-m{margin:18px 2px 8px;font-size:14px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}
.kal-li{align-items:stretch}
.kal-d{width:54px;flex-shrink:0;border-radius:10px;background:var(--accent-soft);color:var(--accent);display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1.1;padding:6px 2px}
.kal-d b{font-size:19px;font-weight:750}
.kal-d b.r{font-size:15px;white-space:nowrap}
.kal-d small{font-size:11.5px;text-transform:uppercase;font-weight:650}
.kal-li.tak .kal-d{background:var(--ok);color:var(--on-ok)}
.kal-li.moze .kal-d{background:var(--accent-2-soft);color:var(--text)}
.kal-li.przew .kal-d{background:none;border:1.5px dashed var(--line);color:var(--muted)}
.kal-li.przew .t,.kal-li.minione .t{color:var(--muted)}
.kal-li.odw .t{text-decoration:line-through;color:var(--muted)}
.kal-li .t{white-space:normal}
.kal-li .main{display:flex;flex-direction:column;justify-content:center}
.kal-b{display:inline-block;margin-left:4px;padding:1px 8px;border-radius:999px;font-size:11.5px;font-weight:650;vertical-align:1px}
.kal-b.tak{background:var(--ok);color:var(--on-ok)}
.kal-b.moze{background:var(--accent-2);color:#241a05}
.kal-b.own{background:var(--accent);color:var(--on-accent)}
.kal-b.pr{background:var(--surface2);color:var(--muted)}
.kal-b.free{background:var(--ok-soft);color:var(--text)}
.kal-next{display:flex;gap:14px;align-items:center;background:var(--ok-soft);border-color:transparent}
.kal-next .v{font-size:22px;font-weight:750}
.kal-src{font-size:13px;color:var(--muted);margin-top:22px;line-height:1.6}
.kal-src a{color:var(--accent)}
.kal-links{display:flex;flex-wrap:wrap;gap:8px;margin:2px 0 6px}
.kal-links a{font-size:14px}
@media (max-width:760px){.kal-dl{display:none}}
`;
    document.head.appendChild(st);
  }

  function gcal(e) {
    const f = d => d.replace(/-/g, '');
    const p = new URLSearchParams({ action: 'TEMPLATE', text: e.title, dates: f(e.start) + '/' + f(plusDni(e.end || e.start, 1)), location: e.city || '', details: e.url || '' });
    return 'https://calendar.google.com/calendar/render?' + p.toString();
  }

  function wiersz(e, i, dzis) {
    const [, m, d] = e.start.split('-').map(Number);
    const r = rodzaj(e.rodzaj);
    const dni = e.start > dzis ? roznica(dzis, e.start) : (e.end >= dzis ? -1 : null);
    const kl = ['li', 'kal-li', e.status, e.przew ? 'przew' : '', e.cancelled ? 'odw' : '', e.end < dzis ? 'minione' : ''].join(' ');
    const dzien = e.end !== e.start && e.end.slice(0, 7) === e.start.slice(0, 7) ? `${d}–${+e.end.slice(8)}` : String(d);
    const opis = [
      e.przew ? `przewidywane – w ${e.poprzednio.start.slice(0, 4)}: ${zakres(e.poprzednio.start, e.poprzednio.end)}` : zakres(e.start, e.end),
      e.city, e.rodzaj === 'ical' ? (e.ical || 'iCal') : r.ik + ' ' + r.nazwa, e.size ? e.size + ' osób' : ''
    ].filter(Boolean).map(esc).join(' · ');
    return `<div class="${kl}" data-i="${i}">
      <div class="kal-d"><b class="${dzien.includes('–') && !e.przew ? 'r' : ''}">${e.przew ? '?' : esc(dzien)}</b><small>${MIES_K[m - 1]}</small></div>
      <div class="main"><div class="t">${esc(e.title)}${e.status === 'tak' ? '<span class="kal-b tak">Idę</span>' : e.status === 'moze' ? '<span class="kal-b moze">Może</span>' : ''}${e.zrodlo === 'own' ? '<span class="kal-b own">moje</span>' : ''}${e.free ? '<span class="kal-b free">wstęp wolny</span>' : ''}${e.cancelled ? '<span class="kal-b pr">odwołane</span>' : ''}</div>
        <div class="s">${opis}${dni != null && !e.przew && !e.cancelled ? ' · <b>' + zaIle(dni) + '</b>' : ''}</div>
        ${e.notes ? `<div class="s">📝 ${esc(e.notes)}</div>` : ''}</div></div>`;
  }

  let szukaj = '', tylkoMoje = false;
  async function render(el, params, ctx, wymus) {
    css();
    const { st, u, wszystkie, dzis } = await przygotuj(wymus);
    const q = klucz(szukaj);
    const widoczne = wszystkie.filter(e => {
      if (e.hidden && !tylkoMoje) return false;
      if (tylkoMoje) return e.status === 'tak' || e.status === 'moze';
      if (!u.minione && e.end < dzis) return false;
      if (e.przew && e.start <= dzis) return false;
      if (q && !klucz(e.title + ' ' + e.city).includes(q)) return false;
      if (e.zrodlo === 'own' || e.zrodlo === 'ical' || e.status) return true;
      return u.rodzaje.includes(e.rodzaj);
    }).sort((a, b) => (a.start + a.title).localeCompare(b.start + b.title));
    const najblizsze = wszystkie.filter(e => e.status === 'tak' && e.end >= dzis && !e.przew).sort((a, b) => a.start.localeCompare(b.start))[0];
    const licz = id => wszystkie.filter(e => e.rodzaj === id && e.end >= dzis && !e.przew && !e.hidden).length;

    let html = '', mies = '';
    widoczne.forEach((e, i) => {
      const k = e.start.slice(0, 7);
      if (k !== mies) {
        if (mies) html += '</div>';
        mies = k; html += `<div class="kal-m">${MIES[+k.slice(5) - 1]} ${k.slice(0, 4)}</div><div class="list">`;
      }
      html += wiersz(e, i, dzis);
    });
    if (mies) html += '</div>';

    const ileUkr = wszystkie.filter(e => e.hidden).length;
    el.innerHTML = `<div class="row"><h1 style="margin:0">Kalendarz imprez</h1><span class="spacer"></span><button class="primary" id="kal-add">+ Dodaj<span class="kal-dl"> wydarzenie</span></button></div>
      ${najblizsze ? `<div class="card kal-next" style="margin-top:12px"><div class="v">${zaIle(Math.max(-1, roznica(dzis, najblizsze.start)))}</div><div><b>${esc(najblizsze.title)}</b><div class="muted" style="font-size:13px">${esc(zakres(najblizsze.start, najblizsze.end))}${najblizsze.city ? ' · ' + esc(najblizsze.city) : ''}</div></div></div>` : ''}
      <div class="toolbar" style="margin-top:8px"><input type="search" id="kal-q" placeholder="Szukaj imprezy lub miasta…" value="${esc(szukaj)}"></div>
      <div class="kal-filters">
        <button class="kal-f ${tylkoMoje ? 'on' : ''}" data-moje="1">⭐ Moje plany</button>
        ${RODZAJE.map(r => `<button class="kal-f ${!tylkoMoje && u.rodzaje.includes(r.id) ? 'on' : ''}" data-r="${r.id}">${r.ik} ${r.nazwa} <span class="muted">${licz(r.id)}</span></button>`).join('')}
      </div>
      ${st.blad && !(st.wydarzenia || []).length ? `<p class="err">${esc(st.blad)}</p>` : ''}
      ${html || `<div class="empty">${tylkoMoje ? 'Nie masz jeszcze planów.<br>Stuknij imprezę i wybierz „Idę” albo „Może”.' : 'Brak imprez dla wybranych filtrów.<br>Włącz więcej rodzajów albo dodaj własne wydarzenie.'}</div>`}
      <div class="kal-src">
        Źródło: <a href="${KP}/konwenty/kalendarz" target="_blank" rel="noopener">konwenty-poludniowe.pl</a>${st.pobrano ? ', stan z ' + esc(new Date(st.pobrano).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' })) : ''}
        ${http() ? '(telefon sprawdza co 3 dni)' : '(aktualizuje telefon i co tydzień serwer aplikacji)'}.
        Szare z „?” to przewidywane kolejne edycje – termin sprzed roku, dopóki organizator nie ogłosi nowego.
        <div class="row" style="margin-top:8px">
          <button class="small" id="kal-ref">↻ Odśwież</button>
          <button class="small" id="kal-ust">⚙ Źródła i ustawienia</button>
          <label class="row" style="gap:6px;font-size:13.5px"><input type="checkbox" id="kal-min" ${u.minione ? 'checked' : ''}> pokaż minione</label>
          ${ileUkr ? `<button class="small ghost" id="kal-ukr">Ukryte (${ileUkr})</button>` : ''}
        </div>
      </div>`;

    const odswiez = () => render(el, params, ctx);
    const qi = el.querySelector('#kal-q');
    qi.oninput = () => { szukaj = qi.value; clearTimeout(qi._t); qi._t = setTimeout(async () => { await render(el, params, ctx); const n = el.querySelector('#kal-q'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 250); };
    el.querySelector('#kal-add').onclick = async () => { if (await edytuj(null)) odswiez(); };
    el.querySelector('[data-moje]').onclick = () => { tylkoMoje = !tylkoMoje; odswiez(); };
    el.querySelectorAll('[data-r]').forEach(b => b.onclick = async () => {
      if (tylkoMoje) { tylkoMoje = false; u.rodzaje = [b.dataset.r]; }
      else u.rodzaje = u.rodzaje.includes(b.dataset.r) ? u.rodzaje.filter(x => x !== b.dataset.r) : u.rodzaje.concat(b.dataset.r);
      await zapiszUst(u); odswiez();
    });
    el.querySelector('#kal-min').onchange = async e => { u.minione = e.target.checked; await zapiszUst(u); odswiez(); };
    el.querySelector('#kal-ref').onclick = async () => {
      App.ui.toast('Sprawdzam kalendarz…');
      pamiec = null;
      if (u.ical.length) await odswiezICS(u);
      await render(el, params, ctx, true);
      if (!pamiec.blad) App.ui.toast(http() ? 'Pobrano z konwenty-poludniowe.pl' : 'Odświeżono');
    };
    el.querySelector('#kal-ust').onclick = async () => { if (await zrodla(u)) odswiez(); };
    const ukr = el.querySelector('#kal-ukr');
    if (ukr) ukr.onclick = async () => { if (await ukryte(wszystkie)) odswiez(); };
    el.querySelectorAll('.kal-li').forEach(r => r.onclick = async () => { if (await szczegoly(widoczne[+r.dataset.i])) odswiez(); });
  }

  /* ---------- okna ---------- */
  async function szczegoly(e) {
    if (e.zrodlo === 'own') return edytuj(e);
    const markId = e.przew ? e.poprzednio.id : e.id;
    const links = [
      e.url ? `<a href="${esc(e.przew ? e.poprzednio.url : e.url)}" target="_blank" rel="noopener">${e.przew ? 'Poprzednia edycja' : 'Strona wydarzenia'} ↗</a>` : '',
      !e.przew ? `<a href="${esc(gcal(e))}" target="_blank" rel="noopener">Dodaj do Kalendarza Google ↗</a>` : '',
      `<a href="https://www.google.com/search?q=${encodeURIComponent(e.title.replace(/\s*\(Odwołane\)/i, '') + ' ' + (e.city || ''))}" target="_blank" rel="noopener">Szukaj w Google ↗</a>`
    ].filter(Boolean).join('');
    const info = `<p class="muted" style="margin:0 0 6px">${esc(e.przew ? 'Przewidywany termin (jak rok temu): ' : '')}${esc(zakres(e.start, e.end))}${e.city ? ' · ' + esc(e.city) : ''}${e.kat ? ' · ' + esc(e.kat) : ''}${e.ical ? ' · z kalendarza ' + esc(e.ical) : ''}${e.size ? ' · ' + esc(e.size) + ' osób' : ''}${e.free ? ' · wstęp wolny' : ''}</p><div class="kal-links">${links}</div>`;
    const v = await App.ui.form(e.title, [
      { type: 'html', html: info },
      { name: 'status', label: 'Czy jadę?', type: 'select', value: e.status || '', options: [['', 'Jeszcze nie wiem'], ['moze', 'Może'], ['tak', 'Idę / jadę']] },
      { name: 'notes', label: 'Notatka (np. nocleg, bilety, z kim)', type: 'textarea', value: e.notes || '', rows: 2 },
      { name: 'hidden', label: 'Ukryj to wydarzenie', type: 'checkbox', value: e.hidden }
    ]);
    if (!v) return false;
    const m = e.mark || { id: markId, source: 'mark' };
    if (!v.status && !v.notes && !v.hidden && !e.mark) return false;
    await DB.put('events', Object.assign({}, m, { status: v.status, notes: v.notes, hidden: v.hidden, title: e.przew ? e.poprzednio.title : e.title }));
    App.ui.toast(v.hidden ? 'Ukryto' : v.status === 'tak' ? 'Zapisano: jadę 🎉' : 'Zapisano');
    return true;
  }

  async function edytuj(e) {
    const x = e || {};
    const v = await App.ui.form(e ? 'Moje wydarzenie' : 'Nowe wydarzenie', [
      { name: 'title', label: 'Nazwa', value: x.title || '', placeholder: 'np. Pionek Gliwice, spotkanie w klubie' },
      { name: 'start', label: 'Od', type: 'date', value: x.start || today() },
      { name: 'end', label: 'Do (puste = jeden dzień)', type: 'date', value: x.end && x.end !== x.start ? x.end : '' },
      { name: 'city', label: 'Miasto / miejsce', value: x.city || '' },
      { name: 'kind', label: 'Rodzaj', type: 'select', value: x.kind || 'plansz', options: RODZAJE.map(r => [r.id, r.ik + ' ' + r.nazwa]) },
      { name: 'status', label: 'Czy jadę?', type: 'select', value: x.status || 'tak', options: [['tak', 'Idę / jadę'], ['moze', 'Może'], ['', 'Tylko zapisuję']] },
      { name: 'url', label: 'Strona (opcjonalnie)', type: 'url', value: x.url || '', placeholder: 'https://…' },
      { name: 'notes', label: 'Notatka', type: 'textarea', value: x.notes || '', rows: 2 },
      ...(e ? [{ name: 'del', label: 'Usuń to wydarzenie', type: 'checkbox', value: false }] : [])
    ], {
      onMount: dlg => {
        if (!e) return;
        const a = document.createElement('div'); a.className = 'kal-links';
        a.innerHTML = `${x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener">Strona ↗</a>` : ''}<a href="${esc(gcal(x))}" target="_blank" rel="noopener">Dodaj do Kalendarza Google ↗</a>`;
        dlg.querySelector('h3').after(a);
      }
    });
    if (!v) return false;
    if (e && v.del) {
      if (!await App.ui.confirm(`Usunąć „${x.title}”?`)) return false;
      await DB.remove('events', x.id); App.ui.toast('Usunięto'); return true;
    }
    if (!v.title || !v.start) { App.ui.toast('Podaj nazwę i datę wydarzenia'); return false; }
    if (v.end && v.end < v.start) { App.ui.toast('Data „do” jest wcześniejsza niż „od” – popraw daty'); return false; }
    await DB.put('events', Object.assign({}, x.id ? { id: x.id, createdAt: x.createdAt } : {}, {
      source: 'own', title: v.title, start: v.start, end: v.end || v.start, city: v.city, kind: v.kind, status: v.status, url: v.url, notes: v.notes
    }));
    App.ui.toast(e ? 'Zapisano' : 'Dodano do kalendarza');
    return true;
  }

  async function ukryte(wszystkie) {
    const lista = wszystkie.filter(e => e.hidden && e.mark);
    const v = await App.ui.form('Ukryte wydarzenia', [
      { type: 'html', html: '<p class="muted" style="margin:0">Zaznacz, które pokazać z powrotem.</p>' },
      ...lista.map((e, i) => ({ name: 'u' + i, label: e.title + ' (' + App.ui.fmtDate(e.start) + ')', type: 'checkbox', value: false }))
    ], { ok: 'Pokaż zaznaczone' });
    if (!v) return false;
    for (let i = 0; i < lista.length; i++) if (v['u' + i]) await DB.put('events', Object.assign({}, lista[i].mark, { hidden: false }));
    return true;
  }

  async function zrodla(u) {
    const v = await App.ui.form('Źródła kalendarza', [
      { type: 'html', html: `<p class="muted" style="margin:0 0 8px">Wydarzenia z <b>konwenty-poludniowe.pl</b> są pobierane same.
        Możesz dodać też kalendarz w formacie iCal (adres kończący się zwykle na .ics) – np. publiczny Kalendarz Google klubu planszówkowego
        (Ustawienia kalendarza Google → „Publiczny adres w formacie iCal”).
        ${http() ? '' : '<br>Uwaga: w przeglądarce wiele kalendarzy iCal blokuje odczyt – wtedy odśwież je w aplikacji na telefonie, a tu przyjdą przez synchronizację.'}</p>
        ${u.ical.length ? '<p style="margin:0 0 4px"><b>Twoje kalendarze iCal:</b></p>' : ''}` },
      ...u.ical.map((s, i) => ({ name: 'del' + i, label: `Usuń „${s.name}”`, type: 'checkbox', value: false })),
      { name: 'name', label: 'Nowy kalendarz iCal – nazwa', value: '', placeholder: 'np. Klub planszówkowy' },
      { name: 'url', label: 'Adres iCal (.ics)', type: 'url', value: '', placeholder: 'https://…/basic.ics' }
    ]);
    if (!v) return false;
    u.ical = u.ical.filter((s, i) => !v['del' + i]);
    let nowy = null;
    if (v.url) {
      if (!/^(https?|webcal):\/\//i.test(v.url)) { App.ui.toast('Adres kalendarza musi zaczynać się od https://'); return false; }
      nowy = { id: DB.uid().slice(0, 8), name: v.name || 'Kalendarz iCal', url: v.url };
      u.ical.push(nowy);
    }
    await zapiszUst(u);
    if (nowy) {
      App.ui.toast('Pobieram kalendarz…');
      const bledy = await odswiezICS(u, nowy.id);
      if (!bledy) App.ui.toast(`Dodano kalendarz „${nowy.name}”`);
    } else await odswiezICS(u, '__nic__');
    return true;
  }

  App.registerModule({ id: 'kalendarz', title: 'Kalendarz imprez', icon: '📅', order: 13, render: (el, params, ctx) => render(el, params, ctx) });
  App.provide('kalendarz.parsujKP', parsujKP);
  App.provide('kalendarz.parsujICS', parsujICS);
})();
