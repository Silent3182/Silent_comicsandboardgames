/* Moduł „Zegar tur”: odmierza czas ruchu każdego gracza.
 * Telefon leży na stole → liczy się czas bieżącego gracza. Podniesienie telefonu → pauza.
 * Położenie z powrotem → start czasu KOLEJNEGO gracza (kolejność ustawiana przed grą).
 * Czujniki: DeviceMotionEvent (działa w przeglądarce i w APK, bez wtyczek). Zawsze jest też przycisk ręczny.
 * Stan pamiętany w localStorage 'zegar.stan' (na tym urządzeniu), czasy liczone ze znaczników czasu.
 */
(function () {
  const { esc } = App.ui;
  const K = () => window.KS;
  const KEY = 'zegar.stan', CFG = 'zegar.ustawienia';
  const ls = { get(k, d) { try { return JSON.parse(localStorage.getItem(k) || 'null') || d; } catch (e) { return d; } }, set(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
  const now = () => Date.now();

  window.IKONY = window.IKONY || {};
  window.IKONY.zegar = '<circle class="f" cx="12" cy="13" r="7.5"/><path d="M12 9v4l2.5 2M9.5 2.5h5M12 2.5v3M18.5 6l1.5-1.5"/>';
  if (window.IKONY_KOLOR) window.IKONY_KOLOR.zegar = '#4b5bd6';

  const css = document.createElement('style');
  css.textContent = `
  .zg-main{border-radius:22px;padding:22px 18px;text-align:center;color:#fff;background:var(--pc);box-shadow:var(--shadow-lg);user-select:none;cursor:pointer;position:relative;transition:background .3s}
  .zg-main.pause{background:color-mix(in srgb,var(--pc) 35%,#555)}
  .zg-main .who{font-size:26px;font-weight:800;display:flex;align-items:center;justify-content:center;gap:12px}
  .zg-main .turn{font-size:72px;font-weight:800;font-variant-numeric:tabular-nums;letter-spacing:-.03em;line-height:1.1;margin:8px 0}
  .zg-main .tot{opacity:.85;font-size:15px}
  .zg-main .hint{margin-top:12px;font-size:14px;opacity:.9;background:rgba(0,0,0,.18);border-radius:10px;padding:8px}
  .zg-main.over .turn{animation:zgblink 1s infinite}
  @keyframes zgblink{50%{opacity:.35}}
  .zg-list{margin-top:14px}
  .zg-list .li{cursor:default}
  .zg-list .li.cur{background:var(--accent-soft)}
  .zg-sens{display:inline-flex;align-items:center;gap:6px;font-size:13px;color:var(--muted)}
  .zg-dot{width:10px;height:10px;border-radius:50%;background:var(--muted)}
  .zg-dot.flat{background:var(--ok)}.zg-dot.up{background:var(--accent-2)}
  .zg-ord .li{cursor:default}
  `;
  document.head.appendChild(css);

  const fmt = ms => { const s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s % 60).padStart(2, '0'); };

  /* ---------- czujnik: „leży” / „podniesiony” ---------- */
  const SENS = { niska: { tilt: 3.2, move: 2.2 }, normalna: { tilt: 2.2, move: 1.3 }, wysoka: { tilt: 1.5, move: .8 } };
  const czujnik = {
    stan: null, last: 0, kand: null, kandOd: 0, cb: null, prog: SENS.normalna, on: false,
    start(cb, prog) {
      this.cb = cb; this.prog = prog; if (this.on) return; this.on = true;
      window.addEventListener('devicemotion', this.h);
    },
    stop() { this.on = false; window.removeEventListener('devicemotion', this.h); this.cb = null; this.stan = null; },
    h: null
  };
  czujnik.h = e => {
    const g = e.accelerationIncludingGravity; if (!g || g.z == null) return;
    czujnik.last = now();
    const a = e.acceleration;
    const tilt = Math.hypot(g.x || 0, g.y || 0);
    const ruch = a && a.x != null ? Math.hypot(a.x, a.y, a.z) : Math.abs(Math.hypot(g.x || 0, g.y || 0, g.z) - 9.81);
    const p = czujnik.prog;
    // leży płasko (ekranem do góry albo do dołu) i się nie rusza
    const flat = Math.abs(g.z) > 8.6 && tilt < p.tilt && ruch < p.move * .45;
    const up = tilt > p.tilt * 1.6 || ruch > p.move || Math.abs(g.z) < 7.5;
    const nowy = flat ? 'flat' : up ? 'up' : null;
    if (!nowy) return;
    if (nowy !== czujnik.kand) { czujnik.kand = nowy; czujnik.kandOd = now(); }
    const trwa = now() - czujnik.kandOd;
    // podniesienie reaguje szybko, położenie dopiero gdy telefon spokojnie leży ~0,7 s
    if (nowy !== czujnik.stan && trwa >= (nowy === 'flat' ? 700 : 150)) {
      const prev = czujnik.stan; czujnik.stan = nowy;
      if (czujnik.cb) czujnik.cb(nowy, prev);
    }
  };
  window.__zegarCzujnik = czujnik; // do testów

  /* ---------- sygnały ---------- */
  let actx = null;
  function pik(f = 880, ms = 120) {
    try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); const o = actx.createOscillator(), g = actx.createGain(); o.frequency.value = f; o.connect(g); g.connect(actx.destination); g.gain.value = .15; o.start(); o.stop(actx.currentTime + ms / 1000); } catch (e) {}
  }
  const wibr = p => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} };
  let lock = null;
  async function ekranWl() { try { if ('wakeLock' in navigator && !lock) { lock = await navigator.wakeLock.request('screen'); lock.addEventListener('release', () => { lock = null; }); } } catch (e) {} }
  function ekranWyl() { try { lock && lock.release(); } catch (e) {} lock = null; }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && ls.get(KEY) && location.hash.startsWith('#/zegar')) ekranWl(); });

  /* ---------- przygotowanie ---------- */
  async function przygotuj(el) {
    const d = await K().dane();
    const cfg = Object.assign({ order: [], limit: 0, sens: 'normalna', auto: true, gameId: '' }, ls.get(CFG, {}));
    const cz = new Map(); d.plays.forEach(p => p.players.forEach(x => cz.set(x.playerId, (cz.get(x.playerId) || 0) + 1)));
    const gracze = d.players.slice().sort((a, b) => (b.isMe - a.isMe) || (cz.get(b.id) || 0) - (cz.get(a.id) || 0) || a.name.localeCompare(b.name, 'pl'));
    let ord = cfg.order.filter(id => d.playerById.has(id));
    if (!ord.length) { const me = K().ja(d.players); if (me) ord.push(me.id); }
    const nowi = [];
    const byId = id => d.playerById.get(id) || nowi.find(p => p.id === id);
    const gry = d.games.filter(g => !g.isExpansion && g.status !== 'wishlist').sort((a, b) => a.title.localeCompare(b.title, 'pl'));
    el.innerHTML = `
      <h1>Zegar tur</h1>
      <div class="card" style="max-width:760px">
        <p class="ks-sub" style="margin-top:0">Połóż telefon na stole: liczy się czas gracza, który ma ruch. <b>Podnieś</b> – pauza. <b>Połóż</b> – czas następnego gracza. Zamiast tego możesz też stuknąć w ekran.</p>
        <h3>1. Kolejność graczy</h3>
        <div class="list zg-ord" id="zg-ord"></div>
        <div class="ks-sub" style="margin:10px 0 4px">Dodaj do kolejki:</div>
        <div class="lc-sel" id="zg-sel"></div>
        <div class="row" style="margin-top:8px"><input id="zg-new" placeholder="Nowy gracz – imię" style="flex:1;min-width:160px"><button id="zg-newb">+ Dodaj</button></div>
        <h3 style="margin-top:18px">2. Ustawienia</h3>
        <div class="row" style="gap:14px;align-items:flex-end">
          <label style="display:flex;flex-direction:column;gap:4px;font-size:13px;font-weight:600;flex:1 1 100%;min-width:0">Gra (opcjonalnie)<select id="zg-game" style="width:100%;max-width:100%"><option value="">—</option>${gry.map(g => `<option value="${esc(g.id)}" ${g.id === cfg.gameId ? 'selected' : ''}>${esc(g.title)}</option>`).join('')}</select></label>
          <label style="display:flex;flex-direction:column;gap:4px;font-size:13px;font-weight:600">Limit na turę<select id="zg-limit">${[[0, 'bez limitu'], [30, '30 s'], [60, '1 min'], [90, '1,5 min'], [120, '2 min'], [180, '3 min'], [300, '5 min']].map(([v, l]) => `<option value="${v}" ${v === cfg.limit ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <label style="display:flex;flex-direction:column;gap:4px;font-size:13px;font-weight:600">Czułość czujnika<select id="zg-sens">${Object.keys(SENS).map(k => `<option ${k === cfg.sens ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
        </div>
        <label style="display:flex;flex-wrap:nowrap;align-items:flex-start;gap:10px;margin-top:14px"><input type="checkbox" id="zg-auto" style="margin-top:3px;flex-shrink:0" ${cfg.auto ? 'checked' : ''}> Używaj czujników telefonu (podnieś = pauza, połóż = kolejny gracz)</label>
        <p class="row" style="margin-top:18px"><button class="primary" id="zg-start">▶ Start</button></p>
      </div>`;
    const $ = s => el.querySelector(s);
    const rysuj = () => {
      $('#zg-ord').innerHTML = ord.length ? ord.map((id, i) => { const p = byId(id); return `<div class="li"><b style="width:22px">${i + 1}.</b>${K().avatar(p, 32)}<div class="main"><div class="t">${esc(p.name)}</div></div>
        <button class="small ghost" data-up="${i}" ${i ? '' : 'disabled'} title="Wyżej">↑</button><button class="small ghost" data-dn="${i}" ${i < ord.length - 1 ? '' : 'disabled'} title="Niżej">↓</button><button class="small ghost" data-rm="${i}" title="Usuń">✕</button></div>`; }).join('')
        : '<div class="empty" style="padding:16px">Wybierz graczy poniżej – w kolejności, w jakiej siedzą przy stole.</div>';
      $('#zg-sel').innerHTML = gracze.concat(nowi).filter(p => !ord.includes(p.id)).map(p => `<button data-p="${esc(p.id)}">${K().avatar(p, 28)}${esc(p.name)}</button>`).join('') || '<span class="ks-sub">Wszyscy dodani.</span>';
    };
    rysuj();
    $('#zg-ord').onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      const sw = (i, j) => { [ord[i], ord[j]] = [ord[j], ord[i]]; };
      if (b.dataset.up) sw(+b.dataset.up, +b.dataset.up - 1); else if (b.dataset.dn) sw(+b.dataset.dn, +b.dataset.dn + 1); else if (b.dataset.rm) ord.splice(+b.dataset.rm, 1);
      rysuj();
    };
    $('#zg-sel').onclick = e => { const b = e.target.closest('[data-p]'); if (b) { ord.push(b.dataset.p); rysuj(); } };
    const dodaj = () => { const n = $('#zg-new').value.trim(); if (!n) return; const ex = gracze.concat(nowi).find(p => p.name.toLowerCase() === n.toLowerCase()); const id = ex ? ex.id : 'nowy-' + DB.uid(); if (!ex) nowi.push({ id, name: n, _new: true }); if (!ord.includes(id)) ord.push(id); $('#zg-new').value = ''; rysuj(); };
    $('#zg-newb').onclick = dodaj; $('#zg-new').onkeydown = e => { if (e.key === 'Enter') dodaj(); };
    $('#zg-start').onclick = async () => {
      if (ord.length < 2) { App.ui.toast('Dodaj co najmniej 2 graczy'); return; }
      const c = { order: ord.filter(id => !id.startsWith('nowy-')), limit: +$('#zg-limit').value, sens: $('#zg-sens').value, auto: $('#zg-auto').checked, gameId: $('#zg-game').value };
      ls.set(CFG, c);
      // iPhone wymaga zgody na czujniki (Android nie)
      if (c.auto && window.DeviceMotionEvent && typeof DeviceMotionEvent.requestPermission === 'function') { try { await DeviceMotionEvent.requestPermission(); } catch (e) {} }
      const g = d.gameById.get(c.gameId);
      ls.set(KEY, {
        gameId: c.gameId || null, gameTitle: g ? g.title : '', limit: c.limit, sens: c.sens, auto: c.auto, startedAt: now(),
        cur: 0, running: false, turnStart: null, turnAcc: 0, turnNo: 1,
        players: ord.map(id => { const p = byId(id); return { key: id, playerId: p._new ? null : p.id, name: p.name, color: K().kolor(p), photo: p.photo || null, total: 0, turns: 0, longest: 0 }; })
      });
      pik(660, 80); App.go('zegar');
    };
  }

  /* ---------- gra ---------- */
  let tick = null;
  function gra(el, st) {
    const save = () => ls.set(KEY, st);
    const turnMs = () => st.turnAcc + (st.running ? now() - st.turnStart : 0);
    const resume = () => { if (st.running) return; st.begun = true; st.running = true; st.turnStart = now(); save(); };
    const pause = () => { if (!st.running) return; st.turnAcc += now() - st.turnStart; st.running = false; st.turnStart = null; save(); };
    // zamknij turę bieżącego gracza i przejdź do następnego (krok -1 = cofnij do poprzedniego)
    const nastepny = (krok = 1) => {
      pause();
      const p = st.players[st.cur];
      if (st.turnAcc > 0) { p.total += st.turnAcc; p.turns++; p.longest = Math.max(p.longest, st.turnAcc); }
      st.turnAcc = 0; st.alerted = false;
      st.cur = (st.cur + krok + st.players.length) % st.players.length;
      if (krok > 0 && st.cur === 0) st.turnNo++;
      resume(); wibr(60); pik(st.cur === 0 ? 990 : 780, 90);
      draw();
    };
    let sensOk = false, sensStan = null;
    const draw = () => {
      const p = st.players[st.cur], next = st.players[(st.cur + 1) % st.players.length];
      const t = turnMs(), over = st.limit && t > st.limit * 1000;
      el.innerHTML = `
        <div class="row" style="margin-bottom:10px"><div style="flex:1;min-width:0"><div class="ks-sub">Zegar tur · runda ${st.turnNo}</div><h1 style="margin:0">${esc(st.gameTitle || 'Zegar tur')}</h1></div>
          <span class="zg-sens" id="zg-sinfo"></span></div>
        <div class="zg-main ${st.running ? '' : 'pause'} ${over ? 'over' : ''}" id="zg-tap" style="--pc:${esc(p.color)}">
          <div class="who">${K().avatar({ name: p.name, color: p.color, photo: p.photo }, 46)}${esc(p.name)}</div>
          <div class="turn" id="zg-turn">${st.limit ? fmt(st.limit * 1000 - t).replace(/^/, over ? '−' : '') : fmt(t)}</div>
          <div class="tot" id="zg-tot">łącznie ${fmt(p.total + t)}${st.limit ? ' · limit ' + fmt(st.limit * 1000) : ''}</div>
          <div class="hint">${!st.begun ? `Połóż telefon na stole albo stuknij tutaj, żeby zacząć. Pierwszy ruch: <b>${esc(p.name)}</b>.` : st.running ? (st.auto ? `Podnieś telefon – pauza. Połóż – ruch ma <b>${esc(next.name)}</b>.` : `Stuknij, gdy ruch ma <b>${esc(next.name)}</b>.`) : (st.auto ? `⏸ Pauza. Połóż telefon (albo stuknij) – ruch ma <b>${esc(next.name)}</b>.` : `⏸ Pauza. Stuknij, żeby wznowić.`)}</div>
        </div>
        <div class="row" style="margin-top:12px">
          <button id="zg-pp">${st.running ? '⏸ Pauza' : '▶ Wznów ' + esc(p.name)}</button>
          <button id="zg-prev">↶ Poprzedni gracz</button>
          <button id="zg-next">⏭ Następny</button>
          <span class="spacer"></span>
          <button class="ghost danger" id="zg-cancel">Przerwij</button>
          <button class="primary" id="zg-end">🏁 Koniec gry</button></div>
        <div class="list zg-list">${st.players.map((x, i) => { const cur = i === st.cur; const tt = x.total + (cur ? t : 0); return `<div class="li ${cur ? 'cur' : ''}">${K().avatar({ name: x.name, color: x.color, photo: x.photo }, 32)}<div class="main"><div class="t">${cur ? '▶ ' : ''}${esc(x.name)}</div><div class="s">${x.turns} ${K().pl(x.turns, 'tura', 'tury', 'tur')}${x.turns ? ' · średnio ' + fmt(x.total / x.turns) : ''}</div></div><div class="num" ${cur ? 'id="zg-cur-tot"' : ''}>${fmt(tt)}</div></div>`; }).join('')}</div>`;
      const $ = s => el.querySelector(s);
      // stuknięcie w duży panel: pauza → następny gracz; biegnie → następny gracz
      $('#zg-tap').onclick = () => { if (!st.begun || (!st.running && !st.auto)) { resume(); draw(); } else nastepny(1); };
      $('#zg-pp').onclick = () => { if (st.running) pause(); else resume(); draw(); };
      $('#zg-next').onclick = () => nastepny(1);
      $('#zg-prev').onclick = () => nastepny(-1);
      $('#zg-cancel').onclick = async () => { if (await App.ui.confirm('Przerwać zegar? Czasy nie zostaną zapisane.')) { koniecSesji(); ls.set(KEY, null); App.go('zegar'); } };
      $('#zg-end').onclick = () => { pause(); const p = st.players[st.cur]; if (st.turnAcc > 0) { p.total += st.turnAcc; p.turns++; p.longest = Math.max(p.longest, st.turnAcc); st.turnAcc = 0; } st.ended = now(); save(); koniecSesji(); App.go('zegar'); };
      sinfo();
    };
    const sinfo = () => {
      const s = el.querySelector('#zg-sinfo'); if (!s) return;
      if (!st.auto) { s.innerHTML = 'czujniki wyłączone'; return; }
      s.innerHTML = sensOk ? `<i class="zg-dot ${sensStan === 'flat' ? 'flat' : sensStan === 'up' ? 'up' : ''}"></i>${sensStan === 'flat' ? 'leży' : sensStan === 'up' ? 'podniesiony' : 'czujnik działa'}` : (now() - st0 > 2500 ? '⚠ brak czujnika – stukaj w ekran' : 'czekam na czujnik…');
    };
    const st0 = now();
    const koniecSesji = () => { clearInterval(tick); czujnik.stop(); ekranWyl(); };
    if (st.auto) czujnik.start((nowy, prev) => {
      sensOk = true; sensStan = nowy;
      if (nowy === 'up' && st.running) { pause(); wibr(30); draw(); }
      else if (nowy === 'flat' && !st.begun) { resume(); pik(660, 80); draw(); }
      else if (nowy === 'flat' && prev === 'up' && !st.running) nastepny(1);
      else sinfo();
    }, SENS[st.sens] || SENS.normalna);
    // bez czujników zaczynamy od razu; z czujnikami – gdy telefon leży (albo po stuknięciu)
    if (!st.auto && !st.begun) resume();
    ekranWl();
    draw();
    clearInterval(tick);
    tick = setInterval(() => {
      const tEl = document.getElementById('zg-turn');
      if (!tEl) { koniecSesji(); return; }
      if (czujnik.last && now() - czujnik.last < 3000) sensOk = true;
      const t = turnMs(), p = st.players[st.cur], over = st.limit && t > st.limit * 1000;
      tEl.textContent = st.limit ? (over ? '−' : '') + fmt(Math.abs(st.limit * 1000 - t)) : fmt(t);
      const tot = document.getElementById('zg-tot'); if (tot) tot.textContent = 'łącznie ' + fmt(p.total + t) + (st.limit ? ' · limit ' + fmt(st.limit * 1000) : '');
      const ct = document.getElementById('zg-cur-tot'); if (ct) ct.textContent = fmt(p.total + t);
      document.getElementById('zg-tap').classList.toggle('over', !!over);
      if (over && !st.alerted) { st.alerted = true; save(); wibr([200, 100, 200]); pik(440, 300); }
      sinfo();
    }, 250);
  }

  /* ---------- podsumowanie ---------- */
  function wynik(el, st) {
    const tot = st.players.reduce((a, p) => a + p.total, 0);
    const mx = Math.max(1, ...st.players.map(p => p.total));
    el.innerHTML = `
      <h1>Czas gry${st.gameTitle ? ': ' + esc(st.gameTitle) : ''}</h1>
      <div class="stats">
        <div class="stat"><div class="v">${fmt(st.ended - st.startedAt)}</div><div class="l">cała gra (z pauzami)</div></div>
        <div class="stat"><div class="v">${fmt(tot)}</div><div class="l">czas ruchów</div></div>
        <div class="stat"><div class="v">${st.turnNo}</div><div class="l">${K().pl(st.turnNo, 'runda', 'rundy', 'rund')}</div></div>
      </div>
      <div class="list">${st.players.slice().sort((a, b) => b.total - a.total).map(p => `<div class="li" style="cursor:default">${K().avatar({ name: p.name, color: p.color, photo: p.photo }, 36)}<div class="main"><div class="t">${esc(p.name)}</div>
        <div class="ks-bar" style="height:8px;margin:4px 0"><i style="width:${p.total / mx * 100}%;background:${esc(p.color)}"></i></div>
        <div class="s">${p.turns} ${K().pl(p.turns, 'tura', 'tury', 'tur')} · średnio ${fmt(p.turns ? p.total / p.turns : 0)} · najdłużej ${fmt(p.longest)}</div></div><div class="num">${fmt(p.total)}</div></div>`).join('')}</div>
      <p class="row" style="margin-top:14px">${App.has('licznik.start') ? '<button class="primary" id="zg-lc">🧮 Wpisz punkty i zapisz rozgrywkę</button>' : ''}<button id="zg-new">Nowa gra</button></p>
      <p class="ks-sub">Licznik punktów dostanie tych samych graczy${st.gameTitle ? ' i grę' : ''}, a czas gry trafi do zapisanej rozgrywki.</p>`;
    el.querySelector('#zg-new').onclick = () => { ls.set(KEY, null); App.go('zegar'); };
    const lc = el.querySelector('#zg-lc');
    if (lc) lc.onclick = async () => {
      if (!st.gameId) {
        const gry = (await DB.all('games')).filter(g => !g.isExpansion && g.status !== 'wishlist').sort((a, b) => a.title.localeCompare(b.title, 'pl'));
        const r = await App.ui.form('W co graliście?', [{ name: 'g', label: 'Gra', type: 'select', options: gry.map(g => [g.id, g.title]) }], { ok: 'Dalej' });
        if (!r || !r.g) return;
        st.gameId = r.g; st.gameTitle = (gry.find(g => g.id === r.g) || {}).title || '';
      }
      // przekazanie do licznika punktów (ten sam format stanu co moduly/licznik)
      try {
        localStorage.setItem('licznik.stan', JSON.stringify({ gameId: st.gameId, gameTitle: st.gameTitle, startedAt: st.startedAt, lowWins: false, round: st.turnNo, undo: [],
          players: st.players.map(p => ({ key: p.key, playerId: p.playerId, name: p.name, color: p.color, photo: p.photo, score: 0, hist: [] })) }));
      } catch (e) {}
      ls.set(KEY, null);
      App.go('licznik');
    };
  }

  App.provide('zegar.start', () => App.go('zegar'));
  App.registerModule({
    id: 'zegar', title: 'Zegar tur', icon: '⏱️', order: 12.6,
    render(el) { const st = ls.get(KEY); if (!st) { czujnik.stop(); return przygotuj(el); } return st.ended ? wynik(el, st) : gra(el, st); }
  });
})();
