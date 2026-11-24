/* Moduł „Przy grze”: narzędzia do planszówek.
 *  – na karcie gry (usługa przygrze.sekcja): instrukcja PDF, zasady, o których się zapomina, koszulki (sleeve'y), braki w pudełku,
 *  – zakładka „Narzędzia gier”: Koszulki (podsumowanie, aparat, zakupy), Braki, „Czy się pozbyć?”, Import partii (BG Stats / BGG).
 * Pola w games: instrukcja (adres), zasady (tekst, jedna zasada w wierszu), sleeves [{size, count, w?, h?}],
 *   sleeveStatus ('none'|'partial'|'done'), braki [{id, text, done, doneAt?}], zostaje (bool – „nie pozbywam się”). */
(function () {
  const { esc } = App.ui;
  const S = () => window.SLEEVE;
  const pl = (n, one, few, many) => n === 1 ? one : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) ? few : many;
  const STAT = { none: 'bez koszulek', partial: 'częściowo w koszulkach', done: 'w koszulkach' };
  const PACZKA = 100;

  function css() {
    if (document.getElementById('pg-css')) return;
    const st = document.createElement('style'); st.id = 'pg-css';
    st.textContent = `
      .pg-sec h3 { margin: 0 0 6px; font-size: 15px; display: flex; align-items: center; gap: 8px; }
      .pg-sec h3 .spacer { flex: 1; }
      .pg-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; }
      .pg-grid > .card { margin: 0; }
      .pg-zas { margin: 4px 0 0; padding-left: 20px; } .pg-zas li { margin: 3px 0; }
      .pg-sl { display: flex; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--line); }
      .pg-sl:last-of-type { border-bottom: 0; }
      .pg-sl i { width: 12px; height: 12px; border-radius: 3px; flex-shrink: 0; }
      .pg-sl .t { flex: 1; min-width: 0; }
      .pg-sl .n { font-weight: 700; font-variant-numeric: tabular-nums; }
      .pg-br { display: flex; align-items: center; gap: 8px; padding: 4px 0; }
      .pg-br.done span { color: var(--muted); }
      .pg-br input[type=checkbox] { width: 20px; height: 20px; accent-color: var(--ok); }
      .pg-badge { display: inline-block; padding: 2px 9px; border-radius: 999px; font-size: 12px; font-weight: 650; }
      .pg-badge.done { background: var(--ok-soft); color: var(--ok); }
      .pg-badge.partial { background: var(--accent-2-soft); color: var(--accent-2); }
      .pg-badge.none { background: var(--surface2); color: var(--muted); }
      .pg-badge.bad { background: var(--bad-soft); color: var(--bad); }
      .pg-add { display: flex; gap: 6px; margin-top: 6px; } .pg-add input { flex: 1; min-width: 0; }
      .pg-why { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 3px; }
      .pg-score { width: 54px; text-align: center; font-weight: 800; font-size: 18px; color: var(--bad); }
      .pg-li .acts { display: flex; gap: 6px; flex-shrink: 0; }
      .pg-tbl td.k { width: 14px; } .pg-tbl td.k i { display: block; width: 12px; height: 12px; border-radius: 3px; }
      @media (max-width: 600px) { .pg-li { flex-wrap: wrap; } .pg-li .acts { width: 100%; justify-content: flex-end; } }
    `;
    document.head.appendChild(st);
  }
  const zapisz = async (id, zmiana) => { const g = await DB.get('games', id); if (!g) return null; return DB.put('games', Object.assign(g, zmiana)); };
  const cover = g => g && (g.thumb || g.image) ? `<img loading="lazy" src="${esc(g.thumb || g.image)}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'ph',textContent:'🎲'}))">` : '<span class="ph">🎲</span>';
  const sumaKart = g => (g.sleeves || []).reduce((a, s) => a + (s.count || 0), 0);
  const http = u => /^https?:\/\//i.test(u) ? u : 'https://' + u;

  /* ---------- koszulki: dodawanie rozmiaru ---------- */
  async function dodajKoszulki(g, wstepny) {
    const opcje = S().ROZMIARY.map(r => [r.id, `${r.nazwa} – ${S().wym(r)}`]).concat([['wlasny', 'Własny rozmiar (wpisz poniżej)']]);
    const out = await App.ui.form(`Koszulki – ${g.title}`, [
      { name: 'size', label: 'Rozmiar', type: 'select', value: wstepny ? wstepny.size : 'std-euro', options: opcje },
      { name: 'count', label: 'Ile kart tego rozmiaru', type: 'number', value: wstepny && wstepny.count },
      { name: 'w', label: 'Własny rozmiar: szerokość karty (mm)', type: 'number', step: '0.5', value: wstepny && wstepny.w },
      { name: 'h', label: 'Własny rozmiar: wysokość karty (mm)', type: 'number', step: '0.5', value: wstepny && wstepny.h },
      { type: 'html', html: '<p class="muted" style="margin:0;font-size:13px">Liczbę kart znajdziesz zwykle w instrukcji (spis elementów) albo na BGG w zakładce „Files” / „Forums” (wątki „sleeve size”).</p>' }
    ], { ok: 'Dodaj' });
    if (!out) return false;
    if (out.size === 'wlasny' && !(out.w && out.h)) { App.ui.toast('Podaj szerokość i wysokość karty w mm.'); return false; }
    const wpis = { size: out.size, count: out.count || 0 };
    if (out.size === 'wlasny') { wpis.w = out.w; wpis.h = out.h; }
    else if (wstepny && wstepny.w && wstepny.size === out.size) { wpis.zmierzone = `${wstepny.w}×${wstepny.h}`; }
    const lista = (g.sleeves || []).filter(s => !(s.size === wpis.size && s.size !== 'wlasny'));
    await zapisz(g.id, { sleeves: lista.concat([wpis]), sleeveStatus: g.sleeveStatus || 'none' });
    App.ui.toast('Zapisano koszulki');
    return true;
  }
  async function zmierz(g) {
    const r = await App.call('przygrze.aparat', { tytul: g ? g.title : '' });
    if (!r) return false;
    if (!g) {
      const n = S().byId(r.size);
      await App.ui.confirm(`Karta ma ok. ${S().mm(r.w)} × ${S().mm(r.h)} mm.\n\nPasuje: ${n.nazwa} (${S().wym(n)}).\n\nŻeby zapisać rozmiar przy grze, otwórz pomiar z karty gry.`, { ok: 'OK', cancel: 'Zamknij' });
      return false;
    }
    return dodajKoszulki(g, r);
  }

  /* ---------- sekcja na karcie gry ---------- */
  async function sekcja(el, g0) {
    css();
    const g = await DB.get('games', g0.id) || g0;
    const zasady = String(g.zasady || '').split('\n').map(s => s.trim()).filter(Boolean);
    const sl = g.sleeves || [];
    const braki = g.braki || [];
    const otwarte = braki.filter(b => !b.done).length;
    const q = encodeURIComponent(`${g.title} instrukcja pdf`);
    el.innerHTML = `<h2>Przy stole</h2><div class="pg-grid pg-sec">
      <div class="card"><h3>📖 Instrukcja i zasady<span class="spacer"></span><button class="small ghost" data-a="zasady">Edytuj</button></h3>
        <div class="row">${g.instrukcja ? `<a class="btn primary" href="${esc(http(g.instrukcja))}" target="_blank" rel="noopener">📄 Otwórz instrukcję ↗</a>` : `<a class="btn" href="https://www.google.com/search?q=${q}" target="_blank" rel="noopener">🔍 Szukaj instrukcji ↗</a>`}
          ${g.bggId ? `<a class="btn" href="https://boardgamegeek.com/boardgame/${g.bggId}/files" target="_blank" rel="noopener">Pliki na BGG ↗</a>` : ''}</div>
        ${zasady.length ? `<p class="muted" style="margin:10px 0 0;font-size:13px">O czym zawsze zapominamy:</p><ul class="pg-zas">${zasady.map(z => `<li>${esc(z)}</li>`).join('')}</ul>`
          : '<p class="muted" style="margin:10px 0 0;font-size:13px">Dopisz zasady, o których zawsze się zapomina, i link do instrukcji (PDF) – „Edytuj”.</p>'}
      </div>
      <div class="card"><h3>🃏 Koszulki<span class="spacer"></span><span class="pg-badge ${g.sleeveStatus || 'none'}">${STAT[g.sleeveStatus || 'none']}</span></h3>
        ${sl.length ? sl.map((s, i) => { const r = S().byId(s.size); return `<div class="pg-sl"><i style="background:${r ? r.kolor : 'var(--muted)'}"></i><span class="t">${esc(S().nazwa(s))}${s.zmierzone ? ` <span class="muted" style="font-size:12px">(zmierzone ${esc(String(s.zmierzone).replace(/\./g, ','))} mm)</span>` : ''}</span><span class="n">${s.count || '?'} szt.</span><button class="small ghost danger" data-del="${i}" aria-label="Usuń">✕</button></div>`; }).join('')
          : '<p class="muted" style="margin:4px 0;font-size:13px">Nie wpisano jeszcze rozmiarów kart.</p>'}
        <div class="row" style="margin-top:8px"><button class="small" data-a="sl">+ Rozmiar</button><button class="small" data-a="aparat">📏 Zmierz aparatem</button>
          <span class="spacer"></span><select data-a="status" aria-label="Czy gra jest w koszulkach">${Object.entries(STAT).map(([k, v]) => `<option value="${k}" ${k === (g.sleeveStatus || 'none') ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      </div>
      <div class="card"><h3>🧩 Braki w pudełku<span class="spacer"></span>${otwarte ? `<span class="pg-badge bad">${otwarte} ${pl(otwarte, 'brak', 'braki', 'braków')}</span>` : braki.length ? '<span class="pg-badge done">komplet</span>' : ''}</h3>
        ${braki.map(b => `<label class="pg-br ${b.done ? 'done' : ''}"><input type="checkbox" data-b="${esc(b.id)}" ${b.done ? 'checked' : ''} title="Uzupełnione"><span>${esc(b.text)}</span><span class="spacer"></span><button class="small ghost danger" data-bdel="${esc(b.id)}" aria-label="Usuń">✕</button></label>`).join('')
          || '<p class="muted" style="margin:4px 0;font-size:13px">Wszystko na miejscu? Dopisz, czego brakuje (np. „1 karta Wybrzeże”, „żółty pionek”). Zaznacz, gdy uzupełnisz.</p>'}
        <form class="pg-add"><input placeholder="Czego brakuje…" aria-label="Czego brakuje"><button class="small" type="submit">Dodaj</button></form>
      </div></div>`;
    const odswiez = () => sekcja(el, g);
    el.querySelector('[data-a=zasady]').onclick = async () => {
      const out = await App.ui.form('Instrukcja i zasady – ' + g.title, [
        { name: 'instrukcja', label: 'Link do instrukcji (PDF, BGG, strona wydawcy)', value: g.instrukcja, placeholder: 'https://…' },
        { name: 'zasady', label: 'Zasady, o których się zapomina (każda w osobnym wierszu)', type: 'textarea', rows: 6, value: g.zasady }
      ]);
      if (out) { await zapisz(g.id, out); odswiez(); }
    };
    el.querySelector('[data-a=sl]').onclick = async () => { if (await dodajKoszulki(g)) odswiez(); };
    el.querySelector('[data-a=aparat]').onclick = async () => { if (await zmierz(g)) odswiez(); };
    el.querySelector('[data-a=status]').onchange = async e => { await zapisz(g.id, { sleeveStatus: e.target.value }); App.ui.toast('Zapisano'); odswiez(); };
    el.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => { const l = sl.slice(); l.splice(+b.dataset.del, 1); await zapisz(g.id, { sleeves: l }); odswiez(); });
    el.querySelectorAll('[data-b]').forEach(c => c.onchange = async () => { await zapisz(g.id, { braki: braki.map(b => b.id === c.dataset.b ? Object.assign({}, b, { done: c.checked, doneAt: c.checked ? App.ui.today() : null }) : b) }); odswiez(); });
    el.querySelectorAll('[data-bdel]').forEach(b => b.onclick = async e => { e.preventDefault(); await zapisz(g.id, { braki: braki.filter(x => x.id !== b.dataset.bdel) }); odswiez(); });
    el.querySelector('.pg-add').onsubmit = async e => {
      e.preventDefault(); const t = e.target.querySelector('input').value.trim(); if (!t) return;
      await zapisz(g.id, { braki: braki.concat([{ id: DB.uid(), text: t, done: false, addedAt: App.ui.today() }]) }); odswiez();
    };
  }

  /* ---------- zakładka: Koszulki ---------- */
  async function kartaKoszulki(out, games) {
    const zDanymi = games.filter(g => (g.sleeves || []).length);
    const suma = new Map();   // rozmiar -> {wszystkie, doKupienia, gry}
    zDanymi.forEach(g => (g.sleeves || []).forEach(s => {
      const k = s.size === 'wlasny' ? `wlasny:${s.w}x${s.h}` : s.size;
      const o = suma.get(k) || { s, wszystkie: 0, doKupienia: 0, gry: 0 };
      o.wszystkie += s.count || 0; o.gry++;
      if (g.sleeveStatus !== 'done') o.doKupienia += s.count || 0;
      suma.set(k, o);
    }));
    const wiersze = [...suma.values()].sort((a, b) => b.doKupienia - a.doKupienia);
    const ile = st => games.filter(g => (g.sleeveStatus || 'none') === st && (g.sleeves || []).length).length;
    out.innerHTML = `
      <div class="card row"><div style="flex:1;min-width:220px"><b>Jaki rozmiar koszulek?</b><div class="muted" style="font-size:13px">Połóż kartę płatniczą obok karty z gry, a aparat zmierzy kartę i podpowie rozmiar. Nakładka pokazuje kontur wybranej koszulki w prawdziwej skali.</div></div>
        <button class="primary" id="pgAp">📏 Zmierz kartę aparatem</button></div>
      <div class="stats">
        <div class="stat"><div class="v">${ile('done')}</div><div class="l">gier w koszulkach</div></div>
        <div class="stat"><div class="v">${ile('partial')}</div><div class="l">częściowo</div></div>
        <div class="stat"><div class="v">${ile('none')}</div><div class="l">czeka na koszulki</div></div>
        <div class="stat"><div class="v">${wiersze.reduce((a, w) => a + w.doKupienia, 0)}</div><div class="l">koszulek do kupienia</div></div>
      </div>
      ${wiersze.length ? `<div class="card"><h3 style="margin-top:0">Ile koszulek potrzeba</h3><table class="tbl pg-tbl"><thead><tr><th></th><th>Rozmiar</th><th class="n">Gry</th><th class="n">Razem</th><th class="n">Do kupienia</th><th></th></tr></thead><tbody>
        ${wiersze.map((w, i) => { const r = S().byId(w.s.size); return `<tr><td class="k"><i style="background:${r ? r.kolor : 'var(--muted)'}"></i></td><td>${esc(S().nazwa(w.s))}</td><td class="n">${w.gry}</td><td class="n">${w.wszystkie}</td><td class="n"><b>${w.doKupienia}</b>${w.doKupienia ? `<div class="muted" style="font-size:12px">ok. ${Math.ceil(w.doKupienia / PACZKA)} ${pl(Math.ceil(w.doKupienia / PACZKA), 'paczka', 'paczki', 'paczek')} po ${PACZKA}</div>` : ''}</td><td>${w.doKupienia ? `<button class="small" data-kup="${i}">🛒 Na listę</button>` : ''}</td></tr>`; }).join('')}
      </tbody></table></div>` : ''}
      <h3>Gry z wpisanymi koszulkami</h3>
      ${zDanymi.length ? `<div class="list">${zDanymi.sort((a, b) => a.title.localeCompare(b.title, 'pl')).map(g => `<div class="li" data-id="${esc(g.id)}">${cover(g)}<div class="main"><div class="t">${esc(g.title)}</div><div class="s">${(g.sleeves || []).map(s => `${s.count || '?'} × ${esc((S().byId(s.size) || { nazwa: 'własny ' + s.w + '×' + s.h }).nazwa)}`).join(' · ')}</div></div><span class="pg-badge ${g.sleeveStatus || 'none'}">${STAT[g.sleeveStatus || 'none']}</span></div>`).join('')}</div>`
        : '<div class="empty">Nie wpisano jeszcze koszulek przy żadnej grze. Otwórz grę i w sekcji „Przy stole” dodaj rozmiar albo zmierz kartę aparatem.</div>'}
      <h3>Popularne rozmiary</h3>
      <div class="card"><table class="tbl pg-tbl"><tbody>${S().ROZMIARY.map(r => `<tr><td class="k"><i style="background:${r.kolor}"></i></td><td><b>${esc(r.nazwa)}</b>${r.uwagi ? `<div class="muted" style="font-size:12px">${esc(r.uwagi)}</div>` : ''}</td><td class="n">${S().wym(r)}</td></tr>`).join('')}</tbody></table>
        <p class="muted" style="font-size:12px;margin:8px 0 0">Wymiary karty, do której jest koszulka. Rozmiary różnych firm (Mayday, Gamegenic, FFG, Ultimate Guard) różnią się o 1–2 mm.</p></div>`;
    out.querySelector('#pgAp').onclick = () => zmierz(null);
    out.querySelectorAll('[data-kup]').forEach(b => b.onclick = async () => {
      const w = wiersze[+b.dataset.kup];
      await DB.put('shoppingList', { title: `Koszulki ${S().nazwa(w.s)} – ${w.doKupienia} szt.`, itemType: 'other', bought: false, notes: `Do ${w.gry} ${pl(w.gry, 'gry', 'gier', 'gier')} (Narzędzia gier › Koszulki)` });
      App.ui.toast('Dodano do listy zakupów');
    });
    out.querySelectorAll('.li[data-id]').forEach(t => t.onclick = () => App.go('planszowki', { gra: t.dataset.id }));
  }

  /* ---------- zakładka: Braki ---------- */
  function kartaBraki(out, games) {
    const z = games.filter(g => (g.braki || []).some(b => !b.done)).sort((a, b) => a.title.localeCompare(b.title, 'pl'));
    const ile = z.reduce((a, g) => a + g.braki.filter(b => !b.done).length, 0);
    out.innerHTML = z.length ? `<p class="muted">${ile} ${pl(ile, 'brakujący element', 'brakujące elementy', 'brakujących elementów')} w ${z.length} ${pl(z.length, 'grze', 'grach', 'grach')}. Zaznacz, gdy uzupełnisz.</p>
      ${z.map(g => `<div class="card pg-sec"><h3><a href="#/planszowki?gra=${encodeURIComponent(g.id)}">${esc(g.title)}</a><span class="spacer"></span>${g.status === 'forSale' ? '<span class="badge sale">na sprzedaż</span>' : ''}</h3>
        ${g.braki.filter(b => !b.done).map(b => `<label class="pg-br"><input type="checkbox" data-g="${esc(g.id)}" data-b="${esc(b.id)}"><span>${esc(b.text)}</span>${b.addedAt ? `<span class="muted" style="font-size:12px">od ${App.ui.fmtDate(b.addedAt)}</span>` : ''}</label>`).join('')}</div>`).join('')}
      <p class="muted" style="font-size:13px">Braki są też widoczne w ogłoszeniu sprzedaży – warto je wpisać w opisie stanu.</p>`
      : '<div class="empty">Żadnych braków. 🎉<br>Braki dopisujesz na karcie gry, w sekcji „Przy stole”.</div>';
    out.querySelectorAll('[data-b]').forEach(c => c.onchange = async () => {
      const g = games.find(x => x.id === c.dataset.g);
      await zapisz(g.id, { braki: g.braki.map(b => b.id === c.dataset.b ? Object.assign({}, b, { done: true, doneAt: App.ui.today() }) : b) });
      App.ui.toast('Uzupełnione'); App.refresh();
    });
  }

  /* ---------- zakładka: Czy się pozbyć? ---------- */
  function ranking(games, plays) {
    const dzis = Date.now();
    const ost = new Map(), ile = new Map();
    plays.forEach(p => { if ((p.date || '') > (ost.get(p.gameId) || '')) ost.set(p.gameId, p.date); ile.set(p.gameId, (ile.get(p.gameId) || 0) + 1); });
    return games.filter(g => g.status === 'owned' && !g.isExpansion).map(g => {
      const partie = (ile.get(g.id) || 0) + (g.bggPlays || 0);
      const last = ost.get(g.id);
      const dni = last ? Math.max(0, (dzis - new Date(last).getTime()) / 864e5) : null;
      const r = g.myRating;
      let pkt = 0; const why = [];
      if (r) { pkt += (7 - r) * 12; if (r <= 6) why.push(`moja ocena ${String(r).replace('.', ',')}`); } else pkt += 5;
      if (dni == null) { if (!partie) { pkt += 40; why.push('nigdy nie grana'); } else { pkt += 15; why.push('brak daty ostatniej partii'); } }
      else { const mies = dni / 30.4; pkt += Math.min(mies, 48) * 1.5; if (mies >= 12) { const lata = Math.floor(mies / 12); why.push(lata >= 1 ? `nie grana od ${lata > 1 ? lata + ' lat' : 'roku'}` : ''); } else if (mies >= 6) why.push(`nie grana od ${Math.floor(mies)} mies.`); }
      if (partie > 0 && partie <= 2) { pkt += 8; why.push(`${partie} ${pl(partie, 'partia', 'partie', 'partii')}`); }
      if (g.weight && g.weight >= 3.5 && dni != null && dni > 365) { pkt += 5; why.push('ciężka i dawno nie wyciągana'); }
      return { g, pkt: Math.round(pkt), why: why.filter(Boolean), last, partie };
    }).sort((a, b) => b.pkt - a.pkt);
  }
  async function kartaPozbyc(out, games, plays, pokazZostaje) {
    const lista = ranking(games.filter(g => !!g.zostaje === !!pokazZostaje), plays);
    const zost = games.filter(g => g.zostaje && g.status === 'owned').length;
    const top = pokazZostaje ? lista : lista.filter(x => x.pkt > 10).slice(0, 40);
    out.innerHTML = `<p class="muted">Kandydaci do sprzedaży: dawno nie grane, rzadko grane i nisko ocenione gry z kolekcji (bez dodatków). Im wyższy wynik, tym mocniejszy kandydat. Gry, które na pewno zostają, oznacz „Zostaje” – znikną z listy.</p>
      <div class="row" style="margin-bottom:10px"><span class="seg"><button data-z="0" class="${pokazZostaje ? '' : 'on'}">Kandydaci</button><button data-z="1" class="${pokazZostaje ? 'on' : ''}">Zostają (${zost})</button></span></div>
      ${top.length ? `<div class="list">${top.map(x => `<div class="li pg-li" data-id="${esc(x.g.id)}">
        ${pokazZostaje ? '' : `<div class="pg-score" title="Wynik">${x.pkt}</div>`}${cover(x.g)}
        <div class="main"><div class="t">${esc(x.g.title)}</div><div class="s">${x.last ? 'ostatnio ' + App.ui.fmtDate(x.last) : 'brak partii w aplikacji'}${x.g.myRating ? ' · ★ ' + String(x.g.myRating).replace('.', ',') : ''}${x.g.estValue ? ' · wart. ok. ' + x.g.estValue + ' zł' : ''}</div>
          <div class="pg-why">${x.why.map(w => `<span class="chip">${esc(w)}</span>`).join('')}</div></div>
        <div class="acts">${pokazZostaje ? '<button class="small" data-zost="0">Cofnij</button>' : '<button class="small" data-zost="1">Zostaje</button><button class="small primary" data-sell>💰 Wystaw</button>'}</div></div>`).join('')}</div>`
        : `<div class="empty">${pokazZostaje ? 'Nie oznaczono jeszcze żadnej gry jako „Zostaje”.' : 'Brak wyraźnych kandydatów – wszystko jest grane i lubiane. 👍'}</div>`}
      ${!pokazZostaje ? '<p class="muted" style="font-size:13px">Wskazówka: zaimportuj historię partii z BG Stats (zakładka „Import partii”), żeby ranking znał daty dawnych rozgrywek.</p>' : ''}`;
    out.querySelectorAll('[data-z]').forEach(b => b.onclick = () => kartaPozbyc(out, games, plays, b.dataset.z === '1'));
    out.querySelectorAll('.pg-li').forEach(li => {
      const id = li.dataset.id;
      li.onclick = e => { if (!e.target.closest('button')) App.go('planszowki', { gra: id }); };
      const s = li.querySelector('[data-sell]'); if (s) s.onclick = () => App.call('sprzedaz.wystaw', { itemType: 'game', itemId: id });
      li.querySelector('[data-zost]').onclick = async e => {
        const v = e.target.dataset.zost === '1';
        await zapisz(id, { zostaje: v }); const g = games.find(x => x.id === id); g.zostaje = v;
        App.ui.toast(v ? 'Zostaje w kolekcji' : 'Wraca do kandydatów'); kartaPozbyc(out, games, plays, pokazZostaje);
      };
    });
  }

  /* ---------- zakładka: Import partii ---------- */
  async function kartaImport(out) {
    const ost = await DB.setting('importPartii');
    out.innerHTML = `<div class="card"><h3 style="margin-top:0">Wczytaj historię partii</h3>
      <p><b>Z BG Stats</b> (najlepiej): w aplikacji BG Stats otwórz <i>Ustawienia › Kopia zapasowa / Backup › Eksport danych (JSON)</i> i zapisz plik <code>BGStatsExport.json</code>. Na komputerze przenieś go np. przez OneDrive.</p>
      <p><b>Z BGG</b>: plik XML z listą partii (<a href="https://boardgamegeek.com/xmlapi2/plays?username=Silent82" target="_blank" rel="noopener">boardgamegeek.com/xmlapi2/plays?username=Silent82</a> → zapisz stronę jako plik). BGG coraz częściej wymaga do tego klucza – jeśli pokaże błąd, użyj BG Stats.</p>
      <p class="muted" style="font-size:13px">Gry rozpoznaję po numerze BGG albo tytule. Gry spoza kolekcji dodam jako „grane u innych”, nowych graczy – do listy graczy. Ponowny import niczego nie dubluje.</p>
      <label class="btn primary" style="cursor:pointer">📂 Wybierz plik<input type="file" accept=".json,.xml,application/json,text/xml" hidden></label>
      <div id="pgImp" style="margin-top:12px"></div>
      ${ost ? `<p class="muted" style="font-size:13px">Ostatni import: ${App.ui.fmtDate(ost.data)} (${esc(ost.format)}, ${ost.ile} ${pl(ost.ile, 'partia', 'partie', 'partii')}).</p>` : ''}</div>`;
    out.querySelector('input[type=file]').onchange = async e => {
      const f = e.target.files[0]; e.target.value = ''; if (!f) return;
      const box = out.querySelector('#pgImp');
      try {
        const tekst = await f.text();
        const pod = await App.call('przygrze.importPartii', tekst, { podglad: true });
        if (!pod.nowe) { box.innerHTML = `<p>W pliku (${esc(pod.format)}) jest ${pod.wszystkie} ${pl(pod.wszystkie, 'partia', 'partie', 'partii')} – wszystkie już są w aplikacji.</p>`; return; }
        if (!await App.ui.confirm(`Plik ${pod.format}: ${pod.wszystkie} ${pl(pod.wszystkie, 'partia', 'partie', 'partii')}.\n\nNowe do dodania: ${pod.nowe}\nPominięte (już są): ${pod.pominiete}\nNowe gry spoza kolekcji: ${pod.noweGry}\nNowi gracze: ${pod.nowiGracze}\n\nZaimportować?`, { ok: 'Importuj' })) return;
        const r = await App.call('przygrze.importPartii', tekst);
        box.innerHTML = `<p style="color:var(--ok)"><b>Zaimportowano ${r.nowe} ${pl(r.nowe, 'partię', 'partie', 'partii')}.</b>${r.noweGry ? ` Dodano ${r.noweGry} ${pl(r.noweGry, 'grę', 'gry', 'gier')} jako „grane u innych”.` : ''}${r.nowiGracze ? ` Nowi gracze: ${r.nowiGracze}.` : ''}${r.liczniki ? ` Przy ${r.liczniki} ${pl(r.liczniki, 'grze', 'grach', 'grach')} wyzerowałem licznik partii z BGG, żeby nie liczyć ich podwójnie.` : ''}</p><button class="small" onclick="App.go('rozgrywki')">Zobacz rozgrywki →</button>`;
        App.ui.toast('Zaimportowano partie');
      } catch (err) { box.innerHTML = `<p style="color:var(--bad)">${esc(App.ui.komunikat(err) || 'Nie udało się zaimportować.')}</p>`; }
    };
  }

  /* ---------- zakładka ---------- */
  const ZAKL = { koszulki: '🃏 Koszulki', braki: '🧩 Braki', pozbyc: '🤔 Czy się pozbyć?', import: '📥 Import partii' };
  async function render(el, params) {
    css();
    const t = ZAKL[params.t] ? params.t : 'koszulki';
    el.innerHTML = `<h1>Narzędzia gier</h1><div class="tabs">${Object.entries(ZAKL).map(([k, v]) => `<button data-t="${k}" class="${k === t ? 'on' : ''}">${v}</button>`).join('')}</div><div id="pgOut"></div>`;
    el.querySelectorAll('.tabs button').forEach(b => b.onclick = () => App.go('przygrze', { t: b.dataset.t }));
    const out = el.querySelector('#pgOut');
    const games = await DB.all('games');
    if (t === 'koszulki') return kartaKoszulki(out, games.filter(g => g.status === 'owned' || g.status === 'forSale' || g.status === 'wishlist'));
    if (t === 'braki') return kartaBraki(out, games);
    if (t === 'pozbyc') return kartaPozbyc(out, games, await DB.all('plays'), false);
    return kartaImport(out);
  }

  App.registerModule({ id: 'przygrze', title: 'Narzędzia gier', icon: '🧰', order: 16, render });
  App.provide('przygrze.sekcja', sekcja);
  window.PrzyGrze = { ranking };
})();
