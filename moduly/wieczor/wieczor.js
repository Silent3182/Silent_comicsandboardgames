/* Moduł „Wieczór gier”: podajesz liczbę osób i czas, aplikacja podpowiada gry z półki.
 * Pierwszeństwo mają gry z półki wstydu (jeszcze nie grane), potem dawno nie grane i najwyżej ocenione.
 * Liczba graczy i czas: z karty gry (pola minPlayers/maxPlayers/playTime), a gdy ich brak – z dane-gracze.js (przybliżone).
 * Ustawienia wyboru pamiętane w localStorage (tylko na tym urządzeniu).
 */
(function () {
  const { esc } = App.ui;
  const KEY = 'wieczor.ustawienia';
  const load = () => { try { return Object.assign({ osoby: 4, czas: 90, ciezar: 'any', wstyd: 'prefer' }, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { return { osoby: 4, czas: 90, ciezar: 'any', wstyd: 'prefer' }; } };
  const save = s => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} };
  const num = v => String(v).replace('.', ',');
  const pl = (n, one, few, many) => n === 1 ? one : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) ? few : many;
  const CZASY = [[30, '½ h'], [45, '45 min'], [60, '1 h'], [90, '1,5 h'], [120, '2 h'], [180, '3 h'], [0, 'bez limitu']];
  const CIEZAR = [['any', 'dowolna'], ['light', 'lekka'], ['mid', 'średnia'], ['heavy', 'ciężka']];
  const WSTYD = [['prefer', 'najpierw półka wstydu'], ['only', 'tylko półka wstydu'], ['off', 'bez znaczenia']];

  // Dane o liczbie graczy i czasie gry: karta gry ma pierwszeństwo, potem dane przybliżone
  function info(g) {
    const d = (window.WIECZOR_DANE && window.WIECZOR_DANE.gry[g.bggId]) || null;
    if (g.minPlayers || g.playTime) {
      return { min: g.minPlayers || (d && d[0]) || 1, max: g.maxPlayers || g.minPlayers || (d && d[1]) || 99, czas: g.playTime || (d && d[2]) || null,
        bestLo: d && d[3], bestHi: d && d[4], zrodlo: 'karta' };
    }
    if (d) return { min: d[0], max: d[1], czas: d[2], bestLo: d[3], bestHi: d[4], zrodlo: d[5] ? 'niepewne' : 'przybliżone' };
    return null;
  }

  async function dane() {
    const [games, plays] = await Promise.all([DB.all('games'), DB.all('plays')]);
    const last = new Map(), cnt = new Map();
    plays.forEach(p => { cnt.set(p.gameId, (cnt.get(p.gameId) || 0) + 1); if (!last.has(p.gameId) || (p.date || '') > last.get(p.gameId)) last.set(p.gameId, p.date || ''); });
    const polka = games.filter(g => (g.status === 'owned' || g.status === 'forSale' || !g.status) && !g.isExpansion);
    polka.forEach(g => { g._plays = (cnt.get(g.id) || 0) + (g.bggPlays || 0); g._last = last.get(g.id) || null; g._info = info(g); });
    return polka;
  }

  function pasuje(g, s) {
    const i = g._info;
    if (!i) return null;
    if (s.osoby < i.min || s.osoby > i.max) return null;
    if (s.czas && i.czas && i.czas > s.czas * 1.15) return null;
    const w = g.weight || 0;
    if (s.ciezar === 'light' && w && w > 2.2) return null;
    if (s.ciezar === 'mid' && w && (w <= 2.2 || w > 3.3)) return null;
    if (s.ciezar === 'heavy' && w && w <= 3.3) return null;
    const wstyd = !g._plays;
    if (s.wstyd === 'only' && !wstyd) return null;
    // punktacja
    let pkt = 0; const why = [];
    if (wstyd) { pkt += s.wstyd === 'off' ? 0 : 40; why.push('<span class="badge wish">półka wstydu</span>'); }
    if (i.bestLo && s.osoby >= i.bestLo && s.osoby <= i.bestHi) { pkt += 20; why.push(`najlepsza na ${i.bestLo === i.bestHi ? i.bestLo : i.bestLo + '–' + i.bestHi}`); }
    const ocena = g.myRating || g.bggRating || 6;
    pkt += ocena * 3;
    if (g.myRating >= 8) why.push(`Twoja ocena ★ ${num(g.myRating)}`);
    if (g._last) {
      const dni = Math.round((Date.now() - new Date(g._last)) / 864e5);
      pkt += Math.min(20, dni / 30);
      if (dni > 365) why.push('nie grana od ' + Math.floor(dni / 365) + ' ' + pl(Math.floor(dni / 365), 'roku', 'lat', 'lat'));
    } else if (!wstyd) pkt += 8;
    if (s.czas && i.czas) pkt += 6 - Math.abs(s.czas - i.czas) / s.czas * 6; // im bliżej dostępnego czasu, tym lepiej
    return { g, pkt, why };
  }

  const cover = g => g.thumb || g.image ? `<img loading="lazy" src="${esc(g.thumb || g.image)}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'ph',textContent:'🎲'}))">` : '<span class="ph">🎲</span>';
  function karta(r, wylosowana) {
    const g = r.g, i = g._info;
    const opis = [`${i.min === i.max ? i.min : i.min + '–' + i.max} os.`, i.czas ? `~${i.czas} min` : '', g.weight ? 'złożoność ' + num(g.weight) : '', g._plays ? `${g._plays}× zagrana` : ''].filter(Boolean).join(' · ');
    return `<div class="li wz-li ${wylosowana ? 'wz-los' : ''}" data-id="${esc(g.id)}">${cover(g)}<div class="main"><div class="t">${esc(g.title)}</div>
      <div class="s">${opis}${i.zrodlo === 'niepewne' ? ' <span class="chip" title="Dane przybliżone, mogą się różnić – popraw w karcie gry">?</span>' : ''}</div>
      ${r.why.length ? `<div class="s">${r.why.join(' · ')}</div>` : ''}</div></div>`;
  }

  function css() {
    if (document.getElementById('wz-css')) return;
    const st = document.createElement('style'); st.id = 'wz-css';
    st.textContent = `
#main .wz-f{display:grid;gap:12px;margin-bottom:14px}
#main .wz-f .l{font-size:13px;color:var(--muted);margin-bottom:4px;font-weight:600}
#main .wz-opt{display:flex;flex-wrap:wrap;gap:6px}
#main .wz-opt button{min-height:36px;padding:5px 12px;border-radius:999px}
#main .wz-opt button.on{background:var(--accent);color:var(--on-accent);border-color:var(--accent)}
#main .wz-li .s .badge{vertical-align:1px}
#main .wz-los{background:var(--accent-2-soft);box-shadow:inset 4px 0 0 var(--accent-2)}
#main .wz-head{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:6px 0 10px}
#main .wz-head .spacer{flex:1}`;
    document.head.appendChild(st);
  }

  let wylosowana = null;
  async function render(el) {
    css();
    const s = load();
    const polka = await dane();
    if (!polka.length) { el.innerHTML = '<h2>Wieczór gier</h2><div class="empty">Brak gier na półce. Otwórz najpierw zakładkę Planszówki, żeby wczytać kolekcję.</div>'; return; }
    const wyniki = polka.map(g => pasuje(g, s)).filter(Boolean).sort((a, b) => b.pkt - a.pkt);
    const bezDanych = polka.filter(g => !g._info);
    const niepewne = polka.filter(g => g._info && g._info.zrodlo === 'niepewne').length;
    const wstydWsz = wyniki.filter(r => !r.g._plays).length;
    const pokaz = wyniki.slice(0, 15);
    if (wylosowana && !wyniki.some(r => r.g.id === wylosowana)) wylosowana = null;
    const opt = (name, list, cur) => `<div class="wz-opt" data-k="${name}">${list.map(([v, l]) => `<button data-v="${v}" class="${String(v) === String(cur) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
    el.innerHTML = `
      <h2>Wieczór gier</h2>
      <div class="card wz-f">
        <div><div class="l">Ile osób gra?</div>${opt('osoby', [1, 2, 3, 4, 5, 6, 7, 8, 10].map(n => [n, n === 10 ? '9+' : n]), s.osoby)}</div>
        <div><div class="l">Ile macie czasu?</div>${opt('czas', CZASY, s.czas)}</div>
        <div><div class="l">Złożoność</div>${opt('ciezar', CIEZAR, s.ciezar)}</div>
        <div><div class="l">Półka wstydu</div>${opt('wstyd', WSTYD, s.wstyd)}</div>
      </div>
      <div class="wz-head"><b>${wyniki.length ? `Pasuje ${wyniki.length} ${pl(wyniki.length, 'gra', 'gry', 'gier')}` : 'Nic nie pasuje'}</b>
        ${wstydWsz ? `<span class="muted">w tym ${wstydWsz} z półki wstydu</span>` : ''}<span class="spacer"></span>
        ${wyniki.length ? '<button class="primary" id="wzLos">🎲 Losuj z najlepszych</button>' : ''}</div>
      ${wyniki.length ? `<div class="list">${(wylosowana ? [wyniki.find(r => r.g.id === wylosowana)].concat(pokaz.filter(r => r.g.id !== wylosowana)) : pokaz).map(r => karta(r, r.g.id === wylosowana)).join('')}</div>
        ${wyniki.length > pokaz.length ? `<p class="muted">Pokazuję ${pokaz.length} najlepiej pasujących. Zawęź czas albo złożoność, żeby zobaczyć inne.</p>` : ''}`
        : '<div class="empty">Żadna gra z półki nie pasuje do tych ustawień. Spróbuj dłuższego czasu albo innej złożoności.</div>'}
      <p class="muted" style="margin-top:14px">Liczba graczy i czas gry są przybliżone (z wiedzy o grach, strona BGG nie pozwalała ich pobrać).${niepewne ? ` Przy ${niepewne} ${pl(niepewne, 'grze', 'grach', 'grach')} dane są najmniej pewne – oznaczone „?”.` : ''} Popraw je w karcie gry (Edytuj), a aplikacja użyje Twoich.</p>
      ${bezDanych.length ? `<details class="card"><summary><b>Bez danych o liczbie graczy: ${bezDanych.length}</b> – te gry nie są podpowiadane</summary>
        <div class="list" style="margin-top:10px">${bezDanych.map(g => `<div class="li"><div class="main"><div class="t">${esc(g.title)}</div></div><button class="small" data-uzup="${esc(g.id)}">Uzupełnij</button></div>`).join('')}</div></details>` : ''}`;

    el.querySelectorAll('.wz-opt').forEach(box => box.querySelectorAll('button').forEach(b => b.onclick = () => {
      const k = box.dataset.k; s[k] = isNaN(+b.dataset.v) ? b.dataset.v : +b.dataset.v; save(s); wylosowana = null; render(el);
    }));
    const los = el.querySelector('#wzLos');
    if (los) los.onclick = () => {
      // losowanie ważone spośród 8 najlepszych
      const top = wyniki.slice(0, 8); const min = Math.min(...top.map(r => r.pkt));
      const wagi = top.map(r => r.pkt - min + 5); let x = Math.random() * wagi.reduce((a, b) => a + b, 0);
      let pick = top[0]; for (let i = 0; i < top.length; i++) { x -= wagi[i]; if (x <= 0) { pick = top[i]; break; } }
      wylosowana = pick.g.id; render(el); App.ui.toast('🎲 ' + pick.g.title);
    };
    el.querySelectorAll('.wz-li').forEach(r => r.onclick = () => App.go('planszowki', { gra: r.dataset.id }));
    el.querySelectorAll('[data-uzup]').forEach(b => b.onclick = async () => {
      const g = await DB.get('games', b.dataset.uzup); if (!g) return;
      const out = await App.ui.form('Uzupełnij: ' + g.title, [
        { name: 'minPlayers', label: 'Graczy od', type: 'number', value: g.minPlayers },
        { name: 'maxPlayers', label: 'Graczy do', type: 'number', value: g.maxPlayers },
        { name: 'playTime', label: 'Czas gry (min)', type: 'number', value: g.playTime }
      ]);
      if (!out) return;
      await DB.put('games', Object.assign({}, g, out)); render(el);
    });
  }

  App.registerModule({ id: 'wieczor', title: 'Wieczór gier', icon: '🎉', order: 12, render });
  App.provide('wieczor.info', info); // inne moduły mogą odczytać liczbę graczy/czas gry
})();
