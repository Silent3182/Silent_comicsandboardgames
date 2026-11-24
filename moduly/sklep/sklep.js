/* Moduł „W sklepie” (🔎): szybkie sprawdzenie „mam / nie mam / na liście zakupów” po tytule albo kodzie kreskowym.
 *  - Skaner (skaner.js) czyta EAN/ISBN aparatem. Znany kod → od razu werdykt.
 *  - Nieznany kod → szukamy tytułu w internecie (ISBN: Google Books, Biblioteka Narodowa, Open Library;
 *    inne EAN: upcitemdb) i podpowiadamy pasujące pozycje z kolekcji. „To ten” zapamiętuje kod w pozycji
 *    (pole `barcode` w games / comics / shoppingList), więc następnym razem rozpozna od razu.
 *  - Z wyniku: dodanie do kolekcji (kupiłem), do listy zakupów, oznaczenie pozycji z listy jako kupionej.
 *  - Na telefonie pływający przycisk 📷 na każdym ekranie = skanowanie jednym kliknięciem.
 *  - Czytnik kodów na USB (działa jak klawiatura) też zadziała: kod + Enter w polu wyszukiwania.
 * Usługa: App.call('sklep.skanuj') – otwiera skaner i pokazuje wynik.
 */
(function () {
  const esc = s => App.ui.esc(s);
  const norm = s => String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l')
    .replace(/[^a-z0-9]+/g, ' ').trim();
  const STOP = new Set(['i', 'w', 'z', 'na', 'the', 'of', 'a', 'and', 'tom', 't', 'vol', 'czesc', 'cz', 'nr', 'egmont', 'komiks', 'gra', 'planszowa', 'edycja', 'wydanie', 'pl', 'polska', 'wersja']);
  const words = s => norm(s).split(' ').filter(w => w && !STOP.has(w));
  const zl = n => (Math.round(n * 100) / 100).toLocaleString('pl-PL', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' zł';

  function css() {
    if (document.getElementById('sk-css')) return;
    const st = document.createElement('style'); st.id = 'sk-css';
    st.textContent = `
.sk-top{display:flex;gap:10px;align-items:stretch;margin:6px 0 12px;flex-wrap:wrap}
.sk-top input[type=search]{flex:1 1 220px;font-size:17px;padding:12px 14px 12px 38px}
.sk-scan{font-size:16px;padding:12px 18px;min-height:48px}
.sk-v{border-radius:var(--radius);padding:16px 18px;margin:0 0 12px;display:flex;gap:14px;align-items:center;border:1px solid var(--line);background:var(--surface)}
.sk-v .i{font-size:34px;line-height:1}
.sk-v b{font-size:20px;display:block;line-height:1.25}
.sk-v .d{color:var(--muted);font-size:13.5px}
.sk-v.own{background:var(--ok-soft);border-color:transparent}
.sk-v.own b{color:var(--ok)}
.sk-v.list{background:var(--accent-2-soft);border-color:transparent}
.sk-v.no{background:var(--bad-soft);border-color:transparent}
.sk-v.no b{color:var(--bad)}
.sk-v.maybe{background:var(--accent-soft);border-color:transparent}
.sk-acts{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 14px}
.sk-st{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11.5px;font-weight:650;white-space:nowrap}
.sk-st.own{background:var(--ok);color:var(--on-ok)}
.sk-st.list{background:var(--accent-2);color:#241a05}
.sk-st.no{background:var(--surface2);color:var(--muted)}
.sk-st.sold{background:var(--muted);color:var(--surface)}
.sk-st.loan{background:var(--accent);color:var(--on-accent)}
.sk-code{font-family:ui-monospace,Consolas,monospace;font-size:13px;color:var(--muted)}
.sk-li .act{flex-shrink:0}
.sk-hint{color:var(--muted);font-size:13.5px;margin:4px 0 12px}
#sk-fab{position:fixed;right:16px;bottom:calc(var(--nav-h) + 18px + env(safe-area-inset-bottom));z-index:60;width:56px;height:56px;border-radius:18px;border:0;
  background:var(--accent);color:var(--on-accent);box-shadow:var(--shadow-lg);display:none;align-items:center;justify-content:center;padding:0;cursor:pointer}
#sk-fab svg{width:28px;height:28px}
@media (max-width:760px){ #sk-fab{display:flex} #sk-fab.hide{display:none} }
`;
    document.head.appendChild(st);
  }

  /* ---------- indeks całej kolekcji ---------- */
  async function buildIndex() {
    if (App.has('komiksy.seed')) { try { await App.call('komiksy.seed'); } catch (e) { /* brak danych startowych */ } }
    const [games, comics, shop, loans] = await Promise.all(['games', 'comics', 'shoppingList', 'loans'].map(s => DB.all(s).catch(() => [])));
    const loanBy = new Map(loans.filter(l => !l.returnedAt && l.direction !== 'in').map(l => [l.itemType + ':' + l.itemId, l]));
    const out = [];
    games.forEach(g => {
      const st = g.status === 'sold' ? 'sold' : g.status === 'wishlist' ? 'list' : 'own';
      out.push({ type: 'game', id: g.id, rec: g, title: g.title, sub: [g.isExpansion ? 'dodatek' : 'gra planszowa', g.year].filter(Boolean).join(' · '),
        st, stLab: { own: g.status === 'forSale' ? 'mam · na sprzedaż' : 'mam', sold: 'sprzedana', list: 'chcę mieć' }[st],
        barcode: g.barcode, thumb: g.thumb || g.image, loan: loanBy.get('game:' + g.id), text: window.Tytuly ? Tytuly.nazwy(g).join(' ') : g.title });
    });
    comics.forEach(c => {
      const st = c.status === 'sold' ? 'sold' : c.status === 'missing' ? 'no' : 'own';
      const vol = c.volume != null && c.volume !== '' ? ' #' + c.volume : '';
      out.push({ type: 'comic', id: c.id, rec: c, title: c.title || (c.series + vol), sub: [c.series ? c.series + vol : '', c.publisher].filter(Boolean).join(' · '),
        st, stLab: { own: c.status === 'forSale' ? 'mam · na sprzedaż' : 'mam', sold: 'sprzedany', no: 'brakuje' }[st],
        barcode: c.barcode, thumb: c.thumb || c.image, loan: loanBy.get('comic:' + c.id),
        text: [c.title, c.series, c.series && c.volume != null ? c.series + ' ' + c.volume : '', c.origTitle].filter(Boolean).join(' ') });
    });
    shop.filter(x => !x.bought).forEach(x => {
      const vol = x.volume != null && x.volume !== '' ? ' #' + x.volume : '';
      out.push({ type: 'shop', id: x.id, rec: x, title: x.title || (x.series + vol), sub: ['lista zakupów', x.series ? x.series + vol : '', x.releaseDate ? 'premiera ' + App.ui.fmtDate(x.releaseDate) : '', x.price ? zl(+x.price) : ''].filter(Boolean).join(' · '),
        st: 'list', stLab: 'na liście zakupów', barcode: x.barcode, text: [x.title, x.series, x.series && x.volume != null ? x.series + ' ' + x.volume : ''].filter(Boolean).join(' ') });
    });
    out.forEach(x => { x.key = ' ' + norm(x.text) + ' '; x.w = new Set(words(x.text)); });
    return out;
  }

  /* wyszukiwanie po tytule: wszystkie słowa muszą pasować (liczby jako całe słowa) */
  function search(idx, q) {
    const toks = norm(q).split(' ').filter(Boolean);
    if (!toks.length) return [];
    const res = idx.filter(x => toks.every(t => /^\d+$/.test(t) ? x.key.includes(' ' + t + ' ') : x.key.includes(t)));
    const rank = { own: 0, list: 1, no: 2, sold: 3 };
    return res.sort((a, b) => (rank[a.st] - rank[b.st]) || a.title.localeCompare(b.title, 'pl')).slice(0, 60);
  }
  /* dopasowanie tytułu z internetu do kolekcji (część wspólna słów) */
  function similar(idx, title, extra) {
    const q = words(title + ' ' + (extra || ''));
    if (!q.length) return [];
    const nums = q.filter(w => /^\d+$/.test(w));
    return idx.map(x => {
      let hit = 0; q.forEach(w => { if (x.w.has(w)) hit++; });
      const sc = hit / Math.max(3, Math.min(q.length, x.w.size + 1));
      const numOk = !nums.length || nums.some(n => x.w.has(n));
      return { x, sc: numOk ? sc : sc * 0.6 };
    }).filter(r => r.sc >= 0.34).sort((a, b) => b.sc - a.sc).slice(0, 6);
  }
  function verdict(list) {
    if (list.some(x => x.st === 'own')) return 'own';
    if (list.some(x => x.st === 'list')) return 'list';
    return 'no';
  }

  /* ---------- tytuł po kodzie z internetu ---------- */
  async function getJSON(url, ms = 6000) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
    try { const r = await fetch(url, { signal: ctl.signal }); if (!r.ok) return null; return await r.json(); }
    catch (e) { return null; } finally { clearTimeout(t); }
  }
  async function lookup(code) {
    const c = code.split('+')[0];
    if (Skaner.isIsbn(c)) {
      const g = await getJSON('https://www.googleapis.com/books/v1/volumes?q=isbn:' + c);
      const v = g && g.items && g.items[0] && g.items[0].volumeInfo;
      if (v && v.title) return { title: [v.title, v.subtitle].filter(Boolean).join(': '), who: (v.authors || []).join(', '), publisher: v.publisher, year: (v.publishedDate || '').slice(0, 4), image: v.imageLinks && (v.imageLinks.thumbnail || '').replace('http:', 'https:'), src: 'Google Books' };
      const bn = await getJSON('https://data.bn.org.pl/api/institutions/bibs.json?isbnIssn=' + c);
      const b = bn && bn.bibs && bn.bibs[0];
      if (b && b.title) return { title: b.title.replace(/\s*\/\s*$/, ''), who: b.author, publisher: b.publisher, year: b.publicationYear, src: 'Biblioteka Narodowa' };
      const ol = await getJSON('https://openlibrary.org/api/books?bibkeys=ISBN:' + c + '&format=json&jscmd=data');
      const o = ol && ol['ISBN:' + c];
      if (o && o.title) return { title: o.title, who: (o.authors || []).map(a => a.name).join(', '), publisher: o.publishers && o.publishers[0] && o.publishers[0].name, year: (o.publish_date || '').slice(-4), image: o.cover && o.cover.medium, src: 'Open Library' };
      return null;
    }
    const u = await getJSON('https://api.upcitemdb.com/prod/trial/lookup?upc=' + c);
    const it = u && u.items && u.items[0];
    if (it && it.title) return { title: it.title, who: it.brand, publisher: it.brand, image: it.images && it.images[0], src: 'upcitemdb' };
    return null;
  }

  /* ---------- akcje ---------- */
  const TYPE_STORE = { game: 'games', comic: 'comics', shop: 'shoppingList' };
  async function assignCode(x, code) {
    const rec = await DB.get(TYPE_STORE[x.type], x.id);
    if (!rec) return;
    if (rec.barcode && rec.barcode !== code && !await App.ui.confirm(`„${x.title}” ma już kod ${rec.barcode}. Zastąpić go kodem ${code}?`)) return false;
    await DB.put(TYPE_STORE[x.type], Object.assign({}, rec, { barcode: code }));
    App.ui.toast('Zapamiętałem kod dla: ' + x.title);
    return true;
  }
  async function seriesList() {
    const comics = await DB.all('comics').catch(() => []);
    return [...new Set(comics.map(c => c.series).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pl'));
  }
  function datalist(id, arr) {
    let dl = document.getElementById(id); if (!dl) { dl = document.createElement('datalist'); dl.id = id; document.body.appendChild(dl); }
    dl.innerHTML = arr.map(s => `<option value="${esc(s)}">`).join('');
  }
  async function addToCollection(pre = {}) {
    datalist('sk-serie', await seriesList());
    const isBook = pre.code && (Skaner.isIsbn(pre.code) || Skaner.isIssn(pre.code));
    const v = await App.ui.form('Dodaj do kolekcji', [
      { name: 'type', label: 'Co to jest?', type: 'select', value: pre.type || (isBook ? 'comic' : 'game'), options: [['comic', 'Komiks'], ['game', 'Gra planszowa']] },
      { name: 'title', label: 'Tytuł', value: pre.title || '' },
      { name: 'series', label: 'Seria (komiksy)', value: pre.series || '', list: 'sk-serie' },
      { name: 'volume', label: 'Numer tomu (komiksy)', type: 'number', value: pre.volume },
      { name: 'publisher', label: 'Wydawca', value: pre.publisher || '' },
      { name: 'pricePaid', label: 'Cena zakupu (zł)', type: 'number', step: '0.01', value: pre.price },
      { name: 'acquiredAt', label: 'Data zakupu', type: 'date', value: App.ui.today() },
      { name: 'barcode', label: 'Kod kreskowy / ISBN', value: pre.code || '' }
    ], { ok: 'Dodaj' });
    if (!v || !v.title) return null;
    const base = { title: v.title, publisher: v.publisher, pricePaid: v.pricePaid, acquiredAt: v.acquiredAt, barcode: v.barcode || undefined, status: 'owned' };
    if (pre.image) { base.image = pre.image; base.thumb = pre.image; }
    let rec;
    if (v.type === 'game') rec = await DB.put('games', Object.assign(base, { isExpansion: false, tags: [], year: pre.year ? +pre.year || null : null }));
    else rec = await DB.put('comics', Object.assign(base, { series: v.series, volume: v.volume, read: false, year: pre.year ? +pre.year || null : null }));
    if (pre.shopId) { const s = await DB.get('shoppingList', pre.shopId); if (s) await DB.put('shoppingList', Object.assign({}, s, { bought: true, boughtAt: App.ui.today() })); }
    App.ui.toast('Dodano do kolekcji: ' + v.title);
    return { type: v.type, rec };
  }
  async function addToShopping(pre = {}) {
    datalist('sk-serie', await seriesList());
    const v = await App.ui.form('Dodaj do listy zakupów', [
      { name: 'itemType', label: 'Rodzaj', type: 'select', value: pre.type || 'comic', options: [['comic', 'Komiks'], ['game', 'Gra planszowa'], ['other', 'Inne']] },
      { name: 'title', label: 'Tytuł', value: pre.title || '' },
      { name: 'series', label: 'Seria', value: pre.series || '', list: 'sk-serie' },
      { name: 'volume', label: 'Tom', type: 'number', value: pre.volume },
      { name: 'price', label: 'Cena w sklepie (zł)', type: 'number', step: '0.01', value: pre.price },
      { name: 'notes', label: 'Notatki', type: 'textarea', value: pre.notes || '' }
    ], { ok: 'Dodaj' });
    if (!v || !v.title) return;
    await DB.put('shoppingList', Object.assign(v, { publisher: pre.publisher || '', barcode: pre.code || undefined, bought: false }));
    App.ui.toast('Dodano do listy zakupów');
  }
  /* pozycja z listy zakupów kupiona → do kolekcji */
  async function boughtFromList(x, code) {
    const s = x.rec;
    if (s.comicId) {
      const c = await DB.get('comics', s.comicId);
      if (c) {
        await DB.put('comics', Object.assign({}, c, { status: 'owned', barcode: code || c.barcode, acquiredAt: App.ui.today(), pricePaid: c.pricePaid != null ? c.pricePaid : (s.price || null) }));
        await DB.put('shoppingList', Object.assign({}, s, { bought: true, boughtAt: App.ui.today() }));
        App.ui.toast('Masz już: ' + (c.title || s.title));
        return true;
      }
    }
    return !!await addToCollection({ type: s.itemType === 'game' ? 'game' : 'comic', title: s.title, series: s.series, volume: s.volume, publisher: s.publisher, price: s.price, code: code || s.barcode, shopId: s.id });
  }
  function openItem(x) {
    if (x.type === 'game') App.go('planszowki', { gra: x.id });
    else if (x.type === 'comic') App.go('komiksy', { id: x.id });
    else App.go('zakupy');
  }

  /* ---------- widok ---------- */
  const TYPE_ICO = { game: '🎲', comic: '📚', shop: '🛒' };
  function rowHtml(x, i, opt = {}) {
    const img = x.thumb ? `<img src="${esc(x.thumb)}" alt="" loading="lazy">` : `<div class="ph">${TYPE_ICO[x.type]}</div>`;
    const loan = x.loan ? ` <span class="sk-st loan">u: ${esc(x.loan.person)}</span>` : '';
    return `<div class="li sk-li" data-i="${i}">${img}<div class="main"><div class="t">${esc(x.title)}</div>
      <div class="s"><span class="sk-st ${x.st}">${esc(x.stLab)}</span>${loan} ${esc(x.sub)}</div></div>
      ${opt.assign ? `<button class="small act" data-as="${i}">To ten ✓</button>` : ''}
      ${x.type === 'shop' ? `<button class="small act" data-buy="${i}">Kupiłem</button>` : ''}</div>`;
  }
  const VERD = {
    own: ['✅', 'Masz to w kolekcji'],
    list: ['🛒', 'Na liście zakupów – nie masz'],
    no: ['❌', 'Nie masz tego'],
    maybe: ['🤔', 'Prawdopodobnie masz'],
    unknown: ['❔', 'Nie znam tego kodu']
  };
  function verdictHtml(kind, title, desc) {
    const [i, lab] = VERD[kind];
    return `<div class="sk-v ${kind === 'unknown' ? '' : kind}"><div class="i">${i}</div><div><b>${esc(title || lab)}</b>${title ? `<div>${esc(lab)}</div>` : ''}${desc ? `<div class="d">${desc}</div>` : ''}</div></div>`;
  }

  async function render(el, params) {
    css();
    el.innerHTML = `<h1>W sklepie</h1>
      <div class="sk-top">
        <input type="search" id="skq" placeholder="Tytuł, seria i tom (np. thorgal 41) albo kod" autocomplete="off" enterkeyhint="search" value="${esc(params.q || '')}">
        <button class="primary sk-scan" id="skscan">📷 Skanuj kod</button>
      </div>
      <div id="skout"><p class="muted">Ładuję kolekcję…</p></div>`;
    const out = el.querySelector('#skout'), q = el.querySelector('#skq');
    let idx = await buildIndex();
    const reindex = async () => { idx = await buildIndex(); };

    const bindRows = (list, code) => {
      out.querySelectorAll('.sk-li').forEach(r => r.onclick = e => {
        if (e.target.closest('button')) return;
        openItem(list[+r.dataset.i]);
      });
      out.querySelectorAll('[data-as]').forEach(b => b.onclick = async () => {
        if (await assignCode(list[+b.dataset.as], code)) { await reindex(); showCode(code); }
      });
      out.querySelectorAll('[data-buy]').forEach(b => b.onclick = async () => {
        if (await boughtFromList(list[+b.dataset.buy], code)) { await reindex(); code ? showCode(code) : showSearch(q.value); }
      });
    };

    function showEmpty() {
      const counts = { own: idx.filter(x => x.st === 'own').length, list: idx.filter(x => x.type === 'shop').length, codes: idx.filter(x => x.barcode).length };
      out.innerHTML = `<div class="empty">Zeskanuj kod z tyłu komiksu lub pudełka gry albo wpisz kawałek tytułu.<br>
        <span class="muted">W kolekcji: ${counts.own} pozycji · na liście zakupów: ${counts.list} · zapamiętane kody: ${counts.codes}</span></div>
        ${idx.some(x => x.type === 'comic') ? '' : '<p class="sk-hint">Komiksy wczytają się po pierwszym otwarciu zakładki Komiksy.</p>'}`;
    }

    function showSearch(text) {
      const t = text.trim();
      if (!t) return showEmpty();
      const list = search(idx, t);
      const v = list.length ? verdict(list) : 'no';
      const first = list.find(x => x.st === v);
      out.innerHTML = (list.length ? verdictHtml(v, list.length === 1 ? first.title : '', v === 'own' && list.length > 1 ? `Pasuje ${list.length} pozycji – sprawdź poniżej.` : '') : verdictHtml('no', '', 'Nic w kolekcji ani na liście zakupów nie pasuje do „' + esc(t) + '”.'))
        + `<div class="sk-acts">${v !== 'own' ? `<button id="skadd">➕ Kupiłem – dodaj do kolekcji</button>` : ''}${v === 'no' ? `<button id="skshop">🛒 Na listę zakupów</button>` : ''}</div>`
        + (list.length ? `<div class="card list">${list.map((x, i) => rowHtml(x, i)).join('')}</div>` : '');
      bindRows(list, null);
      const a = out.querySelector('#skadd'); if (a) a.onclick = async () => { if (await addToCollection({ title: t })) { await reindex(); showSearch(t); } };
      const s = out.querySelector('#skshop'); if (s) s.onclick = async () => { await addToShopping({ title: t }); await reindex(); showSearch(t); };
    }

    async function showCode(code) {
      q.value = '';
      const base = code.split('+')[0];
      // kod czasopisma bez numeru tomu: zapytaj o numer (inaczej każdy tom ma ten sam kod)
      if (Skaner.isIssn(code) && !code.includes('+')) {
        const v = await App.ui.form('Kod czasopisma / kolekcji', [
          { type: 'html', html: `<p class="muted">Kod <span class="sk-code">${esc(code)}</span> jest wspólny dla całej kolekcji (np. Hachette). Obok kodu są małe cyfry z numerem tomu – wpisz je, żeby rozróżnić tomy.</p>` },
          { name: 'nr', label: 'Numer (małe cyfry obok kodu)', type: 'number' }
        ], { ok: 'Dalej' });
        if (v && v.nr != null) code = base + '+' + String(v.nr).padStart(2, '0');
      }
      const hits = idx.filter(x => x.barcode && x.barcode === code);
      const head = `<p class="sk-code">Kod: ${esc(code)}</p>`;
      if (hits.length) {
        const v = verdict(hits); const first = hits.find(x => x.st === v) || hits[0];
        out.innerHTML = head + verdictHtml(v, first.title, first.loan ? 'Teraz pożyczone: ' + esc(first.loan.person) : '')
          + `<div class="sk-acts"><button class="primary" id="sknext">📷 Skanuj następny</button>${v !== 'own' && !hits.some(x => x.type === 'shop') ? '<button id="skadd">➕ Kupiłem – dodaj</button>' : ''}${v === 'no' ? '<button id="skshop">🛒 Na listę zakupów</button>' : ''}</div>`
          + `<div class="card list">${hits.map((x, i) => rowHtml(x, i)).join('')}</div>`;
        bindRows(hits, code);
        out.querySelector('#sknext').onclick = scan;
        const a = out.querySelector('#skadd'); if (a) a.onclick = async () => { if (await addToCollection({ code, title: first.title, type: first.type === 'game' ? 'game' : 'comic', series: first.rec.series, volume: first.rec.volume })) { await reindex(); showCode(code); } };
        const s = out.querySelector('#skshop'); if (s) s.onclick = async () => { await addToShopping({ code, title: first.title }); await reindex(); showCode(code); };
        return;
      }
      out.innerHTML = head + verdictHtml('unknown', '', 'Szukam tytułu w internecie…');
      const info = navigator.onLine === false ? null : await lookup(code);
      const cand = info ? similar(idx, info.title) : [];
      const list = cand.map(c => c.x);
      const best = cand[0];
      let vk = 'unknown', vt = '', vd = '';
      if (info) {
        vt = info.title;
        vd = esc([info.who, info.publisher, info.year].filter(Boolean).join(' · ')) + ` <span class="muted">(${esc(info.src)})</span>`;
        if (best && best.sc >= 0.75) vk = best.x.st === 'own' ? 'maybe' : best.x.st === 'list' ? 'list' : 'no';
        else vk = list.some(x => x.st === 'own') ? 'unknown' : 'no';
      } else {
        vd = navigator.onLine === false ? 'Brak internetu – wpisz tytuł poniżej, żeby sprawdzić.' : 'Nie znalazłem tytułu dla tego kodu – wpisz tytuł poniżej, żeby sprawdzić.';
      }
      out.innerHTML = head + verdictHtml(vk, vt, vd)
        + (list.length ? `<p class="sk-hint">${vk === 'maybe' ? 'Najbardziej pasuje pierwsza pozycja.' : 'Podobne pozycje z kolekcji.'} Kliknij „To ten ✓”, a zapamiętam kod i następnym razem rozpoznam od razu.</p><div class="card list">${list.map((x, i) => rowHtml(x, i, { assign: true })).join('')}</div>` : '')
        + `<div class="row" style="margin:12px 0"><input type="search" id="skt" placeholder="Wpisz tytuł, żeby znaleźć w kolekcji" style="flex:1 1 200px"></div><div id="skt-out"></div>`
        + `<div class="sk-acts"><button class="primary" id="sknext">📷 Skanuj następny</button><button id="skadd">➕ Kupiłem – dodaj do kolekcji</button><button id="skshop">🛒 Na listę zakupów</button>
           <a class="btn" target="_blank" rel="noopener" href="https://www.google.com/search?q=${encodeURIComponent(base)}">Szukaj kodu w Google ↗</a></div>`;
      bindRows(list, code);
      out.querySelector('#sknext').onclick = scan;
      const pre = { code, title: info ? info.title : '', publisher: info && info.publisher, year: info && info.year, image: info && info.image };
      out.querySelector('#skadd').onclick = async () => { if (await addToCollection(pre)) { await reindex(); showCode(code); } };
      out.querySelector('#skshop').onclick = async () => { await addToShopping(pre); await reindex(); showCode(code); };
      const tIn = out.querySelector('#skt'), tOut = out.querySelector('#skt-out');
      tIn.oninput = () => {
        const l = search(idx, tIn.value);
        tOut.innerHTML = tIn.value.trim() ? (l.length ? `<div class="card list">${l.map((x, i) => rowHtml(x, i, { assign: true })).join('')}</div>` : '<p class="muted">Nic nie pasuje – to znaczy, że tego nie masz.</p>') : '';
        tOut.querySelectorAll('.sk-li').forEach(r => r.onclick = e => { if (!e.target.closest('button')) openItem(l[+r.dataset.i]); });
        tOut.querySelectorAll('[data-as]').forEach(b => b.onclick = async () => { if (await assignCode(l[+b.dataset.as], code)) { await reindex(); showCode(code); } });
        tOut.querySelectorAll('[data-buy]').forEach(b => b.onclick = async () => { if (await boughtFromList(l[+b.dataset.buy], code)) { await reindex(); showCode(code); } });
      };
    }

    async function scan() {
      const code = await Skaner.open({ title: 'Skanuj kod – sprawdzę, czy masz' });
      if (code) showCode(code);
    }

    let tmr = null;
    q.oninput = () => { clearTimeout(tmr); tmr = setTimeout(() => showSearch(q.value), 120); };
    q.onkeydown = e => {
      if (e.key !== 'Enter') return;
      const c = Skaner.normCode(q.value);
      if (/^\d{8,13}(\+\d{2,5})?$/.test(c) && Skaner.validEan(c)) { e.preventDefault(); clearTimeout(tmr); showCode(c); }
    };
    el.querySelector('#skscan').onclick = scan;

    if (params.kod) showCode(Skaner.normCode(params.kod));
    else if (params.q) showSearch(params.q);
    else showEmpty();
    if (params.scan) { history.replaceState(null, '', '#/sklep'); scan(); }
    else if (!matchMedia('(pointer:coarse)').matches) q.focus();
  }

  App.registerModule({ id: 'sklep', title: 'W sklepie', icon: '🔎', order: 25, render });
  App.provide('sklep.skanuj', () => App.go('sklep', { scan: 1 }));

  /* pływający przycisk skanowania na telefonie (na każdym ekranie poza samym „W sklepie”) */
  function fab() {
    css();
    let b = document.getElementById('sk-fab');
    if (!b) {
      b = document.createElement('button'); b.id = 'sk-fab'; b.setAttribute('aria-label', 'Skanuj kod – czy to mam?'); b.title = 'Skanuj kod – czy to mam?';
      b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 8v8M10 8v8M13 8v8M16 8v8" stroke-width="1.6"/></svg>';
      b.onclick = () => App.go('sklep', { scan: 1 });
      document.body.appendChild(b);
    }
    b.classList.toggle('hide', /^#\/?sklep/.test(location.hash));
  }
  window.addEventListener('hashchange', fab);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fab); else fab();
})();
