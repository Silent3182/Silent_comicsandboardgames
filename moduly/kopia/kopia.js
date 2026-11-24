/* Moduł „Kopie zapasowe”: automatyczne kopie całej kolekcji, niezależne od synchronizacji przez GitHub.
 *  - Komputer (Chrome/Edge): kopie z datą w wybranym folderze (np. OneDrive\Marcin - apka\Kopie) – OneDrive sam je wysyła do chmury.
 *  - Telefon (APK): kopie w pamięci telefonu (Dokumenty/MojeKolekcje) + przypomnienie, żeby raz w tygodniu wysłać kopię do OneDrive.
 *  - Wszędzie: ostatnie 7 kopii także w pamięci aplikacji (ochrona przed błędną synchronizacją).
 *  - Zdjęcia półek (moduly/polki/zdjecia.js) są tylko na urządzeniu, które je zrobiło (za duże do synchronizacji),
 *    więc kopia odkłada je osobno: komputer – podfolder „Zdjęcia półek” w folderze kopii (OneDrive), telefon –
 *    Dokumenty/MojeKolekcje/ZdjeciaPolek + plik „zdjecia-polek-….json” wysyłany do OneDrive razem z kopią.
 *    Na nowym telefonie / komputerze: „Przywróć zdjęcia półek…” (plik .json albo zdjęcia .jpg).
 * Ustawienia są lokalne dla urządzenia (DB.local), nie synchronizują się.
 */
