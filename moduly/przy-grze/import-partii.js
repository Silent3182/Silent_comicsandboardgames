/* Import dotychczasowych rozgrywek:
 *  – BG Stats: Ustawienia aplikacji BG Stats › Kopia zapasowa › „Eksportuj dane (JSON)” → plik BGStatsExport.json,
 *  – BGG: plik XML z listą partii (boardgamegeek.com/xmlapi2/plays?username=Silent82, zapisany z przeglądarki).
 * Rozgrywki dostają stałe id (bgs-…, bggplay-…), więc ponowny import niczego nie dubluje.
 * Partie z tą samą grą, datą i liczbą graczy co już zapisane (z innego źródła) są pomijane.
 * Usługa: App.call('przygrze.importPartii', plik) -> Promise<raport> ; ImportPartii.parsuj(tekst) do testów. */
(function () {
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').replace(/[^a-z0-9]+/g, ' ').trim();
  const num = v => { if (v == null || v === '') return null; const n = Number(String(v).replace(',', '.')); return isFinite(n) ? n : null; };

  /* ---------- BG Stats (JSON) ---------- */
  function zBgStats(j) {
    const gry = new Map((j.games || []).map(g => [g.id, g]));
    const gracze = new Map((j.players || []).map(p => [p.id, p]));
    const miejsca = new Map((j.locations || []).map(l => [l.id, l.name]));
    const me = j.userInfo && j.userInfo.meRefId;
    return (j.plays || []).filter(p => !p.ignored).map(p => {
      const g = gry.get(p.gameRefId) || {};
      return {
        zrodlo: 'bgs', klucz: 'bgs-' + (p.uuid || p.id || (p.gameRefId + '-' + p.playDate)),
        gra: { tytul: g.name || '(bez nazwy)', bggId: num(g.bggId) || null },
        date: String(p.playDate || '').slice(0, 10), durationMin: num(p.durationMin) || null,
        location: miejsca.get(p.locationRefId) || '', notes: p.comments || '',
        gracze: (p.playerScores || []).map(s => { const pl = gracze.get(s.playerRefId) || {}; return { imie: pl.name || 'Gracz', ja: s.playerRefId === me || !!pl.isMe, score: num(s.score), win: !!s.winner, color: s.role || '' }; })
      };
    }).filter(p => p.date);
  }

  /* ---------- BGG (XML) ---------- */
  function zBgg(xml) {
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    if (doc.querySelector('parsererror')) throw new Error('Nie udało się odczytać pliku XML z BGG');
    const login = (doc.documentElement.getAttribute('username') || '').toLowerCase();
    const out = [];
    doc.querySelectorAll('play').forEach(p => {
      const it = p.querySelector('item');
      const ile = Math.max(1, parseInt(p.getAttribute('quantity') || '1', 10) || 1);
      const baza = {
        zrodlo: 'bgg', gra: { tytul: it ? it.getAttribute('name') : '(bez nazwy)', bggId: it ? num(it.getAttribute('objectid')) : null },
        date: p.getAttribute('date') || '', durationMin: num(p.getAttribute('length')) || null,
        location: p.getAttribute('location') || '', notes: (p.querySelector('comments') || {}).textContent || '',
        gracze: [...p.querySelectorAll('players > player')].map(x => ({ imie: x.getAttribute('name') || x.getAttribute('username') || 'Gracz', ja: !!login && (x.getAttribute('username') || '').toLowerCase() === login, score: num(x.getAttribute('score')), win: x.getAttribute('win') === '1', color: x.getAttribute('color') || '' }))
      };
      for (let i = 0; i < ile; i++) out.push(Object.assign({}, baza, { klucz: 'bggplay-' + p.getAttribute('id') + (i ? '-' + i : '') }));
    });
    return out.filter(p => p.date && p.date !== '0000-00-00');
  }

  function parsuj(tekst) {
    const t = String(tekst || '').replace(/^﻿/, '').trim();
    if (t.startsWith('{')) { const j = JSON.parse(t); if (!j.plays) throw new Error('To nie jest eksport z BG Stats (brak listy partii)'); return { format: 'BG Stats', partie: zBgStats(j) }; }
    if (t.startsWith('<')) {
      if (/<error|Unauthorized|401/i.test(t.slice(0, 400)) && !/<plays/i.test(t)) throw new Error('BGG odmówił dostępu do listy partii (wymaga klucza). Użyj eksportu z BG Stats');
      return { format: 'BGG', partie: zBgg(t) };
    }
    throw new Error('Nieznany format pliku – wczytaj eksport JSON z BG Stats albo XML z BGG');
  }

  /* ---------- zapis do bazy ---------- */
  async function importuj(tekst, opt = {}) {
    const { format, partie } = parsuj(tekst);
    const [games, plays, players] = await Promise.all([DB.all('games', { withDeleted: false }), DB.all('plays', { withDeleted: true }), DB.all('players')]);
    const poBgg = new Map(), poTytule = new Map();
    games.forEach(g => { if (g.bggId && !poBgg.has(g.bggId)) poBgg.set(g.bggId, g); const k = norm(g.title); if (!poTytule.has(k)) poTytule.set(k, g); });
    const graczPoImieniu = new Map(players.map(p => [norm(p.name), p]));
    const ja = players.find(p => p.isMe);
    const juzId = new Set(plays.map(p => p.id));
    const odcisk = p => p.gameId + '|' + p.date + '|' + (p.players || []).length;
    const juzOdcisk = new Map();   // odcisk -> ile takich partii już jest (z innego źródła)
    plays.filter(p => !p.deleted).forEach(p => juzOdcisk.set(odcisk(p), (juzOdcisk.get(odcisk(p)) || 0) + 1));
    const noweGry = [], nowiGracze = [], nowe = [];
    let pominiete = 0;
    const ileNaGre = new Map();

    for (const p of partie) {
      if (juzId.has(p.klucz)) { pominiete++; continue; }
      let g = (p.gra.bggId && poBgg.get(p.gra.bggId)) || poTytule.get(norm(p.gra.tytul));
      if (!g) {   // gra spoza kolekcji: dodajemy jako „grana u innych”
        g = { id: p.gra.bggId ? 'bggp-' + p.gra.bggId : DB.uid(), title: p.gra.tytul, bggId: p.gra.bggId, status: 'played', tags: [], source: 'import' };
        noweGry.push(g); if (g.bggId) poBgg.set(g.bggId, g); poTytule.set(norm(g.title), g);
      }
      const gp = p.gracze.map(x => {
        let pl = x.ja && ja ? ja : graczPoImieniu.get(norm(x.imie));
        if (!pl) { pl = { id: DB.uid(), name: x.imie }; nowiGracze.push(pl); graczPoImieniu.set(norm(x.imie), pl); }
        return { playerId: pl.id, score: x.score, win: x.win, color: x.color };
      });
      const rek = { id: p.klucz, gameId: g.id, date: p.date, durationMin: p.durationMin, location: p.location, notes: p.notes, players: gp, source: p.zrodlo };
      const ile = juzOdcisk.get(odcisk(rek)) || 0;
      if (ile > 0) { juzOdcisk.set(odcisk(rek), ile - 1); pominiete++; continue; }
      nowe.push(rek);
      ileNaGre.set(g.id, (ileNaGre.get(g.id) || 0) + 1);
    }
    if (opt.podglad) return { format, wszystkie: partie.length, nowe: nowe.length, pominiete, noweGry: noweGry.length, nowiGracze: nowiGracze.length };

    if (noweGry.length) await DB.putMany('games', noweGry);
    if (nowiGracze.length) await DB.putMany('players', nowiGracze);
    if (nowe.length) await DB.putMany('plays', nowe);
    // Partie z BGG liczone dotąd tylko jako liczba (bggPlays) – teraz są w aplikacji, więc nie liczymy ich drugi raz.
    const popraw = [];
    for (const g of games) {
      const ile = ileNaGre.get(g.id);
      if (ile && g.bggPlays && ile >= g.bggPlays * 0.8) popraw.push(Object.assign({}, g, { bggPlaysPrzedImportem: g.bggPlays, bggPlays: 0 }));
    }
    if (popraw.length) await DB.putMany('games', popraw);
    await DB.setting('importPartii', { data: new Date().toISOString(), format, ile: nowe.length });
    return { format, wszystkie: partie.length, nowe: nowe.length, pominiete, noweGry: noweGry.length, nowiGracze: nowiGracze.length, liczniki: popraw.length };
  }

  window.ImportPartii = { parsuj, importuj };
  App.provide('przygrze.importPartii', importuj);
})();
