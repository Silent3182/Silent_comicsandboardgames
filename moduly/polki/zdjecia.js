/* Zdjęcia półek (część modułu „Półki”).
 * Robisz zdjęcie całego regału (np. Kallaxa) albo jednej przegródki, potem dotykasz pudełka na zdjęciu
 * i wybierasz, co to jest – gra/tom/seria trafia do właściwej przegródki (przy zdjęciu całego regału przegródka
 * wynika z miejsca dotknięcia w ramce regału).
 * Rozpoznawanie (tylko APK): natywny ML Kit (wtyczka Ocr w android-native/) czyta napisy ze zdjęcia, także pionowe
 * na grzbietach, a aplikacja dopasowuje je do tytułów z kolekcji. To są PODPOWIEDZI do potwierdzenia.
 * Dane: shelves[].zdjecia = [{ id, data, cel: null|'r-c', ramka:{x0,y0,x1,y1}, zn:[{x,y,typ,id,t}] }] (synchronizowane),
 *       sam obraz tylko na tym urządzeniu: DB.local('polkaFoto:'+id) (za duży do synchronizacji).
 */
(function () {
  const W = () => window.PolkiWew;
  const esc = s => App.ui.esc(s);
  const ocr = () => { const C = window.Capacitor; return C && C.isNativePlatform && C.isNativePlatform() && (!C.isPluginAvailable || C.isPluginAvailable('Ocr')) && C.Plugins && C.Plugins.Ocr; };
  const nz = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').replace(/[^a-z0-9]+/g, ' ').trim();
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function css() {
    if (document.getElementById('pkf-css')) return;
    const st = document.createElement('style'); st.id = 'pkf-css';
    st.textContent = `
.pkf{position:fixed;inset:0;z-index:900;background:#0d1015;color:#fff;display:flex;flex-direction:column}
.pkf-bar{display:flex;gap:6px;align-items:center;padding:calc(env(safe-area-inset-top,0px) + 8px) 10px 8px;background:#161b22;flex-wrap:wrap}
.pkf-bar b{flex:1;min-width:120px;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pkf-bar button{min-height:38px;padding:6px 11px;border-radius:10px;border:1px solid #39424e;background:#222a35;color:#fff;font:inherit;font-size:14px}
.pkf-bar button.on{background:#d98a14;border-color:#d98a14;color:#111}
.pkf-scroll{flex:1;overflow:auto;-webkit-overflow-scrolling:touch;touch-action:pan-x pan-y}
.pkf-img{position:relative;margin:0 auto;user-select:none;-webkit-user-select:none}
.pkf-img img{width:100%;display:block;-webkit-touch-callout:none}
.pkf-grid{position:absolute;border:2px solid rgba(255,200,80,.9);pointer-events:none;display:grid}
.pkf-grid span{border:1px dashed rgba(255,200,80,.55);font:600 11px system-ui;color:#ffd27a;padding:2px 4px;text-shadow:0 1px 2px #000}
.pkf-h{position:absolute;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;background:#d98a14;border:3px solid #fff;touch-action:none;z-index:3}
.pkf-zn{position:absolute;transform:translate(-50%,-100%);z-index:2;display:flex;flex-direction:column;align-items:center;cursor:pointer}
.pkf-zn i{font-style:normal;background:#2c9a57;color:#fff;border-radius:8px;padding:2px 7px;font:600 12px/1.3 system-ui;max-width:150px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;box-shadow:0 1px 4px rgba(0,0,0,.5)}
.pkf-zn::after{content:"";width:12px;height:12px;border-radius:50%;background:#2c9a57;border:2px solid #fff;margin-top:2px}
.pkf-pod{position:absolute;border:2px dashed #ffcf4a;background:rgba(255,207,74,.14);border-radius:4px;z-index:1;cursor:pointer}
.pkf-pod i{position:absolute;left:0;top:0;transform:translateY(-100%);font-style:normal;background:#ffcf4a;color:#111;font:600 11.5px/1.3 system-ui;padding:1px 6px;border-radius:6px 6px 6px 0;white-space:nowrap;max-width:200px;overflow:hidden;text-overflow:ellipsis}
.pkf-info{padding:8px 12px calc(env(safe-area-inset-bottom,0px) + 8px);background:#161b22;font-size:13px;color:#c8d1dc}
.pkf-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px;padding:12px;overflow:auto}
.pkf-list .ph{aspect-ratio:4/3;background:#222a35;border-radius:10px;overflow:hidden;display:flex;align-items:center;justify-content:center;color:#9aa6b4;font-size:13px;text-align:center;padding:6px;cursor:pointer;border:1px solid #39424e}
.pkf-list .ph img{width:100%;height:100%;object-fit:cover}
.pkf-list small{display:block;color:#9aa6b4;font-size:12px;margin-top:4px}
.pkf-wyb{max-height:48vh;overflow:auto;border:1px solid var(--line);border-radius:10px;margin-top:8px}
.pkf-wyb button{display:block;width:100%;text-align:left;border:0;border-bottom:1px solid var(--line);border-radius:0;padding:9px 12px;background:var(--surface);color:var(--text);font:inherit;min-height:0}
.pkf-wyb button small{display:block;color:var(--muted);font-size:12px}
.pkf-wyb .sek{padding:6px 12px;font-size:12px;font-weight:700;color:var(--muted);background:var(--surface2)}`;
    document.head.appendChild(st);
  }

  /* ---------- obraz ---------- */
  function zmniejsz(src, max, q) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        res(c.toDataURL('image/jpeg', q));
      };
      img.onerror = () => rej(new Error('Nie udało się wczytać zdjęcia'));
      img.src = src;
    });
  }
  const wybierzPlik = () => new Promise(res => {
    const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.setAttribute('capture', 'environment');
    i.onchange = () => res(i.files && i.files[0] || null); i.click();
  });
  const pokazFoto = async id => { try { return await DB.local('polkaFoto:' + id); } catch (e) { return null; } };

  async function zapiszSh(sh, zdjecia) {
    const fresh = await DB.get('shelves', sh.id);
    const rec = await DB.put('shelves', Object.assign({}, fresh || sh, { zdjecia }));
    await W().reload();
    return rec;
  }

  /* ---------- lista zdjęć regału ---------- */
  async function otworz(shId) {
    css();
    const P = W(); await P.reload();
    let sh = P.C.byId.get(shId);
    if (!sh) return;
    return new Promise(resolve => {
      const el = document.createElement('div'); el.className = 'pkf';
      document.body.appendChild(el);
      const koniec = () => { el.remove(); resolve(); };
      const rysuj = async () => {
        sh = W().C.byId.get(shId) || sh;
        const z = sh.zdjecia || [];
        const obrazy = await Promise.all(z.map(f => pokazFoto(f.id)));
        el.innerHTML = `<div class="pkf-bar"><button data-x>✕</button><b>📷 ${esc(sh.name)}</b><button class="on" data-nowe>+ Nowe zdjęcie</button></div>
          <div class="pkf-list">${z.map((f, i) => `<div><div class="ph" data-i="${i}">${obrazy[i] ? `<img src="${obrazy[i]}" alt="">` : 'Zdjęcie jest na innym urządzeniu'}</div>
            <small>${f.cel ? esc(W().przegrodka(sh, +f.cel.split('-')[0], +f.cel.split('-')[1])) : 'cały regał'} · ${(f.zn || []).length} oznacz. · ${App.ui.fmtDate(f.data)}</small></div>`).join('')}</div>
          ${z.length ? '' : `<div class="pkf-info" style="flex:1;font-size:15px;line-height:1.5;padding:20px">Zrób zdjęcie całego regału (stań na wprost, żeby było widać wszystkie przegródki) albo jednej przegródki z bliska.<br><br>Potem dotykaj pudełek i wybieraj, co to jest.${ocr() ? ' Możesz też kliknąć „🔍 Rozpoznaj”, a aplikacja spróbuje sama odczytać tytuły.' : ''}</div>`}`;
        el.querySelector('[data-x]').onclick = koniec;
        el.querySelector('[data-nowe]').onclick = async () => {
          const plik = await wybierzPlik(); if (!plik) return;
          const kom = [['', 'Cały regał']];
          for (let r = 1; r <= (sh.rows || 1); r++) for (let c = 1; c <= (sh.cols || 1); c++) kom.push([r + '-' + c, 'Tylko: ' + W().przegrodka(sh, r, c)]);
          const o = (sh.rows || 1) * (sh.cols || 1) > 1 ? await App.ui.form('Co jest na zdjęciu?', [{ name: 'cel', label: 'Zdjęcie przedstawia', type: 'select', value: '', options: kom }], { ok: 'Dalej' }) : { cel: '' };
          if (!o) return;
          const url = URL.createObjectURL(plik);
          let data;
          try { data = await zmniejsz(url, 1800, 0.82); } catch (e) { App.ui.toast(e.message); return; } finally { URL.revokeObjectURL(url); }
          const f = { id: DB.uid(), data: App.ui.today(), cel: o.cel || null, ramka: { x0: 0.04, y0: 0.04, x1: 0.96, y1: 0.96 }, zn: [] };
          await DB.local('polkaFoto:' + f.id, data);
          await zapiszSh(sh, (sh.zdjecia || []).concat([f]));
          await edytor(shId, f.id, !f.cel && ((sh.rows || 1) * (sh.cols || 1) > 1));
          rysuj();
        };
        el.querySelectorAll('[data-i]').forEach(d => d.onclick = async () => { const f = z[+d.dataset.i]; if (!obrazy[+d.dataset.i]) { App.ui.toast('To zdjęcie zrobiono na innym urządzeniu – tu są tylko oznaczenia'); return; } await edytor(shId, f.id, false); rysuj(); });
      };
      rysuj();
    });
  }

  /* ---------- edytor jednego zdjęcia ---------- */
  async function edytor(shId, fotoId, ramkaNaStart) {
    const obraz = await pokazFoto(fotoId);
    if (!obraz) return;
    return new Promise(resolve => {
      const el = document.createElement('div'); el.className = 'pkf';
      document.body.appendChild(el);
      let zoom = 1, trybRamki = !!ramkaNaStart, podp = [];
      const sh = () => W().C.byId.get(shId);
      const foto = () => (sh().zdjecia || []).find(f => f.id === fotoId);
      const calyRegal = () => !foto().cel && ((sh().rows || 1) * (sh().cols || 1) > 1);
      const komorka = (x, y) => {
        const f = foto(), s = sh();
        if (f.cel) { const [r, c] = f.cel.split('-').map(Number); return { r, c }; }
        if ((s.rows || 1) * (s.cols || 1) === 1) return { r: 1, c: 1 };
        const R = f.ramka || { x0: 0, y0: 0, x1: 1, y1: 1 };
        const rx = (x - R.x0) / (R.x1 - R.x0), ry = (y - R.y0) / (R.y1 - R.y0);
        return { r: clamp(Math.floor(ry * (s.rows || 1)) + 1, 1, s.rows || 1), c: clamp(Math.floor(rx * (s.cols || 1)) + 1, 1, s.cols || 1) };
      };
      const zapiszFoto = async zmiana => { const z = (sh().zdjecia || []).map(f => f.id === fotoId ? Object.assign({}, f, zmiana(f)) : f); await zapiszSh(sh(), z); };

      function rysuj() {
        const f = foto(), s = sh(); if (!f) { el.remove(); resolve(); return; }
        const R = f.ramka || { x0: 0, y0: 0, x1: 1, y1: 1 };
        const siatka = calyRegal() ? `<div class="pkf-grid" style="left:${R.x0 * 100}%;top:${R.y0 * 100}%;width:${(R.x1 - R.x0) * 100}%;height:${(R.y1 - R.y0) * 100}%;grid-template-columns:repeat(${s.cols || 1},1fr);grid-template-rows:repeat(${s.rows || 1},1fr)">${Array.from({ length: (s.rows || 1) * (s.cols || 1) }, (_, k) => `<span>${Math.floor(k / (s.cols || 1)) + 1}/${k % (s.cols || 1) + 1}</span>`).join('')}</div>` : '';
        const uchwyty = trybRamki ? `<div class="pkf-h" data-h="0" style="left:${R.x0 * 100}%;top:${R.y0 * 100}%"></div><div class="pkf-h" data-h="1" style="left:${R.x1 * 100}%;top:${R.y1 * 100}%"></div>` : '';
        el.innerHTML = `<div class="pkf-bar"><button data-x>✕</button><b>${esc(s.name)}${f.cel ? ' · ' + esc(W().przegrodka(s, +f.cel.split('-')[0], +f.cel.split('-')[1])) : ''}</b>
            ${ocr() ? '<button data-ocr>🔍 Rozpoznaj</button>' : ''}${podp.length ? `<button class="on" data-all>✓ Wszystkie (${podp.length})</button>` : ''}
            ${calyRegal() ? `<button data-ramka class="${trybRamki ? 'on' : ''}">${trybRamki ? '✓ Ramka gotowa' : '▦ Ramka'}</button>` : ''}
            <button data-z="-1">−</button><button data-z="1">+</button><button data-del title="Usuń zdjęcie">🗑</button></div>
          <div class="pkf-scroll"><div class="pkf-img" style="width:${zoom * 100}%">
            <img src="${obraz}" alt="" draggable="false">${siatka}${uchwyty}
            ${podp.map((p, i) => `<div class="pkf-pod" data-p="${i}" style="left:${p.x0 * 100}%;top:${p.y0 * 100}%;width:${(p.x1 - p.x0) * 100}%;height:${(p.y1 - p.y0) * 100}%"><i>${esc(p.t)}?</i></div>`).join('')}
            ${(f.zn || []).map((z, i) => `<div class="pkf-zn" data-zn="${i}" style="left:${z.x * 100}%;top:${z.y * 100}%"><i>${esc(z.t)}</i></div>`).join('')}
          </div></div>
          <div class="pkf-info">${trybRamki ? 'Przeciągnij pomarańczowe kółka na lewy górny i prawy dolny róg regału – po tym aplikacja wie, która przegródka jest gdzie.' : podp.length ? 'Żółte ramki to podpowiedzi z rozpoznawania – dotknij, żeby potwierdzić albo poprawić.' : 'Dotknij pudełka albo tomu i wybierz, co to jest. Zielone znaczniki = już przypisane (dotknij, żeby zmienić).'}</div>`;
        const $ = q => el.querySelector(q);
        $('[data-x]').onclick = () => { el.remove(); resolve(); };
        el.querySelectorAll('[data-z]').forEach(b => b.onclick = () => { zoom = clamp(zoom + (+b.dataset.z) * 0.75, 1, 4); rysuj(); });
        if ($('[data-ramka]')) $('[data-ramka]').onclick = () => { trybRamki = !trybRamki; rysuj(); };
        $('[data-del]').onclick = async () => {
          if (!await App.ui.confirm('Usunąć to zdjęcie? Przypisania gier do półek zostaną.')) return;
          await zapiszSh(sh(), (sh().zdjecia || []).filter(x => x.id !== fotoId)); try { await DB.local('polkaFoto:' + fotoId, null); } catch (e) { }
          el.remove(); resolve();
        };
        if ($('[data-ocr]')) $('[data-ocr]').onclick = async e => {
          const b = e.target; b.disabled = true; b.textContent = 'Czytam…';
          try { podp = await rozpoznaj(obraz, foto()); App.ui.toast(podp.length ? `Podpowiedzi: ${podp.length}` : 'Nie rozpoznałem żadnego tytułu – oznacz ręcznie'); }
          catch (err) { App.ui.toast('Rozpoznawanie nie zadziałało: ' + err.message); }
          rysuj();
        };
        if ($('[data-all]')) $('[data-all]').onclick = async () => { const lista = podp; podp = []; for (const p of lista) await przypisz(p, (p.x0 + p.x1) / 2, (p.y0 + p.y1) / 2); App.ui.toast('Zapisano ' + lista.length); rysuj(); };

        const box = $('.pkf-img');
        // ramka: przeciąganie uchwytów
        el.querySelectorAll('.pkf-h').forEach(h => {
          h.addEventListener('pointerdown', ev => {
            ev.preventDefault(); ev.stopPropagation(); h.setPointerCapture(ev.pointerId);
            const mv = e2 => { const r = box.getBoundingClientRect(); h.style.left = clamp((e2.clientX - r.left) / r.width, 0, 1) * 100 + '%'; h.style.top = clamp((e2.clientY - r.top) / r.height, 0, 1) * 100 + '%'; };
            const up = async e2 => {
              h.removeEventListener('pointermove', mv); h.removeEventListener('pointerup', up);
              const r = box.getBoundingClientRect(); const x = clamp((e2.clientX - r.left) / r.width, 0, 1), y = clamp((e2.clientY - r.top) / r.height, 0, 1);
              await zapiszFoto(f0 => { const R0 = Object.assign({ x0: 0, y0: 0, x1: 1, y1: 1 }, f0.ramka); if (h.dataset.h === '0') { R0.x0 = Math.min(x, R0.x1 - 0.05); R0.y0 = Math.min(y, R0.y1 - 0.05); } else { R0.x1 = Math.max(x, R0.x0 + 0.05); R0.y1 = Math.max(y, R0.y0 + 0.05); } return { ramka: R0 }; });
              rysuj();
            };
            h.addEventListener('pointermove', mv); h.addEventListener('pointerup', up);
          });
        });
        box.addEventListener('click', async ev => {
          if (trybRamki) return;
          const zn = ev.target.closest('.pkf-zn'), pd = ev.target.closest('.pkf-pod');
          if (zn) return zmienZnacznik(+zn.dataset.zn);
          if (pd) return podpowiedz(+pd.dataset.p);
          const r = box.getBoundingClientRect();
          const x = (ev.clientX - r.left) / r.width, y = (ev.clientY - r.top) / r.height;
          const w = await wybor(x, y);
          if (w) { await przypisz(w, x, y); rysuj(); }
        });
      }

      // zapis: znacznik na zdjęciu + miejsce rzeczy na półce
      async function przypisz(w, x, y) {
        const { r, c } = komorka(x, y), s = sh();
        const polka = { s: s.id, r, c };
        if (w.typ === 'seria') { const ser = Object.assign({}, (await DB.setting('polkiSerii')) || {}, { [w.id]: polka }); await DB.setting('polkiSerii', ser); }
        else { const store = w.typ === 'game' ? 'games' : 'comics'; const it = await DB.get(store, w.id); if (it) await DB.put(store, Object.assign({}, it, { polka })); }
        await zapiszFoto(f => ({ zn: (f.zn || []).filter(z => !(z.typ === w.typ && z.id === w.id)).concat([{ x, y, typ: w.typ, id: w.id, t: w.t }]) }));
      }
      async function zmienZnacznik(i) {
        const z = foto().zn[i];
        const o = await App.ui.form(z.t, [{ name: 'co', label: 'Co zrobić?', type: 'select', value: 'zmien', options: [['zmien', 'To jednak coś innego – wybierz'], ['usun', 'Usuń znacznik'], ['otworz', 'Otwórz kartę']] }], { ok: 'Dalej' });
        if (!o) return;
        if (o.co === 'usun') { await zapiszFoto(f => ({ zn: f.zn.filter((_, k) => k !== i) })); rysuj(); }
        if (o.co === 'otworz') { el.remove(); resolve(); document.querySelectorAll('.pkf').forEach(x => x.remove()); if (z.typ === 'game') App.go('planszowki', { gra: z.id }); else if (z.typ === 'comic') App.go('komiksy', { id: z.id }); }
        if (o.co === 'zmien') { const w = await wybor(z.x, z.y); if (w) { await zapiszFoto(f => ({ zn: f.zn.filter((_, k) => k !== i) })); await przypisz(w, z.x, z.y); rysuj(); } }
      }
      async function podpowiedz(i) {
        const p = podp[i];
        const o = await App.ui.form('Czy to: ' + p.t + '?', [{ type: 'html', html: `<p class="muted" style="margin:0">Odczytany napis: „${esc(p.ocr)}”</p>` }, { name: 'co', label: 'Odpowiedź', type: 'select', value: 'tak', options: [['tak', 'Tak, zapisz'], ['inne', 'Nie, wybiorę sam'], ['nie', 'Nie, pomiń']] }], { ok: 'OK' });
        if (!o) return;
        podp.splice(i, 1);
        const x = (p.x0 + p.x1) / 2, y = (p.y0 + p.y1) / 2;
        if (o.co === 'tak') await przypisz(p, x, y);
        if (o.co === 'inne') { const w = await wybor(x, y, p.ocr); if (w) await przypisz(w, x, y); }
        rysuj();
      }
      async function wybor(x, y, q0) {
        const { r, c } = komorka(x, y);
        return wybierzRzecz(sh(), r, c, q0 || '');
      }
      rysuj();
    });
  }

  /* ---------- okno wyboru: co to za pudełko? ---------- */
  async function wybierzRzecz(sh, r, c, q0) {
    const P = W(); const Z = await P.zawartosc();
    const tu = Z.cell.get(Z.key(sh.id, r, c));
    const gry = Z.gry.map(g => ({ typ: 'game', id: g.id, t: g.title + (g.isExpansion ? ' (dodatek)' : ''), gdzie: P.tekst('game', g), exp: g.isExpansion }));
    const tomy = Z.kom.map(k => ({ typ: 'comic', id: k.id, t: (k.series ? k.series + (k.volume != null ? ' ' + k.volume : '') + ' – ' : '') + (k.title || ''), gdzie: k.polka ? P.tekst('comic', { polka: k.polka }) : '' }));
    const serie = [...new Set(Z.kom.map(k => k.series).filter(Boolean))].map(n => ({ typ: 'seria', id: n, t: '📚 cała seria: ' + n, gdzie: P.C.serie[n] ? P.tekst('comic', { series: n }) : '' }));
    const tuIds = new Set(tu ? tu.gry.map(g => g.id).concat(tu.tomy.map(k => k.id)) : []);
    return new Promise(resolve => {
      const dlg = document.createElement('dialog'); dlg.className = 'dlg';
      dlg.innerHTML = `<form method="dialog"><h3>Co to jest?</h3><div class="muted" style="font-size:13px">${esc(sh.name)} · ${esc(P.przegrodka(sh, r, c) || '')}</div>
        <input type="search" id="pkf-q" placeholder="Wpisz kawałek tytułu…" value="${esc(q0)}" style="margin-top:8px;width:100%">
        <div class="pkf-wyb" id="pkf-l"></div>
        <div class="dlg-btns"><button value="cancel" class="ghost">Anuluj</button></div></form>`;
      document.body.appendChild(dlg);
      let wynik = null, lista = [];
      const q = dlg.querySelector('#pkf-q'), l = dlg.querySelector('#pkf-l');
      const draw = () => {
        const f = nz(q.value);
        const pas = x => !f || nz(x.t).includes(f);
        const sek = [];
        if (!f && tuIds.size) sek.push(['Już w tej przegródce', gry.concat(tomy).filter(x => tuIds.has(x.id))]);
        sek.push(['Gry', gry.filter(x => pas(x) && (f || (!x.exp && !x.gdzie))).sort((a, b) => a.t.localeCompare(b.t, 'pl')).slice(0, f ? 40 : 25)]);
        if (f) { sek.push(['Serie komiksów', serie.filter(pas).slice(0, 10)]); sek.push(['Tomy', tomy.filter(pas).slice(0, 40)]); }
        lista = [];
        l.innerHTML = sek.filter(s => s[1].length).map(([n, arr]) => `<div class="sek">${esc(n)}${!f && n === 'Gry' ? ' bez półki (wpisz, żeby szukać wszystkiego)' : ''}</div>` + arr.map(x => { lista.push(x); return `<button type="button" data-k="${lista.length - 1}">${esc(x.t)}${x.gdzie ? `<small>📍 ${esc(x.gdzie)}</small>` : ''}</button>`; }).join('')).join('') || '<p class="muted" style="padding:10px">Nic nie znaleziono.</p>';
      };
      l.addEventListener('click', e => { const b = e.target.closest('[data-k]'); if (!b) return; wynik = lista[+b.dataset.k]; dlg.close('ok'); });
      q.oninput = draw; draw();
      dlg.addEventListener('close', () => { dlg.remove(); resolve(wynik); });
      dlg.showModal();
      setTimeout(() => q.focus(), 50);
    });
  }

  /* ---------- rozpoznawanie: ML Kit (APK) + dopasowanie do kolekcji ---------- */
  const bigramy = s => { const m = new Map(); const t = ' ' + s + ' '; for (let i = 0; i < t.length - 1; i++) { const b = t.slice(i, i + 2); m.set(b, (m.get(b) || 0) + 1); } return m; };
  function dice(a, b) {
    let w = 0, na = 0, nb = 0;
    a.forEach(v => { na += v; }); b.forEach(v => { nb += v; });
    a.forEach((v, k) => { if (b.has(k)) w += Math.min(v, b.get(k)); });
    return na + nb ? 2 * w / (na + nb) : 0;
  }
  async function rozpoznaj(obraz, foto) {
    const dane = await zmniejsz(obraz, 2000, 0.9);
    const r = await ocr().rozpoznaj({ obraz: dane });
    return dopasuj((r && r.teksty) || [], foto);
  }
  async function dopasuj(teksty, foto) {
    const P = W(); const Z = await P.zawartosc();
    const juz = new Set((foto.zn || []).map(z => z.typ + '|' + z.id));
    // kandydaci: gry (cały tytuł i część przed dwukropkiem), tomy („seria numer” i tytuł)
    const kand = [];
    const dodaj = (typ, id, t, klucz) => { const k = nz(klucz); if (k.length >= 3 && !juz.has(typ + '|' + id)) kand.push({ typ, id, t, k, b: bigramy(k) }); };
    Z.gry.forEach(g => { dodaj('game', g.id, g.title, g.title); const p = g.title.split(/[:–]/)[0]; if (p.length >= 4 && p !== g.title) dodaj('game', g.id, g.title, p); if (g.plTitle) dodaj('game', g.id, g.title, g.plTitle); });
    Z.kom.forEach(k => { const t = (k.series ? k.series + (k.volume != null ? ' ' + k.volume : '') : '') + (k.title ? ' – ' + k.title : ''); if (k.series && k.volume != null) dodaj('comic', k.id, t, k.series + ' ' + k.volume); if (k.title && k.title.length >= 5) dodaj('comic', k.id, t, k.title); });
    const naj = new Map(); // item -> podpowiedź
    for (const o of teksty) {
      const T = nz(o.t); if (T.length < 3 || /^\d+$/.test(T)) continue;
      const bT = bigramy(T); let best = null;
      for (const c of kand) {
        let s;
        if (c.k.length >= 4 && (' ' + T + ' ').includes(' ' + c.k + ' ')) s = 0.9 + Math.min(0.09, c.k.length / 300);
        else { s = dice(bT, c.b); if (Math.abs(T.length - c.k.length) > Math.max(T.length, c.k.length) * 0.6) s *= 0.8; }
        if (!best || s > best.s) best = { c, s };
      }
      if (!best || best.s < 0.62) continue;
      const key = best.c.typ + '|' + best.c.id;
      const ex = naj.get(key);
      if (!ex || best.s > ex.s) naj.set(key, { typ: best.c.typ, id: best.c.id, t: best.c.t, ocr: o.t, s: best.s, x0: o.x0, y0: o.y0, x1: o.x1, y1: o.y1 });
    }
    return [...naj.values()].sort((a, b) => b.s - a.s).slice(0, 60);
  }

  App.provide('polki.zdjecia', otworz);
  App.provide('polki._dopasuj', (teksty, foto) => dopasuj(teksty, foto || { zn: [] })); // do testów bez aparatu
})();
