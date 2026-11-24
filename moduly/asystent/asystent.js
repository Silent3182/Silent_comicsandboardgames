/* Moduł „Asystent głosowy” (🎤): polecenia mówione albo wpisane po polsku.
 *   „Brass Silent 145 Andrzej 130 Daria 125 Palmer 150”   → rozgrywka z wynikami, zwycięzca liczony sam
 *   „dodaj rozgrywkę Azul, wygrał Marcin”                  → rozgrywka ze zwycięzcą
 *   „zagraliśmy w Carcassonne z Kasią i Tomkiem”           → rozgrywka z graczami
 *   „dodaj do listy zakupów Thorgal 66”, „czy mam Wingspan”, „pokaż Brass”, „co mam czytać”,
 *   „licznik Azul”, „wystaw na sprzedaż Azul”
 * Zawsze przed zapisem pokazuje podgląd do potwierdzenia (gra, gracze, punkty, zwycięzca).
 * Rozpoznawanie mowy: w przeglądarce Web Speech API (Chrome/Edge, pl-PL); w APK wtyczka
 * @capacitor-community/speech-recognition (Android). Bez mikrofonu zawsze można wpisać polecenie.
 * Ksywki graczy (np. „Silent” = Ty) w ustawieniu 'asystentAliasy' = { ksywka: playerId } – uczą się same,
 * gdy w podglądzie wskażesz, kim jest usłyszane imię.
 */
