/* „Dawno nie grane” – sezonowe przypomnienia: gry nie grane od roku, rocznice pierwszej partii i zakupu,
 * propozycje na porę roku (październik – horrory, grudzień – gry nie grane w tym roku).
 * Raz dziennie (przy otwarciu aplikacji) wysyła powiadomienie o dzisiejszej rocznicy (moduł Powiadomienia).
 * Na urządzeniu: localStorage 'przypomnienia' = { wl: true, dzien: 'RRRR-MM-DD' }.
 */
(function () {
  const G = window.GP, { esc, pl } = G;
  const KEY = 'przypomnienia';
  const cfg = () => { try { return Object.assign({ wl: true, dzien: '' }, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { return { wl: true }; } };
  const zapisz = c => { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {} };
  const dni = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);
  const MIES = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];
  const dzienMies = iso => { const d = new Date(iso); return d.getDate() + ' ' + MIES[d.getMonth()]; };

  async function policz() {
    const d = await G.dane();
    const dzis = App.ui.today(), rok = dzis.slice(0, 4);
    const gry = G.posiadane(d.games).filter(g => !g.isExpansion);
    const dawno = gry.filter(g => d.ostatnia(g) && dni(d.ostatnia(g), dzis) >= 365).sort((a, b) => d.ostatnia(a).localeCompare(d.ostatnia(b)));
    const tylkoBgg = gry.filter(g => !d.ostatnia(g) && g.bggPlays);
    const nigdy = gry.filter(g => !d.partie(g));
    // rocznice w ciągu 7 dni (pierwsza partia, zakup)
    const rocz = [];
    const za = n => { const t = new Date(dzis); t.setDate(t.getDate() + n); return t.toISOString().slice(5, 10); };
    const okno = new Map([...Array(8).keys()].map(n => [za(n), n]));
    gry.forEach(g => {
      const p = d.pierwsza(g);
      if (p && p.slice(0, 4) < rok && okno.has(p.slice(5, 10))) rocz.push({ g, za: okno.get(p.slice(5, 10)), lat: +rok - +p.slice(0, 4), co: 'pierwszej partii', data: p });
      const k = g.acquiredAt && String(g.acquiredAt).slice(0, 10);
      if (k && k.slice(0, 4) < rok && okno.has(k.slice(5, 10))) rocz.push({ g, za: okno.get(k.slice(5, 10)), lat: +rok - +k.slice(0, 4), co: 'zakupu', data: k });
    });
    rocz.sort((a, b) => a.za - b.za);
    // pora roku
    const m = new Date().getMonth() + 1;
    let sezon = null;
    if (m === 10) sezon = { t: '🎃 Październik – czas na horror', gry: gry.filter(g => { const i = G.info(g); return i && i.kat.some(k => /Horror|Zombies/.test(k)); }) };
    else if (m === 12) sezon = { t: '🎄 Koniec roku – gry, w które w tym roku jeszcze nie grałeś', gry: gry.filter(g => d.partie(g) && !(d.byGame.get(g.id) || []).some(p => (p.date || '').startsWith(rok))) };
    else if (m >= 6 && m <= 8) sezon = { t: '☀️ Lato – lekkie gry na wyjazd i do ogródka', gry: gry.filter(g => { const i = G.info(g); return (g.weight && g.weight < 2 && i && i.czas && i.czas <= 45); }) };
    else if (m === 2) sezon = { t: '❤️ Luty – gry na dwie osoby', gry: gry.filter(g => { const i = G.info(g); return i && i.gracze[0] <= 2 && i.gracze[1] === 2; }) };
    if (sezon) sezon.gry = sezon.gry.sort((a, b) => (d.ostatnia(a) || '').localeCompare(d.ostatnia(b) || '')).slice(0, 12);
    return { d, dzis, dawno, tylkoBgg, nigdy, rocz, sezon };
  }

  const kafel = (d, g, opis) => `<a class="li" href="#/planszowki?gra=${encodeURIComponent(g.id)}" style="text-decoration:none;color:inherit">${G.okladka(g)}<div class="main"><div class="t">${esc(g.title)}</div><div class="s">${opis}</div></div>${g.myRating ? `<div class="num">★ ${G.num(g.myRating)}</div>` : ''}</a>`;
  const temu = (dzis, data) => { const n = dni(data, dzis); const l = Math.floor(n / 365); return l >= 1 ? `${l} ${pl(l, 'rok', 'lata', 'lat')}${n % 365 > 60 ? ' i ' + Math.floor(n % 365 / 30) + ' mies.' : ''} temu` : Math.floor(n / 30) + ' mies. temu'; };

  async function render(el) {
    G.css();
    const R = await policz(); const { d, dzis } = R; const c = cfg();
    el.innerHTML = `
      <h1>Dawno nie grane</h1>
      ${R.rocz.length ? `<div class="card" style="margin-bottom:12px"><h3 style="margin:0 0 6px">🎂 Rocznice w tym tygodniu</h3>${R.rocz.map(r => `<p style="margin:4px 0">${r.za === 0 ? '<b>Dziś</b>' : r.za === 1 ? 'Jutro' : dzienMies(dzis.slice(0, 4) + r.data.slice(4))}: ${r.lat} ${pl(r.lat, 'rok', 'lata', 'lat')} od ${r.co} – <a href="#/planszowki?gra=${encodeURIComponent(r.g.id)}">${esc(r.g.title)}</a></p>`).join('')}</div>` : ''}
      ${R.sezon && R.sezon.gry.length ? `<div class="card" style="margin-bottom:12px"><h3 style="margin:0 0 6px">${esc(R.sezon.t)}</h3><div class="gp-chips">${R.sezon.gry.map(g => `<a class="gp-chip" href="#/planszowki?gra=${encodeURIComponent(g.id)}">${esc(g.title)}</a>`).join('')}</div></div>` : ''}
      <h2>Nie grane od ponad roku: ${R.dawno.length}</h2>
      ${R.dawno.length ? `<div class="list">${R.dawno.slice(0, 60).map(g => kafel(d, g, `ostatnio ${App.ui.fmtDate(d.ostatnia(g))} · ${temu(dzis, d.ostatnia(g))} · ${d.partie(g)} ${pl(d.partie(g), 'partia', 'partie', 'partii')}`)).join('')}</div>` : '<p class="muted">Brak – w każdą zapisaną grę grałeś w ostatnim roku. 👏</p>'}
      ${R.tylkoBgg.length ? `<details class="card" style="margin-top:12px"><summary>Partie tylko z BGG (bez dat): ${R.tylkoBgg.length}</summary><p class="muted" style="font-size:13px">Te gry mają partie przeniesione z BGG jako liczbę, bez dat – nie wiem, kiedy ostatnio w nie grałeś. Zaimportuj partie z BG Stats/BGG w „Narzędziach gier”, a pojawią się tutaj.</p><div class="gp-chips">${R.tylkoBgg.map(g => `<a class="gp-chip" href="#/planszowki?gra=${encodeURIComponent(g.id)}">${esc(g.title)} · ${g.bggPlays}×</a>`).join('')}</div></details>` : ''}
      ${R.nigdy.length ? `<details class="card" style="margin-top:12px"><summary>Nigdy nie grane („wstydliwa półka”): ${R.nigdy.length}</summary><div class="gp-chips" style="margin-top:8px">${R.nigdy.map(g => `<a class="gp-chip" href="#/planszowki?gra=${encodeURIComponent(g.id)}">${esc(g.title)}</a>`).join('')}</div></details>` : ''}
      <label style="display:flex;flex-wrap:nowrap;align-items:flex-start;gap:10px;margin-top:16px"><input type="checkbox" id="prW" ${c.wl ? 'checked' : ''}> Powiadamiaj o rocznicach (raz dziennie, przez moduł Powiadomienia)</label>`;
    el.querySelector('#prW').onchange = e => { const k = cfg(); k.wl = e.target.checked; zapisz(k); };
  }

  /* raz dziennie: powiadomienie o dzisiejszych rocznicach */
  async function sprawdzDzis() {
    const c = cfg(); const dzis = App.ui.today();
    if (!c.wl || c.dzien === dzis || !App.has('powiadomienia.teraz')) return;
    c.dzien = dzis; zapisz(c);
    try {
      const R = await policz();
      const r = R.rocz.find(x => x.za === 0);
      if (r) await App.call('powiadomienia.teraz', '🎂 Rocznica: ' + r.g.title, `Dziś mija ${r.lat} ${pl(r.lat, 'rok', 'lata', 'lat')} od ${r.co}. Może zagracie?`, { go: 'przypomnienia' });
    } catch (e) { console.warn('przypomnienia', e); }
  }
  setTimeout(sprawdzDzis, 8000);

  App.registerModule({
    id: 'przypomnienia', title: 'Dawno nie grane', icon: '⏰', order: 12.9, render,
    async info() { const R = await policz(); const r = R.rocz.find(x => x.za === 0); return r ? '🎂 Dziś rocznica: ' + r.g.title : R.dawno.length ? R.dawno.length + ' ' + pl(R.dawno.length, 'gra czeka', 'gry czekają', 'gier czeka') + ' ponad rok' : ''; }
  });
})();
