/* Wspólne pomocniki dla modułów: licznik punktów, gracze, wyzwania, podsumowanie roku.
 * window.KS = { pl, num, kolor, avatar, ja, dane, wynik, h2h, odczyty, zapiszObraz, styl }
 */
(function () {
  const { esc } = App.ui;
  const pl = (n, one, few, many) => n === 1 ? one : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) ? few : many;
  const num = v => String(Math.round(v * 10) / 10).replace('.', ',');
  const PALETA = ['#2f6fde', '#e0242f', '#2c9a57', '#e09b17', '#8a3ffc', '#14a89b', '#f06a24', '#d6337f', '#4b5bd6', '#6b7280'];
  // kolor gracza: zapisany w profilu albo stały kolor wyliczony z id
  function kolor(p) {
    if (p && p.color) return p.color;
    const s = String((p && (p.id || p.name)) || '?');
    let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return PALETA[h % PALETA.length];
  }
  // kółko ze zdjęciem albo pierwszą literą na kolorze gracza
  function avatar(p, size = 40) {
    const n = (p && p.name) || '?';
    const st = `width:${size}px;height:${size}px;font-size:${Math.round(size * .42)}px;--av:${kolor(p)}`;
    return p && p.photo
      ? `<span class="ks-av" style="${st}"><img src="${esc(p.photo)}" alt=""></span>`
      : `<span class="ks-av" style="${st}">${esc(n.trim().charAt(0).toUpperCase() || '?')}</span>`;
  }
  const ja = players => players.find(p => p.isMe) || null;
  // nazwa „mnie” do zdań typu „bilans z Marcinem”
  const mojeImie = me => !me ? 'Tobą' : (/^ja$/i.test(me.name) ? 'Tobą' : me.name);

  async function dane() {
    const [games, plays, players] = await Promise.all([DB.all('games'), DB.all('plays'), DB.all('players')]);
    return { games, plays, players, gameById: new Map(games.map(g => [g.id, g])), playerById: new Map(players.map(p => [p.id, p])) };
  }

  /* Kto był wyżej w rozgrywce: 1 = a, -1 = b, 0 = remis/nie wiadomo. */
  function wynik(play, a, b) {
    const A = play.players.find(x => x.playerId === a), B = play.players.find(x => x.playerId === b);
    if (!A || !B) return null;
    if (A.win && !B.win) return 1;
    if (B.win && !A.win) return -1;
    if (A.score != null && B.score != null && A.score !== B.score) return (A.score > B.score ? 1 : -1) * (play.lowWins ? -1 : 1);
    return 0;
  }
  /* Bilans a kontra b: { razem, a, b, remis } */
  function h2h(plays, a, b) {
    const r = { razem: 0, a: 0, b: 0, remis: 0 };
    plays.forEach(p => { const w = wynik(p, a, b); if (w === null) return; r.razem++; if (w > 0) r.a++; else if (w < 0) r.b++; else r.remis++; });
    return r;
  }

  /* Daty przeczytania komiksów (Master Reading Order + karty komiksów).
   * Pomija odznaczenia hurtowe (ponad 5 z tą samą datą – import z Excela) i pominięte. */
  async function odczyty() {
    const [ro, comics] = await Promise.all([DB.all('readingOrder'), DB.all('comics')]);
    const r = ro.filter(x => x.read && x.readAt && !x.skipped);
    const grupy = new Map(); r.forEach(x => grupy.set(x.readAt, (grupy.get(x.readAt) || 0) + 1));
    const daty = r.filter(x => grupy.get(x.readAt) <= 5).map(x => ({ d: x.readAt.slice(0, 10), title: x.title, zrodlo: 'mro' }));
    comics.filter(c => c.read && c.readAt).forEach(c => daty.push({ d: c.readAt.slice(0, 10), title: c.title || ((c.series || '') + ' ' + (c.volume || '')), zrodlo: 'komiks' }));
    return daty;
  }

  /* Zapis/udostępnienie obrazka (canvas). Telefon (APK): okno „Udostępnij”; przeglądarka: udostępnij albo pobierz. */
  async function zapiszObraz(canvas, name) {
    const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
    const native = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
    if (native && window.Capacitor.Plugins && window.Capacitor.Plugins.Filesystem) {
      const { Filesystem, Share } = window.Capacitor.Plugins;
      const b64 = canvas.toDataURL('image/png').split(',')[1];
      await Filesystem.writeFile({ path: name, data: b64, directory: 'CACHE' });
      const { uri } = await Filesystem.getUri({ path: name, directory: 'CACHE' });
      try { await Share.share({ title: name, files: [uri], dialogTitle: 'Udostępnij podsumowanie' }); } catch (e) { /* anulowano */ }
      return;
    }
    const file = new File([blob], name, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] }) && matchMedia('(pointer:coarse)').matches) {
      try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  // style wspólne dla czterech modułów (tylko zmienne kolorów z style.css)
  const css = `
  .ks-av{display:inline-flex;align-items:center;justify-content:center;border-radius:50%;background:var(--av);color:#fff;font-weight:700;flex-shrink:0;overflow:hidden;box-shadow:0 0 0 2px var(--surface),0 0 0 3.5px var(--av)}
  .ks-av img{width:100%;height:100%;object-fit:cover}
  .ks-bar{height:12px;background:var(--surface2);border-radius:6px;overflow:hidden}
  .ks-bar>i{display:block;height:100%;background:var(--accent);border-radius:6px;transition:width .4s}
  .ks-bar.done>i{background:var(--ok)}
  .ks-sub{color:var(--muted);font-size:13px}
  .ks-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px}
  .ks-card{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:14px;box-shadow:var(--shadow)}
  .ks-click{cursor:pointer}.ks-click:hover{border-color:color-mix(in srgb,var(--accent) 45%,var(--line))}
  .ks-h2h{display:flex;align-items:center;gap:8px;font-variant-numeric:tabular-nums}
  .ks-h2h .sc{font-weight:750;font-size:18px;min-width:56px;text-align:center}
  .ks-split{display:flex;height:8px;border-radius:4px;overflow:hidden;background:var(--surface2);margin-top:6px}
  .ks-split i{display:block;height:100%}
  `;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  window.KS = { pl, num, kolor, avatar, ja, mojeImie, dane, wynik, h2h, odczyty, zapiszObraz, PALETA };
})();
