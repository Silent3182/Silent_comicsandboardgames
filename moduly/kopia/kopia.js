/* Moduł „Kopie zapasowe”: automatyczne kopie całej kolekcji, niezależne od synchronizacji przez GitHub.
 *  - Komputer (Chrome/Edge): kopie z datą w wybranym folderze (np. OneDrive\Marcin - apka\Kopie) – OneDrive sam je wysyła do chmury.
 *  - Telefon (APK): kopie w pamięci telefonu (Dokumenty/MojeKolekcje) + przypomnienie, żeby raz w tygodniu wysłać kopię do OneDrive.
 *  - Wszędzie: ostatnie 7 kopii także w pamięci aplikacji (ochrona przed błędną synchronizacją).
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
      if (native()) { if (await doTelefonu(dump, c.keep)) gdzie = 'w telefonie (' + (await DB.local('kopiaGdzie')) + ')'; }
      else if (hasDir) {
        const h = await dirHandle();
        if (h) {
          if (await permitted(h, ask)) { await doFolderu(h, dump, c.keep); gdzie = 'w folderze „' + h.name + '”'; }
          else { pokazPasek(); gdzie = null; }
        }
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
    $('#kpPlik').onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      try { pytaj(JSON.parse(await f.text()), 'pliku ' + f.name); } catch (err) { App.ui.toast('Błąd pliku: ' + err.message, 4000); }
    };
  }

  App.registerModule({ id: 'kopie', title: 'Kopie zapasowe', icon: '💾', order: 910, render });
  window.addEventListener('load', () => setTimeout(sprawdz, 8000));
  setInterval(sprawdz, 60 * 60 * 1000);
})();
