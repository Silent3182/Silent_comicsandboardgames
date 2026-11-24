/* Moduł „Gracze”: profile graczy (zdjęcie albo kolor), ulubione gry, bilans z Tobą (Marcinem)
 * i rywalizacje „kto kogo najczęściej ogrywa”. Dane: kolekcje players i plays (pola photo, color w players).
 * Zdjęcie jest zmniejszane do 160×160 px (JPEG) i zapisywane w rekordzie gracza, więc synchronizuje się z resztą.
 */
(function () {
  const { esc } = App.ui;
  const K = () => window.KS;

  window.IKONY = window.IKONY || {};
  window.IKONY.gracze = '<circle class="f" cx="9" cy="8" r="3.3"/><path class="f" d="M3 19.5c.6-3.4 3-5.3 6-5.3s5.4 1.9 6 5.3z"/><circle cx="17" cy="9" r="2.4"/><path d="M16.5 14.3c2.4.2 4 1.8 4.5 4.7h-3.6"/>';
  if (window.IKONY_KOLOR) window.IKONY_KOLOR.gracze = '#d6337f';

  /* zdjęcie z pliku → kwadrat 160 px, JPEG */
  function zdjecie(file) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => {
        const S = 160, c = document.createElement('canvas'); c.width = c.height = S;
        const m = Math.min(img.width, img.height);
        c.getContext('2d').drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, S, S);
        URL.revokeObjectURL(img.src); res(c.toDataURL('image/jpeg', .82));
      };
      img.onerror = rej; img.src = URL.createObjectURL(file);
    });
  }

  async function edytuj(p) {
    let photo = p.photo || null;
    const out = await App.ui.form('Profil gracza', [
      { name: 'name', label: 'Imię / ksywka', value: p.name },
      { type: 'html', html: `<div class="row" style="align-items:center;gap:14px"><span id="gr-av">${K().avatar(Object.assign({}, p), 64)}</span>
        <div class="row"><label class="btn small" style="cursor:pointer">📷 Zdjęcie<input type="file" accept="image/*" id="gr-file" hidden></label>
        <button type="button" class="small ghost" id="gr-nofoto">Bez zdjęcia</button></div></div>
        <div style="font-size:13px;font-weight:600;color:var(--muted);margin:10px 0 4px">Kolor</div>
        <div class="row" id="gr-cols">${K().PALETA.map(c => `<button type="button" data-c="${c}" style="width:32px;height:32px;min-height:0;padding:0;border-radius:50%;background:${c};border:3px solid ${c === K().kolor(p) ? 'var(--text)' : 'transparent'}"></button>`).join('')}
        <input type="color" id="gr-col" value="${esc(K().kolor(p))}" style="width:40px;height:34px;padding:2px"></div>` },
      ...(p.isMe ? [] : [{ name: 'isMe', label: 'To ja (Marcin) – właściciel kolekcji', type: 'checkbox', value: false }]),
      { name: 'notes', label: 'Notatka', type: 'textarea', rows: 2, value: p.notes }
    ], {
      onMount(dlg) {
        let col = K().kolor(p);
        const draw = () => { dlg.querySelector('#gr-av').innerHTML = K().avatar(Object.assign({}, p, { color: col, photo }), 64); dlg.querySelectorAll('#gr-cols [data-c]').forEach(b => b.style.borderColor = b.dataset.c === col ? 'var(--text)' : 'transparent'); };
        dlg.querySelectorAll('#gr-cols [data-c]').forEach(b => b.onclick = () => { col = b.dataset.c; dlg.querySelector('#gr-col').value = col; draw(); });
        dlg.querySelector('#gr-col').oninput = e => { col = e.target.value; draw(); };
        dlg.querySelector('#gr-file').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { photo = await zdjecie(f); draw(); } catch (err) { App.ui.toast('Nie udało się wczytać zdjęcia'); } };
        dlg.querySelector('#gr-nofoto').onclick = () => { photo = null; draw(); };
        dlg.addEventListener('close', () => { p._col = col; }, { once: true });
      }
    });
    if (!out || !out.name) return false;
    if (out.isMe && !p.isMe) { // tylko jeden gracz może być „mną”
      const all = await DB.all('players');
      for (const o of all.filter(x => x.isMe && x.id !== p.id)) await DB.put('players', Object.assign({}, o, { isMe: false }));
    }
    const rec = Object.assign({}, p, { name: out.name, color: p._col, photo, isMe: !!(p.isMe || out.isMe), notes: out.notes });
    delete rec._col;
    await DB.put('players', rec);
    return true;
  }

  function staty(d, pid) {
    const ps = d.plays.filter(p => p.players.some(x => x.playerId === pid));
    const wins = ps.filter(p => p.players.some(x => x.playerId === pid && x.win)).length;
    const gry = new Map();
    ps.forEach(p => { const g = gry.get(p.gameId) || { id: p.gameId, n: 0, w: 0 }; g.n++; if (p.players.some(x => x.playerId === pid && x.win)) g.w++; gry.set(p.gameId, g); });
    const last = ps.reduce((a, p) => (p.date || '') > a ? p.date : a, '');
    return { ps, wins, gry: [...gry.values()], last };
  }

  // wszystkie pary graczy, którzy grali razem: kto kogo ogrywa
  function rywalizacje(d) {
    const pary = new Map();
    d.plays.forEach(p => {
      const ids = [...new Set(p.players.map(x => x.playerId))];
      for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
        const [a, b] = [ids[i], ids[j]].sort(); const k = a + '|' + b;
        const r = pary.get(k) || { a, b, razem: 0, wa: 0, wb: 0, remis: 0 };
        const w = K().wynik(p, a, b); r.razem++; if (w > 0) r.wa++; else if (w < 0) r.wb++; else r.remis++;
        pary.set(k, r);
      }
    });
    return [...pary.values()].filter(r => d.playerById.has(r.a) && d.playerById.has(r.b));
  }

  const h2hRow = (d, A, B, r, opt = {}) => {
    const tot = Math.max(1, r.wa + r.wb + r.remis);
    return `<div class="ks-card ${opt.click ? 'ks-click' : ''}" ${opt.click ? `data-p="${esc(opt.click)}"` : ''}>
      <div class="ks-h2h">${K().avatar(A, 34)}<b style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(A.name)}</b>
        <span class="sc">${r.wa} : ${r.wb}</span>
        <b style="flex:1;min-width:0;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(B.name)}</b>${K().avatar(B, 34)}</div>
      <div class="ks-split"><i style="width:${r.wa / tot * 100}%;background:${K().kolor(A)}"></i><i style="width:${r.remis / tot * 100}%;background:var(--line)"></i><i style="width:${r.wb / tot * 100}%;background:${K().kolor(B)}"></i></div>
      <div class="ks-sub" style="margin-top:6px">${r.razem} ${K().pl(r.razem, 'wspólna partia', 'wspólne partie', 'wspólnych partii')}${r.remis ? ' · ' + r.remis + ' bez rozstrzygnięcia (np. kooperacja)' : ''}</div></div>`;
  };

  async function lista(el) {
    const d = await K().dane();
    const me = K().ja(d.players);
    const rows = d.players.map(p => Object.assign({ p }, staty(d, p.id))).sort((a, b) => (b.p.isMe - a.p.isMe) || b.ps.length - a.ps.length || a.p.name.localeCompare(b.p.name, 'pl'));
    const ryw = rywalizacje(d).filter(r => r.wa + r.wb > 0).sort((a, b) => b.razem - a.razem).slice(0, 12);
    el.innerHTML = `
      <div class="row" style="margin-bottom:10px"><h1 style="margin:0">Gracze</h1><span class="spacer"></span><button class="primary" id="gr-add">+ Gracz</button></div>
      <div class="ks-cards">${rows.map(({ p, ps, wins }) => {
        const r = me && p.id !== me.id ? K().h2h(d.plays, me.id, p.id) : null;
        return `<div class="ks-card ks-click" data-p="${esc(p.id)}"><div class="row" style="flex-wrap:nowrap;gap:12px">${K().avatar(p, 48)}
          <div style="min-width:0;flex:1"><div style="font-weight:700">${esc(p.name)} ${p.isMe ? '<span class="chip">to ja</span>' : ''}</div>
          <div class="ks-sub">${ps.length} ${K().pl(ps.length, 'partia', 'partie', 'partii')} · ${wins} ${K().pl(wins, 'wygrana', 'wygrane', 'wygranych')}${ps.length ? ' (' + Math.round(wins / ps.length * 100) + '%)' : ''}</div>
          ${r && r.razem ? `<div class="ks-sub">kontra ${esc(K().mojeImie(me) === 'Tobą' ? 'Ty' : me.name)}: <b style="color:var(--text)">${r.b} : ${r.a}</b></div>` : ''}</div></div></div>`;
      }).join('')}</div>
      <h2>Rywalizacje – kto kogo ogrywa</h2>
      ${ryw.length ? `<div class="ks-cards">${ryw.map(r => {
        const A = d.playerById.get(r.a), B = d.playerById.get(r.b);
        return r.wb > r.wa ? h2hRow(d, B, A, { wa: r.wb, wb: r.wa, remis: r.remis, razem: r.razem }) : h2hRow(d, A, B, r);
      }).join('')}</div>` : '<div class="empty">Zapisz kilka rozgrywek z wynikami, a pojawią się tu pojedynki.</div>'}`;
    el.querySelectorAll('[data-p]').forEach(c => c.onclick = () => App.go('gracze', { gracz: c.dataset.p }));
    el.querySelector('#gr-add').onclick = async () => { const p = { name: '' }; if (await edytuj(p)) App.refresh(); };
  }

  async function profil(el, id) {
    const d = await K().dane();
    const p = d.playerById.get(id);
    if (!p) { el.innerHTML = '<p>Nie ma takiego gracza. <a href="#/gracze">Wróć</a></p>'; return; }
    const me = K().ja(d.players);
    const s = staty(d, id);
    const gname = gid => (d.gameById.get(gid) || {}).title || '(usunięta gra)';
    const ulub = s.gry.slice().sort((a, b) => b.n - a.n).slice(0, 6);
    const mocne = s.gry.filter(g => g.n >= 2).sort((a, b) => b.w / b.n - a.w / a.n || b.n - a.n).slice(0, 5);
    const ryw = rywalizacje(d).filter(r => r.a === id || r.b === id).map(r => r.a === id ? r : { a: id, b: r.a, wa: r.wb, wb: r.wa, remis: r.remis, razem: r.razem }).sort((a, b) => b.razem - a.razem);
    const nem = ryw.filter(r => r.wb > r.wa).sort((a, b) => (b.wb - b.wa) - (a.wb - a.wa))[0];
    const ofi = ryw.filter(r => r.wa > r.wb).sort((a, b) => (b.wa - b.wb) - (a.wa - a.wb))[0];
    const meR = me && me.id !== id ? ryw.find(r => r.b === me.id) : null;
    const partner = ryw[0];
    el.innerHTML = `
      <p><a href="#/gracze">← Gracze</a></p>
      <div class="row" style="gap:16px;flex-wrap:nowrap">${K().avatar(p, 84)}<div style="flex:1;min-width:0"><h1 style="margin:0">${esc(p.name)} ${p.isMe ? '<span class="chip">to ja</span>' : ''}</h1>
        <div class="ks-sub">${s.last ? 'ostatnia partia ' + App.ui.fmtDate(s.last) : 'jeszcze bez rozgrywek'}${p.notes ? ' · ' + esc(p.notes) : ''}</div></div>
        <button id="gr-edit">Edytuj</button></div>
      <div class="stats" style="margin-top:14px">
        <div class="stat"><div class="v">${s.ps.length}</div><div class="l">${K().pl(s.ps.length, 'partia', 'partie', 'partii')}</div></div>
        <div class="stat"><div class="v">${s.wins}</div><div class="l">${K().pl(s.wins, 'wygrana', 'wygrane', 'wygranych')}</div></div>
        <div class="stat"><div class="v">${s.ps.length ? Math.round(s.wins / s.ps.length * 100) + '%' : '–'}</div><div class="l">skuteczność</div></div>
        <div class="stat"><div class="v">${s.gry.length}</div><div class="l">różnych gier</div></div>
        ${partner ? `<div class="stat"><div class="v" style="font-size:18px">${esc(d.playerById.get(partner.b).name)}</div><div class="l">najczęstszy rywal (${partner.razem}×)</div></div>` : ''}
      </div>
      ${meR ? `<h2>Bilans: ${esc(p.name)} kontra ${esc(K().mojeImie(me) === 'Tobą' ? 'Ty' : me.name)}</h2><div style="max-width:520px">${h2hRow(d, p, me, meR)}</div>` : ''}
      ${nem || ofi ? `<div class="ks-cards" style="margin-top:12px">
        ${nem ? `<div class="ks-card"><div class="ks-sub">😈 Nemezis – najczęściej wygrywa w pojedynku</div><div class="row" style="margin-top:6px">${K().avatar(d.playerById.get(nem.b), 30)}<b>${esc(d.playerById.get(nem.b).name)}</b><span class="spacer"></span><b>${nem.wa} : ${nem.wb}</b></div></div>` : ''}
        ${ofi ? `<div class="ks-card"><div class="ks-sub">🎯 Ulubiona ofiara – najczęściej przegrywa w pojedynku</div><div class="row" style="margin-top:6px">${K().avatar(d.playerById.get(ofi.b), 30)}<b>${esc(d.playerById.get(ofi.b).name)}</b><span class="spacer"></span><b>${ofi.wa} : ${ofi.wb}</b></div></div>` : ''}
      </div>` : ''}
      <h2>Ulubione gry</h2>
      ${ulub.length ? `<div class="list">${ulub.map(g => { const G = d.gameById.get(g.id); return `<div class="li" data-g="${esc(g.id)}">${G && (G.thumb || G.image) ? `<img src="${esc(G.thumb || G.image)}" alt="" loading="lazy">` : '<span class="ph">🎲</span>'}<div class="main"><div class="t">${esc(gname(g.id))}</div><div class="s">${g.n} ${K().pl(g.n, 'partia', 'partie', 'partii')} · ${g.w} ${K().pl(g.w, 'wygrana', 'wygrane', 'wygranych')}</div></div><div class="num">${Math.round(g.w / g.n * 100)}%</div></div>`; }).join('')}</div>` : '<div class="empty">Brak rozgrywek.</div>'}
      ${mocne.length ? `<h2>Najlepsza skuteczność</h2><div class="row">${mocne.map(g => `<span class="chip">${esc(gname(g.id))} · ${g.w}/${g.n}</span>`).join('')}</div>` : ''}
      ${ryw.length ? `<h2>Pojedynki</h2><div class="ks-cards">${ryw.map(r => h2hRow(d, p, d.playerById.get(r.b), r, { click: r.b })).join('')}</div>` : ''}`;
    el.querySelector('#gr-edit').onclick = async () => { if (await edytuj(p)) App.refresh(); };
    el.querySelectorAll('[data-g]').forEach(r => r.onclick = () => App.go('planszowki', { gra: r.dataset.g }));
    el.querySelectorAll('[data-p]').forEach(c => c.onclick = () => App.go('gracze', { gracz: c.dataset.p }));
  }

  App.provide('gracze.avatar', (p, size) => K().avatar(p, size));
  App.provide('gracze.edytuj', edytuj);
  App.registerModule({ id: 'gracze', title: 'Gracze', icon: '👥', order: 13, render(el, params) { return params.gracz ? profil(el, params.gracz) : lista(el); } });
})();