(function () {
  const esc = s => App.ui.esc(s);
  const K = () => window.KS;
  const natywna = () => !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  const ls = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };

  window.IKONY = window.IKONY || {};
  window.IKONY.asystent = '<rect class="f" x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/>';
  if (window.IKONY_KOLOR) window.IKONY_KOLOR.asystent = '#8a3ffc';

  /* ---------- tekst ---------- */
  const bezPl = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l');
  const norm = s => bezPl(s).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  function lev(a, b) {
    if (a === b) return 0; if (!a.length) return b.length; if (!b.length) return a.length;
    let p = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) { const c = [i]; for (let j = 1; j <= b.length; j++) c[j] = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); p = c; }
    return p[b.length];
  }
  const podob = (a, b) => 1 - lev(a, b) / Math.max(a.length, b.length, 1);
  // liczby słownie, które czasem zwraca rozpoznawanie mowy
  const SLOWA = { zero: 0, jeden: 1, jedna: 1, dwa: 2, dwie: 2, trzy: 3, cztery: 4, piec: 5, szesc: 6, siedem: 7, osiem: 8, dziewiec: 9, dziesiec: 10, jedenascie: 11, dwanascie: 12, trzynascie: 13, czternascie: 14, pietnascie: 15, szesnascie: 16, siedemnascie: 17, osiemnascie: 18, dziewietnascie: 19, dwadziescia: 20, trzydziesci: 30, czterdziesci: 40, piecdziesiat: 50, szescdziesiat: 60, siedemdziesiat: 70, osiemdziesiat: 80, dziewiecdziesiat: 90, sto: 100, dwiescie: 200, trzysta: 300, czterysta: 400, piecset: 500 };
  function liczbySlownie(t) {
    const w = t.split(' '); const out = []; let acc = null;
    for (const x of w) { const v = SLOWA[x]; if (v != null) { acc = (acc || 0) + v; } else { if (acc != null) { out.push(String(acc)); acc = null; } out.push(x); } }
    if (acc != null) out.push(String(acc));
    return out.join(' ');
  }

  /* ---------- dopasowanie gry ---------- */
  function ocenGre(q, g) {
    const tytuly = (window.Tytuly ? Tytuly.nazwy(g) : [g.title, g.plTitle]).filter(Boolean).map(norm); // także polskie nazwy (moduly/tytuly)
    let best = 0;
    for (const t of tytuly) {
      if (!t) continue;
      if (t === q) return 1;
      const przed = norm(String(g.title).split(/[:–—(-]/)[0]);
      let s = Math.max(podob(q, t), podob(q, przed) * 0.97);
      if (t.startsWith(q + ' ') || przed === q) s = Math.max(s, 0.93);
      const qw = q.split(' '), tw = t.split(' ');
      if (qw.every(w => tw.some(x => x === w || (w.length > 3 && podob(w, x) > 0.8)))) s = Math.max(s, 0.85 - Math.max(0, tw.length - qw.length) * 0.02);
      best = Math.max(best, s);
    }
    return best;
  }
  function znajdzGry(q, games) {
    q = norm(q); if (!q) return [];
    const r = games.map(g => ({ g, s: ocenGre(q, g) - (g.isExpansion ? 0.05 : 0) - (g.status === 'wishlist' || g.status === 'sold' ? 0.08 : 0) })).filter(x => x.s >= 0.62).sort((a, b) => b.s - a.s);
    if (!r.length) return [];
    return r.filter(x => x.s >= r[0].s - 0.06).slice(0, 6).map(x => x.g);
  }

  /* ---------- dopasowanie graczy (odmiana: „z Kasią” → Kasia) ---------- */
  function znajdzGracza(name, players, aliasy) {
    const n = norm(name); if (!n) return null;
    if (aliasy[n] && players.some(p => p.id === aliasy[n])) return players.find(p => p.id === aliasy[n]);
    if (/^(ja|mnie|mna|ze mna)$/.test(n)) return players.find(p => p.isMe) || null;
    let best = null, bs = 0;
    players.forEach(p => {
      const pn = norm(p.name); if (!pn) return;
      let s = pn === n ? 1 : pn.split(' ')[0] === n ? 0.95 : 0;
      if (!s) { const k = Math.min(4, pn.length - 1, n.length - 1); if (k >= 3 && pn.slice(0, k) === n.slice(0, k) && Math.abs(pn.length - n.length) <= 3) s = 0.8; }
      if (!s && podob(n, pn) >= 0.75) s = 0.7;
      if (s > bs) { bs = s; best = p; }
    });
    return best;
  }
  // „Kasią” → „Kasia”, „Tomkiem” → „Tomek” – tylko do podpisania nowego gracza
  function mianownik(w) {
    const x = w.trim(); const l = x.toLowerCase();
    if (/ą$/.test(l)) return x.slice(0, -1) + 'a';
    if (/kiem$/.test(l)) return x.slice(0, -4) + 'ek';
    if (/iem$/.test(l) && x.length > 5) return x.slice(0, -3);
    if (/em$/.test(l) && x.length > 4) return x.slice(0, -2);
    return x;
  }
  const duza = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;

  /* ---------- rozbiór polecenia ---------- */
  function rozbierz(tekst) {
    let t = liczbySlownie(norm(tekst).replace(/(\d) (\d{3})\b/g, '$1$2'));
    const T = { surowy: tekst };
    if (/^(dodaj (do )?(listy )?zakup\w*|do listy zakupow|kup|kupic|dopisz do zakupow)\b/.test(t)) return Object.assign(T, { typ: 'zakupy', co: t.replace(/^(dodaj (do )?(listy )?zakup\w*|do listy zakupow|kup|kupic|dopisz do zakupow)\s*/, '') });
    if (/^czy mam\b/.test(t)) return Object.assign(T, { typ: 'czymam', co: t.replace(/^czy mam\s*/, '') });
    if (/^(co (mam )?(teraz )?czytac|nastepny komiks|co dalej czytac|co czytam)/.test(t)) return Object.assign(T, { typ: 'czytaj' });
    if (/^(wystaw|sprzedaj|sprzedam)( na sprzedaz)?\b/.test(t)) return Object.assign(T, { typ: 'sprzedaz', co: t.replace(/^(wystaw|sprzedaj|sprzedam)( na sprzedaz)?\s*/, '') });
    if (/^(licznik|liczymy|licz punkty|zacznij gre|zaczynamy)\b/.test(t) && !/\d/.test(t)) return Object.assign(T, { typ: 'licznik', co: t.replace(/^(licznik( punktow)?|liczymy( punkty)?|licz punkty|zacznij gre|zaczynamy)\s*(w\s+)?/, '') });
    if (/^(pokaz|otworz|znajdz)\b/.test(t)) return Object.assign(T, { typ: 'pokaz', co: t.replace(/^(pokaz|otworz|znajdz)\s*/, '') });

    // rozgrywka
    t = t.replace(/^(dodaj |zapisz |nowa )?(rozgrywk\w*|partie|partia|gre)\s*(w\s+)?/, '').replace(/^(zagralismy|gralismy|gralem|gralam|zagralem|zagralam)\s*(w\s+)?/, '');
    const R = Object.assign(T, { typ: 'rozgrywka', gracze: [], zwyciezca: null, coop: null });
    // zwycięzca: „wygrał Marcin”, „wygrała Kasia”, „zwycięzca Tomek”, „Marcin wygrał”
    let m = t.match(/\b(wygral|wygrala|wygrywa|wygrali|zwyciezca|zwyciezyl|zwyciezyla)\s+([a-z]+)/);
    if (m) { R.zwyciezca = m[2]; t = t.replace(m[0], ' '); }
    else if ((m = t.match(/\b([a-z]+)\s+(wygral|wygrala|wygrywa|zwyciezyl|zwyciezyla)\b/))) { R.zwyciezca = m[1]; t = t.replace(m[0], ' '); }
    if (/\b(wygralismy|wygrali wszyscy)\b/.test(t)) { R.coop = 'win'; t = t.replace(/\b(wygralismy|wygrali wszyscy)\b/, ' '); }
    if (/\b(przegralismy|przegrali wszyscy)\b/.test(t)) { R.coop = 'lose'; t = t.replace(/\b(przegralismy|przegrali wszyscy)\b/, ' '); }
    const czas = t.match(/\b(\d+)\s*(min|minut\w*)\b/); if (czas) { R.czas = +czas[1]; t = t.replace(czas[0], ' '); }
    const godz = t.match(/\b(\d+)\s*(godz\w*|h)\b/); if (godz) { R.czas = (R.czas || 0) + 60 * +godz[1]; t = t.replace(godz[0], ' '); }
    // pary „imię liczba”
    const slowa = t.split(' ').filter(Boolean);
    const jestLiczba = w => /^-?\d+([.,]\d+)?$/.test(w);
    const zbedne = new Set(['pkt', 'punkty', 'punktow', 'punkt', 'punktami', 'i', 'oraz', 'a', 'ma', 'mial', 'miala', 'wynik', 'wyniki', 'po']);
    const pierwszaLiczba = slowa.findIndex(jestLiczba);
    let gameWords = slowa;
    if (pierwszaLiczba > 0) {
      // nazwa gracza = słowo tuż przed liczbą (pomijając „pkt” itp.); gra = słowa przed pierwszym graczem
      const pary = [];
      for (let i = 0; i < slowa.length; i++) {
        if (!jestLiczba(slowa[i])) continue;
        let j = i - 1; while (j >= 0 && zbedne.has(slowa[j])) j--;
        if (j < 0 || jestLiczba(slowa[j])) continue;
        pary.push({ i: j, imie: slowa[j], punkty: +slowa[i].replace(',', '.') });
      }
      if (pary.length) {
        gameWords = slowa.slice(0, pary[0].i);
        pary.forEach(p => R.gracze.push({ slyszane: p.imie, punkty: p.punkty }));
      }
    }
    // „z Kasią i Tomkiem” (bez punktów)
    let gtxt = gameWords.join(' ');
    const z = gtxt.match(/\s(z|ze)\s+(.+)$/);
    if (z) { gtxt = gtxt.slice(0, z.index); z[2].split(/\s+(?:i|oraz)\s+|\s+/).filter(w => w && !zbedne.has(w)).forEach(w => { if (!R.gracze.some(g => g.slyszane === w)) R.gracze.push({ slyszane: w, punkty: null }); }); }
    if (R.zwyciezca && !R.gracze.some(g => g.slyszane === R.zwyciezca)) R.gracze.push({ slyszane: R.zwyciezca, punkty: null });
    R.gra = gtxt.replace(/\b(w|we)\s*$/, '').trim();
    return R;
  }

  /* ---------- wykonanie ---------- */
  async function wykonaj(tekst, glosem) {
    const R = rozbierz(tekst);
    const [games, players] = await Promise.all([DB.all('games'), DB.all('players')]);
    const aliasy = Object.assign({}, (await DB.setting('asystentAliasy')) || {});
    const ja = players.find(p => p.isMe);
    if (ja && !aliasy.silent && !players.some(p => norm(p.name) === 'silent')) aliasy.silent = ja.id; // nick Marcina z BGG
    const odp = (t, opt) => { dodajHistorie(tekst, t); pokazOdp(t); if (glosem) mow(t); return t; };
    const wlasne = games.filter(g => g.status !== 'wishlist');

    if (R.typ === 'zakupy') {
      if (!R.co) return odp('Co dopisać do listy zakupów?');
      const tyt = duza(tekst.replace(/^\s*(dodaj (do )?(listy )?zakup\w*|do listy zakupów|do listy zakupow|kup|kupić|kupic|dopisz do zakupów)\s*/i, '').trim()) || duza(R.co);
      if (!(await App.ui.confirm(`Dopisać „${tyt}” do listy zakupów?`, { ok: 'Dopisz' }))) return odp('Anulowano.');
      await DB.put('shoppingList', { title: tyt, itemType: /\d/.test(tyt) ? 'comic' : 'other', bought: false, notes: 'Dodane głosowo' });
      return odp(`Dopisano do listy zakupów: ${tyt}.`);
    }
    if (R.typ === 'czymam') {
      if (!R.co) return odp('O co zapytać?');
      const g = znajdzGry(R.co, games);
      const comics = await DB.all('comics');
      const q = norm(R.co);
      const k = comics.filter(c => c.status === 'owned' && norm((c.series || '') + ' ' + (c.volume || '') + ' ' + (c.title || '')).includes(q)).slice(0, 5);
      const gm = g.filter(x => x.status !== 'wishlist' && x.status !== 'sold');
      if (gm.length) return odp(`Tak, masz: ${gm.map(x => x.title).join(', ')}${gm[0].polka && App.has('polki.tekst') ? ' – ' + App.call('polki.tekst', 'game', gm[0]) : ''}.`);
      if (k.length) return odp(`Tak, masz komiksy: ${k.map(c => c.title || c.series + ' ' + c.volume).join(', ')}.`);
      if (g.some(x => x.status === 'wishlist')) return odp(`Nie masz – „${g.find(x => x.status === 'wishlist').title}” jest na liście życzeń.`);
      if (g.some(x => x.status === 'sold')) return odp(`Już nie – „${g.find(x => x.status === 'sold').title}” sprzedana.`);
      return odp(`Nie znalazłem „${R.co}” w kolekcji.`);
    }
    if (R.typ === 'czytaj') {
      const n = App.has('komiksy.nastepny') ? await App.call('komiksy.nastepny') : null;
      return odp(n ? `Następny do przeczytania: ${n.title}${n.wyd ? ' (' + n.wyd + ')' : ''}.` : 'Nie wiem, co jest następne – otwórz zakładkę Czytanie.');
    }
    if (R.typ === 'licznik' || R.typ === 'pokaz' || R.typ === 'sprzedaz') {
      const g = await wybierzGre(znajdzGry(R.co, R.typ === 'pokaz' ? games : wlasne), R.co, wlasne);
      if (!g) {
        if (R.typ === 'pokaz' && R.co) { const comics = await DB.all('comics'); const q = norm(R.co); const c = comics.find(c => norm((c.series || '') + ' ' + (c.volume || '') + ' ' + (c.title || '')).includes(q)); if (c) { App.go('komiksy', { id: c.id }); return odp('Otwieram: ' + (c.title || c.series + ' ' + c.volume) + '.'); } }
        return odp(R.co ? `Nie znalazłem gry „${R.co}”.` : 'Jaką grę?');
      }
      if (R.typ === 'licznik') { App.call('licznik.start', g.id); return odp('Licznik punktów: ' + g.title + '.'); }
      if (R.typ === 'sprzedaz') { App.call('sprzedaz.wystaw', { itemType: 'game', itemId: g.id }); return odp('Wystawiam: ' + g.title + '.'); }
      App.go('planszowki', { gra: g.id }); return odp('Otwieram: ' + g.title + '.');
    }

    // rozgrywka
    if (!R.gra && !R.gracze.length) return odp('Nie zrozumiałem. Powiedz np. „Brass Silent 145 Andrzej 130” albo „dodaj rozgrywkę Azul, wygrał Marcin”.');
    const kandydaci = znajdzGry(R.gra, wlasne);
    return potwierdzRozgrywke(R, kandydaci, players, aliasy, odp);
  }

  async function wybierzGre(lista, q, games) {
    if (lista.length === 1) return lista[0];
    if (!lista.length) return null;
    const f = await App.ui.form('Którą grę masz na myśli?', [{ name: 'g', label: `Usłyszałem: „${q}”`, type: 'select', options: lista.map(g => [g.id, g.title + (g.year ? ' (' + g.year + ')' : '')]) }], { ok: 'Wybierz' });
    return f ? games.find(g => g.id === f.g) : null;
  }

  async function potwierdzRozgrywke(R, kandydaci, players, aliasy, odp) {
    const ja = players.find(p => p.isMe);
    const gr = R.gracze.map(g => { const p = znajdzGracza(g.slyszane, players, aliasy); return Object.assign({}, g, { playerId: p ? p.id : '', nowy: duza(mianownik(g.slyszane)) }); });
    // „wygrał Marcin” bez innych graczy → dodaj mnie (jeśli to nie ja)
    if (gr.length && ja && !gr.some(g => g.playerId === ja.id) && !gr.some(g => g.punkty != null)) gr.unshift({ slyszane: 'ja', punkty: null, playerId: ja.id, nowy: ja.name });
    const opcjeGraczy = g => [['', '➕ nowy gracz: ' + g.nowy], ...players.slice().sort((a, b) => (b.isMe - a.isMe) || a.name.localeCompare(b.name, 'pl')).map(p => [p.id, p.name + (p.isMe ? ' (Ty)' : '')]), ['__x', '✕ pomiń']];
    const sc = gr.map(g => g.punkty).filter(v => v != null);
    const max = sc.length ? Math.max(...sc) : null;
    const zw = R.zwyciezca ? gr.findIndex(g => g.slyszane === R.zwyciezca) : -1;
    const winDom = R.coop === 'win' ? '__all' : R.coop === 'lose' ? '__none' : zw >= 0 ? String(zw) : max != null ? '__auto' : '';
    const fields = [
      { type: 'html', html: `<p class="muted" style="margin:0 0 6px">Usłyszałem: „${esc(R.surowy)}”</p>` },
      kandydaci.length ? { name: 'gra', label: 'Gra', type: 'select', value: kandydaci[0].id, options: kandydaci.map(g => [g.id, g.title + (g.year ? ' (' + g.year + ')' : '')]).concat([['__inna', 'Inna – wpiszę poniżej']]) } : { name: 'gra', type: 'select', label: 'Gra', value: '__inna', options: [['__inna', 'Nie znalazłem – wpisz tytuł poniżej']] },
      { name: 'graT', label: kandydaci.length ? 'Tytuł innej gry (opcjonalnie)' : 'Tytuł gry', value: kandydaci.length ? '' : duza(R.gra || '') },
      ...gr.flatMap((g, i) => [
        { name: 'p' + i, label: `Gracz ${i + 1}: „${g.slyszane === 'ja' ? 'Ty' : duza(g.slyszane)}”`, type: 'select', value: g.playerId, options: opcjeGraczy(g) },
        { name: 's' + i, label: 'Punkty', type: 'number', step: 'any', value: g.punkty }
      ]),
      { name: 'win', label: 'Zwycięzca', type: 'select', value: winDom, options: [['__auto', max != null ? 'Według punktów (najwięcej)' : 'Według punktów'], ['__low', 'Według punktów (najmniej wygrywa)'], ...gr.map((g, i) => [String(i), g.slyszane === 'ja' ? 'Ty' : duza(g.slyszane)]), ['__all', 'Wszyscy (kooperacja – wygraliśmy)'], ['__none', 'Nikt (kooperacja – przegraliśmy)'], ['', '— nie wiem —']] },
      { name: 'date', label: 'Data', type: 'date', value: App.ui.today() },
      { name: 'durationMin', label: 'Czas gry (min, opcjonalnie)', type: 'number', value: R.czas || null }
    ];
    const out = await App.ui.form('Zapisać rozgrywkę?', fields, { ok: 'Zapisz rozgrywkę' });
    if (!out) return odp('Anulowano – nic nie zapisałem.');
    let gameId = out.gra !== '__inna' ? out.gra : null;
    if (!gameId) {
      const t = (out.graT || '').trim(); if (!t) return odp('Nie zapisano – brak tytułu gry.');
      const all = await DB.all('games'); const ex = all.find(g => g.title.toLowerCase() === t.toLowerCase());
      gameId = ex ? ex.id : (await DB.put('games', { title: t, status: 'played' })).id;
    }
    const nowe = Object.assign({}, aliasy); let nauczone = false;
    const ps = [];
    for (let i = 0; i < gr.length; i++) {
      const sel = out['p' + i]; if (sel === '__x') continue;
      let pid = sel;
      if (!pid) { const ex = players.find(p => norm(p.name) === norm(gr[i].nowy)); pid = ex ? ex.id : (await DB.put('players', { name: gr[i].nowy })).id; }
      // zapamiętaj ksywkę, jeśli usłyszane imię nie pasowało samo
      const n = norm(gr[i].slyszane);
      if (n && n !== 'ja' && sel && !znajdzGraczaBezAliasu(n, players, sel) && nowe[n] !== sel) { nowe[n] = sel; nauczone = true; }
      ps.push({ i, playerId: pid, score: out['s' + i] });
    }
    if (!ps.length) return odp('Nie zapisano – brak graczy.');
    const s = ps.map(p => p.score).filter(v => v != null);
    const low = out.win === '__low';
    const best = s.length ? (low ? Math.min(...s) : Math.max(...s)) : null;
    ps.forEach(p => { p.win = out.win === '__all' ? true : out.win === '__none' ? false : (out.win === '__auto' || low) ? (best != null && p.score === best) : out.win !== '' && String(p.i) === out.win; });
    await DB.put('plays', { gameId, date: out.date || App.ui.today(), durationMin: out.durationMin || undefined, notes: 'Dodane asystentem głosowym', coop: out.win === '__all' || out.win === '__none', lowWins: low || undefined, players: ps.map(({ playerId, score, win }) => ({ playerId, score, win })) });
    if (nauczone) await DB.setting('asystentAliasy', nowe);
    const all = await DB.all('players');
    const game = await DB.get('games', gameId);
    const wyg = ps.filter(p => p.win).map(p => (all.find(x => x.id === p.playerId) || {}).name).filter(Boolean);
    return odp(`Zapisano rozgrywkę: ${game ? game.title : ''}${wyg.length ? '. Wygrywa ' + wyg.join(' i ') : ''}.`);
  }
  function znajdzGraczaBezAliasu(n, players, pid) { const p = znajdzGracza(n, players, {}); return p && p.id === pid; }

  /* ---------- mowa ---------- */
  function mow(t) {
    if (!ls.get('asystent.mowa', true) || !window.speechSynthesis) return;
    try { const u = new SpeechSynthesisUtterance(t); u.lang = 'pl-PL'; const v = speechSynthesis.getVoices().find(v => /^pl/i.test(v.lang)); if (v) u.voice = v; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch (e) {}
  }
  const WebRec = () => window.SpeechRecognition || window.webkitSpeechRecognition;
  const plugin = () => natywna() && window.Capacitor.Plugins && window.Capacitor.Plugins.SpeechRecognition;
  const mozeSluchac = () => !!(plugin() || WebRec());

  async function sluchaj(onPart) {
    const P = plugin();
    if (P) {
      const a = await P.available().catch(() => ({ available: false }));
      if (!a.available) throw new Error('Rozpoznawanie mowy nie jest dostępne na tym telefonie (zainstaluj „Google” / „Usługi mowy Google”).');
      const perm = await P.requestPermissions().catch(() => null);
      if (perm && perm.speechRecognition && perm.speechRecognition !== 'granted') throw new Error('Brak zgody na mikrofon. Zezwól w ustawieniach telefonu.');
      const r = await P.start({ language: 'pl-PL', maxResults: 3, prompt: 'Powiedz polecenie…', partialResults: false, popup: true });
      return (r && r.matches && r.matches[0]) || '';
    }
    const R = WebRec(); if (!R) throw new Error('Ta przeglądarka nie rozpoznaje mowy – wpisz polecenie albo użyj Chrome lub Edge.');
    return new Promise((res, rej) => {
      const r = new R(); r.lang = 'pl-PL'; r.interimResults = true; r.maxAlternatives = 3; r.continuous = false;
      let final = '';
      r.onresult = e => { let t = ''; for (let i = 0; i < e.results.length; i++) { t += e.results[i][0].transcript; if (e.results[i].isFinal) final = t; } onPart && onPart(t); };
      r.onerror = e => rej(new Error(e.error === 'not-allowed' ? 'Brak zgody na mikrofon. Zezwól w ustawieniach przeglądarki.' : e.error === 'no-speech' ? 'Nic nie usłyszałem – spróbuj jeszcze raz.' : e.error === 'network' ? 'Rozpoznawanie mowy potrzebuje internetu.' : 'Nie udało się rozpoznać mowy.'));
      r.onend = () => res(final);
      r.start();
      sluchaj.stop = () => { try { r.stop(); } catch (e) {} };
    });
  }

  /* ---------- historia poleceń ---------- */
  function dodajHistorie(q, a) { const h = ls.get('asystent.historia', []); h.unshift({ q, a, t: Date.now() }); ls.set('asystent.historia', h.slice(0, 15)); const el = document.getElementById('as-hist'); if (el) el.innerHTML = historiaHtml(); }
  const historiaHtml = () => ls.get('asystent.historia', []).map(h => `<div class="li" style="cursor:default;min-height:0"><div class="main"><div class="s">🗣 ${esc(h.q)}</div><div>${esc(h.a)}</div></div></div>`).join('') || '<p class="muted" style="padding:12px;margin:0">Tu pojawią się Twoje polecenia.</p>';
  function pokazOdp(t) { const el = document.getElementById('as-odp'); if (el) el.textContent = t; else App.ui.toast(t, 4500); }

  function css() {
    if (document.getElementById('as-css')) return;
    const st = document.createElement('style'); st.id = 'as-css';
    st.textContent = `
.as-mic{width:108px;height:108px;border-radius:50%;border:0;background:var(--accent);color:var(--on-accent);display:grid;place-items:center;margin:8px auto;cursor:pointer;box-shadow:var(--shadow-lg)}
.as-mic svg{width:48px;height:48px}
.as-mic.on{background:var(--bad);animation:asP 1.2s infinite}
@keyframes asP{0%{box-shadow:0 0 0 0 rgba(179,65,46,.5)}100%{box-shadow:0 0 0 22px rgba(179,65,46,0)}}
.as-live{min-height:28px;text-align:center;font-size:18px;color:var(--muted)}
.as-odp{min-height:24px;text-align:center;font-weight:650;margin:6px 0 12px}
.as-ex{display:flex;flex-wrap:wrap;gap:8px}
.as-ex button{font-size:13px}
#as-fab{position:fixed;right:16px;bottom:calc(var(--nav-h) + 86px + env(safe-area-inset-bottom));z-index:60;width:48px;height:48px;border-radius:16px;border:0;background:var(--surface);color:var(--accent);box-shadow:var(--shadow-lg);display:none;align-items:center;justify-content:center}
#as-fab svg{width:24px;height:24px}
#as-fab.on{background:var(--bad);color:#fff}
@media (max-width:760px){ #as-fab{display:flex} #as-fab.hide{display:none} }
`;
    document.head.appendChild(st);
  }
  const MIC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/></svg>';

  let trwa = false;
  async function nasluch(btn, live) {
    if (trwa) { sluchaj.stop && sluchaj.stop(); return; }
    trwa = true; btn && btn.classList.add('on'); if (live) live.textContent = 'Słucham…';
    try {
      const t = await sluchaj(p => { if (live) live.textContent = p; });
      if (live) live.textContent = t ? '„' + t + '”' : '';
      if (t) await wykonaj(t, true); else pokazOdp('Nic nie usłyszałem.');
    } catch (e) { pokazOdp(App.ui.komunikat(e) || ''); App.ui.toast(e); }
    finally { trwa = false; btn && btn.classList.remove('on'); }
  }

  async function render(el) {
    css();
    const ok = mozeSluchac();
    el.innerHTML = `<h1>Asystent głosowy</h1>
      <div class="card" style="max-width:720px;text-align:center">
        <button class="as-mic" id="as-mic" aria-label="Mów">${MIC}</button>
        <div class="as-live" id="as-live">${ok ? 'Dotknij i powiedz polecenie' : 'Ta przeglądarka nie rozpoznaje mowy – wpisz polecenie poniżej'}</div>
        <div class="as-odp" id="as-odp" aria-live="polite"></div>
        <form id="as-f" class="row" style="text-align:left"><input id="as-t" placeholder="np. Brass Silent 145 Andrzej 130 Daria 125" style="flex:1;min-width:200px" autocomplete="off" enterkeyhint="send"><button class="primary">Wykonaj</button></form>
      </div>
      <div class="card" style="max-width:720px"><h3 style="margin-top:0">Przykłady</h3>
        <div class="as-ex">${['Brass Silent 145 Andrzej 130 Daria 125 Palmer 150', 'Dodaj rozgrywkę Azul, wygrał Marcin', 'Zagraliśmy w Carcassonne z Kasią i Tomkiem', 'Czy mam Wingspan', 'Co mam czytać', 'Dodaj do listy zakupów Thorgal 66', 'Licznik Azul', 'Pokaż Brass'].map(x => `<button class="small" data-ex="${esc(x)}">${esc(x)}</button>`).join('')}</div>
        <p class="muted" style="font-size:13px;margin-bottom:0">Wyniki: tytuł gry, a potem imię i punkty każdego gracza. Zwycięzca liczy się sam. „Silent” to Ty. Przed zapisem zawsze pokazuję podgląd – możesz poprawić grę, graczy i punkty. Gdy wskażesz, kim jest usłyszane imię, zapamiętam to na przyszłość.</p>
        <label class="row" style="gap:8px;margin-top:10px"><input type="checkbox" id="as-mowa" ${ls.get('asystent.mowa', true) ? 'checked' : ''}> Odpowiadaj głosem</label>
        <label class="row" style="gap:8px"><input type="checkbox" id="as-fabo" ${ls.get('asystent.fab', true) ? 'checked' : ''}> Przycisk mikrofonu na telefonie (nad skanerem)</label>
      </div>
      <h2>Ostatnie polecenia</h2><div class="list" id="as-hist" style="max-width:720px">${historiaHtml()}</div>`;
    const $ = s => el.querySelector(s);
    $('#as-mic').onclick = () => nasluch($('#as-mic'), $('#as-live'));
    $('#as-f').onsubmit = async e => { e.preventDefault(); const t = $('#as-t').value.trim(); if (!t) return; $('#as-t').value = ''; $('#as-live').textContent = '„' + t + '”'; await wykonaj(t, false); };
    el.querySelectorAll('[data-ex]').forEach(b => b.onclick = () => { $('#as-t').value = b.dataset.ex; $('#as-t').focus(); });
    $('#as-mowa').onchange = e => ls.set('asystent.mowa', e.target.checked);
    $('#as-fabo').onchange = e => { ls.set('asystent.fab', e.target.checked); fab(); };
  }

  function fab() {
    css();
    let b = document.getElementById('as-fab');
    if (!b) { b = document.createElement('button'); b.id = 'as-fab'; b.setAttribute('aria-label', 'Asystent głosowy'); b.title = 'Asystent głosowy'; b.innerHTML = MIC; document.body.appendChild(b); b.onclick = () => mozeSluchac() ? nasluch(b, document.getElementById('as-live')) : App.go('asystent'); }
    const id = location.hash.replace(/^#\/?/, '').split('?')[0];
    b.classList.toggle('hide', !ls.get('asystent.fab', true) || id === 'asystent' || id === 'licznik');
  }
  window.addEventListener('hashchange', fab);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fab); else fab();

  App.provide('asystent.wykonaj', t => wykonaj(t, false));
  App.provide('asystent.rozbierz', rozbierz); // do testów
  App.registerModule({ id: 'asystent', title: 'Asystent głosowy', icon: '🎤', order: 14, render });
})();