(function () {
  const { esc } = App.ui;
  const hasDir = 'showDirectoryPicker' in window;
  const native = () => !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  const PREFIX = 'kolekcja-kopia-';
  const CO = { daily: ['codziennie', 1], weekly: ['co tydzień', 7], off: ['wyłączone', 0] };
  const DZIEN = 864e5;
  let busy = false;

  const cfg = async () => Object.assign({ freq: 'daily', keep: 30 }, (await DB.local('kopiaCfg')) || {});
  const nazwa = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${PREFIX}${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}.json`; };
  const dirHandle = async () => { try { return await DB.local('kopiaDir'); } catch (e) { return null; } };
  async function permitted(h, ask) {
    const o = { mode: 'readwrite' };
    try { if ((await h.queryPermission(o)) === 'granted') return true; if (ask && (await h.requestPermission(o)) === 'granted') return true; } catch (e) {}
    return false;
  }

  /* ---- zdjęcia półek ---- */
  const FOTO_DIR = 'Zdjęcia półek', FOTO_DIR_TEL = 'ZdjeciaPolek';
  const slug = t => String(t || 'regal').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').replace(/Ł/g, 'L').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'regal';
  const plikFoto = f => `${slug(f.polka)}_${f.data || ''}_${f.id}.jpg`;
  const idZPliku = n => { const m = /_([^_]+)\.jpe?g$/i.exec(n); return m ? m[1] : null; };
  const b64 = dataUrl => String(dataUrl).replace(/^data:[^,]*,/, '');
  /* Wszystkie zdjęcia półek opisane w regałach: {id, polka, data, obraz (dataURL albo null, gdy zrobione na innym urządzeniu)} */
  async function zdjeciaPolek() {
    const out = [];
    for (const sh of await DB.all('shelves')) for (const f of sh.zdjecia || []) {
      let obraz = null; try { obraz = await DB.local('polkaFoto:' + f.id); } catch (e) { }
      out.push({ id: f.id, polka: sh.name, data: f.data, obraz: obraz || null });
    }
    return out;
  }
  async function wpiszZdjecie(id, dataUrl) {
    if (!id || !/^data:image\//.test(dataUrl || '')) return false;
    await DB.local('polkaFoto:' + id, dataUrl); return true;
  }
  const doDataUrl = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });
  /* komputer: zdjęcia do podfolderu (tylko nowe), a brakujące u siebie – z podfolderu */
  async function zdjeciaFolder(h) {
    const z = await zdjeciaPolek(); if (!z.length) return { zapisane: 0, wczytane: 0 };
    const d = await h.getDirectoryHandle(FOTO_DIR, { create: true });
    const sa = new Map();
    for await (const [n, e] of d.entries()) if (e.kind === 'file') { const id = idZPliku(n); if (id) sa.set(id, e); }
    let zapisane = 0, wczytane = 0;
    for (const f of z) {
      if (f.obraz && !sa.has(f.id)) {
        const fh = await d.getFileHandle(plikFoto(f), { create: true });
        const w = await fh.createWritable(); await w.write(await (await fetch(f.obraz)).blob()); await w.close(); zapisane++;
      } else if (!f.obraz && sa.has(f.id)) {
        if (await wpiszZdjecie(f.id, await doDataUrl(await sa.get(f.id).getFile()))) wczytane++;
      }
    }
    return { zapisane, wczytane };
  }
  /* telefon: zdjęcia do Dokumenty/MojeKolekcje/ZdjeciaPolek (tylko nowe), brakujące u siebie – stamtąd */
  async function zdjeciaTelefon() {
    const z = await zdjeciaPolek(); if (!z.length) return { zapisane: 0, wczytane: 0 };
    const { Filesystem } = window.Capacitor.Plugins;
    const directory = (await DB.local('kopiaGdzie') || '').startsWith('Dokumenty') ? 'DOCUMENTS' : 'EXTERNAL';
    const dir = 'MojeKolekcje/' + FOTO_DIR_TEL;
    try { await Filesystem.mkdir({ path: dir, directory, recursive: true }); } catch (e) { /* już jest */ }
    let sa = new Map();
    try { const { files } = await Filesystem.readdir({ path: dir, directory }); files.map(f => typeof f === 'string' ? f : f.name).forEach(n => { const id = idZPliku(n); if (id) sa.set(id, n); }); } catch (e) { }
    let zapisane = 0, wczytane = 0;
    for (const f of z) {
      if (f.obraz && !sa.has(f.id)) { await Filesystem.writeFile({ path: dir + '/' + plikFoto(f), data: b64(f.obraz), directory }); zapisane++; }
      else if (!f.obraz && sa.has(f.id)) {
        try { const r = await Filesystem.readFile({ path: dir + '/' + sa.get(f.id), directory }); if (await wpiszZdjecie(f.id, 'data:image/jpeg;base64,' + r.data)) wczytane++; } catch (e) { }
      }
    }
    return { zapisane, wczytane };
  }
  /* jeden plik ze wszystkimi zdjęciami (do OneDrive przez „Udostępnij” albo pobranie) */
  async function paczkaZdjec() {
    const z = (await zdjeciaPolek()).filter(f => f.obraz);
    return { app: 'moje-kolekcje-zdjecia', format: 1, exportedAt: new Date().toISOString(), zdjecia: z.map(f => ({ id: f.id, polka: f.polka, data: f.data, obraz: f.obraz })) };
  }
  async function wyslijZdjecia() {
    const p = await paczkaZdjec();
    if (!p.zdjecia.length) { App.ui.toast('Na tym urządzeniu nie ma zdjęć półek'); return false; }
    const d = new Date(), nazwaPliku = `zdjecia-polek-${d.toISOString().slice(0, 10)}.json`, tekst = JSON.stringify(p);
    if (native()) {
      const { Filesystem, Share } = window.Capacitor.Plugins;
      await Filesystem.writeFile({ path: nazwaPliku, data: tekst, directory: 'CACHE', encoding: 'utf8' });
      const { uri } = await Filesystem.getUri({ path: nazwaPliku, directory: 'CACHE' });
      try { await Share.share({ title: 'Zdjęcia półek', files: [uri], dialogTitle: 'Zapisz zdjęcia półek (wybierz OneDrive)' }); } catch (e) { return false; }
    } else {
      const file = new File([tekst], nazwaPliku, { type: 'application/json' });
      let ok = false;
      if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: 'Zdjęcia półek' }); ok = true; } catch (e) { if (e.name === 'AbortError') return false; } }
      if (!ok) { const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = nazwaPliku; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); }
    }
    await DB.local('zdjeciaWyslane', p.zdjecia.map(f => f.id));
    return true;
  }
  /* przywracanie: plik .json z paczką albo zdjęcia .jpg (nazwa kończy się _<id>.jpg) */
  async function przywrocZdjecia(files) {
    const znane = new Set((await zdjeciaPolek()).map(f => f.id));
    let n = 0, obce = 0;
    for (const f of files) {
      if (/\.json$/i.test(f.name) || f.type === 'application/json') {
        const p = JSON.parse(await f.text());
        if (!p || p.app !== 'moje-kolekcje-zdjecia') throw new Error('To nie jest plik ze zdjęciami półek');
        for (const z of p.zdjecia || []) { if (!znane.has(z.id)) { obce++; continue; } if (await wpiszZdjecie(z.id, z.obraz)) n++; }
      } else {
        const id = idZPliku(f.name);
        if (!id || !znane.has(id)) { obce++; continue; }
        if (await wpiszZdjecie(id, await doDataUrl(f))) n++;
      }
    }
    return { n, obce };
  }
  async function noweDoWyslania() {
    const wys = new Set((await DB.local('zdjeciaWyslane')) || []);
    return (await zdjeciaPolek()).filter(f => f.obraz && !wys.has(f.id)).length;
  }

  /* ---- kopie w pamięci aplikacji (IndexedDB lokalnie) ---- */
  async function wewn(dump) {
    const arr = (await DB.local('kopieWewn')) || [];
    arr.unshift({ at: dump.exportedAt, dump });
    await DB.local('kopieWewn', arr.slice(0, 7));
  }

  /* ---- zapis do folderu (komputer) ---- */
  async function doFolderu(h, dump, keep) {
    const f = await h.getFileHandle(nazwa(), { create: true });
    const w = await f.createWritable(); await w.write(JSON.stringify(dump)); await w.close();
    const pliki = [];
    for await (const [n, e] of h.entries()) if (e.kind === 'file' && n.startsWith(PREFIX) && n.endsWith('.json')) pliki.push(n);
    pliki.sort().reverse().slice(keep).forEach(n => h.removeEntry(n).catch(() => {}));
  }
  /* ---- zapis w telefonie (APK) ---- */
  async function doTelefonu(dump, keep) {
    const { Filesystem } = window.Capacitor.Plugins;
    for (const directory of ['DOCUMENTS', 'EXTERNAL']) {
      try {
        try { await Filesystem.mkdir({ path: 'MojeKolekcje', directory, recursive: true }); } catch (e) { /* już jest */ }
        await Filesystem.writeFile({ path: 'MojeKolekcje/' + nazwa(), data: JSON.stringify(dump), directory, encoding: 'utf8' });
        try {
          const { files } = await Filesystem.readdir({ path: 'MojeKolekcje', directory });
          files.map(f => typeof f === 'string' ? f : f.name).filter(n => n.startsWith(PREFIX)).sort().reverse().slice(keep)
            .forEach(n => Filesystem.deleteFile({ path: 'MojeKolekcje/' + n, directory }).catch(() => {}));
        } catch (e) {}
        await DB.local('kopiaGdzie', directory === 'DOCUMENTS' ? 'Dokumenty/MojeKolekcje' : 'Android/data/…/files/MojeKolekcje');
        return true;
      } catch (e) { console.warn('Kopia w telefonie (' + directory + '):', e); }
    }
    return false;
  }

  /* Zrób kopię. ask=true, gdy kliknięto (wtedy można poprosić o dostęp do folderu). Zwraca opis albo null. */
  async function zrobKopie(ask) {
    if (busy) return null;
    busy = true;
    try {
      const c = await cfg();
      const dump = await DB.exportAll();
      await wewn(dump);
      let gdzie = 'w pamięci aplikacji';
      let fz = null;
      if (native()) {
        if (await doTelefonu(dump, c.keep)) gdzie = 'w telefonie (' + (await DB.local('kopiaGdzie')) + ')';
        try { fz = await zdjeciaTelefon(); } catch (e) { console.warn('Zdjęcia półek (telefon):', e); }
      }
      else if (hasDir) {
        const h = await dirHandle();
        if (h) {
          if (await permitted(h, ask)) {
            await doFolderu(h, dump, c.keep); gdzie = 'w folderze „' + h.name + '”';
            try { fz = await zdjeciaFolder(h); } catch (e) { console.warn('Zdjęcia półek (folder):', e); }
          }
          else { pokazPasek(); gdzie = null; }
        }
      }
      if (fz && (fz.zapisane || fz.wczytane)) {
        if (gdzie) gdzie += ` + zdjęcia półek: ${fz.zapisane} nowych`;
        if (fz.wczytane) App.ui.toast(`Wczytano ${fz.wczytane} zdjęć półek z kopii`, 3500);
      }
      await DB.local('kopiaOstatnia', new Date().toISOString());
      if (gdzie) await DB.local('kopiaOstatniaGdzie', gdzie);
      return gdzie;
    } catch (e) { console.error(e); if (ask) App.ui.toast('Kopia nieudana: ' + e.message, 5000); return null; }
    finally { busy = false; }
  }

  /* Automatycznie: przy starcie i co godzinę sprawdzamy, czy czas na kolejną kopię. */
  async function sprawdz() {
    const c = await cfg();
    if (c.freq === 'off') return;
    const ost = await DB.local('kopiaOstatnia');
    const due = !ost || Date.now() - new Date(ost) > CO[c.freq][1] * DZIEN - 36e5;
    if (due) await zrobKopie(false);
    // telefon: przypomnienie o wysłaniu kopii do OneDrive raz w tygodniu
    if ((native() || !hasDir) && !(await DB.local('kopiaOneDriveNie'))) {
      const wys = await DB.local('kopiaWyslana'), odl = await DB.local('kopiaOdlozona');
      if ((!wys || Date.now() - new Date(wys) > 7 * DZIEN) && (!odl || Date.now() - new Date(odl) > DZIEN)) pokazPasek('onedrive');
    }
  }

  /* Pasek u dołu ekranu: prośba o kliknięcie (dostęp do folderu wymaga kliknięcia) albo przypomnienie o OneDrive. */
  function pokazPasek(typ) {
    if (document.getElementById('kpPasek')) return;
    const d = document.createElement('div'); d.id = 'kpPasek';
    d.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:calc(var(--nav-h,64px) + 16px);z-index:60;background:var(--surface);color:var(--text);border:1px solid var(--line);box-shadow:var(--shadow-lg);border-radius:14px;padding:10px 12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;max-width:calc(100% - 32px);font-size:14px';
    d.innerHTML = typ === 'onedrive'
      ? '<span>💾 Minął tydzień od wysłania kopii do OneDrive.</span><button class="primary small" data-a="ok">Wyślij kopię</button><button class="ghost small" data-a="later">Później</button>'
      : '<span>💾 Kopia zapasowa czeka na zapis do folderu.</span><button class="primary small" data-a="ok">Zapisz kopię</button><button class="ghost small" data-a="later">Później</button>';
    d.onclick = async e => {
      const a = e.target.dataset && e.target.dataset.a; if (!a) return;
      d.remove();
      if (a === 'later') { if (typ === 'onedrive') await DB.local('kopiaOdlozona', new Date().toISOString()); return; }
      if (typ === 'onedrive') { await wyslij(); return; }
      const g = await zrobKopie(true); if (g) App.ui.toast('Kopia zapisana ' + g);
    };
    document.body.appendChild(d);
  }
  async function wyslij() {
    await Sync.exportFile(); // okno „Udostępnij” – wybierz OneDrive
    await DB.local('kopiaWyslana', new Date().toISOString());
    // nowe zdjęcia półek od ostatniego wysłania – osobny plik, też do OneDrive
    const ile = await noweDoWyslania();
    if (ile && await App.ui.confirm(`Wysłać też zdjęcia półek do OneDrive? Nowych od ostatniego razu: ${ile}.`, { ok: 'Wyślij zdjęcia', cancel: 'Nie teraz' })) await wyslijZdjecia();
  }

  /* Przywrócenie stanu z kopii: rekordy z kopii wracają (z nową datą, żeby wygrały przy synchronizacji),
   * a rekordy, których w kopii nie było, są oznaczane jako usunięte. */
  async function przywroc(dump) {
    if (!dump || !dump.data) throw new Error('To nie jest kopia kolekcji');
    await zrobKopie(false); // na wszelki wypadek kopia obecnego stanu
    const t = new Date().toISOString();
    for (const s of DB.STORES) {
      const zKopii = dump.data[s] || [];
      const ids = new Set(zKopii.map(r => r.id));
      const lok = await DB.all(s, { withDeleted: true });
      const zmiany = zKopii.map(r => Object.assign({}, r, { updatedAt: t }))
        .concat(lok.filter(r => !ids.has(r.id) && !r.deleted).map(r => Object.assign({}, r, { deleted: true, updatedAt: t })));
      if (zmiany.length) await DB.putMany(s, zmiany, { keepDates: true });
    }
  }

  async function render(el) {
    const c = await cfg();
    const h = hasDir && !native() ? await dirHandle() : null;
    const ost = await DB.local('kopiaOstatnia'), gdzie = await DB.local('kopiaOstatniaGdzie');
    const wewnetrzne = (await DB.local('kopieWewn')) || [];
    const zdj = await zdjeciaPolek(), doWys = native() || !hasDir ? await noweDoWyslania() : 0;
    const dt = iso => new Date(iso).toLocaleString('pl-PL', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    let pliki = [];
    if (h && await permitted(h, false)) { try { for await (const [n, e] of h.entries()) if (e.kind === 'file' && n.startsWith(PREFIX)) pliki.push(n); pliki.sort().reverse(); } catch (e) {} }
    el.innerHTML = `
      <h2>Kopie zapasowe</h2>
      <div class="card">
        <p>Aplikacja sama robi kopię całej kolekcji (gry, rozgrywki, komiksy, czytanie, zakupy, ogłoszenia). To dodatek do synchronizacji przez GitHub: gdyby coś się popsuło, można wrócić do stanu z wybranego dnia.</p>
        <p class="row"><span>Jak często:</span><span class="seg">${Object.entries(CO).map(([k, [l]]) => `<button data-f="${k}" class="${c.freq === k ? 'on' : ''}">${l}</button>`).join('')}</span></p>
        <p class="muted">${ost ? `Ostatnia kopia: <b>${dt(ost)}</b>${gdzie ? ' · ' + esc(gdzie) : ''}` : 'Jeszcze nie było kopii.'}</p>
        <p class="row"><button class="primary" id="kpTeraz">Zrób kopię teraz</button></p>
      </div>
      ${native() ? `
      <h2>Telefon</h2>
      <div class="card">
        <p>Kopie trafiają do pamięci telefonu (${esc((await DB.local('kopiaGdzie')) || 'Dokumenty/MojeKolekcje')}), zostaje ${c.keep} ostatnich. Żeby były też w OneDrive, raz w tygodniu aplikacja przypomni o wysłaniu kopii – wybierz wtedy OneDrive w oknie „Udostępnij”.</p>
        <p class="row"><button id="kpWyslij">Wyślij kopię do OneDrive</button></p>
      </div>` : hasDir ? `
      <h2>Folder w OneDrive</h2>
      <div class="card">
        <p>Folder na kopie: <b>${h ? esc(h.name) : 'nie wybrano'}</b>. Zostaje ${c.keep} ostatnich plików, starsze są usuwane.</p>
        <p class="row"><button id="kpFolder">${h ? 'Zmień folder…' : 'Wybierz folder w OneDrive…'}</button>${h ? '<button class="ghost" id="kpBezFolderu">Nie zapisuj do folderu</button>' : ''}</p>
        <p class="muted">Najlepiej utwórz folder „Kopie” w OneDrive, np. w „Marcin - apka”. OneDrive sam wyśle pliki do chmury. Po ponownym uruchomieniu przeglądarki może pojawić się prośba o zgodę na zapis – wtedy kliknij „Zapisz kopię” na pasku u dołu.</p>
        ${pliki.length ? `<details><summary>Kopie w folderze (${pliki.length})</summary><div class="list" style="margin-top:8px">${pliki.map(n => `<div class="li"><div class="main"><div class="t">${esc(n.replace(PREFIX, '').replace('.json', '').replace('_', ' '))}</div></div><button class="small ghost" data-plik="${esc(n)}">Przywróć</button></div>`).join('')}</div></details>` : ''}
      </div>` : `
      <h2>OneDrive</h2>
      <div class="card"><p>W tej przeglądarce kopie zostają w pamięci aplikacji. Żeby mieć je w OneDrive, użyj „Wyślij kopię” i wybierz OneDrive.</p>
        <p class="row"><button id="kpWyslij">Wyślij kopię do OneDrive</button></p></div>`}
      ${zdj.length ? `
      <h2>Zdjęcia półek</h2>
      <div class="card">
        <p>Zdjęć regałów: <b>${zdj.length}</b>, na tym urządzeniu ${zdj.filter(f => f.obraz).length}${zdj.some(f => !f.obraz) ? ` (${zdj.filter(f => !f.obraz).length} zrobiono na innym urządzeniu)` : ''}.
          Same zdjęcia nie synchronizują się (są za duże), dlatego trafiają do kopii: ${native() ? 'w telefonie do Dokumenty/MojeKolekcje/ZdjeciaPolek, a do OneDrive przez „Wyślij zdjęcia do OneDrive” (aplikacja zapyta też przy cotygodniowym wysyłaniu kopii).' : hasDir ? (h ? `do podfolderu „${esc(FOTO_DIR)}” w folderze „${esc(h.name)}” (OneDrive), przy każdej kopii – tylko nowe.` : 'do podfolderu „Zdjęcia półek” w folderze kopii – wybierz folder powyżej.') : 'przez „Wyślij zdjęcia do OneDrive”.'}</p>
        ${doWys ? `<p class="muted">Nowych zdjęć od ostatniego wysłania: ${doWys}.</p>` : ''}
        <p class="row"><button id="kpZdjWyslij" ${zdj.some(f => f.obraz) ? '' : 'disabled'}>Wyślij zdjęcia do OneDrive</button><label class="btn">Przywróć zdjęcia półek…<input type="file" id="kpZdjPlik" accept=".json,application/json,image/jpeg" multiple hidden></label></p>
        <p class="muted">Po zmianie telefonu albo komputera: „Przywróć zdjęcia półek…” i wybierz z OneDrive plik „zdjecia-polek-….json” albo zdjęcia z folderu „${esc(FOTO_DIR)}”.${hasDir && !native() ? ' Na komputerze z wybranym folderem kopii brakujące zdjęcia wczytają się same przy kopii.' : ''}</p>
      </div>` : ''}
      <h2>Przywracanie</h2>
      <div class="card">
        <p class="muted">Przywrócenie ustawia całą kolekcję dokładnie tak, jak było w kopii (na wszystkich urządzeniach, po synchronizacji). Przed przywróceniem aplikacja zapisze kopię obecnego stanu.</p>
        ${wewnetrzne.length ? `<div class="list">${wewnetrzne.map((k, i) => `<div class="li"><div class="main"><div class="t">${dt(k.at)}</div><div class="s">kopia w pamięci aplikacji</div></div><button class="small ghost" data-wewn="${i}">Przywróć</button></div>`).join('')}</div>` : '<p class="muted">Brak kopii w pamięci aplikacji.</p>'}
        <p class="row" style="margin-top:10px"><label class="btn">Przywróć z pliku…<input type="file" id="kpPlik" accept=".json,application/json" hidden></label></p>
      </div>`;
    const $ = s => el.querySelector(s);
    el.querySelectorAll('[data-f]').forEach(b => b.onclick = async () => { await DB.local('kopiaCfg', Object.assign(c, { freq: b.dataset.f })); render(el); });
    $('#kpTeraz').onclick = async () => { const g = await zrobKopie(true); if (g) App.ui.toast('Kopia zapisana ' + g, 3500); render(el); };
    if ($('#kpWyslij')) $('#kpWyslij').onclick = async () => { await wyslij(); };
    if ($('#kpFolder')) $('#kpFolder').onclick = async () => {
      try {
        const d = await window.showDirectoryPicker({ id: 'kopie-kolekcji', mode: 'readwrite', startIn: 'documents' });
        await DB.local('kopiaDir', d);
        const g = await zrobKopie(true); if (g) App.ui.toast('Kopia zapisana ' + g, 3500);
        render(el);
      } catch (e) { if (e.name !== 'AbortError') App.ui.toast(e.message, 4000); }
    };
    if ($('#kpBezFolderu')) $('#kpBezFolderu').onclick = async () => { await DB.local('kopiaDir', null); render(el); };
    const pytaj = async (dump, opis) => {
      if (!(await App.ui.confirm(`Przywrócić kolekcję do stanu z ${opis}? Zmiany zrobione później zostaną cofnięte (obecny stan trafi do kopii).`))) return;
      try { await przywroc(dump); App.ui.toast('Przywrócono stan z ' + opis, 4000); App.refresh(); } catch (e) { App.ui.toast('Nie udało się: ' + e.message, 5000); }
    };
    el.querySelectorAll('[data-wewn]').forEach(b => b.onclick = () => { const k = wewnetrzne[+b.dataset.wewn]; pytaj(k.dump, dt(k.at)); });
    el.querySelectorAll('[data-plik]').forEach(b => b.onclick = async () => {
      try { const f = await (await h.getFileHandle(b.dataset.plik)).getFile(); pytaj(JSON.parse(await f.text()), b.dataset.plik.replace(PREFIX, '').replace('.json', '').replace('_', ' ')); }
      catch (e) { App.ui.toast('Błąd pliku: ' + e.message, 4000); }
    });
    if ($('#kpZdjWyslij')) $('#kpZdjWyslij').onclick = async () => { try { if (await wyslijZdjecia()) App.ui.toast('Zdjęcia półek wysłane'); render(el); } catch (e) { App.ui.toast(e); } };
    if ($('#kpZdjPlik')) $('#kpZdjPlik').onchange = async e => {
      const files = [...e.target.files]; if (!files.length) return;
      try {
        const r = await przywrocZdjecia(files);
        App.ui.toast(r.n ? `Przywrócono ${r.n} zdjęć półek` + (r.obce ? ` (${r.obce} nie pasuje do żadnego regału)` : '') : 'Żadne zdjęcie nie pasuje do regałów w aplikacji', 4500);
        render(el);
      } catch (err) { App.ui.toast('Błąd pliku: ' + (App.ui.komunikat(err) || ''), 4500); }
    };
    $('#kpPlik').onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      try { pytaj(JSON.parse(await f.text()), 'pliku ' + f.name); } catch (err) { App.ui.toast('Błąd pliku: ' + err.message, 4000); }
    };
  }

  App.provide('kopia.zdjecia', () => ({ zdjeciaPolek, paczkaZdjec, przywrocZdjecia, wyslijZdjecia })); // też do testów
  App.registerModule({ id: 'kopie', title: 'Kopie zapasowe', icon: '💾', order: 910, render });
  window.addEventListener('load', () => setTimeout(sprawdz, 8000));
  setInterval(sprawdz, 60 * 60 * 1000);
})();
