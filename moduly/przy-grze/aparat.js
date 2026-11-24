/* Tryb aparatu do koszulek: podgląd z kamery + nakładka z konturami koszulek w prawdziwej skali.
 * Skala z obiektu odniesienia: karta płatnicza (ISO/IEC 7810 ID-1: 85,6 × 54 mm) leżąca obok karty z gry.
 *   1) użytkownik dopasowuje żółtą ramkę do karty płatniczej (proporcje zablokowane) → piksele na mm,
 *   2) dopasowuje niebieską ramkę do karty z gry → wymiary w mm i najbliższy rozmiar koszulki,
 *      kontur wybranej koszulki rysuje się przerywaną linią wokół karty (można przełączać rozmiary).
 * Bez aparatu (komputer, brak zgody) można wczytać zdjęcie z pliku.
 * Usługa: App.call('przygrze.aparat', {tytul}) -> Promise<{size, w, h} | null> */
(function () {
  const { esc } = App.ui;
  const KARTA = { w: 85.6, h: 54 };
  const S = () => window.SLEEVE;

  function css() {
    if (document.getElementById('ap-css')) return;
    const st = document.createElement('style'); st.id = 'ap-css';
    st.textContent = `
      dialog.ap { padding: 0; border: 0; width: 100vw; height: 100vh; max-width: 100vw; max-height: 100vh; margin: 0; background: #000; color: #fff; }
      dialog.ap::backdrop { background: #000; }
      .ap-w { display: flex; flex-direction: column; height: 100%; }
      .ap-top { display: flex; align-items: center; gap: 8px; padding: 8px 10px; padding-top: calc(8px + env(safe-area-inset-top)); background: rgba(0,0,0,.6); }
      .ap-top b { flex: 1; font-size: 15px; }
      .ap-top button, .ap-bot button { background: rgba(255,255,255,.14); color: #fff; border: 1px solid rgba(255,255,255,.25); }
      .ap-bot button.primary { background: var(--accent-2); color: #241a05; border-color: transparent; }
      .ap-st { position: relative; flex: 1; min-height: 0; touch-action: none; }
      .ap-st canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
      .ap-bot { padding: 10px 12px calc(10px + env(safe-area-inset-bottom)); background: rgba(0,0,0,.72); display: flex; flex-direction: column; gap: 8px; }
      .ap-msg { font-size: 14px; line-height: 1.4; }
      .ap-msg .big { font-size: 17px; font-weight: 700; }
      .ap-ok { color: #8be0a8; } .ap-warn { color: #ffcf7a; } .ap-bad { color: #ff9d8a; }
      .ap-chips { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 2px; scrollbar-width: none; }
      .ap-chips button { flex: 0 0 auto; font-size: 12.5px; padding: 5px 10px; min-height: 34px; border-radius: 999px; white-space: nowrap; }
      .ap-chips button.on { background: #fff; color: #111; }
      .ap-chips button i { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 5px; vertical-align: 0; }
      .ap-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
      .ap-row .sp { flex: 1; }
      .ap-empty[hidden] { display: none; }
      .ap-empty { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; text-align: center; padding: 24px; color: #ddd; }
    `;
    document.head.appendChild(st);
  }

  function otworz(opt = {}) {
    css();
    return new Promise(resolve => {
      const dlg = document.createElement('dialog');
      dlg.className = 'ap';
      dlg.innerHTML = `<div class="ap-w">
        <div class="ap-top"><b>📏 Dopasuj koszulki${opt.tytul ? ' – ' + esc(opt.tytul) : ''}</b>
          <button data-a="foto" title="Wczytaj zdjęcie z pliku">🖼️ Zdjęcie</button><button data-a="x" aria-label="Zamknij">✕</button></div>
        <div class="ap-st"><canvas></canvas><div class="ap-empty" hidden></div></div>
        <div class="ap-bot"><div class="ap-msg"></div><div class="ap-chips"></div><div class="ap-row"></div></div>
        <input type="file" accept="image/*" capture="environment" hidden>
      </div>`;
      document.body.appendChild(dlg);
      const $ = s => dlg.querySelector(s);
      const cv = $('canvas'), ctx = cv.getContext('2d'), st = $('.ap-st'), msg = $('.ap-msg'), chips = $('.ap-chips'), row = $('.ap-row'), empty = $('.ap-empty');
      const video = document.createElement('video'); video.playsInline = true; video.muted = true; video.setAttribute('playsinline', '');
      let stream = null, frozen = null, raf = 0, W = 0, H = 0, dpr = 1;
      let krok = 1, pion = false;                              // 1 = karta płatnicza, 2 = karta z gry
      let kal = null, gra = null, wybrany = null, recznie = false, wynik = null, rozm = '';

      function zakoncz(v) {
        cancelAnimationFrame(raf);
        if (stream) stream.getTracks().forEach(t => t.stop());
        ro.disconnect();
        dlg.close(); dlg.remove(); resolve(v);
      }
      dlg.addEventListener('cancel', e => { e.preventDefault(); zakoncz(null); });

      /* Ramki trzymamy we współrzędnych OBRAZU (piksele zdjęcia/klatki), więc zmiana wielkości okna ich nie przesuwa. */
      function rozmiar() {
        const r = st.getBoundingClientRect(); dpr = window.devicePixelRatio || 1;
        W = r.width; H = r.height; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      }
      const ro = new ResizeObserver(rozmiar);
      function startRamki(o) {
        const bw = Math.min(W * 0.55, 260) / o.s, bh = bw * KARTA.h / KARTA.w;
        kal = { x: Math.max(10 / o.s, o.iw / 2 - bw - 8 / o.s), y: o.ih / 2 - bh / 2, w: bw, h: bh };
      }
      const ppm = () => kal ? (kal.w / (pion ? KARTA.h : KARTA.w)) : 0;   // piksele obrazu na milimetr
      const naEkran = (r, o) => ({ x: o.x + r.x * o.s, y: o.y + r.y * o.s, w: r.w * o.s, h: r.h * o.s });
      function zrodlo() { return frozen || (video.readyState >= 2 ? video : null); }
      function ramkaObrazu() {                                  // „contain” – cały obraz widoczny
        const z = zrodlo(); if (!z) return null;
        const iw = z.videoWidth || z.naturalWidth || z.width, ih = z.videoHeight || z.naturalHeight || z.height;
        if (!iw || !ih) return null;
        const s = Math.min(W / iw, H / ih);
        if (rozm !== iw + 'x' + ih) { rozm = iw + 'x' + ih; kal = null; gra = null; wynik = null; if (krok !== 1) { krok = 1; panel(); } }   // inny obraz (np. wczytane zdjęcie) – ramki od nowa
        const o = { z, s, iw, ih, x: (W - iw * s) / 2, y: (H - ih * s) / 2, w: iw * s, h: ih * s };
        if (!kal) startRamki(o);
        return o;
      }

      /* ---------- rysowanie ---------- */
      function rect(r, kolor, opt2 = {}) {
        ctx.save(); ctx.lineWidth = opt2.lw || 2.5; ctx.strokeStyle = kolor;
        if (opt2.dash) ctx.setLineDash(opt2.dash);
        if (opt2.fill) { ctx.fillStyle = opt2.fill; ctx.fillRect(r.x, r.y, r.w, r.h); }
        ctx.strokeRect(r.x, r.y, r.w, r.h); ctx.restore();
        if (opt2.uchwyty) [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]].forEach(([x, y]) => {
          ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fillStyle = kolor; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#000'; ctx.stroke();
        });
        if (opt2.napis) { ctx.save(); ctx.font = '600 13px system-ui, sans-serif'; const t = opt2.napis, tw = ctx.measureText(t).width;
          const ty = (!opt2.dol && r.y > 24) || r.y + r.h + 22 > H ? r.y - 8 : r.y + r.h + 18; ctx.fillStyle = 'rgba(0,0,0,.65)'; ctx.fillRect(r.x - 2, ty - 14, tw + 10, 19); ctx.fillStyle = kolor; ctx.fillText(t, r.x + 3, ty); ctx.restore(); }
      }
      function rysuj() {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
        const o = ramkaObrazu();
        if (!o) { raf = requestAnimationFrame(rysuj); return; }
        ctx.drawImage(o.z, o.x, o.y, o.w, o.h);
        if (kal) rect(naEkran(kal, o), '#ffd23f', { uchwyty: krok === 1, fill: krok === 1 ? 'rgba(255,210,63,.12)' : null, napis: 'karta płatnicza 85,6×54 mm', lw: krok === 1 ? 3 : 2 });
        if (krok === 2) {
          const p = ppm() * o.s, ge = gra && naEkran(gra, o);
          if (gra) rect(ge, '#5aa9ff', { uchwyty: true, fill: 'rgba(90,169,255,.12)', napis: wynik ? `karta z gry ${S().mm(wynik.w)}×${S().mm(wynik.h)} mm` : 'karta z gry', lw: 3 });
          if (wybrany && p) {                                  // kontur koszulki: rozmiar karty + ok. 3 mm zapasu, wokół środka karty z gry
            const r = S().byId(wybrany), poziomo = gra && gra.w > gra.h;
            const sw = (poziomo ? r.h : r.w) * p + 3 * p, sh = (poziomo ? r.w : r.h) * p + 3 * p;
            const c = ge ? { x: ge.x + ge.w / 2, y: ge.y + ge.h / 2 } : { x: W / 2, y: H / 2 };
            rect({ x: c.x - sw / 2, y: c.y - sh / 2, w: sw, h: sh }, r.kolor === '#3d4654' ? '#bbb' : r.kolor, { dash: [9, 6], lw: 3, dol: true, napis: 'koszulka: ' + r.nazwa });
          }
        }
        raf = requestAnimationFrame(rysuj);
      }

      /* ---------- dotyk / mysz ---------- */
      let ciag = null;
      let sk = 1;   // ile pikseli ekranu na piksel obrazu (do progów dotyku)
      const pkt = e => { const r = cv.getBoundingClientRect(), o = ramkaObrazu() || { x: 0, y: 0, s: 1 }; sk = o.s; return { x: (e.clientX - r.left - o.x) / o.s, y: (e.clientY - r.top - o.y) / o.s }; };
      const narozniki = r => [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]];
      cv.addEventListener('pointerdown', e => {
        if (!kal) return;
        const p = pkt(e), r = krok === 1 ? kal : gra;
        cv.setPointerCapture(e.pointerId);
        if (r) {
          const i = narozniki(r).findIndex(([x, y]) => Math.hypot(x - p.x, y - p.y) < 30 / sk);
          if (i >= 0) { const [ox, oy] = narozniki(r)[3 - i]; ciag = { tryb: 'rog', ox, oy }; return; }
          if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) { ciag = { tryb: 'ruch', dx: p.x - r.x, dy: p.y - r.y }; return; }
        }
        if (krok === 2) { gra = { x: p.x, y: p.y, w: 1, h: 1 }; ciag = { tryb: 'rog', ox: p.x, oy: p.y }; }
      });
      cv.addEventListener('pointermove', e => {
        if (!ciag) return;
        const p = pkt(e), r = krok === 1 ? kal : gra;
        if (ciag.tryb === 'ruch') { r.x = p.x - ciag.dx; r.y = p.y - ciag.dy; }
        else {
          let w = Math.max(Math.abs(p.x - ciag.ox), 16 / sk), h = Math.max(Math.abs(p.y - ciag.oy), 16 / sk);
          if (krok === 1) { const prop = pion ? KARTA.w / KARTA.h : KARTA.h / KARTA.w; if (w * prop > h) h = w * prop; else w = h / prop; }
          r.w = w; r.h = h; r.x = p.x < ciag.ox ? ciag.ox - w : ciag.ox; r.y = p.y < ciag.oy ? ciag.oy - h : ciag.oy;
        }
        if (krok === 2) licz(false);
      });
      const puść = () => { ciag = null; if (krok === 2) licz(true); };
      cv.addEventListener('pointerup', puść); cv.addEventListener('pointercancel', puść);

      /* ---------- obliczenia i panel ---------- */
      function licz(pelny) {
        const p = ppm();
        wynik = gra && p ? { w: Math.min(gra.w, gra.h) / p, h: Math.max(gra.w, gra.h) / p } : null;
        if (wynik) { wynik.lista = S().dopasuj(wynik.w, wynik.h); if (!recznie) wybrany = wynik.lista[0].r.id; }
        if (pelny !== false) panel();
      }
      function panel() {
        if (krok === 1) {
          msg.innerHTML = `<div class="big">1. Karta płatnicza jako miarka</div>Połóż kartę płatniczą (albo dowód, legitymację – ten sam rozmiar) obok karty z gry na płaskim stole. Trzymaj telefon równolegle do stołu, ok. 30 cm nad nim. Przesuń i rozciągnij <b style="color:#ffd23f">żółtą ramkę</b> za róg, żeby pokryła kartę płatniczą.`;
          chips.innerHTML = '';
          row.innerHTML = `<button data-a="obroc">↻ Karta pionowo/poziomo</button><button data-a="stop">${frozen ? '▶ Wznów obraz' : '⏸ Zatrzymaj obraz'}</button><span class="sp"></span><button class="primary" data-a="dalej">Dalej →</button>`;
          return;
        }
        const najl = wynik && wynik.lista[0];
        const ocKl = o => o === 'pasuje' ? 'ap-ok' : o === 'luźno' ? 'ap-warn' : 'ap-bad';
        msg.innerHTML = wynik
          ? `<div class="big">Karta: ${S().mm(wynik.w)} × ${S().mm(wynik.h)} mm</div>Najbliżej: <b>${esc(najl.r.nazwa)}</b> (${S().wym(najl.r)}) – <span class="${ocKl(najl.ocena)}">${najl.ocena}</span>${wynik.lista[1] && wynik.lista[1].ocena !== 'za mała' && wynik.lista[1].ocena !== 'nie pasuje' ? `, ewentualnie ${esc(wynik.lista[1].r.nazwa)}` : ''}. <span style="opacity:.75">Dokładność ok. ±2 mm.</span>`
          : `<div class="big">2. Karta z gry</div>Narysuj palcem <b style="color:#5aa9ff">niebieską ramkę</b> na karcie z gry (przeciągnij od rogu do rogu), potem popraw za rogi. Przerywana linia to wybrana koszulka w prawdziwej skali.`;
        const ocena = new Map(wynik ? wynik.lista.map(x => [x.r.id, x.ocena]) : []);
        chips.innerHTML = S().ROZMIARY.map(r => `<button data-r="${r.id}" class="${r.id === wybrany ? 'on' : ''}"><i style="background:${r.kolor}"></i>${esc(r.nazwa)} ${S().mm(r.w)}×${S().mm(r.h)}${ocena.get(r.id) === 'pasuje' ? ' ✓' : ''}</button>`).join('');
        chips.querySelectorAll('[data-r]').forEach(b => b.onclick = () => { wybrany = b.dataset.r; recznie = true; panel(); });
        const on = chips.querySelector('.on'); if (on) on.scrollIntoView({ inline: 'center', block: 'nearest' });
        row.innerHTML = `<button data-a="wstecz">← Miarka</button><button data-a="stop">${frozen ? '▶ Wznów' : '⏸ Zatrzymaj'}</button><span class="sp"></span>${wynik ? `<button class="primary" data-a="ok">${opt.zapisz === false ? 'Gotowe' : 'Użyj: ' + esc(S().byId(wybrany).nazwa)}</button>` : ''}`;
      }
      row.addEventListener('click', e => {
        const a = e.target.closest('[data-a]'); if (!a) return;
        const t = a.dataset.a;
        if (t === 'obroc') { pion = !pion; const c = { x: kal.x + kal.w / 2, y: kal.y + kal.h / 2 }; [kal.w, kal.h] = [kal.h, kal.w]; kal.x = c.x - kal.w / 2; kal.y = c.y - kal.h / 2; }
        if (t === 'stop') zamroz();
        if (t === 'dalej') {
          if (!kal) return App.ui.toast('Najpierw włącz aparat albo wczytaj zdjęcie.');
          krok = 2;
          const o = ramkaObrazu();
          if (!gra && o) { const p = ppm(), w = 59 * p, h = 92 * p; gra = { x: Math.min(o.iw - w - 10 / o.s, kal.x + kal.w + 20 / o.s), y: o.ih / 2 - h / 2, w, h }; if (gra.x < kal.x + kal.w) gra.x = o.iw / 2 - w / 2; }
          licz(false);
        }
        if (t === 'wstecz') krok = 1;
        if (t === 'ok' && wynik) return zakoncz({ size: wybrany, w: Math.round(wynik.w * 10) / 10, h: Math.round(wynik.h * 10) / 10 });
        panel();
      });
      dlg.querySelector('.ap-top').addEventListener('click', e => {
        const a = e.target.closest('[data-a]'); if (!a) return;
        if (a.dataset.a === 'x') zakoncz(null);
        if (a.dataset.a === 'foto') $('input[type=file]').click();
      });
      function zamroz() {
        if (frozen) { frozen = null; if (video.paused && stream) video.play().catch(() => {}); return; }
        if (video.readyState < 2) return;
        const c = document.createElement('canvas'); c.width = video.videoWidth; c.height = video.videoHeight;
        c.getContext('2d').drawImage(video, 0, 0); frozen = c;
      }
      $('input[type=file]').onchange = e => {
        const f = e.target.files[0]; if (!f) return;
        const img = new Image();
        img.onload = () => { frozen = img; empty.hidden = true; ramkaObrazu(); panel(); };
        img.onerror = () => App.ui.toast('Nie udało się wczytać zdjęcia.');
        img.src = URL.createObjectURL(f);
      };

      async function kamera() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('Brak aparatu w tej przeglądarce');
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
        video.srcObject = stream; await video.play();
      }

      dlg._stan = () => { const o = ramkaObrazu(); return { kal, gra, krok, wynik, o: o && { x: o.x, y: o.y, s: o.s } }; };   // do testów
      dlg.showModal();
      panel(); rozmiar(); ro.observe(st); rysuj();
      kamera().catch(e => {
        empty.hidden = false;
        empty.innerHTML = `<div style="font-size:42px">📷</div><div>${esc(App.ui.komunikat(e) || 'Nie udało się włączyć aparatu.')}</div><div style="opacity:.8">Możesz zrobić zdjęcie karty płatniczej obok karty z gry i wczytać je z pliku.</div><button class="primary" style="background:var(--accent-2);color:#241a05">🖼️ Wczytaj zdjęcie</button>`;
        empty.querySelector('button').onclick = () => $('input[type=file]').click();
      });
    });
  }
  App.provide('przygrze.aparat', otworz);
})();
