/* Moduł „Tryb imprezy” (🎉): kod QR na stole – goście skanują go telefonem i sami dopisują się do rozgrywki
 * (imię, kolor, a na koniec wynik). Gospodarz widzi ich na żywo, a potem jednym przyciskiem
 * zapisuje rozgrywkę albo przekazuje graczy do „Licznika punktów”.
 *
 * Jak to działa bez własnego serwera: telefon gościa otwiera stronę impreza.html#t=<losowy kanał>,
 * a wiadomości idą przez darmowy pośrednik ntfy.sh (kanał = losowe 20 znaków, nie do zgadnięcia).
 * Przez pośrednika przechodzą tylko: imiona gości, kolory, wyniki i tytuł gry. Nic z kolekcji ani z bazy graczy.
 * Wiadomości znikają z ntfy.sh po 12 godzinach. Bez internetu gości można dopisać ręcznie.
 * Stan trwającej imprezy: localStorage 'impreza.stan' (na tym urządzeniu).
 */
(function () {
  const { esc } = App.ui;
  const K = () => window.KS;
  const RELAY = 'https://ntfy.sh/';
  const PAGES = 'https://silent3182.github.io/Silent_comicsandboardgames/';
  const KEY = 'impreza.stan';
  const natywna = () => !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  const baza = () => (!natywna() && /^https?:$/.test(location.protocol)) ? location.origin + location.pathname.replace(/[^/]*$/, '') : PAGES;
  const wczytaj = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } };
  const zapisz = s => { try { if (s) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY); } catch (e) {} };
  const losowy = n => { const a = new Uint8Array(n); crypto.getRandomValues(a); return [...a].map(x => 'abcdefghijkmnpqrstuvwxyz23456789'[x % 32]).join(''); };
  const PALETA = ['#2f6fde', '#e0242f', '#2c9a57', '#e09b17', '#8a3ffc', '#14a89b', '#f06a24', '#d6337f', '#4b5bd6', '#6b7280'];

  window.IKONY = window.IKONY || {};
  window.IKONY.impreza = '<rect class="f" x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect class="f" x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect class="f" x="3.5" y="13.5" width="7" height="7" rx="1.5"/><path d="M14 14h2.5v2.5H14zM18 18h2.5v2.5H18zM18 14h2.5M14 18v2.5"/>';
  if (window.IKONY_KOLOR) window.IKONY_KOLOR.impreza = '#d6337f';

  function css() {
    if (document.getElementById('im-css')) return;
    const st = document.createElement('style'); st.id = 'im-css';
    st.textContent = `
.im-grid{display:grid;grid-template-columns:minmax(240px,320px) 1fr;gap:16px;align-items:start}
@media (max-width:760px){.im-grid{grid-template-columns:1fr}}
.im-qr{background:#fff;border-radius:16px;padding:12px;display:flex;justify-content:center}
.im-qr svg{width:100%;max-width:300px;height:auto}
.im-big{position:fixed;inset:0;z-index:200;background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:20px;color:#1a1f26}
.im-big svg{width:min(86vw,70vh);height:auto}
.im-big h2{margin:0;text-align:center}
.im-st{font-size:13px;color:var(--muted);display:flex;align-items:center;gap:6px}
.im-dot{width:9px;height:9px;border-radius:50%;background:var(--muted);display:inline-block}
.im-dot.ok{background:var(--ok)}.im-dot.bad{background:var(--bad)}
.im-p{display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid var(--line)}
.im-p:last-child{border-bottom:0}
.im-p .n{flex:1;min-width:0}
.im-p .n b{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.im-p select{max-width:170px;padding:6px 8px;font-size:13px}
.im-p input{width:80px;text-align:right;padding:6px 8px}
.im-new{animation:imIn .8s ease}
@keyframes imIn{from{background:var(--ok-soft)}to{background:transparent}}
.im-gres{display:flex;flex-direction:column;gap:2px;max-height:240px;overflow:auto;margin-top:4px}
.im-gres button{justify-content:flex-start;text-align:left;border:0;background:none;display:flex;gap:10px;align-items:center}
.im-gres img{width:34px;height:34px;object-fit:contain;border-radius:6px;background:var(--surface2)}
`;
    document.head.appendChild(st);
  }

  /* ---------- pośrednik (ntfy.sh) ---------- */
  async function wyslij(topic, obj) {
    const r = await fetch(RELAY + topic, { method: 'POST', body: JSON.stringify(obj) });
    if (!r.ok) throw new Error('Serwer pośredniczący odpowiedział: ' + r.status);
  }
  async function odbierz(topic, since) {
    const r = await fetch(RELAY + topic + '/json?poll=1&since=' + encodeURIComponent(since || 'all'), { cache: 'no-store' });
    if (!r.ok) throw new Error('Serwer pośredniczący odpowiedział: ' + r.status);
    const txt = await r.text();
    return txt.split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(m => m && m.event === 'message');
  }
  const czyste = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f]/g, '').trim().slice(0, n);
  const kolorOk = c => /^#[0-9a-f]{6}$/i.test(c || '') ? c : null;
  const liczba = v => v === '' || v == null || isNaN(+v) ? null : Math.round(+v * 100) / 100;

  let timer = null, polaczenie = 'czekam';
  function zatrzymaj() { clearInterval(timer); timer = null; }
  // st = ten sam obiekt, który ogląda ekran gospodarza (żeby zapisy się nie nadpisywały)
  async function krok(st, onZmiana) {
    if (!st || !wczytaj()) return zatrzymaj();
    try {
      const msgs = await odbierz(st.topic, st.lastId);
      polaczenie = 'ok';
      let zm = false;
      for (const m of msgs) {
        st.lastId = m.id;
        let o; try { o = JSON.parse(m.message); } catch (e) { continue; }
        if (!o || o.t !== 'g' || typeof o.gid !== 'string' || !/^[a-z0-9]{6,24}$/.test(o.gid)) continue;
        const ist = st.goscie[o.gid];
        if (!ist && Object.keys(st.goscie).length >= 20) continue;
        if (o.leave) { if (ist) { delete st.goscie[o.gid]; zm = true; } continue; }
        const name = czyste(o.name, 30); if (!name) continue;
        const g = ist || { dolaczyl: Date.now(), nowy: true };
        g.name = name; g.color = kolorOk(o.color) || g.color || PALETA[Object.keys(st.goscie).length % PALETA.length];
        if (o.score !== undefined) g.score = liczba(o.score);
        st.goscie[o.gid] = g; zm = true;
      }
      if (zm) { await dopasuj(st); zapisz(st); await nadajStan(st); onZmiana && onZmiana(); }
      else zapisz(st);
    } catch (e) { polaczenie = 'blad'; }
    const d = document.getElementById('im-conn');
    if (d) d.innerHTML = polaczenie === 'ok' ? '<span class="im-dot ok"></span> Połączono – goście mogą dołączać' : polaczenie === 'blad' ? '<span class="im-dot bad"></span> Brak połączenia z serwerem pośredniczącym – dopisz gości ręcznie' : '<span class="im-dot"></span> Łączę…';
  }
  function start(st, onZmiana) { zatrzymaj(); krok(st, onZmiana); timer = setInterval(() => { if (!document.getElementById('im-host')) return zatrzymaj(); if (!document.hidden) krok(st, onZmiana); }, 2500); }

  // gość o imieniu z bazy graczy → ten gracz (bez wysyłania bazy graczy gościom)
  async function dopasuj(st) {
    const players = await DB.all('players');
    Object.values(st.goscie).forEach(g => {
      if (g.playerId === undefined || g.auto) {
        const p = players.find(x => x.name.trim().toLowerCase() === g.name.toLowerCase());
        g.playerId = p ? p.id : null; g.auto = true;
      }
    });
  }
  // stan widoczny dla gości: gra, faza, imiona i kolory przy stole
  async function nadajStan(st) {
    const players = await DB.all('players');
    const lok = st.lokalni.map(l => { const p = players.find(x => x.id === l.playerId); return { name: p ? p.name : l.name, color: p ? K().kolor(p) : l.color }; });
    const gs = Object.entries(st.goscie).map(([gid, g]) => ({ gid, name: g.name, color: g.color, score: g.score }));
    try { await wyslij(st.topic, { t: 'h', gra: st.gameTitle || '', faza: st.faza, gracze: lok.concat(gs).slice(0, 30), lowWins: !!st.lowWins }); } catch (e) { /* krok() pokaże stan połączenia */ }
  }

  async function qr(el, text) {
    try { const Z = await window.Skaner.loadZXing(); const svg = new Z.BrowserQRCodeSvgWriter().write(text, 300, 300); svg.setAttribute('viewBox', '0 0 300 300'); el.innerHTML = ''; el.appendChild(svg); }
    catch (e) { el.innerHTML = '<p style="color:#555">Nie udało się narysować kodu QR. Podaj gościom link.</p>'; }
  }

  /* ---------- ekran: nowa impreza ---------- */
  async function przygotuj(el, params) {
    const d = await K().dane();
    const gry = d.games.filter(g => g.status !== 'wishlist' && g.status !== 'sold' && !g.isExpansion).sort((a, b) => a.title.localeCompare(b.title, 'pl'));
    let gra = params.gra ? d.gameById.get(params.gra) || null : null;
    el.innerHTML = `<h1>Tryb imprezy</h1>
      <p class="muted" style="max-width:720px">Pokaż kod QR przy stole. Goście skanują go aparatem, wpisują imię i są w grze – bez instalowania aplikacji. Na koniec sami wpisują swoje wyniki, a Ty zapisujesz rozgrywkę jednym przyciskiem.</p>
      <div class="card" style="max-width:720px">
        <h3 style="margin-top:0">W co gramy? <span class="ks-sub" style="font-weight:400">(można wybrać później)</span></h3>
        <div id="im-gw"></div>
        <input type="search" id="im-g" placeholder="Wpisz tytuł gry…" autocomplete="off"><div class="im-gres" id="im-gres"></div>
        <label class="row" style="gap:8px;margin-top:12px"><input type="checkbox" id="im-low"> Wygrywa najmniej punktów</label>
        <p class="row" style="margin-top:16px"><button class="primary" id="im-start">🎉 Pokaż kod QR dla gości</button></p>
      </div>
      <p class="ks-sub" style="max-width:720px">Imiona gości, kolory i wyniki przechodzą przez darmowy serwer pośredniczący ntfy.sh (kanał o losowej nazwie, wiadomości znikają po 12 godzinach). Twoja kolekcja i lista graczy nie są nigdzie wysyłane.</p>`;
    const $ = s => el.querySelector(s);
    const pokaz = () => { $('#im-gw').innerHTML = gra ? `<div class="row" style="margin-bottom:8px">${gra.thumb || gra.image ? `<img src="${esc(gra.thumb || gra.image)}" alt="" style="width:44px;height:44px;object-fit:contain;border-radius:8px">` : '🎲'}<b>${esc(gra.title)}</b></div>` : ''; };
    pokaz();
    $('#im-g').oninput = e => { const q = e.target.value.trim().toLowerCase(); gra = null; pokaz(); $('#im-gres').innerHTML = !q ? '' : gry.filter(g => g.title.toLowerCase().includes(q)).slice(0, 8).map(g => `<button data-g="${esc(g.id)}">${g.thumb || g.image ? `<img src="${esc(g.thumb || g.image)}" alt="">` : '<span>🎲</span>'}<span>${esc(g.title)}</span></button>`).join(''); };
    $('#im-gres').onclick = e => { const b = e.target.closest('[data-g]'); if (!b) return; gra = d.gameById.get(b.dataset.g); $('#im-g').value = ''; $('#im-gres').innerHTML = ''; pokaz(); };
    $('#im-start').onclick = async () => {
      const typed = $('#im-g').value.trim();
      const me = K().ja(d.players);
      const st = { topic: 'mk' + losowy(20), gameId: gra ? gra.id : null, gameTitle: gra ? gra.title : typed, startedAt: Date.now(), faza: 'zbieramy', lowWins: $('#im-low').checked, goscie: {}, lokalni: me ? [{ key: 'l' + me.id, playerId: me.id, name: me.name, color: K().kolor(me) }] : [], lastId: 'all' };
      zapisz(st); await nadajStan(st); App.refresh();
    };
  }

  /* ---------- ekran: trwa impreza ---------- */
  async function host(el) {
    const st = wczytaj();
    const players = (await DB.all('players')).sort((a, b) => (b.isMe - a.isMe) || a.name.localeCompare(b.name, 'pl'));
    const link = baza() + 'impreza.html#t=' + st.topic;
    const wszyscy = () => st.lokalni.map(l => ({ typ: 'l', key: l.key, name: (players.find(p => p.id === l.playerId) || l).name, color: l.color, playerId: l.playerId, score: l.score }))
      .concat(Object.entries(st.goscie).map(([gid, g]) => ({ typ: 'g', key: 'g' + gid, gid, name: g.name, color: g.color, playerId: g.playerId, score: g.score, nowy: g.nowy })));
    const rysujListe = () => {
      const w = wszyscy();
      const box = el.querySelector('#im-list'); if (!box) return;
      box.innerHTML = w.length ? w.map(p => `<div class="im-p ${p.nowy ? 'im-new' : ''}" data-k="${esc(p.key)}">${K().avatar({ name: p.name, color: p.color, photo: (players.find(x => x.id === p.playerId) || {}).photo }, 36)}
        <div class="n"><b>${esc(p.name)}</b><span class="ks-sub">${p.typ === 'g' ? '📱 gość' : 'przy tym urządzeniu'}</span></div>
        ${p.typ === 'g' ? `<select data-map="${esc(p.gid)}" title="Kto to w Twojej bazie graczy?"><option value="">nowy gracz</option>${players.map(x => `<option value="${esc(x.id)}" ${x.id === p.playerId ? 'selected' : ''}>= ${esc(x.name)}</option>`).join('')}</select>` : ''}
        <input type="number" step="any" inputmode="decimal" placeholder="wynik" data-sc="${esc(p.key)}" value="${p.score == null ? '' : p.score}">
        <button class="ghost small" data-del="${esc(p.key)}" title="Usuń z rozgrywki">✕</button></div>`).join('')
        : '<p class="muted" style="padding:12px">Czekam na gości… Niech zeskanują kod QR.</p>';
      Object.values(st.goscie).forEach(g => { delete g.nowy; }); zapisz(st);
      box.querySelectorAll('[data-map]').forEach(s => s.onchange = () => { const g = st.goscie[s.dataset.map]; if (!g) return; g.playerId = s.value || null; g.auto = false; zapisz(st); });
      box.querySelectorAll('[data-sc]').forEach(i => i.onchange = () => { const k = i.dataset.sc, v = liczba(i.value); if (k[0] === 'g') { const g = st.goscie[k.slice(1)]; if (g) g.score = v; } else { const l = st.lokalni.find(x => x.key === k); if (l) l.score = v; } zapisz(st); });
      box.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => { const k = b.dataset.del; if (k[0] === 'g') delete st.goscie[k.slice(1)]; else st.lokalni = st.lokalni.filter(x => x.key !== k); zapisz(st); rysujListe(); await nadajStan(st); });
      const n = el.querySelector('#im-n'); if (n) n.textContent = w.length;
    };
    el.innerHTML = `<div id="im-host"></div><div class="row" style="margin-bottom:10px"><div style="flex:1;min-width:0"><div class="ks-sub">Tryb imprezy</div><h1 style="margin:0">${esc(st.gameTitle || 'Wybierz grę na końcu')}</h1></div></div>
      <div class="im-grid">
        <div class="card"><div class="im-qr" id="im-qr"></div>
          <p style="text-align:center;margin:10px 0 4px"><b>Zeskanuj, żeby dołączyć</b></p>
          <div class="row" style="justify-content:center"><button class="small" id="im-full">⛶ Pełny ekran</button><button class="small" id="im-copy">Kopiuj link</button></div>
          <p class="im-st" id="im-conn"><span class="im-dot"></span> Łączę…</p></div>
        <div>
          <div class="card" style="padding:0"><div class="row" style="padding:12px 12px 6px"><h3 style="margin:0">Gracze (<span id="im-n">0</span>)</h3><span class="spacer"></span></div><div id="im-list"></div>
            <div class="row" style="padding:10px 12px;border-top:1px solid var(--line)"><select id="im-addp" style="flex:1;min-width:150px"><option value="">+ dodaj gracza z bazy…</option>${players.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select><input id="im-addn" placeholder="albo wpisz imię" style="flex:1;min-width:120px"><button id="im-addb">Dodaj</button></div></div>
          <div class="card">
            <p class="ks-sub" style="margin-top:0">${st.faza === 'wyniki' ? '✅ Goście widzą pole na wynik – wpisują go na swoich telefonach.' : 'Po grze poproś gości o wyniki – wpiszą je sami.'}</p>
            <div class="row">
              <button id="im-wyn" class="${st.faza === 'wyniki' ? '' : 'primary'}">${st.faza === 'wyniki' ? 'Zamknij wpisywanie wyników' : '📝 Poproś gości o wyniki'}</button>
              <button id="im-lic">🧮 Licz punkty w liczniku</button>
              <button class="primary" id="im-save">💾 Zapisz rozgrywkę</button>
            </div>
            <p class="row" style="margin-top:10px"><button class="ghost danger" id="im-end">Zakończ bez zapisu</button></p>
          </div>
        </div>
      </div>`;
    const $ = s => el.querySelector(s);
    qr($('#im-qr'), link);
    rysujListe();
    start(st, () => rysujListe());
    $('#im-full').onclick = () => {
      const ov = document.createElement('div'); ov.className = 'im-big';
      ov.innerHTML = `<h2>${esc(st.gameTitle || 'Dołącz do gry')}</h2><div class="q"></div><p>Zeskanuj aparatem telefonu · dotknij, żeby zamknąć</p>`;
      document.body.appendChild(ov); qr(ov.querySelector('.q'), link); ov.onclick = () => ov.remove();
    };
    $('#im-copy').onclick = async () => { try { await navigator.clipboard.writeText(link); App.ui.toast('Skopiowano link dla gości'); } catch (e) { App.ui.toast(link, 6000); } };
    $('#im-addb').onclick = async () => {
      const pid = $('#im-addp').value, n = $('#im-addn').value.trim();
      if (pid) { const p = players.find(x => x.id === pid); if (!st.lokalni.some(l => l.playerId === pid)) st.lokalni.push({ key: 'l' + pid, playerId: pid, name: p.name, color: K().kolor(p) }); }
      else if (n) { const ex = players.find(x => x.name.toLowerCase() === n.toLowerCase()); st.lokalni.push({ key: 'l' + (ex ? ex.id : DB.uid()), playerId: ex ? ex.id : null, name: ex ? ex.name : n, color: ex ? K().kolor(ex) : PALETA[(st.lokalni.length + 3) % PALETA.length] }); }
      else return;
      zapisz(st); App.refresh(); nadajStan(st);
    };
    $('#im-wyn').onclick = async () => { st.faza = st.faza === 'wyniki' ? 'zbieramy' : 'wyniki'; zapisz(st); await nadajStan(st); App.refresh(); };
    $('#im-end').onclick = async () => { if (await App.ui.confirm('Zakończyć imprezę bez zapisywania rozgrywki?', { ok: 'Zakończ' })) { st.faza = 'koniec'; await nadajStan(st); zapisz(null); zatrzymaj(); App.refresh(); } };
    $('#im-lic').onclick = async () => {
      const w = wszyscy(); if (!w.length) return App.ui.toast('Najpierw dodaj graczy');
      if (!st.gameTitle) { const f = await App.ui.form('W co gracie?', [{ name: 't', label: 'Tytuł gry' }]); if (!f || !f.t) return; st.gameTitle = f.t; }
      if (localStorage.getItem('licznik.stan') && !(await App.ui.confirm('W liczniku trwa inna gra. Zastąpić ją?', { ok: 'Zastąp' }))) return;
      const lic = { gameId: st.gameId, gameTitle: st.gameTitle, startedAt: Date.now(), lowWins: !!st.lowWins, round: 1, undo: [],
        players: w.map(p => ({ key: p.key, playerId: p.playerId || null, name: p.name, color: p.color || K().kolor({ name: p.name }), photo: (players.find(x => x.id === p.playerId) || {}).photo || null, score: p.score || 0, hist: [] })) };
      try { localStorage.setItem('licznik.stan', JSON.stringify(lic)); } catch (e) {}
      st.faza = 'koniec'; await nadajStan(st); zapisz(null); zatrzymaj();
      App.go('licznik');
    };
    $('#im-save').onclick = () => zapiszRozgrywke(st, wszyscy());
  }

  async function zapiszRozgrywke(st, w) {
    if (!w.length) return App.ui.toast('Nie ma graczy');
    const sc = w.map(p => p.score).filter(v => v != null);
    const best = sc.length ? (st.lowWins ? Math.min(...sc) : Math.max(...sc)) : null;
    const lead = best == null ? [] : w.filter(p => p.score === best).map(p => p.key);
    const games = (await DB.all('games')).filter(g => g.status !== 'wishlist').sort((a, b) => a.title.localeCompare(b.title, 'pl'));
    const out = await App.ui.form('Zapisz rozgrywkę', [
      ...(st.gameId ? [{ type: 'html', html: `<b>${esc(st.gameTitle)}</b>` }] : [{ type: 'html', html: `<datalist id="im-dl">${games.map(g => `<option value="${esc(g.title)}">`).join('')}</datalist>` }, { name: 'gra', label: 'Gra', list: 'im-dl', value: st.gameTitle || '' }]),
      { type: 'html', html: `<div class="list">${w.slice().sort((a, b) => (b.score == null) - (a.score == null) || (st.lowWins ? a.score - b.score : b.score - a.score)).map(p => `<div class="li" style="cursor:default">${K().avatar({ name: p.name, color: p.color }, 28)}<div class="main"><div class="t">${esc(p.name)}</div></div><div class="num">${p.score == null ? '–' : K().num(p.score)}</div></div>`).join('')}</div>` },
      { name: 'win', label: 'Zwycięzca', type: 'select', value: lead.length === 1 ? lead[0] : '', options: [['', lead.length ? 'Według punktów' : '— wybierz —'], ...w.map(p => [p.key, p.name]), ['__all', 'Wszyscy (kooperacja – wygraliśmy)'], ['__none', 'Nikt (kooperacja – przegraliśmy)']] },
      { name: 'durationMin', label: 'Czas gry (min)', type: 'number', value: Math.max(1, Math.round((Date.now() - st.startedAt) / 60000)) },
      { name: 'date', label: 'Data', type: 'date', value: App.ui.today() },
      { name: 'location', label: 'Miejsce', placeholder: 'np. u Kasi' }
    ], { ok: 'Zapisz rozgrywkę' });
    if (!out) return;
    let gameId = st.gameId;
    if (!gameId) {
      const t = (out.gra || '').trim(); if (!t) return App.ui.toast('Wpisz grę');
      const ex = games.find(g => g.title.toLowerCase() === t.toLowerCase());
      gameId = ex ? ex.id : (await DB.put('games', { title: t, status: 'played' })).id;
    }
    const all = await DB.all('players');
    const ps = [];
    for (const p of w) {
      let pid = p.playerId && all.some(x => x.id === p.playerId) ? p.playerId : null;
      if (!pid) { const ex = all.find(x => x.name.toLowerCase() === p.name.toLowerCase()); pid = ex ? ex.id : (await DB.put('players', { name: p.name, color: p.color })).id; }
      const win = out.win === '__all' ? true : out.win === '__none' ? false : !out.win ? lead.includes(p.key) : out.win === p.key;
      ps.push({ playerId: pid, score: p.score, win });
    }
    await DB.put('plays', { gameId, date: out.date || App.ui.today(), durationMin: out.durationMin, location: out.location, notes: 'Zapisane w trybie imprezy', coop: out.win === '__all' || out.win === '__none', lowWins: st.lowWins || undefined, players: ps });
    st.faza = 'koniec'; await nadajStan(st); zapisz(null); zatrzymaj();
    const zw = w.filter((p, i) => ps[i].win).map(p => p.name);
    App.ui.toast(zw.length ? '🏆 Zapisano! Wygrywa: ' + zw.join(', ') : 'Zapisano rozgrywkę', 4000);
    App.go('planszowki', { gra: gameId });
  }

  App.provide('impreza.start', gameId => App.go('impreza', gameId ? { gra: gameId } : undefined));
  App.registerModule({ id: 'impreza', title: 'Tryb imprezy', icon: '🎉', order: 12.7, render(el, params) { css(); zatrzymaj(); return wczytaj() ? host(el) : przygotuj(el, params); } });
})();
