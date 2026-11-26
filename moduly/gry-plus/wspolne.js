/* Wspólne pomocniki modułów „gry-plus”: Co kupić, Mechaniki i autorzy, Dodatki, Kampanie, Wymiana,
 * Dawno nie grane, Pudełka i Kallax, Ciemny stół. window.GP = { … }
 * Dane o grach (mechaniki, kategorie, autorzy, dodatki) z window.GRY_DANE (dane-gry.js) – publiczny zestaw
 * danych BGG ze stycznia 2022, więc nowsze gry mogą ich nie mieć (pokazujemy wtedy „brak danych”).
 */
(function () {
  const esc = s => App.ui.esc(s);
  const pl = (n, one, few, many) => n === 1 ? one : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) ? few : many;
  const num = v => (v == null || v === '' ? '' : String(Math.round(v * 10) / 10).replace('.', ','));

  /* Polskie nazwy najczęstszych mechanik i kategorii BGG (reszta zostaje po angielsku). */
  const MECH_PL = {
    'Hand Management': 'Zarządzanie ręką', 'Dice Rolling': 'Rzut kośćmi', 'Set Collection': 'Zbieranie zestawów', 'Tile Placement': 'Układanie kafelków',
    'Variable Player Powers': 'Różne zdolności graczy', 'Solo / Solitaire Game': 'Tryb solo', 'Card Drafting': 'Dobieranie kart (draft)', 'Worker Placement': 'Rozmieszczanie robotników',
    'Area Majority / Influence': 'Kontrola obszarów / większość', 'End Game Bonuses': 'Premie na koniec gry', 'Modular Board': 'Modułowa plansza', 'Simultaneous Action Selection': 'Jednoczesny wybór akcji',
    'Auction/Bidding': 'Licytacja', 'Cooperative Game': 'Kooperacja', 'Grid Movement': 'Ruch po siatce', 'Income': 'Dochód', 'Hexagon Grid': 'Plansza heksagonalna',
    'Variable Set-up': 'Zmienne przygotowanie', 'Network and Route Building': 'Budowa sieci i tras', 'Action Points': 'Punkty akcji', 'Player Elimination': 'Eliminacja graczy',
    'Area Movement': 'Ruch po obszarach', 'Team-Based Game': 'Gra drużynowa', 'Take That': 'Negatywna interakcja („take that”)', 'Contracts': 'Kontrakty',
    'Worker Placement, Different Worker Types': 'Robotnicy różnych typów', 'Turn Order: Stat-Based': 'Kolejność wg statystyk', 'Push Your Luck': 'Kuszenie losu (push your luck)',
    'Ownership': 'Własność', 'Events': 'Wydarzenia', 'Drafting': 'Draft', 'Tech Trees / Tech Tracks': 'Drzewka technologii', 'Point to Point Movement': 'Ruch między punktami',
    'Track Movement': 'Ruch po torze', 'Action Queue': 'Kolejka akcji', 'Pattern Building': 'Budowanie wzorów', 'Map Addition': 'Rozbudowa mapy', 'Storytelling': 'Opowiadanie historii',
    'Increase Value of Unchosen Resources': 'Rosnąca wartość niewybranych', 'Enclosure': 'Otaczanie terenu', 'Memory': 'Pamięć', 'Action Drafting': 'Draft akcji',
    'Turn Order: Progressive': 'Rotująca kolejność', 'Deck, Bag, and Pool Building': 'Budowanie talii / worka (deck building)', 'Scenario / Mission / Campaign Game': 'Scenariusze / kampania',
    'Turn Order: Claim Action': 'Kolejność przez zajęcie akcji', 'Roll / Spin and Move': 'Rzuć i idź', 'Pattern Recognition': 'Rozpoznawanie wzorów', 'Worker Placement with Dice Workers': 'Kości jako robotnicy',
    'Catch the Leader': 'Doganianie lidera', 'Loans': 'Pożyczki', 'Victory Points as a Resource': 'Punkty jako zasób', 'Trading': 'Handel', 'Square Grid': 'Siatka kwadratów',
    'Variable Phase Order': 'Zmienna kolejność faz', 'Voting': 'Głosowanie', 'Race': 'Wyścig', 'Connections': 'Połączenia', 'Hidden Roles': 'Ukryte role', 'Role Playing': 'Odgrywanie ról',
    'Campaign / Battle Card Driven': 'Karty napędzające kampanię', 'Rondel': 'Rondel', 'Pick-up and Deliver': 'Odbierz i dostarcz', 'Automatic Resource Growth': 'Samoczynny przyrost zasobów',
    'Traitor Game': 'Zdrajca', 'Action Retrieval': 'Odzyskiwanie akcji', 'Sudden Death Ending': 'Nagły koniec gry', 'Stock Holding': 'Akcje spółek', 'Grid Coverage': 'Pokrywanie siatki',
    'Market': 'Rynek', 'Follow': 'Podążanie (follow)', 'Communication Limits': 'Ograniczona komunikacja', 'Trick-taking': 'Lewy (trick-taking)', 'Die Icon Resolution': 'Symbole na kościach',
    'Narrative Choice / Paragraph': 'Wybory fabularne / paragrafy', 'Semi-Cooperative Game': 'Półkooperacja', 'Betting and Bluffing': 'Zakłady i blef', 'Deduction': 'Dedukcja',
    'Card Play Conflict Resolution': 'Walka kartami', 'Once-Per-Game Abilities': 'Zdolności jednorazowe', 'Movement Points': 'Punkty ruchu', 'Paper-and-Pencil': 'Papier i ołówek',
    'Secret Unit Deployment': 'Ukryte rozstawienie', 'Simulation': 'Symulacja', 'Investment': 'Inwestycje', 'Real-Time': 'Czas rzeczywisty', 'Negotiation': 'Negocjacje',
    'Deck Construction': 'Budowanie talii przed grą', 'Stacking and Balancing': 'Układanie i balansowanie', 'Re-rolling and Locking': 'Przerzuty i blokowanie', 'Hidden Victory Points': 'Ukryte punkty',
    'Legacy Game': 'Legacy', 'Line Drawing': 'Rysowanie linii', 'Bingo': 'Bingo', 'Programmed Movement': 'Programowanie ruchu', 'Bag Building': 'Budowanie worka', 'Mancala': 'Mankala',
    'End Game Bonuses ': 'Premie końcowe', 'Turn Order: Pass Order': 'Kolejność wg pasowania', 'Turn Order: Auction': 'Licytacja kolejności', 'Tug of War': 'Przeciąganie liny',
    'Commodity Speculation': 'Spekulacja towarami', 'Movement Template': 'Szablon ruchu', 'Critical Hits and Failures': 'Trafienia krytyczne', 'Tags': 'Znaczniki', 'Bias': 'Skłonności (bias)'
  };
  const KAT_PL = {
    'Card Game': 'Karciana', 'Economic': 'Ekonomiczna', 'Fantasy': 'Fantasy', 'Medieval': 'Średniowiecze', 'Animals': 'Zwierzęta', 'Fighting': 'Walka', 'City Building': 'Budowa miasta',
    'Exploration': 'Eksploracja', 'Dice': 'Kościana', 'Adventure': 'Przygoda', 'Science Fiction': 'Science fiction', 'Bluffing': 'Blef', 'Industry / Manufacturing': 'Przemysł',
    'Party Game': 'Imprezowa', 'Territory Building': 'Budowa terytorium', 'Civilization': 'Cywilizacja', "Children's Game": 'Dla dzieci', 'Deduction': 'Dedukcja', 'Humor': 'Humor',
    'Ancient': 'Starożytność', 'Nautical': 'Morska', 'Abstract Strategy': 'Abstrakcyjna', 'Farming': 'Rolnictwo', 'Negotiation': 'Negocjacje', 'Novel-based': 'Na podstawie książki',
    'Real-time': 'Czas rzeczywisty', 'Action / Dexterity': 'Zręcznościowa', 'Movies / TV / Radio theme': 'Film / serial', 'Renaissance': 'Renesans', 'Environmental': 'Przyroda',
    'Transportation': 'Transport', 'Horror': 'Horror', 'Mythology': 'Mitologia', 'Video Game Theme': 'Gra wideo', 'Puzzle': 'Łamigłówka', 'Mafia': 'Mafia', 'Miniatures': 'Figurki',
    'Trains': 'Pociągi', 'Memory': 'Pamięć', 'Prehistoric': 'Prehistoria', 'Political': 'Polityka', 'Racing': 'Wyścigi', 'Arabian': 'Orient', 'American West': 'Dziki Zachód',
    'Word Game': 'Słowna', 'Space Exploration': 'Kosmos', 'Travel': 'Podróże', 'Spies/Secret Agents': 'Szpiedzy', 'Pirates': 'Piraci', 'Zombies': 'Zombie', 'Sports': 'Sport',
    'Educational': 'Edukacyjna', 'Mature / Adult': 'Dla dorosłych', 'Comic Book / Strip': 'Komiks', 'Wargame': 'Wojenna', 'Murder/Mystery': 'Kryminał', 'Medical': 'Medycyna',
    'Religious': 'Religia', 'Math': 'Matematyka', 'Trivia': 'Wiedza (trivia)', 'Music': 'Muzyka', 'Napoleonic': 'Epoka napoleońska', 'World War II': 'II wojna światowa', 'Collectible Components': 'Kolekcjonerska'
  };
  const D = () => window.GRY_DANE || { mech: [], kat: [], aut: [], gry: {}, baza: {}, dodatki: {}, kand: [] };
  const mechNazwa = m => MECH_PL[m] || m;
  const katNazwa = k => KAT_PL[k] || k;

  /* Dane o grze z BGG: { mech:[], kat:[], aut:[], gracze:[min,max], czas } albo null */
  function info(g) {
    const d = D(); const x = g && g.bggId && d.gry[g.bggId];
    if (!x) return null;
    return { mech: x.m.map(i => d.mech[i]), kat: x.c.map(i => d.kat[i]), aut: x.d.map(i => d.aut[i]), gracze: x.p, czas: x.t };
  }

  /* Liczba partii gry: rozgrywki z aplikacji + zapisane wcześniej na BGG */
  async function dane() {
    const [games, plays, players] = await Promise.all([DB.all('games'), DB.all('plays'), DB.all('players')]);
    const byGame = new Map();
    plays.forEach(p => { if (!byGame.has(p.gameId)) byGame.set(p.gameId, []); byGame.get(p.gameId).push(p); });
    byGame.forEach(a => a.sort((x, y) => (x.date || '').localeCompare(y.date || '')));
    // rozgrywki z dodatkami (pole expansions w rozgrywce – jeśli kiedyś zapisane)
    const zDodatkiem = new Map();
    plays.forEach(p => (p.expansions || []).forEach(e => zDodatkiem.set(e, (zDodatkiem.get(e) || 0) + 1)));
    const partie = g => (byGame.get(g.id) || []).length + (g.bggPlays || 0) + (zDodatkiem.get(g.id) || 0);
    const ostatnia = g => { const a = byGame.get(g.id); return a && a.length ? a[a.length - 1].date : null; };
    const pierwsza = g => { const a = byGame.get(g.id); return a && a.length ? a[0].date : null; };
    return { games, plays, players, byGame, partie, ostatnia, pierwsza, gameById: new Map(games.map(g => [g.id, g])), playerById: new Map(players.map(p => [p.id, p])) };
  }
  const posiadane = games => games.filter(g => g.status === 'owned' || g.status === 'forSale');

  /* Gra bazowa dla dodatku (z danych BGG albo po tytule „Baza: Dodatek”) */
  function bazaDodatku(exp, games) {
    const d = D();
    const bid = exp.baseBggId || d.baza[exp.bggId];
    const bazy = games.filter(g => !g.isExpansion && g.status !== 'wishlist');
    if (exp.baseGameId) { const b = games.find(g => g.id === exp.baseGameId); if (b) return b; }
    if (bid) { const b = bazy.find(g => g.bggId === bid); if (b) return b; }
    const t = (exp.title || '').toLowerCase();
    const kand = bazy.filter(g => t.startsWith(g.title.toLowerCase()) && t.length > g.title.length);
    return kand.sort((a, b) => b.title.length - a.title.length)[0] || null;
  }

  /* ---------- Pudełka i Kallax ---------- */
  // Wnętrze przegródki IKEA Kallax: ok. 33 × 33 cm, głębokość ok. 38 cm.
  const KALLAX = { w: 33, h: 33, d: 38 };
  const TYPOWE = { w: 30, l: 30, h: 7 }; // szacunek, gdy nie znamy wymiarów
  function wymiary(g) {
    const p = g && g.pudelko;
    if (p && p.w && p.l && p.h) return { w: +p.w, l: +p.l, h: +p.h, szac: false };
    const b = g && g.bggId && window.BGG_PUDELKA && window.BGG_PUDELKA[g.bggId]; // z wydań na BGG (bgg-dane.js)
    if (b) return { w: b[0], l: b[1], h: b[2], szac: false, bgg: true };
    return Object.assign({ szac: true }, TYPOWE);
  }
  /* Czy pudełko zmieści się w przegródce: { pion, poziom } (pion = stoi grzbietem do przodu, poziom = leży) */
  function miesci(g) {
    const { w, l, h } = wymiary(g);
    const a = [w, l, h].sort((x, y) => x - y); // a[0] najcieńszy
    // stoi: grubość w poziomie, dwa większe wymiary jako wysokość i głębokość
    const pion = (a[1] <= KALLAX.h && a[2] <= KALLAX.d) || (a[2] <= KALLAX.h && a[1] <= KALLAX.d);
    // leży: dwa większe wymiary na dnie (szerokość × głębokość)
    const poziom = (a[1] <= KALLAX.w && a[2] <= KALLAX.d) || (a[2] <= KALLAX.w && a[1] <= KALLAX.d);
    return { pion, poziom, grubosc: a[0] };
  }
  /* Zajętość przegródki przez gry (stojące obok siebie): { cm, szac, procent } */
  function zajetosc(gry) {
    let cm = 0, szac = 0;
    gry.forEach(g => { const m = miesci(g); cm += m.grubosc; if (wymiary(g).szac) szac++; });
    return { cm: Math.round(cm * 10) / 10, szac, procent: Math.round(cm / KALLAX.w * 100) };
  }

  function css() {
    if (document.getElementById('gp-css')) return;
    const st = document.createElement('style'); st.id = 'gp-css';
    st.textContent = `
.gp-bar{display:flex;align-items:center;gap:8px;margin:3px 0}
.gp-bar .lab{flex:0 0 42%;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px}
.gp-bar .tr{flex:1;height:10px;border-radius:6px;background:var(--surface2);overflow:hidden;position:relative}
.gp-bar .tr i{position:absolute;left:0;top:0;bottom:0;border-radius:6px;background:var(--accent)}
.gp-bar .tr b{position:absolute;left:0;top:0;height:4px;bottom:auto;border-radius:6px;background:#e09b17;display:block}
.gp-bar .v{flex:0 0 auto;font-size:12.5px;color:var(--muted);min-width:74px;text-align:right}
.gp-chips{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0}
.gp-chip{display:inline-block;padding:3px 10px;border-radius:999px;background:var(--surface2);font-size:12.5px;line-height:1.5;border:0;color:var(--text);cursor:pointer}
.gp-chip.on{background:var(--accent);color:#fff}
.gp-reko{display:flex;gap:12px;align-items:flex-start}
.gp-reko img,.gp-reko .ph{width:56px;height:56px;object-fit:contain;border-radius:8px;flex:0 0 56px;background:var(--surface2);display:flex;align-items:center;justify-content:center}
.gp-reko .why{font-size:13px;color:var(--muted);margin-top:2px}
.gp-sec{margin-top:16px}
.gp-sec h2{margin-bottom:6px}
.gp-ok{color:#2c9a57;font-weight:600}.gp-no{color:#d64545;font-weight:600}.gp-q{color:var(--muted)}
.gp-fill{height:12px;border-radius:6px;background:var(--surface2);overflow:hidden;margin:6px 0}
.gp-fill i{display:block;height:100%;background:#2c9a57}
.gp-fill.full i{background:#d64545}.gp-fill.near i{background:#e09b17}
.gp-tabs{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0 12px}
.gp-pre{white-space:pre-wrap;font:13px/1.45 ui-monospace,Consolas,monospace;background:var(--surface2);padding:12px;border-radius:10px;max-height:340px;overflow:auto;user-select:all}
.gp-log{border-left:3px solid var(--line);padding-left:10px;margin:8px 0}
.gp-dod{display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--line)}
.gp-dod:last-child{border-bottom:0}
.gp-dod img,.gp-dod .ph{width:36px;height:36px;object-fit:contain;border-radius:6px;flex:0 0 36px}
.gp-dod .main{flex:1;min-width:0}
`;
    document.head.appendChild(st);
  }

  async function kopiuj(t) {
    try { await navigator.clipboard.writeText(t); App.ui.toast('Skopiowano – wklej na forum'); }
    catch (e) { App.ui.toast('Nie udało się skopiować – zaznacz tekst i skopiuj ręcznie'); }
  }

  const okladka = (g, cls = '') => g && (g.thumb || g.image) ? `<img loading="lazy" class="${cls}" src="${esc(g.thumb || g.image)}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'ph',textContent:'🎲'}))">` : `<span class="ph ${cls}">🎲</span>`;

  window.GP = { esc, pl, num, D, info, mechNazwa, katNazwa, dane, posiadane, bazaDodatku, KALLAX, TYPOWE, wymiary, miesci, zajetosc, css, kopiuj, okladka };

  // ikony kafelków (Start i menu)
  Object.assign(window.IKONY = window.IKONY || {}, {
    rekomendacje: '<path class="f" d="M5.5 8h13l-1 12.5h-11z"/><path d="M9 10.5V7a3 3 0 0 1 6 0v3.5"/><path d="m12 12.3.9 1.8 2 .3-1.5 1.4.4 2-1.8-1-1.8 1 .4-2-1.5-1.4 2-.3z" fill="currentColor" stroke="none"/>',
    mechaniki: '<circle class="f" cx="12" cy="12" r="3.2"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>',
    dodatki: '<rect class="f" x="3.5" y="9" width="11.5" height="11.5" rx="2"/><path d="M9 4.5h8.5a2 2 0 0 1 2 2V15M18 2.5v4M16 4.5h4"/>',
    kampanie: '<path class="f" d="M5 3.5h11.5a2 2 0 0 1 2 2v15l-7.2-3.6L4.5 20.5V4a.5.5 0 0 1 .5-.5z"/><path d="M8.5 8.5h6M8.5 12h4"/>',
    wymiana: '<path d="M4 8h13M13.5 4.5 17 8l-3.5 3.5M20 16H7M10.5 12.5 7 16l3.5 3.5"/><circle class="f" cx="19.5" cy="8" r="1.2"/><circle class="f" cx="4.5" cy="16" r="1.2"/>',
    przypomnienia: '<circle class="f" cx="12" cy="13" r="7.5"/><path d="M12 9v4.5l3 2M4.5 4.5 7 3M19.5 4.5 17 3"/>',
    pudelka: '<path class="f" d="M3.5 7.5 12 3.5l8.5 4v9L12 20.5l-8.5-4z"/><path d="M3.5 7.5 12 11.5l8.5-4M12 11.5v9"/>'
  });
  Object.assign(window.IKONY_KOLOR = window.IKONY_KOLOR || {}, {
    rekomendacje: '#0f8f6f', mechaniki: '#5a67d8', dodatki: '#c2410c', kampanie: '#7c3aed', wymiana: '#0891b2', przypomnienia: '#db2777', pudelka: '#92400e'
  });
})();
