/* Synchronizacja przez wspólny plik JSON (np. w folderze OneDrive).
 * Komputer (Chrome/Edge): aplikacja pamięta plik „kolekcja.json” w folderze OneDrive i sama
 *   go czyta i zapisuje (scalanie rekord po rekordzie – wygrywa nowsza zmiana).
 * Android: „Zapisz kopię” (udostępnij do OneDrive) i „Wczytaj z pliku” (wybór pliku z OneDrive).
 */
(function () {
  const hasFS = 'showSaveFilePicker' in window;
  let timer = null, busy = false;

  async function getHandle() { try { return await DB.local('syncHandle'); } catch (e) { return null; } }

  async function permitted(h, ask) {
    const o = { mode: 'readwrite' };
    if ((await h.queryPermission(o)) === 'granted') return true;
    if (ask && (await h.requestPermission(o)) === 'granted') return true;
    return false;
  }

  async function syncWithFile(ask) {
    if (busy) return;
    const h = await getHandle();
    if (!h) return;
    if (!(await permitted(h, ask))) { setStatus('Kliknij „Synchronizuj”, żeby zezwolić na dostęp do pliku'); return; }
    busy = true;
    try {
      const f = await h.getFile();
      const txt = await f.text();
      let changed = 0;
      if (txt.trim()) changed = await DB.mergeAll(JSON.parse(txt));
      const dump = await DB.exportAll();
      const w = await h.createWritable();
      await w.write(JSON.stringify(dump));
      await w.close();
      await DB.local('lastSync', new Date().toISOString());
      setStatus('Zsynchronizowano ' + new Date().toLocaleTimeString('pl-PL'));
      if (changed) App.refresh();
      return changed;
    } catch (e) { console.error(e); setStatus('Błąd synchronizacji: ' + e.message); }
    finally { busy = false; }
  }

  function setStatus(t) { const el = document.getElementById('syncStatus'); if (el) el.textContent = t; }

  const Sync = {
    hasFS,
    async chooseFile() {
      const h = await window.showSaveFilePicker({ suggestedName: 'kolekcja.json', types: [{ description: 'Kolekcja', accept: { 'application/json': ['.json'] } }] });
      await DB.local('syncHandle', h);
      return syncWithFile(true);
    },
    async openExisting() {
      const [h] = await window.showOpenFilePicker({ types: [{ description: 'Kolekcja', accept: { 'application/json': ['.json'] } }] });
      await DB.local('syncHandle', h);
      return syncWithFile(true);
    },
    async forget() { await DB.local('syncHandle', null); },
    now: () => syncWithFile(true),
    async fileName() { const h = await getHandle(); return h ? h.name : null; },
    async exportFile() {
      const dump = await DB.exportAll();
      const blob = new Blob([JSON.stringify(dump)], { type: 'application/json' });
      const file = new File([blob], 'kolekcja.json', { type: 'application/json' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: 'Kopia kolekcji' }); return; } catch (e) { if (e.name === 'AbortError') return; }
      }
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'kolekcja.json'; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    },
    async importFile(file) {
      const dump = JSON.parse(await file.text());
      const n = await DB.mergeAll(dump);
      App.refresh();
      return n;
    }
  };
  window.Sync = Sync;

  // Automatycznie: przy starcie, po zmianach (z opóźnieniem) i co 5 min.
  DB.on('*', () => { clearTimeout(timer); timer = setTimeout(() => syncWithFile(false), 4000); });
  window.addEventListener('load', () => setTimeout(() => syncWithFile(false), 1500));
  setInterval(() => syncWithFile(false), 5 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncWithFile(false); });

  // Zakładka „Ustawienia”
  App.registerModule({
    id: 'ustawienia', title: 'Ustawienia', icon: '⚙️', order: 900,
    async render(el, p, { ui }) {
      const name = await Sync.fileName();
      const last = await DB.local('lastSync');
      el.innerHTML = `
        <h2>Synchronizacja</h2>
        <div class="card">
          <p>Dane są zapisane w tym urządzeniu i działają bez internetu. Żeby mieć to samo na komputerze i telefonie, aplikacja używa jednego pliku <b>kolekcja.json</b> w folderze OneDrive.</p>
          ${hasFS ? `
            <p>Plik synchronizacji: <b>${name ? ui.esc(name) : 'nie wybrano'}</b>${last ? ` · ostatnio ${ui.fmtDate(last)} ${new Date(last).toLocaleTimeString('pl-PL')}` : ''}</p>
            <p class="row">
              <button class="primary" id="sNow" ${name ? '' : 'disabled'}>Synchronizuj teraz</button>
              <button id="sNew">Utwórz plik w OneDrive…</button>
              <button id="sOpen">Wskaż istniejący plik…</button>
            </p>
            <p class="muted">Komputer: wybierz folder OneDrive na dysku. Aplikacja sama zapisuje zmiany co kilka sekund.</p>` : `
            <p class="muted">Na telefonie: „Zapisz kopię” i wybierz OneDrive. Na drugim urządzeniu „Wczytaj z pliku” i wybierz ten plik z OneDrive. Zmiany są scalane, nic nie ginie.</p>`}
          <p class="row">
            <button id="sExp">Zapisz kopię (eksport)</button>
            <label class="btn">Wczytaj z pliku<input type="file" id="sImp" accept=".json,application/json" hidden></label>
          </p>
          <p id="syncStatus" class="muted"></p>
        </div>
        <h2>O aplikacji</h2>
        <div class="card"><p>Moje kolekcje · wersja 0.1. Dane: ${(await Promise.all(DB.STORES.filter(s => s !== 'settings').map(async s => s + ': ' + (await DB.all(s)).length))).join(', ')}</p></div>`;
      const $ = s => el.querySelector(s);
      if (hasFS) {
        $('#sNow').onclick = () => Sync.now();
        $('#sNew').onclick = async () => { try { await Sync.chooseFile(); App.refresh(); } catch (e) { if (e.name !== 'AbortError') ui.toast(e.message); } };
        $('#sOpen').onclick = async () => { try { await Sync.openExisting(); App.refresh(); } catch (e) { if (e.name !== 'AbortError') ui.toast(e.message); } };
      }
      $('#sExp').onclick = () => Sync.exportFile();
      $('#sImp').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { const n = await Sync.importFile(f); ui.toast('Wczytano, zmienionych rekordów: ' + n); } catch (err) { ui.toast('Błąd pliku: ' + err.message); } };
    }
  });
})();
