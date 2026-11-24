/* Polskie tytuły gier: „Wsiąść do pociągu” = „Ticket to Ride”.
 * Słownik wbudowany (dane-tytuly.js) + własne wpisy (ustawienie 'tytulyPL' = { klucz: [nazwy] }, synchronizowane;
 * klucz = tytuł z BGG po normalizacji; pusta lista = „ta gra nie ma polskiej nazwy”, wtedy słownik jest pomijany).
 * Używają tego: wyszukiwarka planszówek i wybór gry przy rozgrywce, asystent głosowy, rozpoznawanie zdjęć półek,
 * sklep/skaner („czy mam?”), lista życzeń (szukanie cen).
 * API (synchronicznie, globalne window.Tytuly):
 *   Tytuly.pl(gra|tytuł)     -> polskie nazwy
 *   Tytuly.nazwy(gra|tytuł)  -> [tytuł, ...polskie]
 *   Tytuly.pasuje(gra, tekst)-> czy tekst jest fragmentem któregoś tytułu (bez ogonków i wielkości liter)
 *   await Tytuly.ustaw(tytuł, [nazwy] | null)  (null = wróć do słownika)
 *   App.call('tytuly.karta', el, gra) – linijka „🇵🇱 …  ✏️” na karcie gry
 */
(function () {
  const nz = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l')
    .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
  const baza = new Map(Object.entries(window.TYTULY_PL || {}).map(([en, pl]) => [nz(en), pl.split('|').map(x => x.trim()).filter(Boolean)]));
  let wlasne = {};
  const hay = new Map(); // tytuł -> znormalizowane nazwy (do szukania)

  const tytul = g => typeof g === 'string' ? g : (g && g.title) || '';
  /* Ze słownika: cały tytuł albo gra bazowa + reszta tytułu dodatku („7 Wonders: Leaders” → „7 Cudów Świata: Leaders”). */
  function zeSlownika(t) {
    const k = nz(t);
    if (baza.has(k)) return baza.get(k);
    const m = /^(.+?)\s*([:–—(].*)$/.exec(t);
    if (m) { const b = nz(m[1]); if (baza.has(b)) return baza.get(b).map(p => p + (m[2][0] === '(' ? ' ' : '') + m[2]); }
    return [];
  }
  function wlasneDla(t) {
    const k = nz(t);
    if (Object.prototype.hasOwnProperty.call(wlasne, k)) return wlasne[k];
    const m = /^(.+?)\s*([:–—(].*)$/.exec(t); // własna nazwa gry bazowej przechodzi na dodatki
    if (m) { const b = nz(m[1]); if (Object.prototype.hasOwnProperty.call(wlasne, b)) return wlasne[b].map(p => p + (m[2][0] === '(' ? ' ' : '') + m[2]); }
    return null;
  }
  function pl(g) {
    const t = tytul(g);
    const w = wlasneDla(t);
    const arr = (w || zeSlownika(t)).slice();
    if (g && typeof g === 'object' && g.plTitle) arr.unshift(g.plTitle);
    const T = nz(t), seen = new Set([T]);
    return arr.filter(x => { const k = nz(x); if (!k || seen.has(k)) return false; seen.add(k); return true; });
  }
  const nazwy = g => [tytul(g)].concat(pl(g)).filter(Boolean);
  function pasuje(g, q) {
    const Q = nz(q); if (!Q) return true;
    const t = tytul(g), key = t + '\u0001' + ((g && g.plTitle) || '');
    let h = hay.get(key);
    if (h == null) { h = nazwy(g).map(nz).join(' | '); hay.set(key, h); }
    return h.includes(Q);
  }
  async function ustaw(t, lista) {
    const k = nz(t);
    const w = Object.assign({}, (await DB.setting('tytulyPL')) || {});
    if (lista == null) delete w[k]; else w[k] = lista.map(x => String(x).trim()).filter(Boolean);
    await DB.setting('tytulyPL', w);
    wlasne = w; hay.clear();
  }
  const wczytaj = async () => { try { wlasne = (await DB.setting('tytulyPL')) || {}; hay.clear(); } catch (e) { } };
  wczytaj();
  DB.on('settings', wczytaj);

  window.Tytuly = { pl, nazwy, pasuje, ustaw, nz, zeSlownika, get wlasne() { return wlasne; }, ileWSlowniku: baza.size };

  /* ---------- edycja ---------- */
  async function edytuj(t) {
    const teraz = pl(t), slownik = zeSlownika(t), maWlasne = wlasneDla(t) !== null;
    const o = await App.ui.form('Polskie nazwy: ' + t, [
      { name: 'n', label: 'Polskie tytuły (kilka oddziel średnikiem)', value: teraz.join('; '), placeholder: 'np. Wsiąść do pociągu' },
      { type: 'html', html: `<p class="muted" style="margin:0;font-size:13px">${slownik.length ? 'W słowniku aplikacji: ' + App.ui.esc(slownik.join('; ')) + '. ' : ''}Zostaw puste, jeśli gra nie ma polskiej nazwy. Nazwy pomagają w szukaniu, asystencie głosowym i rozpoznawaniu półek.</p>` },
      ...(maWlasne ? [{ name: 'reset', label: 'Wróć do nazw ze słownika aplikacji', type: 'checkbox', value: false }] : [])
    ]);
    if (!o) return false;
    if (o.reset) await ustaw(t, null);
    else await ustaw(t, o.n.split(/[;\n]/));
    App.ui.toast('Zapisano polskie nazwy');
    return true;
  }
  App.provide('tytuly.edytuj', edytuj);
  App.provide('tytuly.karta', (el, g) => {
    if (!el || !g) return;
    const p = pl(g);
    el.innerHTML = `<span class="muted">🇵🇱 ${p.length ? App.ui.esc(p.join(' · ')) : 'brak polskiej nazwy'}</span> <button class="ghost small" data-tpl title="Popraw albo dopisz polski tytuł">✏️</button>`;
    el.querySelector('[data-tpl]').onclick = async () => { if (await edytuj(g.title)) App.refresh(); };
  });

  /* ---------- słownik w Ustawieniach ---------- */
  async function slownikOkno() {
    const gry = (await DB.all('games')).filter(g => !g.isExpansion && g.status !== 'played').sort((a, b) => a.title.localeCompare(b.title, 'pl'));
    return new Promise(resolve => {
      const dlg = document.createElement('dialog'); dlg.className = 'dlg';
      let filtr = 'wszystkie', q = '';
      dlg.innerHTML = `<form method="dialog" style="min-width:min(560px,90vw)"><h3>Polskie tytuły gier</h3>
        <input type="search" id="tq" placeholder="Szukaj (po polsku albo po angielsku)…" style="width:100%">
        <div class="seg" style="margin:8px 0"><button type="button" data-f="wszystkie" class="on">Wszystkie</button><button type="button" data-f="bez">Bez polskiej nazwy</button><button type="button" data-f="moje">Moje poprawki</button></div>
        <div id="tl" class="list" style="max-height:55vh;overflow:auto"></div>
        <div class="dlg-btns"><button type="button" class="ghost" id="tdod">+ Tytuł spoza kolekcji</button><button value="ok" class="primary">Gotowe</button></div></form>`;
      document.body.appendChild(dlg);
      const l = dlg.querySelector('#tl');
      const draw = () => {
        const arr = gry.filter(g => pasuje(g, q) && (filtr === 'wszystkie' || (filtr === 'bez' ? !pl(g).length : wlasneDla(g.title) !== null)));
        l.innerHTML = arr.map((g, i) => `<div class="li" data-i="${gry.indexOf(g)}" style="cursor:pointer"><div class="main"><div class="t">${App.ui.esc(g.title)}</div><div class="s">${pl(g).length ? '🇵🇱 ' + App.ui.esc(pl(g).join(' · ')) : '<i>brak polskiej nazwy</i>'}${wlasneDla(g.title) !== null ? ' · <b>Twoja</b>' : ''}</div></div><span>✏️</span></div>`).join('') || '<p class="muted" style="padding:10px">Nic nie znaleziono.</p>';
      };
      l.onclick = async e => { const r = e.target.closest('[data-i]'); if (!r) return; if (await edytuj(gry[+r.dataset.i].title)) draw(); };
      dlg.querySelector('#tq').oninput = e => { q = e.target.value; draw(); };
      dlg.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { filtr = b.dataset.f; dlg.querySelectorAll('[data-f]').forEach(x => x.classList.toggle('on', x === b)); draw(); });
      dlg.querySelector('#tdod').onclick = async () => {
        const o = await App.ui.form('Tytuł spoza kolekcji', [{ name: 't', label: 'Tytuł oryginalny (jak na BGG)', placeholder: 'np. Ticket to Ride: Europe' }, { name: 'n', label: 'Polskie tytuły (oddziel średnikiem)', placeholder: 'np. Wsiąść do pociągu: Europa' }]);
        if (o && o.t && o.n) { await ustaw(o.t, o.n.split(/[;\n]/)); App.ui.toast('Dodano do słownika'); }
      };
      dlg.addEventListener('close', () => { dlg.remove(); resolve(); });
      draw();
      dlg.showModal();
    });
  }
  async function karta(el) {
    const gry = (await DB.all('games')).filter(g => !g.isExpansion && (g.status === 'owned' || g.status === 'forSale'));
    const zNazwa = gry.filter(g => pl(g).length).length, moje = Object.keys(wlasne).length;
    const box = document.createElement('div');
    box.innerHTML = `<h2>Polskie tytuły gier</h2>
      <div class="card"><p>Słownik nazw w rodzaju „Wsiąść do pociągu” = „Ticket to Ride”. Działa w wyszukiwarce, przy wyborze gry do rozgrywki, w asystencie głosowym, w rozpoznawaniu zdjęć półek, w sklepie i na liście życzeń.</p>
        <p class="muted">Polską nazwę ma ${zNazwa} z ${gry.length} Twoich gier · w słowniku aplikacji ${baza.size} tytułów${moje ? ` · Twoich poprawek: ${moje}` : ''}.</p>
        <p class="row"><button id="tSlownik">Otwórz słownik…</button></p></div>`;
    el.append(...box.childNodes);
    el.querySelector('#tSlownik').onclick = async () => { await slownikOkno(); App.refresh(); };
  }
  function hook() {
    const m = (App.modules || []).find(x => x.id === 'ustawienia');
    if (!m || m._tytuly) return !!m;
    const orig = m.render; m._tytuly = true;
    m.render = async function (el, ...rest) { await orig.call(this, el, ...rest); try { await karta(el); } catch (e) { console.warn(e); } };
    return true;
  }
  if (!hook()) document.addEventListener('DOMContentLoaded', hook);
})();
