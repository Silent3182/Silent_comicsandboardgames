/* Moduł „Udostępnij kolekcję” (🔗): link tylko do odczytu dla znajomych (strona kolekcja.html).
 * Znajomi widzą, co masz, i mogą poprosić o pożyczenie – nie mogą niczego zmienić.
 *
 * BEZPIECZEŃSTWO – co trafia do linku (lista dozwolonych pól, nic poza nią):
 *   gry: tytuł, rok, numer BGG, dodatek tak/nie, opcjonalnie: moja ocena, liczba partii, „na sprzedaż”,
 *        „teraz pożyczona” (bez imienia osoby), okładka;  komiksy: seria + numery tomów albo tytuły.
 *   NIGDY: notatki, ceny zakupu i wyceny, kody kreskowe, półki, gracze i wyniki, osoby z wypożyczeń,
 *          tokeny, ustawienia synchronizacji.
 * Dwa rodzaje linku:
 *   1. „Link z danymi” (domyślny, bez konfiguracji): spis jest skompresowany w części adresu po „#”.
 *      Ta część nie jest wysyłana do serwera – nikt poza osobą z linkiem jej nie widzi. Po zmianach w kolekcji
 *      trzeba wysłać nowy link.
 *   2. „Stały link” (opcjonalny): spis zapisany jako sekretny Gist na GitHubie (dostępny tylko dla osób,
 *      które znają adres). Aktualizuje się sam. Wymaga tokenu GitHub z uprawnieniem „Gists: Read and write”
 *      (token trzymany tylko na tym urządzeniu, DB.local). Można go w każdej chwili wyłączyć (usuwa Gist).
 * Ustawienie 'udostepnij' (synchronizowane): { nazwa, oceny, partie, sprzedaz, pozyczone, komiksy, okladki, gistId, gistAt, auto, hash }
 */
