/* Test całej aplikacji „Moje kolekcje” – uruchamiany przed każdym scaleniem i wydaniem.
 *   node testy/test-aplikacji.js            (wymaga Playwright z Chromium)
 * Sprawdza:
 *   1. pliki: składnia JS, skrypty z index.html istnieją, każdy plik modułu jest w sw.js (offline),
 *      każda kolekcja bazy używana w kodzie jest w STORES (core/db.js), podpis APK w workflow
 *   2. wszystkie zakładki (telefon i komputer): bez błędów JS, bez „Błąd modułu”, bez brakujących plików
 *   3. tryb offline: po pierwszym otwarciu aplikacja działa bez internetu, wszystkie zakładki
 *   4. baza: zapis, odczyt, usunięcie, eksport i scalanie
 *   5. synchronizacja: dwa urządzenia przez (udawane) repozytorium GitHub – zmiany i usunięcia przechodzą
 *   6. komunikaty: błędy pokazują się po polsku w okienku aplikacji, nigdy jako systemowe okno przeglądarki
 * Kod wyjścia 0 = wszystko dobrze. Zewnętrzne adresy (okładki, BGG, Egmont) są blokowane – test nie zależy od sieci.
 */
const fs = require('fs'), path = require('path'), http = require('http'), { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const PORT = 8000 + Math.floor(Math.random() * 900);
const BASE = `http://localhost:${PORT}/`;
let fails = 0, oks = 0;
const ok = (cond, msg, extra) => { if (cond) { oks++; console.log('  ✓ ' + msg); } else { fails++; console.log('  ✗ ' + msg + (extra ? '\n      ' + String(extra).slice(0, 600) : '')); } };
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const walk = d => fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);

