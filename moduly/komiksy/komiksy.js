/* Moduł „Komiksy”: kolekcja komiksów, Master Reading Order (co czytać dalej), lista zakupów.
 * Zakładki: komiksy (📚), czytanie (📖), zakupy (🛒).
 * Dane startowe (z arkusza Marcina) ładowane leniwie z dane-komiksy.js i dane-mro.js.
 *  - comics: rekordy kolekcji. Import startowy ma updatedAt z 2000 r., więc każda Twoja zmiana wygrywa przy synchronizacji.
 *  - readingOrder: tylko pozycje, które zmieniłeś (przeczytane / nieprzeczytane). Reszta stanu pochodzi z arkusza.
 *  - settings 'mroSekcja:<nazwa>': części kolejności zaktualizowane ze strony comicbookreadingorders.com.
 */
(function () {
  const BASE = (document.currentScript && document.currentScript.src) ? document.currentScript.src.replace(/komiksy\.js.*$/, '') : 'moduly/komiksy/';
  const OLD = '2000-01-01T00:00:00.000Z';
  const SERIE_START = ['WKKM', 'Marvel Now 1.0', 'Marvel Now 2.0', 'Marvel Fresh', 'Marvel Origins', 'Marvel Classic', 'Marvel Limited',
    'Marvel Must-Have', 'Superbohaterowie Marvela', 'Wielkie Pojedynki', 'Bohaterowie i Złoczyńcy DC', 'Thorgal'];
  const STATUS = { owned: 'Mam', missing: 'Brakuje', forSale: 'Na sprzedaż', sold: 'Sprzedany' };

  /* ---------- pomocniki ---------- */
  const loaded = {};
  function loadScript(file) {
    if (!loaded[file]) loaded[file] = new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = BASE + file; s.onload = res; s.onerror = () => rej(new Error('Nie mogę wczytać ' + file));
      document.head.appendChild(s);
    });
    return loaded[file];
  }
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\bthe\b/g, '').replace(/[^a-z0-9#]/g, '');
  const esc = s => App.ui.esc(s);
  function css() {
    if (document.getElementById('kx-css')) return;
    const st = document.createElement('style'); st.id = 'kx-css';
    st.textContent = `
.kx-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:8px 0}
.kx-bar input[type=search],.kx-bar select{padding:8px;border-radius:8px;border:1px solid #c8cfd8;font-size:15px;max-width:100%}
.kx-bar input[type=search]{flex:1 1 200px}
.kx-chips{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0}
.kx-chip{border:1px solid #c8cfd8;background:transparent;border-radius:999px;padding:4px 10px;font-size:13px;cursor:pointer;color:inherit}
.kx-chip.on{background:#1f3a5f;color:#fff;border-color:#1f3a5f}
.kx-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(105px,1fr));gap:8px}
.kx-tile{border:1px solid #dde3ea;border-radius:10px;overflow:hidden;cursor:pointer;background:rgba(127,127,127,.04);display:flex;flex-direction:column}
.kx-cov{aspect-ratio:2/3;background:#e9edf2 center/cover no-repeat;display:flex;align-items:center;justify-content:center;text-align:center;padding:6px;font-size:12px;color:#fff;font-weight:600;position:relative}
.kx-cov img{width:100%;height:100%;object-fit:cover;position:absolute;inset:0}
.kx-tile .kx-t{padding:6px 8px;font-size:13px;line-height:1.25}
.kx-tile .kx-s{font-size:11px;opacity:.7}
.kx-b{display:inline-block;font-size:11px;padding:1px 6px;border-radius:6px;background:#e3e8ee;color:#223;margin-right:4px}
.kx-b.own{background:#cdeccf;color:#164d1a}.kx-b.miss{background:#f3e0c7;color:#6a3d00}.kx-b.sale{background:#ffe08a;color:#5a4300}.kx-b.sold{background:#ddd;color:#555}
.kx-b.must{background:#ffd6d6;color:#7a0000}.kx-b.skip{background:#eee;color:#666}
.kx-row{display:flex;gap:10px;align-items:flex-start;padding:8px 4px;border-bottom:1px solid rgba(127,127,127,.18)}
.kx-row input[type=checkbox]{width:22px;height:22px;flex:none;margin-top:1px}
.kx-row .kx-main{flex:1;min-width:0}
.kx-row.read{background:rgba(146,208,80,.45)}
.kx-row.hdr{background:rgba(31,58,95,.08);font-weight:600}
.kx-row.note{font-size:12px;opacity:.7}
.kx-next{border:2px solid #1f3a5f;border-radius:14px;padding:14px;margin:10px 0}
.kx-next h3{margin:4px 0 6px;font-size:20px}
.kx-prog{height:10px;background:#e3e8ee;border-radius:6px;overflow:hidden;margin:6px 0}
.kx-prog div{height:100%;background:#4c9a2a}
.kx-det{display:grid;grid-template-columns:minmax(140px,220px) 1fr;gap:16px}
@media (max-width:600px){.kx-det{grid-template-columns:1fr}.kx-det .kx-cov{max-width:220px}}
.kx-stars button{border:1px solid #c8cfd8;background:transparent;border-radius:6px;min-width:32px;padding:4px;margin:2px;cursor:pointer;color:inherit}
.kx-stars button.on{background:#f0b400;border-color:#f0b400;color:#000}
.kx-muted{opacity:.7;font-size:13px}
.kx-btns{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}
.kx-btns button,.kx-btns a{padding:8px 12px;border-radius:8px;border:1px solid #c8cfd8;background:transparent;cursor:pointer;color:inherit;text-decoration:none;font-size:14px}
.kx-btns .pri{background:#1f3a5f;color:#fff;border-color:#1f3a5f}
.kx-pre{white-space:pre-wrap}
@media (prefers-color-scheme:dark){.kx-b{background:#334;color:#dde}.kx-prog{background:#334}}`;
    document.head.appendChild(st);
  }
  function seriesColor(s) { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return `hsl(${h} 45% 38%)`; }
  function cover(c, big) {
    const src = c.thumb || c.image;
    return `<div class="kx-cov" style="background-color:${seriesColor(c.series)}">${src ? `<img loading="lazy" src="${esc(src)}" alt="">` : esc((c.series || '') + (c.volume != null ? ' #' + c.volume : '')) + (big ? '' : '')}</div>`;
  }
  function statusBadge(s) { const cl = { owned: 'own', missing: 'miss', forSale: 'sale', sold: 'sold' }[s] || ''; return `<span class="kx-b ${cl}">${STATUS[s] || s}</span>`; }
  function rating(r) { return r ? `<span class="kx-b">★ ${r}/10</span>` : ''; }
  // okładka ze zdjęcia: dłuższy bok 320 px, JPEG 0.7 – ok. 15–25 KB, żeby synchronizacja się nie rozrastała
  function resizeImage(file, max = 320, q = 0.7) {
    return new Promise((res, rej) => {
      const img = new Image(); const url = URL.createObjectURL(file);
      img.onload = () => { const k = Math.min(1, max / Math.max(img.width, img.height)); const cv = document.createElement('canvas');
        cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k); cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(url); res(cv.toDataURL('image/jpeg', q)); };
      img.onerror = () => rej(new Error('To nie jest obrazek')); img.src = url;
    });
  }

  /* ---------- dane komiksów ---------- */
  let seeding = null;
  async function ensureSeed() {
    if (seeding) return seeding;
    seeding = (async () => {
      const done = await DB.setting('komiksyImport');
      await loadScript('dane-komiksy.js');
      const ver = window.KOMIKSY_WERSJA || 1;
      if (done && (done.wersja || 1) >= ver) return;
      // Dokładamy nowe rekordy i nadpisujemy tylko te, których użytkownik jeszcze nie zmieniał (updatedAt = OLD).
      const seed = async (store, arr) => {
        const have = new Map((await DB.all(store, { withDeleted: true })).map(c => [c.id, c]));
        const recs = (arr || []).filter(c => { const h = have.get(c.id); return !h || h.updatedAt === OLD; })
          .map(c => Object.assign({}, c, { createdAt: OLD, updatedAt: OLD }));
        if (recs.length) await DB.putMany(store, recs, { keepDates: true });
        return recs.length;
      };
      const ile = await seed('comics', window.KOMIKSY_DANE);
      // okładki ze startowych danych także dla tomów, które użytkownik już zmieniał (o ile nie ma własnej)
      const zOkl = new Map((window.KOMIKSY_DANE || []).filter(c => c.image).map(c => [c.id, c.image]));
      const dopisz = (await DB.all('comics')).filter(c => c.updatedAt !== OLD && !c.image && !c.thumb && zOkl.has(c.id)).map(c => Object.assign({}, c, { image: zOkl.get(c.id) }));
      if (dopisz.length) await DB.putMany('comics', dopisz);
      await seed('shoppingList', window.ZAKUPY_DANE);
      await DB.setting('komiksyImport', { data: new Date().toISOString(), ile, wersja: ver });
    })();
    return seeding;
  }
  // kod wydania z arkusza (np. WKKM36, NOW1_7, KM75, MH15, SBM4, WP3) -> [seria, nr]
  const KODY = { WKKM: 'WKKM', KM: 'Marvel Classic', MH: 'Marvel Must-Have', SBM: 'Superbohaterowie Marvela', WP: 'Wielkie Pojedynki', MO: 'Marvel Origins', FRESH: 'Marvel Fresh' };
  function parseCodes(txt) {
    const out = []; const re = /\b(WKKM|KM|MH|SBM|WP|MO|NOW)\s?(\d+)(?:_(\d+))?/gi; let m;
    while ((m = re.exec(txt || ''))) {
      const k = m[1].toUpperCase();
      if (k === 'NOW') { if (m[3]) out.push({ code: m[0], series: 'Marvel Now ' + m[2] + '.0', vol: +m[3] }); }
      else out.push({ code: m[0], series: KODY[k], vol: +m[2] });
    }
    const u = new Set();
    return out.filter(c => { const k = c.series + '|' + c.vol; if (u.has(k)) return false; u.add(k); return true; });
  }
  async function comicIndex() {
    const all = await DB.all('comics'); const map = new Map();
    all.forEach(c => map.set(c.series + '|' + c.volume, c));
    map.byId = new Map(all.map(c => [c.id, c]));
    return map;
  }
  function codesHtml(txt, idx, kIds) {
    const cs = parseCodes(txt);
    const seen = new Set(cs.map(c => c.series + '|' + c.vol));
    // tomy z kolekcji, w których jest ten zeszyt (dopasowanie po zawartości tomu)
    const extra = (kIds || []).map(id => idx.byId && idx.byId.get(id)).filter(k => k && !seen.has(k.series + '|' + k.volume))
      .sort((a, b) => (b.status === 'owned') - (a.status === 'owned'))
      .map(k => `<a href="#/komiksy?id=${encodeURIComponent(k.id)}" class="kx-b ${k.status === 'owned' ? 'own' : 'miss'}" title="${esc(k.title)}">${k.status === 'owned' ? '📗 masz' : '📕 brak'}: ${esc(k.series)} ${esc(k.volume)} – ${esc(k.title)}</a>`).join(' ');
    if (!cs.length) return (txt ? `<span class="kx-muted">Wydanie: ${esc(txt)}</span> ` : '') + extra;
    return extra + ' ' + cs.map(c => {
      const k = idx.get(c.series + '|' + c.vol);
      if (!k) return `<span class="kx-b">${esc(c.code)}</span>`;
      return `<a href="#/komiksy?id=${encodeURIComponent(k.id)}" class="kx-b ${k.status === 'owned' ? 'own' : 'miss'}" title="${esc(k.title)}">${esc(c.code)} · ${k.status === 'owned' ? 'masz' : 'brak'}: ${esc(k.title)}</a>`;
    }).join(' ') + (txt.replace(/\b(WKKM|KM|MH|SBM|WP|MO|NOW)\s?\d+(_\d+)?/gi, '').replace(/[\s/]+/g, ' ').trim() ? ` <span class="kx-muted">(${esc(txt)})</span>` : '');
  }

  /* ---------- zakładka KOMIKSY ---------- */
  const st = { q: '', seria: '', filtr: 'all', sort: 'seria', limit: 120 };
  async function renderKomiksy(el, params) {
    css();
    el.innerHTML = '<p class="muted">Ładowanie kolekcji…</p>';
    await ensureSeed();
    if (params.id) return renderComic(el, params.id);
    if (params.braki) return renderBraki(el);
    const all = await DB.all('comics');
    const series = [...new Set(SERIE_START.concat(all.map(c => c.series)).filter(Boolean))];
    const stats = {}; all.forEach(c => { const s = stats[c.series] = stats[c.series] || { all: 0, own: 0 }; s.all++; if (c.status === 'owned' || c.status === 'forSale') s.own++; });
    el.innerHTML = `
      <h2>Komiksy</h2>
      <div class="kx-bar">
        <input type="search" id="kq" placeholder="Szukaj: tytuł, oryginał, zawartość…" value="${esc(st.q)}">
        <select id="ks"><option value="">Wszystkie serie (${all.length})</option>${series.map(s => `<option value="${esc(s)}" ${s === st.seria ? 'selected' : ''}>${esc(s)}${stats[s] ? ` (${stats[s].own}/${stats[s].all})` : ''}</option>`).join('')}</select>
        <select id="ksort">${[['seria', 'Seria i numer'], ['tytul', 'Tytuł'], ['ocena', 'Moja ocena'], ['nowe', 'Ostatnio zmienione']].map(([v, l]) => `<option value="${v}" ${st.sort === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <button class="primary" id="kadd">+ Dodaj komiks</button>
        <button id="kbraki">🔍 Braki w seriach</button>
      </div>
      <div class="kx-chips">${[['all', 'Wszystkie'], ['owned', 'Mam'], ['missing', 'Brakuje'], ['unread', 'Mam, nieprzeczytane'], ['forSale', 'Na sprzedaż'], ['sold', 'Sprzedane'], ['rated', 'Ocenione']].map(([v, l]) => `<button class="kx-chip ${st.filtr === v ? 'on' : ''}" data-f="${v}">${l}</button>`).join('')}</div>
      <div id="klist"></div>`;
    const draw = () => {
      const q = norm(st.q);
      let rows = all.filter(c => (!st.seria || c.series === st.seria)
        && (st.filtr === 'all' || (st.filtr === 'unread' ? (c.status === 'owned' && !c.read) : st.filtr === 'rated' ? c.myRating : c.status === st.filtr))
        && (!q || norm([c.title, c.origTitle, c.contents, c.series, c.notes].join(' ')).includes(q)));
      const cmp = { seria: (a, b) => (a.series || '').localeCompare(b.series || '', 'pl') || (+a.volume || 0) - (+b.volume || 0) || (a.title || '').localeCompare(b.title || '', 'pl'),
        tytul: (a, b) => (a.title || '').localeCompare(b.title || '', 'pl'), ocena: (a, b) => (b.myRating || 0) - (a.myRating || 0),
        nowe: (a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '') }[st.sort];
      rows.sort(cmp);
      const box = el.querySelector('#klist');
      const own = rows.filter(c => c.status === 'owned').length;
      box.innerHTML = `<p class="kx-muted">${rows.length} pozycji · masz ${own}</p><div class="kx-grid">${rows.slice(0, st.limit).map(c => `
        <div class="kx-tile" data-id="${esc(c.id)}">${cover(c)}
          <div class="kx-t"><div>${esc(c.title)}</div><div class="kx-s">${esc(c.series || '')}${c.volume != null ? ' #' + esc(c.volume) : ''}</div>
          <div>${statusBadge(c.status)}${c.read ? '<span class="kx-b own">✓ przeczytany</span>' : ''}${rating(c.myRating)}</div></div></div>`).join('')}</div>
        ${rows.length > st.limit ? `<p><button id="kmore">Pokaż więcej (${rows.length - st.limit})</button></p>` : ''}`;
      box.querySelectorAll('.kx-tile').forEach(t => t.onclick = () => App.go('komiksy', { id: t.dataset.id }));
      const more = box.querySelector('#kmore'); if (more) more.onclick = () => { st.limit += 240; draw(); };
    };
    el.querySelector('#kq').oninput = e => { st.q = e.target.value; st.limit = 120; draw(); };
    el.querySelector('#ks').onchange = e => { st.seria = e.target.value; st.limit = 120; draw(); };
    el.querySelector('#ksort').onchange = e => { st.sort = e.target.value; draw(); };
    el.querySelectorAll('.kx-chip').forEach(b => b.onclick = () => { st.filtr = b.dataset.f; el.querySelectorAll('.kx-chip').forEach(x => x.classList.toggle('on', x === b)); st.limit = 120; draw(); });
    el.querySelector('#kadd').onclick = () => editComic(null, series);
    el.querySelector('#kbraki').onclick = () => App.go('komiksy', { braki: 1 });
    draw();
  }

  /* ---------- braki w seriach ---------- */
  const br = { wszystkie: false };
  async function renderBraki(el) {
    const all = await DB.all('comics'); const shop = (await DB.all('shoppingList')).filter(x => !x.bought);
    const naLiscie = new Set(shop.flatMap(x => [x.comicId, x.series && x.volume != null ? x.series + '|' + x.volume : null]).filter(Boolean));
    const mam = c => c.status === 'owned' || c.status === 'forSale';
    const serie = new Map();
    all.forEach(c => { const v = parseInt(c.volume, 10); if (!c.series || !(v > 0)) return; if (!serie.has(c.series)) serie.set(c.series, new Map()); const m = serie.get(c.series); const o = m.get(v); if (!o || mam(c)) m.set(v, c); });
    const wiersze = [...serie].map(([s, m]) => {
      const max = Math.max(...m.keys()); const nr = []; let ile = 0;
      for (let v = 1; v <= max; v++) { const c = m.get(v); if (c && mam(c)) ile++; else nr.push({ v, c }); }
      return { s, max, ile, nr };
    }).filter(r => r.nr.length && (br.wszystkie || r.ile > 0)).sort((a, b) => b.ile / b.max - a.ile / a.max || a.s.localeCompare(b.s, 'pl'));
    const zakresy = nr => { const out = []; nr.forEach(({ v }) => { const l = out[out.length - 1]; if (l && l[1] === v - 1) l[1] = v; else out.push([v, v]); }); return out.map(([a, b]) => a === b ? a : a + '–' + b).join(', '); };
    const juz = (s, n) => n.c && naLiscie.has(n.c.id) || naLiscie.has(s + '|' + n.v);
    el.innerHTML = `<p><a href="#/komiksy">← Komiksy</a></p><h2>Braki w seriach</h2>
      <p class="kx-muted">Numery tomów, których nie masz (od 1 do ostatniego znanego tomu serii). Kliknij numer, żeby dodać go na listę zakupów; 🛒 = już na liście.</p>
      <label class="chk"><input type="checkbox" id="brw" ${br.wszystkie ? 'checked' : ''}> <span>pokaż też serie, z których nie masz żadnego tomu</span></label>
      ${wiersze.map(r => { const dod = r.nr.filter(n => !juz(r.s, n)); return `<div class="card" style="margin:10px 0">
        <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:baseline"><b>${esc(r.s)}</b><span class="kx-muted">masz ${r.ile} z ${r.max} · brakuje ${r.nr.length}: ${esc(zakresy(r.nr))}</span></div>
        <div class="kx-prog"><div style="width:${(r.ile / r.max * 100).toFixed(1)}%"></div></div>
        <div class="kx-chips" style="flex-wrap:wrap;overflow:visible">${r.nr.slice(0, 300).map(n => `<button class="kx-chip ${juz(r.s, n) ? 'on' : ''}" data-bs="${esc(r.s)}" data-bv="${n.v}" title="${esc(n.c ? n.c.title : 'tom ' + n.v)}">${juz(r.s, n) ? '🛒 ' : ''}${n.v}</button>`).join('')}</div>
        ${dod.length ? `<div class="kx-btns"><button data-ball="${esc(r.s)}">🛒 Dodaj wszystkie brakujące na listę (${dod.length})</button></div>` : ''}</div>`; }).join('') || '<p>Nie masz braków w żadnej serii 🎉</p>'}`;
    const dodaj = async (s, lista) => {
      const recs = lista.filter(n => !juz(s, n)).map(n => ({ title: n.c ? `${s} ${n.v}: ${n.c.title}` : `${s} ${n.v}`, itemType: 'comic', series: s, volume: n.v, comicId: n.c ? n.c.id : null, publisher: n.c ? n.c.publisher || '' : '', bought: false, notes: 'Brak w serii' }));
      if (recs.length) await DB.putMany('shoppingList', recs);
      App.ui.toast(recs.length === 1 ? 'Dodano na listę zakupów' : `Dodano ${recs.length} pozycji na listę zakupów`); renderBraki(el);
    };
    el.querySelector('#brw').onchange = e => { br.wszystkie = e.target.checked; renderBraki(el); };
    el.querySelectorAll('[data-bv]').forEach(b => b.onclick = async () => {
      const r = wiersze.find(w => w.s === b.dataset.bs); const n = r.nr.find(k => k.v === +b.dataset.bv);
      if (juz(r.s, n)) return App.ui.toast('Ten tom już jest na liście zakupów');
      await dodaj(r.s, [n]);
    });
    el.querySelectorAll('[data-ball]').forEach(b => b.onclick = async () => {
      const r = wiersze.find(w => w.s === b.dataset.ball); const n = r.nr.filter(k => !juz(r.s, k));
      if (n.length > 10 && !await App.ui.confirm(`Dodać ${n.length} tomów serii ${r.s} na listę zakupów?`)) return;
      await dodaj(r.s, n);
    });
  }

  async function editComic(c, series, opt = {}) {
    series = series || [...new Set(SERIE_START.concat((await DB.all('comics')).map(x => x.series)))];
    let dl = document.getElementById('kx-serie'); if (!dl) { dl = document.createElement('datalist'); dl.id = 'kx-serie'; document.body.appendChild(dl); }
    dl.innerHTML = series.map(s => `<option value="${esc(s)}">`).join('');
    const v = c || Object.assign({ status: 'owned', publisher: 'Egmont', series: st.seria || '' }, opt.preset || {});
    const out = await App.ui.form(c ? 'Edytuj komiks' : 'Nowy komiks', [
      { name: 'series', label: 'Seria / kolekcja', value: v.series, list: 'kx-serie', placeholder: 'np. Thorgal, WKKM, Marvel Fresh' },
      { name: 'volume', label: 'Numer tomu', value: v.volume, placeholder: 'np. 12' },
      { name: 'title', label: 'Tytuł', value: v.title },
      { name: 'origTitle', label: 'Tytuł oryginalny', value: v.origTitle },
      { name: 'contents', label: 'Zawartość (zeszyty)', type: 'textarea', value: v.contents, rows: 2 },
      { name: 'publisher', label: 'Wydawca', value: v.publisher },
      { name: 'year', label: 'Rok wydania', type: 'number', value: v.year },
      { name: 'status', label: 'Stan', type: 'select', value: v.status, options: Object.entries(STATUS) },
      { name: 'read', label: 'Przeczytany', type: 'checkbox', value: v.read },
      { name: 'myRating', label: 'Moja ocena (1–10)', type: 'number', value: v.myRating, step: 1 },
      { name: 'image', label: 'Okładka – adres obrazka (opcjonalnie)', value: v.image && !String(v.image).startsWith('data:') ? v.image : '', placeholder: 'https://…jpg' },
      { name: 'notes', label: 'Notatki', type: 'textarea', value: v.notes, rows: 3 }
    ]);
    if (!out) return null;
    if (!out.title) { App.ui.toast('Podaj tytuł'); return null; }
    const vol = out.volume === '' ? null : (isNaN(+out.volume) ? out.volume : +out.volume);
    const rec = Object.assign({}, c || {}, out, { volume: vol, myRating: out.myRating ? Math.max(1, Math.min(10, Math.round(out.myRating))) : null });
    if (!out.image && c && String(c.image || '').startsWith('data:')) rec.image = c.image;
    if (out.image && c && out.image !== c.image) rec.thumb = null;
    const saved = await DB.put('comics', rec);
    App.ui.toast('Zapisano');
    if (!opt.noNav) App.go('komiksy', { id: saved.id });
    return saved;
  }

  async function renderComic(el, id) {
    const c = await DB.get('comics', id);
    if (!c) { el.innerHTML = '<p>Nie ma takiego komiksu.</p><p><a href="#/komiksy">← Wróć</a></p>'; return; }
    const q = encodeURIComponent(`${c.title} ${c.series || ''} komiks`);
    el.innerHTML = `
      <p><a href="#/komiksy">← Komiksy</a></p>
      <div class="kx-det">
        <div>${cover(c, true)}
          <div class="kx-btns"><label class="btn" style="cursor:pointer;padding:6px 10px;border:1px solid #c8cfd8;border-radius:8px;font-size:13px">📷 Zrób zdjęcie<input type="file" accept="image/*" capture="environment" class="kimg" hidden></label>
          <label class="btn" style="cursor:pointer;padding:6px 10px;border:1px solid #c8cfd8;border-radius:8px;font-size:13px">🖼 Z galerii / pliku<input type="file" accept="image/*" class="kimg" hidden></label>
          <a target="_blank" rel="noopener" href="https://www.google.com/search?tbm=isch&q=${encodeURIComponent(c.title + ' ' + (c.publisher || '') + ' okładka')}" style="font-size:13px">🔎 Szukaj okładki</a></div>
          <p class="kx-muted">Znalezioną okładkę: prawy klik / przytrzymaj → „Kopiuj adres obrazu” i wklej w „Edytuj”, albo zapisz i wybierz plik.</p>
        </div>
        <div>
          <h2 style="margin-top:0">${esc(c.title)}</h2>
          <p>${esc(c.series || '')}${c.volume != null ? ' · tom ' + esc(c.volume) : ''}${c.publisher ? ' · ' + esc(c.publisher) : ''}${c.year ? ' · ' + esc(c.year) : ''}</p>
          ${c.origTitle ? `<p class="kx-muted">Oryginał: ${esc(c.origTitle)}</p>` : ''}
          ${c.contents ? `<p>${esc(c.contents)}</p>` : ''}
          <p>${statusBadge(c.status)}${c.read ? '<span class="kx-b own">✓ przeczytany</span>' : ''}</p>
          <div class="kx-btns">
            <button id="kown" class="${c.status === 'owned' ? 'pri' : ''}">${c.status === 'owned' ? '✓ Mam' : 'Oznacz: mam'}</button>
            <button id="kread" class="${c.read ? 'pri' : ''}">${c.read ? '✓ Przeczytany' : 'Oznacz: przeczytany'}</button>
          </div>
          <p><b>Moja ocena:</b></p>
          <div class="kx-stars">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => `<button data-r="${n}" class="${c.myRating >= n ? 'on' : ''}">${n}</button>`).join('')}${c.myRating ? ' <button data-r="0">✕</button>' : ''}</div>
          ${c.notes ? `<p class="kx-pre kx-muted">${esc(c.notes)}</p>` : ''}
          <div class="kx-btns">
            <button id="kedit">✏️ Edytuj</button>
            <button id="ksell">💰 Wystaw na sprzedaż</button>
            ${App.has('wypozyczenia.przycisk') && c.status !== 'missing' ? '<button id="klend">🤝 Pożycz</button>' : ''}
            ${App.has('polki.przycisk') && (c.status === 'owned' || c.status === 'forSale') ? '<button id="kshelf">📍 Półka</button>' : ''}
            ${c.status !== 'owned' ? '<button id="kshop">🛒 Do listy zakupów</button>' : ''}
            <a target="_blank" rel="noopener" href="https://allegro.pl/listing?string=${q}">Ceny: Allegro</a>
            <a target="_blank" rel="noopener" href="https://www.olx.pl/oferty/q-${encodeURIComponent((c.title || '').replace(/\s+/g, '-'))}/">OLX</a>
            <a target="_blank" rel="noopener" href="https://www.ceneo.pl/;szukaj-${q}">Ceneo</a>
            <button id="kdel">🗑 Usuń</button>
          </div>
        </div>
      </div>`;
    const $ = s => el.querySelector(s);
    const save = async patch => { await DB.put('comics', Object.assign({}, c, patch)); App.refresh(); };
    $('#kown').onclick = () => save({ status: c.status === 'owned' ? 'missing' : 'owned' });
    $('#kread').onclick = () => save({ read: !c.read, readAt: !c.read ? new Date().toISOString() : null });
    el.querySelectorAll('.kx-stars button').forEach(b => b.onclick = () => save({ myRating: +b.dataset.r || null }));
    $('#kedit').onclick = () => editComic(c);
    $('#ksell').onclick = () => App.call('sprzedaz.wystaw', { itemType: 'comic', itemId: c.id });
    if ($('#klend')) App.call('wypozyczenia.przycisk', $('#klend'), 'comic', c.id);
    if ($('#kshelf')) App.call('polki.przycisk', $('#kshelf'), 'comic', c.id);
    if ($('#kshop')) $('#kshop').onclick = async () => {
      await DB.put('shoppingList', { title: c.title, itemType: 'comic', series: c.series, volume: c.volume, comicId: c.id, publisher: c.publisher, bought: false });
      App.ui.toast('Dodano do listy zakupów');
    };
    $('#kdel').onclick = async () => { if (await App.ui.confirm(`Usunąć „${c.title}” z kolekcji?`)) { await DB.remove('comics', c.id); App.go('komiksy'); } };
    el.querySelectorAll('.kimg').forEach(inp => inp.onchange = async e => { const f = e.target.files[0]; if (!f) return;
      try { const img = await resizeImage(f); await save({ image: img, thumb: null }); App.ui.toast(`Okładka zapisana (${Math.round(img.length * 0.75 / 1024)} KB)`); } catch (err) { App.ui.toast(err.message); } });
  }

  /* ---------- zakładka CZYTANIE (Master Reading Order) ---------- */
  let MRO = null; // { list:[{id,title,base,sec,ev,typ,wyd,ex}], secs, events }
  async function loadMRO() {
    await loadScript('dane-mro.js');
    const D = window.MRO_DANE;
    let list = D.p.map(r => ({ id: 'mro-' + r[0], title: r[1], base: !!r[2], sec: D.sekcje[r[3]], ev: r[4] >= 0 ? D.eventy[r[4]] : null, typ: r[5], wyd: r[6], ex: r[7] || {} }));
    // części zaktualizowane ze strony
    const secs = D.sekcje.slice();
    const sets = (await DB.all('settings')).filter(s => s.id.startsWith('mroSekcja:'));
    for (const s of sets) {
      const name = s.id.slice(10); const rows = s.value.rows.map(r => ({ id: r[0], title: r[1], base: false, sec: name, ev: r[2] || null, typ: r[3] || 0, wyd: r[4] || '', ex: r[5] || {} }));
      if (!secs.includes(name)) { const after = s.value.after && secs.indexOf(s.value.after); secs.splice(after >= 0 ? after + 1 : secs.length, 0, name); }
      const keepBase = new Map(list.filter(x => x.sec === name).map(x => [x.id, x]));
      rows.forEach(r => { const o = keepBase.get(r.id); if (o) { r.base = o.base; r.ex = Object.assign({}, o.ex, r.ex); if (!r.wyd) r.wyd = o.wyd; } });
      list = list.filter(x => x.sec !== name);
      const idx = secs.indexOf(name);
      let pos = list.findIndex(x => secs.indexOf(x.sec) > idx); if (pos < 0) pos = list.length;
      list.splice(pos, 0, ...rows);
    }
    list.forEach((x, i) => x.i = i);
    MRO = { list, secs, data: D.data };
    return MRO;
  }
  async function mroState() {
    if (!MRO) await loadMRO();
    const ov = new Map((await DB.all('readingOrder')).map(r => [r.id, r]));
    const opt = Object.assign({ pomin: true, wyl: ['Star Wars'] }, (await DB.setting('mroOpcje')) || {});
    const isRead = x => { const o = ov.get(x.id); return o ? !!o.read : x.base; };
    const counts = x => x.typ === 0 && !opt.wyl.includes(x.sec) && !(opt.pomin && x.ex.pomin);
    let last = -1; MRO.list.forEach(x => { if (counts(x) && isRead(x)) last = x.i; });
    const next = MRO.list.find(x => x.i > last && counts(x) && !isRead(x));
    const backlog = MRO.list.filter(x => x.i < last && counts(x) && !isRead(x));
    // tomy przy zeszycie: automatyczne (ex.k) minus odrzucone + dodane ręcznie
    const vols = x => { const o = ov.get(x.id) || {}; const off = o.comicIdsOff || [];
      return [...new Set((x.ex.k || []).filter(id => !off.includes(id)).concat(o.comicIds || []))]; };
    return { ov, opt, isRead, counts, last, next, backlog, vols };
  }
  async function setRead(items, read) {
    const t = new Date().toISOString();
    const old = new Map((await DB.all('readingOrder')).map(r => [r.id, r]));
    await DB.putMany('readingOrder', items.map(x => Object.assign({}, old.get(x.id) || {}, { id: x.id, order: x.i + 1, part: x.sec, title: x.title, read, readAt: read ? t : null })));
  }
  // Okno „📎 Tom”: odznacz błędne tomy, wybierz tom z listy albo dodaj nowy
  async function assignVolume(x, S) {
    const all = (await DB.all('comics')).sort((a, b) => (a.series || '').localeCompare(b.series || '', 'pl') || (+a.volume || 0) - (+b.volume || 0));
    const byId = new Map(all.map(c => [c.id, c]));
    const label = c => `${c.series || ''}${c.volume != null ? ' ' + c.volume : ''} – ${c.title}`;
    const cur = S.vols(x).filter(id => byId.has(id));
    const dlg = document.createElement('dialog'); dlg.className = 'dlg';
    dlg.innerHTML = `<form method="dialog"><h3>Tom dla: ${esc(x.title)}</h3>
      ${cur.length ? `<p class="kx-muted">Przypisane tomy (odznacz błędne):</p>${cur.map(id => `<label class="chk"><input type="checkbox" data-c="${esc(id)}" checked> <span>${esc(label(byId.get(id)))}</span></label>`).join('')}` : '<p class="kx-muted">Brak przypisanego tomu.</p>'}
      <label><span>Dodaj tom z kolekcji (zacznij pisać serię lub tytuł)</span><input name="pick" list="kx-tomy" placeholder="np. WKKM 36 albo Spider-Man 5"></label>
      <datalist id="kx-tomy">${all.map(c => `<option value="${esc(label(c))}">`).join('')}</datalist>
      <div class="dlg-btns"><button value="new" class="ghost">➕ Nowy tom…</button><button value="cancel" class="ghost">Anuluj</button><button value="ok" class="primary">Zapisz</button></div></form>`;
    document.body.appendChild(dlg);
    const res = await new Promise(r => { dlg.addEventListener('close', () => r(dlg.returnValue)); dlg.showModal(); });
    const keep = [...dlg.querySelectorAll('[data-c]')].filter(c => c.checked).map(c => c.dataset.c);
    const pickTxt = dlg.querySelector('[name=pick]').value.trim(); dlg.remove();
    if (res === 'cancel' || !res) return;
    let add = null;
    if (res === 'new') {
      const m = x.title.match(/^(.*?)\s*#/);
      add = await editComic(null, null, { noNav: true, preset: { contents: x.title, origTitle: m ? m[1] : '' } });
      if (!add) return;
    } else if (pickTxt) {
      add = all.find(c => label(c) === pickTxt) || all.find(c => norm(label(c)).includes(norm(pickTxt)));
      if (!add) { App.ui.toast('Nie znalazłem takiego tomu – użyj „Nowy tom…”'); return; }
    }
    const o = S.ov.get(x.id) || { id: x.id, order: x.i + 1, part: x.sec, title: x.title, read: S.isRead(x) };
    const auto = x.ex.k || [];
    const final = new Set(keep.concat(add ? [add.id] : []));
    const rec = Object.assign({}, o, {
      read: S.isRead(x),
      comicIds: [...final].filter(id => !auto.includes(id)),
      comicIdsOff: auto.filter(id => !final.has(id))
    });
    rec.comicId = [...final][0] || null;
    await DB.put('readingOrder', rec);
    App.ui.toast('Zapisano tom'); App.refresh();
  }
  const cz = { sec: null, q: '', page: 0, view: 'next' };
  function itemRow(x, S, idx, opts = {}) {
    if (x.typ === 1) return `<div class="kx-row hdr"><div class="kx-main">📘 ${esc(x.title)}</div></div>`;
    if (x.typ === 2) return `<div class="kx-row hdr"><div class="kx-main">➡️ Event: ${esc(x.ex.ev || x.title)}${x.ev ? '' : ' <span class="kx-muted">(brak listy w arkuszu)</span>'}</div></div>`;
    if (x.typ === 3) return `<div class="kx-row note"><div class="kx-main">${x.title.startsWith('http') ? `<a href="${esc(x.title)}" target="_blank" rel="noopener">${esc(x.title)}</a>` : esc(x.title)}</div></div>`;
    const r = S.isRead(x); const e = x.ex;
    return `<div class="kx-row ${r ? 'read' : ''}" data-i="${x.i}"><input type="checkbox" ${r ? 'checked' : ''} data-i="${x.i}" title="Przeczytane">
      <div class="kx-main"><div class="kx-tt">${esc(x.title)}</div>
      <div class="kx-muted">${opts.sec ? esc(x.sec) + (x.ev ? ' · ' + esc(x.ev) : '') + ' · ' : (x.ev ? esc(x.ev) + ' · ' : '')}#${x.i + 1}
        ${e.mustRead ? '<span class="kx-b must">Must read</span>' : ''}${e.pomin ? '<span class="kx-b skip">do pominięcia</span>' : ''}${e.ocena ? `<span class="kx-b">ocena ${e.ocena}</span>` : ''}${codesHtml([x.wyd, e.nosnik].filter(Boolean).join(' / '), idx, S.vols(x))} ${e.uwagi ? esc(e.uwagi) : ''}</div></div>
      <button class="ghost" data-tom="${x.i}" title="Przypisz tom z kolekcji">📎</button>
      ${opts.upto ? `<button class="ghost" data-upto="${x.i}" title="Oznacz wszystko do tego miejsca jako przeczytane">⤒</button>` : ''}</div>`;
  }
  function bindRows(el, S) {
    // odznaczanie bez przerysowania listy – lista zostaje w tym samym miejscu (prośba Anety)
    const naMiejscu = (items, read) => {
      const t = read ? new Date().toISOString() : null;
      items.forEach(x => {
        S.ov.set(x.id, Object.assign({}, S.ov.get(x.id) || {}, { id: x.id, read, readAt: t }));
        document.querySelectorAll(`.kx-row[data-i="${x.i}"]`).forEach(r => { r.classList.toggle('read', read); const c = r.querySelector('input[type=checkbox]'); if (c) c.checked = read; });
      });
      const L = MRO.list, tot = L.filter(S.counts).length, done = L.filter(x => S.counts(x) && S.isRead(x)).length;
      const bar = document.getElementById('czprog'), txt = document.getElementById('czprogt');
      if (bar) bar.style.width = (done / Math.max(1, tot) * 100).toFixed(2) + '%';
      if (txt) txt.textContent = `Przeczytane ${done.toLocaleString('pl-PL')} z ${tot.toLocaleString('pl-PL')} (${(done / Math.max(1, tot) * 100).toFixed(1)}%)`;
    };
    el.querySelectorAll('input[type=checkbox][data-i]').forEach(cb => cb.onchange = async () => {
      const x = MRO.list[+cb.dataset.i]; await setRead([x], cb.checked); naMiejscu([x], cb.checked);
    });
    el.querySelectorAll('[data-tom]').forEach(b => b.onclick = () => assignVolume(MRO.list[+b.dataset.tom], S));
    el.querySelectorAll('[data-upto]').forEach(b => b.onclick = async () => {
      const to = +b.dataset.upto;
      const items = MRO.list.filter(x => x.i <= to && S.counts(x) && !S.isRead(x));
      if (!items.length) return App.ui.toast('Wszystko do tego miejsca jest już przeczytane');
      if (await App.ui.confirm(`Oznaczyć ${items.length} pozycji do tego miejsca jako przeczytane?`)) { await setRead(items, true); naMiejscu(items, true); App.ui.toast(`Oznaczono ${items.length} pozycji`); }
    });
  }
  /* ---- filtr po postaci / evencie ---- */
  const POSTACIE = [['Spider-Man', 'spider-man|spectacular spider|web of spider|peter parker'], ['X-Men', 'x-men|x-factor|x-force|new mutants|excalibur'],
    ['Avengers', 'avengers'], ['Fantastyczna Czwórka', 'fantastic four|\\bff\\b'], ['Iron Man', 'iron man|tony stark'], ['Kapitan Ameryka', 'captain america|steve rogers'],
    ['Thor', '\\bthor\\b'], ['Hulk', '\\bhulk'], ['Daredevil', 'daredevil'], ['Wolverine', 'wolverine|\\blogan\\b'], ['Deadpool', 'deadpool'],
    ['Strażnicy Galaktyki', 'guardians of the galaxy'], ['Czarna Pantera', 'black panther'], ['Doktor Strange', 'doctor strange|dr\\. strange'],
    ['Punisher', 'punisher'], ['Kapitan Marvel', 'captain marvel|ms\\. marvel|carol danvers'], ['Venom', 'venom'], ['Moon Knight', 'moon knight'],
    ['Silver Surfer', 'silver surfer'], ['Czarna Wdowa', 'black widow'], ['Ant-Man', 'ant-man'], ['Hawkeye', 'hawkeye'], ['Ghost Rider', 'ghost rider'],
    ['Thanos', 'thanos'], ['Inhumans', 'inhumans'], ['Nova', '\\bnova\\b'], ['Vision / Scarlet Witch', 'vision|scarlet witch']];
  const pz = { p: '', q: '', ev: '', tylko: false, page: 0 };
  function renderPostac(body, S, idx) {
    const L = MRO.list;
    const evs = [...new Set(L.map(x => x.ev).filter(Boolean))];
    const wz = pz.q.trim() ? new RegExp(pz.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : pz.p ? new RegExp((POSTACIE.find(x => x[0] === pz.p) || [])[1] || '^$', 'i') : null;
    const aktywny = !!(wz || pz.ev);
    let rows = aktywny ? L.filter(x => x.typ === 0 && !S.opt.wyl.includes(x.sec) && (!wz || wz.test(x.title)) && (!pz.ev || x.ev === pz.ev)) : [];
    const ile = rows.length, czyt = rows.filter(S.isRead).length;
    const nast = rows.find(x => !S.isRead(x) && S.counts(x));
    if (pz.tylko) rows = rows.filter(x => !S.isRead(x));
    const PER = 150, pages = Math.max(1, Math.ceil(rows.length / PER)); if (pz.page >= pages) pz.page = 0;
    body.innerHTML = `
      <p class="kx-muted">Wybierz bohatera albo event – zobaczysz tylko jego zeszyty, w kolejności Master Reading Order.</p>
      <div class="kx-chips">${POSTACIE.map(([n]) => `<button class="kx-chip ${pz.p === n && !pz.q ? 'on' : ''}" data-pp="${esc(n)}">${esc(n)}</button>`).join('')}</div>
      <div class="kx-bar"><input type="search" id="pzq" placeholder="Inna postać lub seria (po angielsku, np. Silk)" value="${esc(pz.q)}">
        <select id="pzev"><option value="">Wszystkie eventy</option>${evs.map(e => `<option ${e === pz.ev ? 'selected' : ''}>${esc(e)}</option>`).join('')}</select>
        <label class="chk"><input type="checkbox" id="pzt" ${pz.tylko ? 'checked' : ''}> <span>tylko nieprzeczytane</span></label>
        ${aktywny ? '<button id="pzx">Wyczyść</button>' : ''}</div>
      ${aktywny ? `<div class="kx-prog"><div style="width:${(czyt / Math.max(1, ile) * 100).toFixed(1)}%"></div></div>
        <p class="kx-muted">${esc([pz.q || pz.p, pz.ev].filter(Boolean).join(' · '))}: przeczytane ${czyt} z ${ile}${nast ? ` · następny: <b>${esc(nast.title)}</b> (#${nast.i + 1})` : ''}</p>
        ${pages > 1 ? `<div class="kx-chips">${Array.from({ length: pages }, (_, i) => `<button class="kx-chip ${i === pz.page ? 'on' : ''}" data-pg="${i}">${i * PER + 1}–${Math.min(rows.length, (i + 1) * PER)}</button>`).join('')}</div>` : ''}
        <div>${rows.slice(pz.page * PER, pz.page * PER + PER).map(x => itemRow(x, S, idx, { sec: true, upto: false })).join('') || '<p>Nic nie znalazłem.</p>'}</div>` : ''}`;
    const go = () => renderPostac(body, S, idx);
    body.querySelectorAll('[data-pp]').forEach(b => b.onclick = () => { pz.p = pz.p === b.dataset.pp && !pz.q ? '' : b.dataset.pp; pz.q = ''; pz.page = 0; go(); });
    body.querySelector('#pzq').onchange = e => { pz.q = e.target.value; pz.page = 0; go(); };
    body.querySelector('#pzev').onchange = e => { pz.ev = e.target.value; pz.page = 0; go(); };
    body.querySelector('#pzt').onchange = e => { pz.tylko = e.target.checked; pz.page = 0; go(); };
    const x = body.querySelector('#pzx'); if (x) x.onclick = () => { Object.assign(pz, { p: '', q: '', ev: '', page: 0 }); go(); };
    body.querySelectorAll('[data-pg]').forEach(b => b.onclick = () => { pz.page = +b.dataset.pg; go(); });
    bindRows(body, S);
  }

  /* ---- oś czasu czytania ---- */
  const odm = (n, a, b, c) => n + ' ' + (n === 1 ? a : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? b : c);
  async function renderHistoria(body, S) {
    const comics = await DB.all('comics'); const byId = new Map(comics.map(c => [c.id, c]));
    const byMro = new Map(MRO.list.map(x => [x.id, x]));
    const ev = [];
    S.ov.forEach(o => { if (o.read && o.readAt && !o.skipped) { const x = byMro.get(o.id); if (x && x.typ === 0) ev.push({ t: o.readAt, x }); } });
    comics.forEach(c => { if (c.read && c.readAt) ev.push({ t: c.readAt, c }); });
    ev.sort((a, b) => b.t.localeCompare(a.t));
    const bezDaty = MRO.list.filter(x => x.typ === 0 && x.base && !S.ov.has(x.id)).length;
    const mies = new Map(); ev.forEach(e => { const k = e.t.slice(0, 7); if (!mies.has(k)) mies.set(k, []); mies.get(k).push(e); });
    const nazwa = k => new Date(k + '-15').toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });
    const blok = (k, list) => {
      const tomy = new Map();
      list.forEach(e => { (e.c ? [e.c] : S.vols(e.x).map(id => byId.get(id)).filter(Boolean)).forEach(c => tomy.set(c.id, c)); });
      const zeszyty = list.filter(e => e.x);
      return `<div class="card" style="margin:10px 0"><h3 style="margin:0 0 4px;text-transform:capitalize">${esc(nazwa(k))}</h3>
        <p class="kx-muted">${zeszyty.length ? odm(zeszyty.length, 'zeszyt', 'zeszyty', 'zeszytów') + ' z kolejności' : ''}${zeszyty.length && list.length > zeszyty.length ? ' · ' : ''}${list.length > zeszyty.length ? odm(list.length - zeszyty.length, 'tom', 'tomy', 'tomów') + ' z kolekcji' : ''}</p>
        ${tomy.size ? `<div class="kx-grid">${[...tomy.values()].map(c => `<div class="kx-tile" data-id="${esc(c.id)}">${cover(c)}<div class="kx-t"><div>${esc(c.title)}</div><div class="kx-s">${esc(c.series || '')}${c.volume != null ? ' #' + esc(c.volume) : ''}</div></div></div>`).join('')}</div>` : ''}
        ${zeszyty.length ? `<details><summary>Zeszyty (${zeszyty.length})</summary>${zeszyty.map(e => `<div class="kx-row read"><div class="kx-main"><div class="kx-tt">${esc(e.x.title)}</div><div class="kx-muted">${App.ui.fmtDate(e.t.slice(0, 10))} · ${esc(e.x.sec)}</div></div></div>`).join('')}</details>` : ''}</div>`;
    };
    body.innerHTML = `<p class="kx-muted">Co czytałeś miesiąc po miesiącu – zeszyty odznaczone w kolejności i tomy oznaczone jako przeczytane, z okładkami tomów.${bezDaty ? ` ${bezDaty.toLocaleString('pl-PL')} pozycji przeczytanych wcześniej (z arkusza) nie ma daty, więc ich tu nie ma.` : ''}</p>
      ${mies.size ? [...mies].map(([k, l]) => blok(k, l)).join('') : '<p>Jeszcze nic nie odznaczyłeś w aplikacji. Każde „✓ Przeczytane” trafi tutaj.</p>'}`;
    body.querySelectorAll('.kx-tile').forEach(t => t.onclick = () => App.go('komiksy', { id: t.dataset.id }));
  }

  async function renderCzytanie(el, params) {
    css();
    el.innerHTML = '<p class="muted">Ładowanie kolejności czytania…</p>';
    await ensureSeed();
    const S = await mroState(); const idx = await comicIndex();
    if (params.v) cz.view = params.v;
    const L = MRO.list;
    const tot = L.filter(S.counts).length; const done = L.filter(x => S.counts(x) && S.isRead(x)).length;
    const nx = S.next;
    const tabs = [['next', 'Następne'], ['backlog', `Zaległe (${S.backlog.length})`], ['all', 'Cała lista'], ['postac', 'Postać / event'], ['historia', 'Oś czasu'], ['opcje', 'Ustawienia i aktualizacja']];
    el.innerHTML = `
      <h2>Master Reading Order</h2>
      <div class="kx-prog"><div id="czprog" style="width:${(done / Math.max(1, tot) * 100).toFixed(2)}%"></div></div>
      <p class="kx-muted" id="czprogt">Przeczytane ${done.toLocaleString('pl-PL')} z ${tot.toLocaleString('pl-PL')} (${(done / Math.max(1, tot) * 100).toFixed(1)}%)</p>
      <div class="kx-chips">${tabs.map(([v, l]) => `<button class="kx-chip ${cz.view === v ? 'on' : ''}" data-v="${v}">${l}</button>`).join('')}</div>
      <div id="czbody"></div>`;
    el.querySelectorAll('[data-v]').forEach(b => b.onclick = () => { cz.view = b.dataset.v; App.refresh(); });
    const body = el.querySelector('#czbody');
    if (cz.view === 'next') {
      if (!nx) { body.innerHTML = '<div class="kx-next"><h3>Wszystko przeczytane! 🎉</h3></div>'; return; }
      const e = nx.ex;
      const upcoming = L.slice(nx.i + 1).filter(x => x.typ !== 3 && !S.opt.wyl.includes(x.sec)).slice(0, 25);
      body.innerHTML = `
        <div class="kx-next">
          <div class="kx-muted">Następny do przeczytania · ${esc(nx.sec)}${nx.ev ? ' · event: ' + esc(nx.ev) : ''} · pozycja ${nx.i + 1}</div>
          <h3>${esc(nx.title)}</h3>
          <div>${e.mustRead ? '<span class="kx-b must">Must read</span>' : ''}${e.ocena ? `<span class="kx-b">ocena ${e.ocena}</span>` : ''}${e.typ ? `<span class="kx-b">${esc(e.typ)}</span>` : ''}${e.uwagi ? esc(e.uwagi) : ''}</div>
          <p>${codesHtml([nx.wyd, e.nosnik].filter(Boolean).join(' / '), idx, S.vols(nx)).trim() || '<span class="kx-muted">Nie znalazłem tego zeszytu w żadnym tomie kolekcji</span>'}</p>
          <p id="czpolka"></p>
          <div class="kx-btns"><button class="pri" id="czok">✓ Przeczytane</button><button id="czskip">Pomiń (oznacz jako przeczytane bez czytania)</button><button id="cztom">📎 Tom</button></div>
          ${S.backlog.length ? `<p class="kx-muted">Masz ${S.backlog.length} zaległych pozycji wcześniej w kolejności – zobacz „Zaległe”.</p>` : ''}
        </div>
        <h3>Dalej w kolejce</h3><div>${upcoming.map(x => itemRow(x, S, idx, { sec: x.sec !== nx.sec, upto: true })).join('')}</div>`;
      body.querySelector('#czok').onclick = async () => { await setRead([nx], true); App.ui.toast('✓ ' + nx.title); App.refresh(); };
      body.querySelector('#czskip').onclick = async () => { await DB.put('readingOrder', Object.assign({}, S.ov.get(nx.id) || {}, { id: nx.id, order: nx.i + 1, part: nx.sec, title: nx.title, read: true, skipped: true, readAt: null })); App.refresh(); };
      body.querySelector('#cztom').onclick = () => assignVolume(nx, S);
      if (App.has('polki.html') && S.vols(nx).length) { // gdzie stoi tom z następnym zeszytem
        Promise.all(S.vols(nx).map(i => DB.get('comics', i))).then(cs => { const h = cs.filter(Boolean).map(k => App.call('polki.html', 'comic', k)).filter(Boolean); const p = body.querySelector('#czpolka'); if (p && h.length) p.innerHTML = [...new Set(h)].join(' '); });
      }
      bindRows(body, S);
    } else if (cz.view === 'backlog') {
      body.innerHTML = S.backlog.length ? `<p class="kx-muted">Pozycje przed miejscem, w którym jesteś, które nie są odznaczone. Odznacz, gdy przeczytasz.</p>${S.backlog.map(x => itemRow(x, S, idx, { sec: true })).join('')}` : '<p>Brak zaległości 👍</p>';
      bindRows(body, S);
    } else if (cz.view === 'all') {
      if (cz.sec == null) cz.sec = nx ? nx.sec : MRO.secs[0];
      const q = norm(cz.q);
      const rows = q ? L.filter(x => norm(x.title).includes(q)) : L.filter(x => x.sec === cz.sec);
      const PER = 150; const pages = Math.max(1, Math.ceil(rows.length / PER));
      if (params.goto) { const p = rows.findIndex(x => x.i === +params.goto); if (p >= 0) cz.page = Math.floor(p / PER); }
      if (cz.page >= pages) cz.page = 0;
      body.innerHTML = `
        <div class="kx-bar"><select id="czsec">${MRO.secs.map(s => { const r = L.filter(x => x.sec === s && x.typ === 0); const d = r.filter(S.isRead).length; return `<option value="${esc(s)}" ${s === cz.sec ? 'selected' : ''}>${esc(s)} (${d}/${r.length})</option>`; }).join('')}</select>
        <input type="search" id="czq" placeholder="Szukaj w całej kolejności…" value="${esc(cz.q)}">
        ${nx ? '<button id="czgo">Skocz do następnego</button>' : ''}</div>
        ${pages > 1 ? pager(pages) : ''}
        <div>${rows.slice(cz.page * PER, cz.page * PER + PER).map(x => itemRow(x, S, idx, { sec: !!q, upto: true })).join('')}</div>
        ${pages > 1 ? pager(pages) : ''}`;
      function pager(n) { return `<div class="kx-chips">${Array.from({ length: n }, (_, i) => `<button class="kx-chip ${i === cz.page ? 'on' : ''}" data-p="${i}">${i * PER + 1}–${Math.min(rows.length, (i + 1) * PER)}</button>`).join('')}</div>`; }
      body.querySelector('#czsec').onchange = e => { cz.sec = e.target.value; cz.page = 0; cz.q = ''; App.refresh(); };
      const qi = body.querySelector('#czq'); qi.onchange = e => { cz.q = e.target.value; cz.page = 0; App.refresh(); };
      body.querySelectorAll('[data-p]').forEach(b => b.onclick = () => { cz.page = +b.dataset.p; App.refresh(); });
      if (nx) body.querySelector('#czgo').onclick = () => { cz.sec = nx.sec; cz.q = ''; App.go('czytanie', { v: 'all', goto: nx.i }); };
      bindRows(body, S);
    } else if (cz.view === 'postac') {
      renderPostac(body, S, idx);
    } else if (cz.view === 'historia') {
      renderHistoria(body, S);
    } else {
      renderOpcje(body, S);
    }
  }

  async function renderOpcje(body, S) {
    const urls = {}; MRO.list.forEach(x => { if (x.typ === 3 && x.title.startsWith('http') && !urls[x.sec]) urls[x.sec] = x.title; });
    body.innerHTML = `
      <div class="card">
        <h3>Co liczy się do „następnego”</h3>
        <label class="chk"><input type="checkbox" id="opom" ${S.opt.pomin ? 'checked' : ''}> Pomijaj pozycje oznaczone w arkuszu „Skip? = TAK” (fillery)</label>
        <p>Części wyłączone z kolejki:</p>
        <div class="kx-chips">${MRO.secs.map(s => `<button class="kx-chip ${S.opt.wyl.includes(s) ? '' : 'on'}" data-s="${esc(s)}">${esc(s)}</button>`).join('')}</div>
        <p class="kx-muted">Podświetlone = w kolejce. Kliknij, żeby wyłączyć/włączyć (np. Star Wars, Ultimate).</p>
      </div>
      <div class="card">
        <h3>Aktualizacja ze strony comicbookreadingorders.com</h3>
        <p>Strona czasem się zmienia. Otwórz właściwą część, zaznacz całą listę (Ctrl+A), skopiuj i wklej poniżej. Aplikacja dopasuje pozycje po tytułach: przeczytane zostaną, nowe dojdą w odpowiednim miejscu, usunięte ze strony znikną z kolejki.</p>
        <div class="kx-bar"><select id="usec">${MRO.secs.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('')}<option value="__new">+ Nowa część…</option></select>
        <a id="ulink" target="_blank" rel="noopener" href="https://comicbookreadingorders.com/marvel/marvel-master-reading-order/">Otwórz stronę ↗</a></div>
        <textarea id="utxt" rows="8" style="width:100%" placeholder="Wklej tu skopiowany tekst strony…"></textarea>
        <div class="kx-btns"><button class="pri" id="uprev">Sprawdź zmiany</button></div>
        <div id="ures"></div>
      </div>
      <p class="kx-muted">Dane bazowe: arkusz „Marvel Master Reading Order.xlsx” (import ${esc(MRO.data)}).</p>`;
    const saveOpt = async patch => { await DB.setting('mroOpcje', Object.assign({}, S.opt, patch)); App.refresh(); };
    body.querySelector('#opom').onchange = e => saveOpt({ pomin: e.target.checked });
    body.querySelectorAll('[data-s]').forEach(b => b.onclick = () => { const s = b.dataset.s; const w = S.opt.wyl.includes(s) ? S.opt.wyl.filter(x => x !== s) : S.opt.wyl.concat(s); saveOpt({ wyl: w }); });
    const sel = body.querySelector('#usec'), link = body.querySelector('#ulink');
    const setLink = () => { link.href = urls[sel.value] || 'https://comicbookreadingorders.com/marvel/marvel-master-reading-order/'; };
    sel.onchange = setLink; setLink();
    body.querySelector('#uprev').onclick = async () => {
      let sec = sel.value; let after = null;
      if (sec === '__new') { const r = await App.ui.form('Nowa część', [{ name: 'n', label: 'Nazwa (np. Part 12)' }, { name: 'a', label: 'Wstaw po części', type: 'select', options: MRO.secs, value: MRO.secs[MRO.secs.length - 1] }]); if (!r || !r.n) return; sec = r.n; after = r.a; }
      const plan = planUpdate(sec, body.querySelector('#utxt').value);
      const res = body.querySelector('#ures');
      if (!plan.rows.length) { res.innerHTML = '<p>Nie znalazłem w tekście żadnych pozycji.</p>'; return; }
      res.innerHTML = `<p><b>${esc(sec)}</b>: ${plan.rows.length} pozycji na stronie · dopasowane ${plan.matched} · nowe ${plan.added.length} · usunięte ze strony ${plan.removed.length}</p>
        ${plan.added.length ? `<details><summary>Nowe (${plan.added.length})</summary>${plan.added.slice(0, 300).map(t => `<div>${esc(t)}</div>`).join('')}</details>` : ''}
        ${plan.removed.length ? `<details><summary>Znikną (${plan.removed.length})</summary>${plan.removed.slice(0, 300).map(t => `<div>${esc(t)}</div>`).join('')}</details>` : ''}
        <div class="kx-btns"><button class="pri" id="uok">Zastosuj aktualizację</button></div>`;
      res.querySelector('#uok').onclick = async () => {
        await DB.setting('mroSekcja:' + sec, { rows: plan.rows, after, data: new Date().toISOString() });
        MRO = null; App.ui.toast('Zaktualizowano ' + sec); cz.view = 'next'; App.refresh();
      };
    };
  }
  // Dopasowanie wklejonego tekstu do istniejącej części. Zwraca wiersze [id, tytuł, event, typ, wydanie, dodatki]
  function planUpdate(sec, text) {
    const old = MRO.list.filter(x => x.sec === sec);
    const main = old.filter(x => !x.ev || x.typ === 2);
    const evBlocks = {}; old.filter(x => x.ev && x.typ !== 2).forEach(x => (evBlocks[norm(x.ev)] = evBlocks[norm(x.ev)] || []).push(x));
    const pool = new Map(); main.forEach(x => { const k = norm(x.title.replace(/\s+-\s+.*$/, '')); (pool.get(k) || pool.set(k, []).get(k)).push(x); });
    const lines = text.split(/\r?\n/).map(s => s.replace(/ /g, ' ').trim()).filter(s => s && s.length < 160);
    const start = lines.findIndex(s => /#\s?\d|Read .+ here/i.test(s));
    const rows = []; let matched = 0; const added = []; const used = new Set(); const usedEv = new Set();
    for (const line of lines.slice(Math.max(0, start))) {
      if (/^(share|tweet|pin|related|leave a reply|previous|next|comments?)\b/i.test(line)) continue;
      const m = line.match(/^Read (.+?) here\.?$/i);
      const isIssue = m || /#\s?-?[\d½]|Annual|One-Shot|Special|Giant-Size|\(\d{4}\)/i.test(line);
      if (!isIssue) continue;
      const k = norm(line.replace(/\s+-\s+.*$/, ''));
      const cand = (pool.get(k) || []).find(x => !used.has(x.id));
      let id;
      if (cand) { used.add(cand.id); id = cand.id; matched++; } else { id = 'mro-u' + Math.abs([...k].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)).toString(36) + rows.length.toString(36); added.push(line); }
      if (m) {
        rows.push([id, line, null, 2, '', { ev: m[1] }]);
        const blk = Object.entries(evBlocks).find(([e]) => !usedEv.has(e) && (e === norm(m[1]) || e.includes(norm(m[1])) || norm(m[1]).includes(e)));
        if (blk) { usedEv.add(blk[0]); blk[1].forEach(x => rows.push([x.id, x.title, x.ev, x.typ, x.wyd, x.ex])); }
      } else rows.push([id, line, null, 0, cand ? cand.wyd : '', cand ? cand.ex : {}]);
    }
    Object.entries(evBlocks).forEach(([e, b]) => { if (!usedEv.has(e) && rows.length) b.forEach(x => rows.push([x.id, x.title, x.ev, x.typ, x.wyd, x.ex])); });
    const removed = main.filter(x => x.typ === 0 && !used.has(x.id)).map(x => x.title);
    return { rows, matched, added, removed };
  }

  /* ---------- zakładka ZAKUPY ---------- */
  async function editShop(it) {
    const v = it || { itemType: 'comic', publisher: 'Egmont', bought: false };
    const out = await App.ui.form(it ? 'Edytuj pozycję' : 'Dodaj do listy zakupów', [
      { name: 'title', label: 'Tytuł', value: v.title },
      { name: 'itemType', label: 'Rodzaj', type: 'select', value: v.itemType, options: [['comic', 'Komiks'], ['game', 'Gra planszowa'], ['other', 'Inne']] },
      { name: 'series', label: 'Seria (dla komiksu)', value: v.series, list: 'kx-serie' },
      { name: 'volume', label: 'Numer tomu', value: v.volume },
      { name: 'publisher', label: 'Wydawca', value: v.publisher },
      { name: 'releaseDate', label: 'Data premiery', type: 'date', value: v.releaseDate },
      { name: 'price', label: 'Cena (zł)', type: 'number', step: '0.01', value: v.price },
      { name: 'url', label: 'Link (np. zapowiedź Egmontu)', value: v.url, placeholder: 'https://…' },
      { name: 'notes', label: 'Notatki', type: 'textarea', value: v.notes, rows: 2 }
    ]);
    if (!out || !out.title) return;
    const vol = out.volume === '' ? null : (isNaN(+out.volume) ? out.volume : +out.volume);
    await DB.put('shoppingList', Object.assign({}, it || {}, out, { volume: vol }));
    App.refresh();
  }
  async function renderZakupy(el) {
    css();
    await ensureSeed();
    const all = await DB.all('shoppingList');
    let dl = document.getElementById('kx-serie'); if (!dl) { dl = document.createElement('datalist'); dl.id = 'kx-serie'; document.body.appendChild(dl); }
    dl.innerHTML = [...new Set(SERIE_START.concat((await DB.all('comics')).map(x => x.series)))].map(s => `<option value="${esc(s)}">`).join('');
    const todo = all.filter(x => !x.bought).sort((a, b) => (a.releaseDate || '9999').localeCompare(b.releaseDate || '9999') || (a.title || '').localeCompare(b.title || '', 'pl'));
    const done = all.filter(x => x.bought).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    const sum = todo.reduce((s, x) => s + (+x.price || 0), 0);
    const today = App.ui.today();
    const row = x => `<div class="kx-row ${x.bought ? 'read' : ''}"><input type="checkbox" data-b="${esc(x.id)}" ${x.bought ? 'checked' : ''} title="Kupione">
      <div class="kx-main"><div class="kx-tt">${esc(x.title)}</div>
      <div class="kx-muted">${{ comic: '📚', game: '🎲', other: '•' }[x.itemType] || ''} ${esc([x.series && x.series + (x.volume != null ? ' #' + x.volume : ''), x.publisher].filter(Boolean).join(' · '))}
      ${x.releaseDate ? ` · premiera ${App.ui.fmtDate(x.releaseDate)}${!x.bought && x.releaseDate <= today ? ' <span class="kx-b own">już jest</span>' : ''}` : ''}${x.price ? ` · ${(+x.price).toFixed(2)} zł` : ''}
      ${x.url ? ` · <a href="${esc(x.url)}" target="_blank" rel="noopener">link</a>` : ''} · <a target="_blank" rel="noopener" href="https://www.ceneo.pl/;szukaj-${encodeURIComponent(x.title)}">porównaj ceny</a>
      ${x.notes ? `<div>${esc(x.notes)}</div>` : ''}</div></div>
      <button class="ghost" data-e="${esc(x.id)}">✏️</button><button class="ghost" data-d="${esc(x.id)}">🗑</button></div>`;
    el.innerHTML = `
      <h2>Lista zakupów</h2>
      <div class="kx-btns"><button class="pri" id="zadd">+ Dodaj</button>
        <a href="https://www.google.com/search?q=egmont+marvel+zapowiedzi" target="_blank" rel="noopener">Szukaj zapowiedzi Marvela ↗</a></div>
      <p class="kx-muted">${todo.length} do kupienia${sum ? ` · razem ok. ${sum.toFixed(2)} zł` : ''}. Brakujące tomy dodasz też z karty komiksu („🛒 Do listy zakupów”).</p>
      <div id="kx-zap" class="card" style="margin:8px 0"></div>
      <div>${todo.map(row).join('') || '<p>Lista jest pusta.</p>'}</div>
      ${done.length ? `<details><summary>Kupione (${done.length})</summary>${done.slice(0, 200).map(row).join('')}</details>` : ''}`;
    el.querySelector('#zadd').onclick = () => editShop(null);
    if (window.KXZapowiedzi) window.KXZapowiedzi.render(el.querySelector('#kx-zap')); else el.querySelector('#kx-zap').remove();
    el.querySelectorAll('[data-e]').forEach(b => b.onclick = async () => editShop(await DB.get('shoppingList', b.dataset.e)));
    el.querySelectorAll('[data-d]').forEach(b => b.onclick = async () => { await DB.remove('shoppingList', b.dataset.d); App.refresh(); });
    el.querySelectorAll('[data-b]').forEach(cb => cb.onchange = async () => {
      const x = await DB.get('shoppingList', cb.dataset.b);
      await DB.put('shoppingList', Object.assign({}, x, { bought: cb.checked }));
      if (cb.checked && x.itemType === 'comic') {
        let c = x.comicId ? await DB.get('comics', x.comicId) : null;
        if (!c && x.series) c = (await DB.all('comics')).find(k => k.series === x.series && String(k.volume) === String(x.volume));
        if (c) { await DB.put('comics', Object.assign({}, c, { status: 'owned' })); App.ui.toast('Oznaczono w kolekcji jako „mam”'); }
        else if (await App.ui.confirm(`Dodać „${x.title}” do kolekcji komiksów?`)) {
          await DB.put('comics', { title: x.title, series: x.series || '', volume: x.volume, publisher: x.publisher, status: 'owned', read: false, notes: x.price ? `Kupione za ${x.price} zł` : '' });
          App.ui.toast('Dodano do kolekcji');
        }
      }
      App.refresh();
    });
  }

  // Dla modułu „Postęp czytania”: lista Master Reading Order i stan przeczytanych
  App.provide('komiksy.mro', async () => { await ensureSeed(); const S = await mroState(); return { list: MRO.list, secs: MRO.secs, S }; });
  App.registerModule({ id: 'komiksy', title: 'Komiksy', icon: '📚', order: 20, render: renderKomiksy });
  App.registerModule({ id: 'czytanie', title: 'Do czytania', icon: '📖', order: 21, render: renderCzytanie });
  App.registerModule({ id: 'zakupy', title: 'Zakupy', icon: '🛒', order: 30, render: renderZakupy });
  // usługa dla innych modułów: następny komiks do czytania (np. na stronę główną)
  App.provide('komiksy.nastepny', async () => { const S = await mroState(); return S.next ? { title: S.next.title, part: S.next.sec, wyd: S.next.wyd } : null; });
  App.provide('komiksy.seed', ensureSeed);
  App.provide('zakupy.dodaj', async item => DB.put('shoppingList', Object.assign({ bought: false }, item)));
})();