(function () {
  const esc = s => App.ui.esc(s);
  const PAGES = 'https://silent3182.github.io/Silent_comicsandboardgames/';
  const natywna = () => !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  // adres strony podglądu: na GitHub Pages / lokalnym serwerze – obok aplikacji; w APK – GitHub Pages
  const baza = () => (!natywna() && /^https?:$/.test(location.protocol)) ? location.origin + location.pathname.replace(/[^/]*$/, '') : PAGES;
  const DOMYSLNE = { nazwa: 'Kolekcja Marcina', oceny: true, partie: true, sprzedaz: true, pozyczone: true, komiksy: true, okladki: false, auto: true };

  window.IKONY = window.IKONY || {};
  window.IKONY.udostepnij = '<circle class="f" cx="6.5" cy="12" r="2.7"/><circle class="f" cx="17.5" cy="6" r="2.7"/><circle class="f" cx="17.5" cy="18" r="2.7"/><path d="M8.9 10.7l6.2-3.4M8.9 13.3l6.2 3.4"/>';
  if (window.IKONY_KOLOR) window.IKONY_KOLOR.udostepnij = '#0f9bd7';

  async function cfg() { return Object.assign({}, DOMYSLNE, (await DB.setting('udostepnij')) || {}); }
  async function zapiszCfg(c) { await DB.setting('udostepnij', c); }
  async function token() {
    try { const t = await DB.local('udostepnijToken'); if (t) return t; } catch (e) {}
    try { const g = await DB.local('ghSync'); return g && g.token || null; } catch (e) { return null; }
  }

  /* Numery tomów -> „1-93, 95, 97-99” */
  function zakresy(nums) {
    const n = [...new Set(nums)].sort((a, b) => a - b), out = [];
    for (let i = 0; i < n.length; i++) { let j = i; while (j + 1 < n.length && n[j + 1] === n[j] + 1) j++; out.push(j > i ? n[i] + '-' + n[j] : String(n[i])); i = j; }
    return out.join(',');
  }

  /* Spis do udostępnienia – tylko dozwolone pola. */
  async function spis(c, okladki) {
    const [games, comics, plays, loans] = await Promise.all([DB.all('games'), DB.all('comics'), DB.all('plays'), DB.all('loans').catch(() => [])]);
    const partie = new Map(); plays.forEach(p => partie.set(p.gameId, (partie.get(p.gameId) || 0) + 1));
    const wyp = new Set(loans.filter(l => l.direction === 'out' && !l.returnedAt).map(l => l.itemType + ':' + l.itemId));
    const g = games.filter(x => x.status === 'owned' || x.status === 'forSale' || !x.status || (c.wishlist && x.status === 'wishlist'))
      .sort((a, b) => (a.title || '').localeCompare(b.title || '', 'pl'))
      .map(x => {
        const fl = (x.isExpansion ? 1 : 0) | (c.sprzedaz && x.status === 'forSale' ? 2 : 0) | (x.status === 'wishlist' ? 4 : 0) | (c.pozyczone && wyp.has('game:' + x.id) ? 8 : 0);
        const r = [String(x.title || '').slice(0, 120), +x.year || 0, +x.bggId || 0, fl, c.oceny && has(x.myRating) ? +x.myRating : 0, c.partie ? partie.get(x.id) || 0 : 0];
        const img = x.thumb || x.image;
        if (okladki && img && /^https:\/\//.test(img)) r.push(img);
        return r;
      });
    let k = [];
    if (c.komiksy) {
      const ser = new Map();
      comics.filter(x => x.status === 'owned' || x.status === 'forSale').forEach(x => {
        const s = x.series || 'Inne';
        if (!ser.has(s)) ser.set(s, { nums: [], tyt: [] });
        const o = ser.get(s), v = parseInt(x.volume, 10);
        if (x.series && !isNaN(v) && String(v) === String(x.volume).trim()) o.nums.push(v); else o.tyt.push(String(x.title || ((x.series || '') + ' ' + (x.volume || ''))).trim().slice(0, 120));
      });
      k = [...ser.entries()].sort((a, b) => (b[1].nums.length + b[1].tyt.length) - (a[1].nums.length + a[1].tyt.length) || a[0].localeCompare(b[0], 'pl'))
        .map(([s, o]) => [s.slice(0, 80), zakresy(o.nums), o.tyt.sort((a, b) => a.localeCompare(b, 'pl', { numeric: true }))]);
    }
    return { v: 1, n: String(c.nazwa || DOMYSLNE.nazwa).slice(0, 60), d: App.ui.today(), o: { oceny: !!c.oceny, partie: !!c.partie }, g, k };
  }
  const has = v => v != null && v !== '' && !isNaN(+v) && +v > 0;

  /* JSON -> deflate -> base64url (część adresu po #) */
  const b64u = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  async function koduj(obj) {
    const txt = new TextEncoder().encode(JSON.stringify(obj));
    if (window.CompressionStream) {
      const buf = await new Response(new Blob([txt]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer();
      return 'z' + b64u(new Uint8Array(buf));
    }
    return 'j' + b64u(txt);
  }

  async function hash(s) {
    if (!(window.crypto && crypto.subtle)) return String(s.length);
    const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return b64u(new Uint8Array(b)).slice(0, 16);
  }

  /* ---------- stały link: sekretny Gist ---------- */
  async function gist(method, path, body, tok) {
    const r = await fetch('https://api.github.com/gists' + path, { method, headers: { Authorization: 'Bearer ' + tok, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    if (r.status === 401) throw new Error('Token GitHub jest nieprawidłowy albo wygasł');
    if (r.status === 403 || r.status === 404 && method === 'POST') throw new Error('Token nie ma uprawnienia „Gists: Read and write”');
    if (!r.ok && !(method === 'DELETE' && r.status === 404)) throw new Error('GitHub odpowiedział: ' + r.status);
    return method === 'DELETE' ? null : r.json();
  }
  async function opublikuj(wymus) {
    const c = await cfg(); const tok = await token();
    if (!tok) throw new Error('Brak tokenu GitHub – wpisz go w sekcji „Stały link”');
    const dane = await spis(c, true);
    const txt = JSON.stringify(dane);
    const h = await hash(txt.replace(/"d":"[^"]*"/, ''));
    if (!wymus && c.gistId && c.hash === h) return { zmiany: false, c };
    const body = { description: 'Moje kolekcje – spis tylko do odczytu', files: { 'kolekcja.json': { content: txt } } };
    let res;
    if (c.gistId) {
      try { res = await gist('PATCH', '/' + c.gistId, body, tok); }
      catch (e) { if (/404/.test(e.message)) { c.gistId = null; } else throw e; }
    }
    if (!c.gistId) res = await gist('POST', '', Object.assign({ public: false }, body), tok);
    c.gistId = res.id; c.gistAt = new Date().toISOString(); c.hash = h;
    await zapiszCfg(c);
    return { zmiany: true, c };
  }
  async function wylaczGist() {
    const c = await cfg(); const tok = await token();
    if (c.gistId && tok) await gist('DELETE', '/' + c.gistId, null, tok);
    c.gistId = null; c.gistAt = null; c.hash = null; await zapiszCfg(c);
  }
  // automatyczna aktualizacja stałego linku (raz na kilka godzin, po zmianach)
  let autoT = null;
  function autoPozniej(ms = 15000) {
    clearTimeout(autoT);
    autoT = setTimeout(async () => {
      try {
        const c = await cfg(); if (!c.gistId || !c.auto || !navigator.onLine) return;
        if (c.gistAt && Date.now() - new Date(c.gistAt).getTime() < 6 * 3600 * 1000) return;
        if (!(await token())) return;
        await opublikuj(false);
      } catch (e) { console.warn('udostępnianie', e); }
    }, ms);
  }
  ['games', 'comics', 'plays', 'loans'].forEach(s => DB.on(s, () => autoPozniej(60000)));
  setTimeout(() => autoPozniej(0), 20000);

  async function udostepnijLink(url, nazwa) {
    const tekst = `${nazwa} – zobacz, co mam (tylko do odczytu):`;
    if (natywna() && window.Capacitor.Plugins && window.Capacitor.Plugins.Share) {
      try { await window.Capacitor.Plugins.Share.share({ title: nazwa, text: tekst, url, dialogTitle: 'Wyślij link' }); return; } catch (e) { return; }
    }
    if (navigator.share && matchMedia('(pointer:coarse)').matches) { try { await navigator.share({ title: nazwa, text: tekst, url }); return; } catch (e) { if (e.name === 'AbortError') return; } }
    await kopiuj(url);
  }
  async function kopiuj(t) {
    try { await navigator.clipboard.writeText(t); App.ui.toast('Skopiowano link'); }
    catch (e) { const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); App.ui.toast('Skopiowano link'); } catch (e2) { App.ui.toast('Zaznacz link i skopiuj ręcznie'); } ta.remove(); }
  }

  async function qr(el, text) {
    try {
      const Z = await window.Skaner.loadZXing();
      const svg = new Z.BrowserQRCodeSvgWriter().write(text, 260, 260);
      svg.setAttribute('style', 'background:#fff;border-radius:12px;max-width:100%;height:auto'); svg.setAttribute('viewBox', '0 0 260 260');
      el.innerHTML = ''; el.appendChild(svg);
    } catch (e) { el.innerHTML = '<p class="muted">Kod QR niedostępny – link jest za długi albo brak czytnika. Wyślij link.</p>'; }
  }

  async function render(el) {
    const c = await cfg();
    const tokLokalny = await DB.local('udostepnijToken').catch(() => null);
    const tokSync = await DB.local('ghSync').catch(() => null);
    const dane = await spis(c, c.okladki);
    const kod = await koduj(dane);
    const link = baza() + 'kolekcja.html#k=' + kod;
    const stały = c.gistId ? baza() + 'kolekcja.html#g=' + c.gistId : null;
    const nG = dane.g.length, nK = dane.k.reduce((a, s) => a + (s[1] ? s[1].split(',').reduce((x, r) => { const [p, q] = r.split('-').map(Number); return x + (q ? q - p + 1 : 1); }, 0) : 0) + s[2].length, 0);
    const opcja = (k, l) => `<label class="row" style="gap:8px"><input type="checkbox" data-o="${k}" ${c[k] ? 'checked' : ''}> ${l}</label>`;
    el.innerHTML = `<h1>Udostępnij kolekcję</h1>
      <p class="muted" style="max-width:720px">Znajomi dostają link do strony, na której widzą Twoje gry i komiksy i mogą poprosić o pożyczenie. Nie mogą niczego zmienić ani zobaczyć Twoich notatek, cen, kodów, półek, graczy czy tokenów.</p>
      <div class="card" style="max-width:760px">
        <h3 style="margin-top:0">Co pokazać</h3>
        <label><span>Nazwa na stronie</span><input id="udn" value="${esc(c.nazwa)}" maxlength="60"></label>
        <div style="display:grid;gap:6px;margin-top:10px">
          ${opcja('komiksy', 'Komiksy (serie i numery tomów)')}
          ${opcja('oceny', 'Moje oceny gier')}
          ${opcja('partie', 'Liczba rozegranych partii')}
          ${opcja('sprzedaz', 'Oznaczenie „na sprzedaż”')}
          ${opcja('pozyczone', 'Oznaczenie „teraz pożyczona” (bez imienia osoby)')}
          ${opcja('wishlist', 'Lista życzeń (np. przed urodzinami)')}
          ${opcja('okladki', 'Okładki gier w „linku z danymi” (link robi się dużo dłuższy)')}
        </div>
        <p class="muted" style="font-size:13px;margin-bottom:0">W spisie: ${nG} gier i dodatków${c.komiksy ? `, ${nK} komiksów w ${dane.k.length} seriach` : ''}. <a href="${esc(link)}" target="_blank" rel="noopener">Podgląd strony ↗</a></p>
      </div>
      <div class="card" style="max-width:760px">
        <h3 style="margin-top:0">1. Link z danymi <span class="chip">bez konfiguracji</span></h3>
        <p class="muted" style="font-size:13px">Spis jest zapisany w samym linku (część po „#” nie trafia na żaden serwer). To zdjęcie kolekcji z dziś – po zmianach wyślij link jeszcze raz. Długość: ${link.length.toLocaleString('pl-PL')} znaków.</p>
        <div class="row"><button class="primary" id="udsh">📤 Wyślij link</button><button id="udcp">Kopiuj link</button></div>
      </div>
      <div class="card" style="max-width:760px">
        <h3 style="margin-top:0">2. Stały link <span class="chip">aktualizuje się sam</span></h3>
        ${stały ? `<p>Link działa od ${App.ui.fmtDate(c.gistAt)}${c.gistAt ? ', ostatnia aktualizacja ' + new Date(c.gistAt).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' }) : ''}.</p>
          <div id="udqr" style="width:200px;margin:8px 0"></div>
          <div class="row"><button class="primary" id="udsh2">📤 Wyślij stały link</button><button id="udcp2">Kopiuj</button><button id="udup">↻ Aktualizuj teraz</button><button class="ghost danger" id="udoff">Wyłącz link</button></div>
          ${opcja('auto', 'Aktualizuj sam po zmianach w kolekcji (najwyżej co 6 godzin)')}`
        : `<p class="muted" style="font-size:13px">Spis trafia do sekretnego Gista na GitHubie – widzi go tylko ten, kto ma link, a strona sama pokazuje aktualny stan. Link można w każdej chwili wyłączyć (Gist zostaje usunięty).</p>
          <p class="muted" style="font-size:13px">Potrzebny token GitHub z uprawnieniem <b>Gists: Read and write</b> (github.com → Settings → Developer settings → Fine-grained tokens → Account permissions → Gists). ${tokSync && tokSync.token ? 'Najpierw spróbuję tokenu z synchronizacji.' : ''}</p>
          <div class="row"><button class="primary" id="udon">Włącz stały link</button></div>`}
        <details style="margin-top:10px"><summary class="muted">Token tylko do udostępniania ${tokLokalny ? '(zapisany na tym urządzeniu)' : ''}</summary>
          <p class="muted" style="font-size:13px">Token zostaje tylko na tym urządzeniu i jest wysyłany wyłącznie do api.github.com.</p>
          <div class="row"><input type="password" id="udtok" placeholder="github_pat_…" autocomplete="off" style="flex:1;min-width:200px"><button id="udtoks">Zapisz</button>${tokLokalny ? '<button class="ghost" id="udtokx">Usuń</button>' : ''}</div></details>
      </div>`;
    const $ = s => el.querySelector(s);
    el.querySelectorAll('[data-o]').forEach(i => i.onchange = async () => { const n = await cfg(); n[i.dataset.o] = i.checked; await zapiszCfg(n); if (n.gistId) n.hash = null, await zapiszCfg(n); App.refresh(); });
    $('#udn').onchange = async () => { const n = await cfg(); n.nazwa = $('#udn').value.trim() || DOMYSLNE.nazwa; await zapiszCfg(n); App.refresh(); };
    $('#udsh').onclick = () => udostepnijLink(link, c.nazwa);
    $('#udcp').onclick = () => kopiuj(link);
    const run = async (btn, fn, ok) => { btn.disabled = true; try { await fn(); if (ok) App.ui.toast(ok); App.refresh(); } catch (e) { App.ui.toast(e, 5000); btn.disabled = false; } };
    if (stały) {
      qr($('#udqr'), stały);
      $('#udsh2').onclick = () => udostepnijLink(stały, c.nazwa);
      $('#udcp2').onclick = () => kopiuj(stały);
      $('#udup').onclick = e => run(e.target, () => opublikuj(true), 'Zaktualizowano stały link');
      $('#udoff').onclick = async e => { if (await App.ui.confirm('Wyłączyć stały link? Znajomi, którzy go mają, przestaną widzieć kolekcję.', { ok: 'Wyłącz' })) run(e.target, wylaczGist, 'Link wyłączony'); };
    } else $('#udon').onclick = e => run(e.target, () => opublikuj(true), 'Stały link gotowy');
    $('#udtoks').onclick = async () => { const t = $('#udtok').value.trim(); if (!t) return; await DB.local('udostepnijToken', t); App.ui.toast('Zapisano token na tym urządzeniu'); App.refresh(); };
    const x = $('#udtokx'); if (x) x.onclick = async () => { await DB.local('udostepnijToken', null); App.refresh(); };
  }

  App.provide('udostepnij.spis', async () => spis(await cfg(), false));
  App.provide('udostepnij.koduj', koduj);
  App.registerModule({ id: 'udostepnij', title: 'Udostępnij kolekcję', icon: '🔗', order: 56, render });
})();