/* ---------- 1. pliki ---------- */
function testPliki() {
  console.log('\n1. Pliki');
  const js = ['core', 'moduly'].flatMap(walk).filter(f => f.endsWith('.js') && !f.includes('narzedzia'));
  const bad = [];
  for (const f of js) { try { execFileSync(process.execPath, ['--check', path.join(ROOT, f)], { stdio: 'pipe' }); } catch (e) { bad.push(f + ': ' + e.stderr.toString().split('\n').slice(0, 4).join(' ')); } }
  ok(!bad.length, `składnia JS (${js.length} plików)`, bad.join('\n      '));

  const html = read('index.html');
  const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
  const missing = scripts.filter(s => !fs.existsSync(path.join(ROOT, s)));
  ok(!missing.length, `skrypty z index.html istnieją (${scripts.length})`, missing.join(', '));
  const dup = scripts.filter((s, i) => scripts.indexOf(s) !== i);
  ok(!dup.length, 'brak podwójnie dołączonych skryptów', dup.join(', '));

  const sw = read('sw.js');
  const files = [...sw.slice(sw.indexOf('FILES'), sw.indexOf('];')).matchAll(/'([^']+)'/g)].map(m => m[1]).filter(f => f !== './');
  const swMissing = files.filter(f => !fs.existsSync(path.join(ROOT, f)));
  ok(!swMissing.length, `pliki z listy offline (sw.js) istnieją (${files.length})`, swMissing.join(', '));
  const notOffline = js.map(f => f.split(path.sep).join('/')).filter(f => !files.includes(f) && !/demo/.test(f));
  ok(!notOffline.length, 'każdy plik modułu jest na liście offline w sw.js', notOffline.join(', '));
  const notLoaded = scripts.filter(s => !files.includes(s));
  ok(!notLoaded.length, 'każdy skrypt z index.html działa offline', notLoaded.join(', '));

  const stores = JSON.parse(read('core/db.js').match(/const STORES = (\[[^\]]+\])/)[1].replace(/'/g, '"'));
  const used = new Set();
  for (const f of js) for (const m of read(f).matchAll(/DB\.(?:all|get|put|putMany|remove)\(\s*'([A-Za-z]+)'/g)) used.add(m[1]);
  const noStore = [...used].filter(s => !stores.includes(s));
  ok(!noStore.length, `kolekcje bazy używane w kodzie są w STORES (${[...used].join(', ')})`, noStore.join(', '));

  const sys = [];
  for (const f of js) if (!f.endsWith('app.js') && !f.includes('zxing')) read(f).split('\n').forEach((l, i) => { if (/(^|[^.\w])(window\.)?(alert|confirm|prompt)\s*\(/.test(l) && !/ui\.(confirm|prompt)|\.confirm\(/.test(l)) sys.push(f + ':' + (i + 1)); });
  ok(!sys.length, 'brak systemowych okienek alert/confirm/prompt w modułach (używaj App.ui.toast / App.ui.confirm)', sys.join(', '));

  ok(read('moduly/komiksy/komiksy.js').includes('okładki ze startowych danych'), 'komiksy.js: blok „okładki ze startowych danych” (ensureSeed) jest na miejscu');
  const wf = read('.github/workflows/apk.yml');
  ok(wf.includes('android-build/klucz.keystore') && wf.includes('Zły podpis APK') && fs.existsSync(path.join(ROOT, 'android-build/klucz.keystore')), 'APK podpisywane stałym kluczem z repo (z kontrolą podpisu)');
  try { JSON.parse(read('manifest.webmanifest')); ok(true, 'manifest.webmanifest to poprawny JSON'); } catch (e) { ok(false, 'manifest.webmanifest to poprawny JSON', e.message); }
  for (const f of fs.readdirSync(ROOT).filter(f => f.endsWith('.json'))) { try { JSON.parse(read(f)); ok(true, f + ' to poprawny JSON'); } catch (e) { ok(false, f + ' to poprawny JSON', e.message); } }
}

/* ---------- serwer ---------- */
const TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const served404 = [];
const server = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, path.normalize(p));
  if (!f.startsWith(ROOT)) { r.writeHead(403); r.end(); return; }
  fs.readFile(f, (e, d) => { if (e) { served404.push(p); r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(d); });
});

/* Udawane repozytorium GitHub (api.github.com/repos/.../contents/...) – wspólne dla „urządzeń” */
const fakeGH = { content: null, sha: null, n: 0, puts: 0 };
async function routeExternal(ctx) {
  await ctx.route(u => !u.href.startsWith(BASE) && !u.href.startsWith('data:') && !u.href.startsWith('blob:'), async route => {
    const req = route.request(), url = req.url();
    if (url.startsWith('https://api.github.com/repos/')) {
      if (req.method() === 'GET') {
        if (!fakeGH.content) return route.fulfill({ status: 404, body: '{}' });
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sha: fakeGH.sha, encoding: 'base64', content: fakeGH.content }) });
      }
      if (req.method() === 'PUT') {
        const b = JSON.parse(req.postData());
        if ((b.sha || null) !== fakeGH.sha) return route.fulfill({ status: 409, body: '{}' });
        fakeGH.content = b.content; fakeGH.sha = 'sha' + (++fakeGH.n); fakeGH.puts++;
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: { sha: fakeGH.sha } }) });
      }
    }
    return route.abort('internetdisconnected');
  });
}

function watch(page, errs) {
  page.on('pageerror', e => errs.push('błąd JS: ' + e.message));
  page.on('dialog', d => { errs.push('systemowe okienko przeglądarki: ' + d.message()); d.dismiss().catch(() => {}); });
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_INTERNET_DISCONNECTED|net::ERR/.test(m.text())) errs.push('konsola: ' + m.text()); });
}
async function tabs(page) { return page.evaluate(() => [...new Set([...document.querySelectorAll('#nav button[data-id]')].map(b => b.dataset.id))]); }
async function visitAll(page, errs, label) {
  const ids = await tabs(page);
  const bad = [];
  for (const id of ids) {
    const n = errs.length;
    await page.evaluate(id => App.go(id), id);
    await page.waitForTimeout(700);
    const t = await page.evaluate(() => { const m = document.querySelector('#main'); return m ? m.innerText : ''; });
    if (/Błąd modułu|Nie udało się otworzyć zakładki/.test(t) || !t.trim() || errs.length > n) bad.push(id + ': ' + (errs.slice(n).join(' | ') || t.slice(0, 150)));
  }
  ok(ids.length >= 5 && !bad.length, `${label}: wszystkie zakładki działają (${ids.join(', ')})`, bad.join('\n      '));
  return ids;
}

