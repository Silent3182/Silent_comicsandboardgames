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
    if (!(await permitted(h, ask))) { if (ask) setStatus('Kliknij „Synchronizuj”, żeby zezwolić na dostęp do pliku'); return; }
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

  /* ---------- Synchronizacja przez prywatne repozytorium GitHub ---------- */
  // Konfiguracja tylko lokalnie na urządzeniu (nie trafia do pliku synchronizacji): { repo:'owner/nazwa', token, path }
  async function ghCfg() { try { return await DB.local('ghSync'); } catch (e) { return null; } }
  const b64enc = str => { const bytes = new TextEncoder().encode(str); let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(bin); };
  const b64dec = b64 => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, '')), c => c.charCodeAt(0)));
  async function ghReq(cfg, method, body, accept) {
    const url = `https://api.github.com/repos/${cfg.repo}/contents/${encodeURIComponent(cfg.path || 'kolekcja.json')}`;
    const r = await fetch(url + (method === 'GET' ? '?ref=' + (cfg.branch || 'main') + '&t=' + Date.now() : ''), {
      method, cache: 'no-store',
      headers: { Authorization: 'Bearer ' + cfg.token, Accept: accept || 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
      body: body ? JSON.stringify(body) : undefined
    });
    return r;
  }
  async function ghRead(cfg) {
    const r = await ghReq(cfg, 'GET');
    if (r.status === 404) return { sha: null, dump: null };
    if (r.status === 401) throw new Error('GitHub nie przyjął klucza (token nieważny lub wygasł)');
    if (r.status === 403) throw new Error('Brak uprawnień do repozytorium (sprawdź ustawienia tokenu)');
    if (!r.ok) throw new Error('GitHub: błąd ' + r.status);
    const meta = await r.json();
    let txt;
    if (meta.content && meta.encoding === 'base64') txt = b64dec(meta.content);
    else { const raw = await ghReq(cfg, 'GET', null, 'application/vnd.github.raw+json'); if (!raw.ok) throw new Error('GitHub: błąd ' + raw.status); txt = await raw.text(); }
    return { sha: meta.sha, dump: txt.trim() ? JSON.parse(txt) : null };
  }
  let ghBusy = false, suppress = false;
  async function syncWithGitHub() {
    const cfg = await ghCfg();
    if (!cfg || !cfg.token || !cfg.repo || ghBusy) return;
    if (!navigator.onLine) { setStatus('Brak internetu – zsynchronizuję, gdy wróci sieć'); return; }
    ghBusy = true; suppress = true;
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const { sha, dump } = await ghRead(cfg);
        let changed = 0;
        if (dump) changed = await DB.mergeAll(dump);
        const local = await DB.exportAll();
        const same = dump && JSON.stringify(dump.data) === JSON.stringify(local.data);
        if (!same) {
          const dev = /Android/i.test(navigator.userAgent) ? 'telefon' : 'komputer';
          const r = await ghReq(cfg, 'PUT', { message: `Synchronizacja (${dev}) ${new Date().toLocaleString('pl-PL')}`, content: b64enc(JSON.stringify(local)), branch: cfg.branch || 'main', sha: sha || undefined });
          if (r.status === 409 || r.status === 422) continue; // ktoś zapisał w międzyczasie – pobierz jeszcze raz i scal
          if (!r.ok) throw new Error('GitHub: zapis nieudany (' + r.status + ')');
        }
        await DB.local('lastSync', new Date().toISOString());
        setStatus('Zsynchronizowano z GitHubem ' + new Date().toLocaleTimeString('pl-PL'));
        if (changed) App.refresh();
        return changed;
      }
      throw new Error('GitHub: nie udało się zapisać po 3 próbach');
    } catch (e) { console.error(e); setStatus('Błąd synchronizacji: ' + e.message); throw e; }
    finally { ghBusy = false; setTimeout(() => { suppress = false; }, 100); }
  }
  async function syncAll(ask) {
    try { await syncWithGitHub(); } catch (e) { if (ask) App.ui.toast(e.message, 4000); }
    await syncWithFile(ask);
  }

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
    now: () => syncAll(true),
    github: { cfg: ghCfg, sync: syncWithGitHub, async set(c) { await DB.local('ghSync', c); }, async forget() { await DB.local('ghSync', null); } },
    async fileName() { const h = await getHandle(); return h ? h.name : null; },
    async exportFile() {
      const dump = await DB.exportAll();
      const native = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
      if (native) {
        // Aplikacja z APK: zapis do pamięci podręcznej i okno „Udostępnij” (np. do OneDrive).
        const { Filesystem, Share } = window.Capacitor.Plugins;
        await Filesystem.writeFile({ path: 'kolekcja.json', data: JSON.stringify(dump), directory: 'CACHE', encoding: 'utf8' });
        const { uri } = await Filesystem.getUri({ path: 'kolekcja.json', directory: 'CACHE' });
        try { await Share.share({ title: 'Kopia kolekcji', files: [uri], dialogTitle: 'Zapisz kopię kolekcji' }); } catch (e) { /* anulowano */ }
        return;
      }
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
  DB.on('*', () => { if (suppress) return; clearTimeout(timer); timer = setTimeout(() => syncAll(false), 4000); });
  window.addEventListener('load', () => setTimeout(() => syncAll(false), 1500));
  window.addEventListener('online', () => syncAll(false));
  setInterval(() => syncAll(false), 5 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncAll(false); });

  // Zakładka „Ustawienia”
  App.registerModule({
    id: 'ustawienia', title: 'Ustawienia', icon: '⚙️', order: 900,
    async render(el, p, { ui }) {
      const name = await Sync.fileName();
      const last = await DB.local('lastSync');
      const gh = await ghCfg();
      el.innerHTML = `
        <h2>Synchronizacja przez GitHub</h2>
        <div class="card">
          <p>Dane są zapisane w tym urządzeniu i działają bez internetu. Po połączeniu z prywatnym repozytorium GitHub komputer i telefon same wymieniają się zmianami (przy starcie, kilka sekund po każdej zmianie i co 5 minut).</p>
          ${gh ? `<p>Połączono z <b>${ui.esc(gh.repo)}</b>${last ? ` · ostatnio ${ui.fmtDate(last)} ${new Date(last).toLocaleTimeString('pl-PL')}` : ''}</p>
            <p class="row"><button class="primary" id="gNow">Synchronizuj teraz</button><button id="gEdit">Zmień</button><button id="gOff" class="ghost danger">Rozłącz</button></p>`
          : `<p class="row"><button class="primary" id="gEdit">Połącz z GitHubem…</button></p>`}
          <p id="syncStatus" class="muted"></p>
        </div>
        <h2>Plik w OneDrive (opcjonalnie)</h2>
        <div class="card">
          <p>Druga możliwość: jeden plik <b>kolekcja.json</b> w folderze OneDrive. Przyda się też jako kopia zapasowa.</p>
          ${hasFS ? `
            <p>Plik synchronizacji: <b>${name ? ui.esc(name) : 'nie wybrano'}</b>${last ? ` · ostatnio ${ui.fmtDate(last)} ${new Date(last).toLocaleTimeString('pl-PL')}` : ''}</p>
            <p class="row">
              <button id="sNow" ${name ? '' : 'disabled'}>Synchronizuj teraz</button>
              <button id="sNew">Utwórz plik w OneDrive…</button>
              <button id="sOpen">Wskaż istniejący plik…</button>
            </p>
            <p class="muted">Komputer: wybierz folder OneDrive na dysku. Aplikacja sama zapisuje zmiany co kilka sekund.</p>` : `
            <p class="muted">Na telefonie: „Zapisz kopię” i wybierz OneDrive. Na drugim urządzeniu „Wczytaj z pliku” i wybierz ten plik z OneDrive. Zmiany są scalane, nic nie ginie.</p>`}
          <p class="row">
            <button id="sExp">Zapisz kopię (eksport)</button>
            <label class="btn">Wczytaj z pliku<input type="file" id="sImp" accept=".json,application/json" hidden></label>
          </p>
        </div>
        <h2>O aplikacji</h2>
        <div class="card"><p>Moje kolekcje · wersja 0.1. Dane: ${(await Promise.all(DB.STORES.filter(s => s !== 'settings').map(async s => s + ': ' + (await DB.all(s)).length))).join(', ')}</p></div>`;
      const $ = s => el.querySelector(s);
      $('#gEdit').onclick = async () => {
        const c = gh || { repo: 'Silent3182/kolekcja-dane' };
        const r = await ui.form('Połącz z GitHubem', [
          { name: 'repo', label: 'Repozytorium na dane (konto/nazwa)', value: c.repo },
          { name: 'token', label: 'Klucz dostępu (token) z GitHuba', type: 'password', value: c.token, placeholder: 'github_pat_…' },
          { type: 'html', html: '<p class="muted" style="margin:0;font-size:13px">Klucz zostaje tylko na tym urządzeniu. Przy pierwszym połączeniu dane z urządzenia i z GitHuba zostaną scalone.</p>' }
        ], { ok: 'Połącz' });
        if (!r || !r.repo || !r.token) return;
        const cfg = { repo: r.repo.replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/$/, ''), token: r.token, path: 'kolekcja.json' };
        await Sync.github.set(cfg);
        try { const n = await syncWithGitHub(); ui.toast('Połączono z GitHubem' + (n ? ', pobrano zmian: ' + n : '')); App.refresh(); }
        catch (e) { ui.toast(e.message, 5000); }
      };
      if (gh) {
        $('#gNow').onclick = async () => { try { await syncWithGitHub(); ui.toast('Zsynchronizowano'); } catch (e) { ui.toast(e.message, 5000); } };
        $('#gOff').onclick = async () => { if (await ui.confirm('Rozłączyć synchronizację z GitHubem na tym urządzeniu? Dane zostają.')) { await Sync.github.forget(); App.refresh(); } };
      }
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