async function main() {
  testPliki();
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch();
  try {
    /* ---------- 2. zakładki ---------- */
    console.log('\n2. Zakładki');
    for (const [label, vp] of [['telefon', { width: 400, height: 860 }], ['komputer', { width: 1366, height: 860 }]]) {
      const ctx = await browser.newContext({ viewport: vp, hasTouch: label === 'telefon' }); await routeExternal(ctx);
      const page = await ctx.newPage(); const errs = []; watch(page, errs);
      await page.goto(BASE); await page.waitForTimeout(2500);
      ok(!errs.length, `${label}: start bez błędów`, errs.join('\n      '));
      await visitAll(page, errs, label);
      if (label === 'telefon') {
        const more = await page.$('#nav .more');
        if (more) { await more.click(); ok(await page.evaluate(() => document.getElementById('nav').classList.contains('open')), 'telefon: „Więcej” otwiera menu'); }
      }
      await ctx.close();
    }
    ok(!served404.length, 'brak brakujących plików (404)', [...new Set(served404)].join(', '));

    /* ---------- 3. offline ---------- */
    console.log('\n3. Offline');
    {
      const ctx = await browser.newContext({ viewport: { width: 400, height: 860 } }); await routeExternal(ctx);
      const page = await ctx.newPage(); const errs = []; watch(page, errs);
      await page.goto(BASE); await page.waitForTimeout(1500);
      await page.evaluate(() => navigator.serviceWorker.ready);
      const ids = await tabs(page);
      for (const id of ids) { await page.evaluate(id => App.go(id), id); await page.waitForTimeout(400); } // leniwe dane trafiają do pamięci
      await page.waitForTimeout(1500);
      await ctx.setOffline(true);
      await page.reload(); await page.waitForTimeout(2500);
      ok(await page.evaluate(() => !!window.App && !!navigator.serviceWorker.controller), 'aplikacja otwiera się bez internetu');
      errs.length = 0;
      await visitAll(page, errs, 'offline');
      await ctx.close();
    }

    /* ---------- 4. baza ---------- */
    console.log('\n4. Baza danych');
    {
      const ctx = await browser.newContext(); await routeExternal(ctx);
      const page = await ctx.newPage(); const errs = []; watch(page, errs);
      await page.goto(BASE); await page.waitForTimeout(2000);
      const r = await page.evaluate(async () => {
        const g = await DB.put('games', { name: 'Gra testowa', test: true });
        const got = await DB.get('games', g.id);
        await DB.remove('games', g.id);
        const vis = (await DB.all('games')).some(x => x.id === g.id);
        const dump = await DB.exportAll();
        const dead = dump.data.games.find(x => x.id === g.id);
        return { saved: got && got.name === 'Gra testowa', hidden: !vis, tomb: !!(dead && dead.deleted), stores: Object.keys(dump.data) };
      });
      ok(r.saved && r.hidden && r.tomb, 'zapis, odczyt i usunięcie (z nagrobkiem dla synchronizacji)', JSON.stringify(r));
      ok(r.stores.length >= 9, `eksport obejmuje wszystkie kolekcje (${r.stores.length})`);
      // dane startowe komiksów i MRO wczytują się
      await page.evaluate(() => App.go('komiksy')); await page.waitForTimeout(3000);
      await page.evaluate(() => App.go('czytanie')); await page.waitForTimeout(3000);
      const c = await page.evaluate(async () => ({ comics: (await DB.all('comics')).length, mro: window.MRO_DANE ? MRO_DANE.p.length : 0, games: (await DB.all('games')).length }));
      ok(c.comics > 100 && c.mro > 1000 && c.games > 100, `dane startowe: ${c.games} gier, ${c.comics} komiksów, ${c.mro} pozycji MRO`, JSON.stringify(c));
      // Do czytania: odznaczenie „przeczytane” nie przewija listy na górę
      await page.evaluate(() => App.go('czytanie', { v: 'all' })); await page.waitForTimeout(3000);
      const sc = await page.evaluate(async () => {
        for (let k = 0; k < 20 && !document.querySelector('#czbody .kx-row[data-i]'); k++) await new Promise(r => setTimeout(r, 500));
        const rows = [...document.querySelectorAll('#czbody .kx-row[data-i]')]; const row = rows[Math.min(60, rows.length - 1)];
        if (!row) return { brak: true, html: (document.getElementById('czbody') || document.body).innerText.slice(0, 200) };
        const bylo = row.classList.contains('read');
        row.scrollIntoView({ block: 'center' }); await new Promise(r => setTimeout(r, 300));
        const main = document.getElementById('main'), przed = [window.scrollY, main.scrollTop], i = row.dataset.i;
        row.querySelector('input[type=checkbox]').click(); await new Promise(r => setTimeout(r, 1200));
        const po = [window.scrollY, main.scrollTop], r2 = document.querySelector(`#czbody .kx-row[data-i="${i}"]`);
        return { przed, po, tenSam: r2 === row, zielony: r2 && r2.classList.contains('read') !== bylo, zapisany: !!(await DB.all('readingOrder')).find(o => o.read === !bylo && o.order === +i + 1) };
      });
      ok(!sc.brak && sc.tenSam && sc.zielony && sc.zapisany && sc.przed[0] === sc.po[0] && sc.przed[1] === sc.po[1] && (sc.przed[0] + sc.przed[1]) > 0,
        'Do czytania: odznaczenie przeczytanego zostaje w miejscu (bez przewijania na górę) i zapisuje się', JSON.stringify(sc));
      ok(!errs.length, 'bez błędów w konsoli', errs.join('\n      '));
      await ctx.close();
    }

    /* ---------- 5. synchronizacja ---------- */
    console.log('\n5. Synchronizacja (GitHub, dwa urządzenia)');
    {
      const dev = async () => { const ctx = await browser.newContext(); await routeExternal(ctx); const p = await ctx.newPage(); const errs = []; watch(p, errs); await p.goto(BASE); await p.waitForTimeout(2000);
        await p.evaluate(() => Sync.github.set({ repo: 'test/kolekcja-dane', token: 'x', path: 'kolekcja.json' })); return { ctx, p, errs }; };
      const A = await dev(), B = await dev();
      const sync = d => d.p.evaluate(() => Sync.github.sync());
      const id = await A.p.evaluate(async () => (await DB.put('shoppingList', { title: 'Test synchronizacji', test: true })).id);
      await sync(A); await sync(B);
      ok(await B.p.evaluate(async id => !!(await DB.get('shoppingList', id)), id), 'zmiana z telefonu widoczna na komputerze');
      await B.p.evaluate(async id => { await new Promise(r => setTimeout(r, 5)); await DB.remove('shoppingList', id); }, id);
      await sync(B); await sync(A);
      ok(await A.p.evaluate(async id => !(await DB.all('shoppingList')).some(x => x.id === id), id), 'usunięcie na komputerze znika też na telefonie');
      ok(fakeGH.puts >= 2, `zapisy do repozytorium: ${fakeGH.puts}`);
      ok(!A.errs.length && !B.errs.length, 'bez błędów w konsoli', A.errs.concat(B.errs).join('\n      '));
      await A.ctx.close(); await B.ctx.close();
    }

    /* ---------- 6. komunikaty ---------- */
    console.log('\n6. Komunikaty o błędach (po polsku, w aplikacji)');
    {
      const ctx = await browser.newContext({ viewport: { width: 400, height: 860 } }); await routeExternal(ctx);
      const page = await ctx.newPage(); let native = 0; page.on('dialog', d => { native++; d.dismiss().catch(() => {}); });
      await page.goto(BASE); await page.waitForTimeout(2000);
      const k = await page.evaluate(() => { const K = App.ui.komunikat; return {
        typ: K(new TypeError("Cannot read properties of undefined (reading 'x')")),
        siec: K(new TypeError('Failed to fetch')),
        anul: K(Object.assign(new Error('The user aborted a request.'), { name: 'AbortError' })),
        plik: K('Błąd pliku: Unexpected token < in JSON at position 0'),
        aparat: K(Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' })),
        miejsce: K(Object.assign(new Error('The quota has been exceeded.'), { name: 'QuotaExceededError' })),
        pl: K('Dodano do listy zakupów'), pl2: K('To jest gra dla 2 osób') }; });
      const PLR = /[ąćęłńóśźż]/i;
      ok(PLR.test(k.typ) && !/Cannot/.test(k.typ), 'błąd programu → „' + k.typ + '”');
      ok(/internet/.test(k.siec), 'brak sieci → „' + k.siec + '”');
      ok(k.anul === null, 'anulowanie (np. zamknięty wybór pliku) → bez komunikatu');
      ok(/^Błąd pliku: Nieprawidłowy format/.test(k.plik), 'zły plik → „' + k.plik + '”');
      ok(/aparat/.test(k.aparat) && /miejsca/.test(k.miejsce), 'aparat i pełna pamięć → po polsku');
      ok(k.pl === 'Dodano do listy zakupów' && k.pl2 === 'To jest gra dla 2 osób', 'polskie komunikaty bez zmian');

      // pytanie Tak/Nie w oknie aplikacji
      const p = page.evaluate(() => App.ui.confirm('Usunąć grę testową?'));
      await page.waitForSelector('dialog.dlg-pyt[open]');
      const lab = await page.textContent('dialog.dlg-pyt [value=ok]');
      await page.click('dialog.dlg-pyt [value=ok]');
      ok((await p) === true && lab === 'Tak, usuń', 'pytanie „Usunąć…?” w oknie aplikacji z przyciskiem „' + lab + '”');
      const p2 = page.evaluate(() => App.ui.confirm('Kontynuować?'));
      await page.waitForSelector('dialog.dlg-pyt[open]'); await page.click('dialog.dlg-pyt [value=cancel]');
      ok((await p2) === false, '„Anuluj” zwraca nie');

      // nieobsłużone błędy i alert → komunikat aplikacji
      const toast = () => page.evaluate(() => document.querySelector('#toast.show') ? document.getElementById('toast').textContent : '');
      await page.evaluate(() => setTimeout(() => { null.x(); }, 0)); await page.waitForTimeout(300);
      const t1 = await toast(); ok(PLR.test(t1), 'nieobsłużony wyjątek → „' + t1 + '”');
      await page.evaluate(() => { Promise.reject(new TypeError('Failed to fetch')); }); await page.waitForTimeout(300);
      const t2 = await toast(); ok(/internet/.test(t2), 'nieobsłużone zapytanie bez sieci → „' + t2 + '”');
      await page.evaluate(() => alert('Zapisano')); await page.waitForTimeout(200);
      ok((await toast()) === 'Zapisano', 'alert() pokazuje się jako komunikat aplikacji');
      await ctx.setOffline(true); await page.waitForTimeout(300);
      ok(/Brak internetu/.test(await toast()), 'utrata internetu → komunikat');
      await ctx.setOffline(false);

      // synchronizacja z błędnym kluczem
      await page.route('https://api.github.com/**', r => r.fulfill({ status: 401, body: '{}' }));
      await page.evaluate(() => Sync.github.set({ repo: 'test/x', token: 'zly', path: 'kolekcja.json' }));
      const sErr = await page.evaluate(() => Sync.github.sync().then(() => '', e => App.ui.komunikat(e)));
      ok(/klucza/.test(sErr), 'zły token GitHub → „' + sErr + '”');

      // zakładka, która się wywraca → komunikat z przyciskiem „Spróbuj ponownie”
      await page.evaluate(() => { App.registerModule({ id: 'zepsuta', title: 'Zepsuta', order: 999, render() { throw new TypeError("Cannot read properties of undefined (reading 'a')"); } }); App.go('zepsuta'); });
      await page.waitForTimeout(400);
      const zt = await page.textContent('#main');
      ok(/Nie udało się otworzyć zakładki/.test(zt) && !/Cannot read/.test(zt) && await page.$('#main div.err button'), 'zepsuta zakładka → polski komunikat i „Spróbuj ponownie”');
      ok(native === 0, 'żadnego systemowego okienka przeglądarki', native + ' okienek');
      await ctx.close();
    }
  } finally { await browser.close(); server.close(); }
  console.log(`\n${fails ? '✗ BŁĘDY' : '✓ WSZYSTKO DZIAŁA'}: ${oks} ok, ${fails} błędów`);
  process.exit(fails ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(2); });
