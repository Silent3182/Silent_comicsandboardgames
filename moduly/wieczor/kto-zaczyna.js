/* „Kto zaczyna?” – losowanie pierwszego gracza palcami.
 * Każdy kładzie palec na ekranie, pod palcem pojawia się kolorowe kółko. Gdy leżą co najmniej 2 palce
 * i przez 3 sekundy nikt nie dołoży, nie zabierze ani wyraźnie nie przesunie palca – aplikacja losuje.
 * Zwycięski kolor rozlewa się na cały ekran, po chwili ekran się zamyka.
 * Bez ekranu dotykowego: kliknięcia myszą dodają „palce” (kliknij kółko, żeby je zabrać).
 * Użycie: App.call('wieczor.ktoZaczyna')
 */
(function () {
  const KOLORY = ['#e6453a', '#2f8fe0', '#f2b705', '#2bb673', '#a35bd6', '#ff7a1a', '#18b3b3', '#e84f9b', '#8bc34a', '#f5f5f5'];
  const CZEKAJ = 3000, RUCH = 28, PO_WYGRANEJ = 2600;

  function css() {
    if (document.getElementById('kz-css')) return;
    const st = document.createElement('style'); st.id = 'kz-css';
    st.textContent = `
.kz{position:fixed;inset:0;z-index:1000;background:#0b0d11;color:#fff;touch-action:none;user-select:none;-webkit-user-select:none;overflow:hidden;animation:kzIn .25s ease}
@keyframes kzIn{from{opacity:0}to{opacity:1}}
.kz-info{position:absolute;left:0;right:0;top:40%;text-align:center;font:600 20px/1.4 system-ui,sans-serif;opacity:.75;padding:0 24px;pointer-events:none;transition:opacity .2s}
.kz-info small{display:block;font-size:14px;font-weight:400;opacity:.8;margin-top:6px}
.kz-x{position:absolute;top:calc(env(safe-area-inset-top,0px) + 12px);right:12px;width:48px;height:48px;border-radius:50%;border:0;background:rgba(255,255,255,.12);color:#fff;font-size:22px;z-index:3}
.kz-p{position:absolute;width:110px;height:110px;margin:-55px 0 0 -55px;border-radius:50%;pointer-events:none;z-index:2;transition:transform .25s,opacity .3s}
.kz-p::before{content:"";position:absolute;inset:14px;border-radius:50%;background:var(--c);box-shadow:0 0 30px var(--c);animation:kzPuls 1s ease-in-out infinite alternate}
.kz-p svg{position:absolute;inset:0;transform:rotate(-90deg)}
.kz-p circle{fill:none;stroke:var(--c);stroke-width:5;stroke-linecap:round;opacity:.9}
@keyframes kzPuls{from{transform:scale(.9)}to{transform:scale(1.04)}}
.kz-p.out{opacity:0;transform:scale(.3)}
.kz-p.win{transform:scale(1.25)}
.kz-p.win::before{box-shadow:0 0 0 6px rgba(255,255,255,.9),0 0 40px rgba(255,255,255,.6)}
.kz-fala{position:absolute;border-radius:50%;z-index:1;width:40px;height:40px;margin:-20px 0 0 -20px;transform:scale(0);transition:transform .9s cubic-bezier(.2,.7,.3,1)}
.kz-wynik{position:absolute;left:0;right:0;bottom:18%;text-align:center;font:700 26px system-ui,sans-serif;z-index:3;opacity:0;transition:opacity .4s .5s;text-shadow:0 1px 8px rgba(0,0,0,.35)}`;
    document.head.appendChild(st);
  }

  let otwarte = false;
  function start(poczatkowe) {
    if (otwarte) return;
    otwarte = true;
    css();
    const el = document.createElement('div'); el.className = 'kz';
    el.innerHTML = `<button class="kz-x" aria-label="Zamknij">✕</button>
      <div class="kz-info">Połóżcie palce na ekranie<small>Gdy wszyscy trzymają palce nieruchomo, po 3 sekundach wylosuję, kto zaczyna</small></div>`;
    document.body.appendChild(el);
    const info = el.querySelector('.kz-info');
    const palce = new Map(); // id -> {x,y,x0,y0,kolor,el}
    let timer = null, t0 = 0, raf = null, koniec = false;
    const wolne = () => KOLORY.find(k => ![...palce.values()].some(p => p.kolor === k)) || KOLORY[palce.size % KOLORY.length];

    function zamknij() { koniec = true; otwarte = false; clearTimeout(timer); cancelAnimationFrame(raf); el.remove(); document.removeEventListener('keydown', esc);
      ['touchstart', 'touchmove', 'touchend', 'touchcancel'].forEach((t, i) => document.removeEventListener(t, H[i], true)); }
    const esc = e => { if (e.key === 'Escape') zamknij(); };
    document.addEventListener('keydown', esc);
    el.querySelector('.kz-x').onclick = e => { e.stopPropagation(); zamknij(); };

    function dodaj(id, x, y) {
      const kolor = wolne();
      const p = document.createElement('div'); p.className = 'kz-p'; p.style.setProperty('--c', kolor);
      p.innerHTML = '<svg viewBox="0 0 110 110"><circle cx="55" cy="55" r="51" stroke-dasharray="320.4" stroke-dashoffset="320.4"/></svg>';
      p.style.left = x + 'px'; p.style.top = y + 'px';
      el.appendChild(p);
      palce.set(id, { x, y, x0: x, y0: y, kolor, el: p });
      if (navigator.vibrate) try { navigator.vibrate(15); } catch (e) {}
      odliczaj();
    }
    function zabierz(id) { const p = palce.get(id); if (!p) return; p.el.classList.add('out'); setTimeout(() => p.el.remove(), 300); palce.delete(id); odliczaj(); }
    function przesun(id, x, y) {
      const p = palce.get(id); if (!p) return;
      p.x = x; p.y = y; p.el.style.left = x + 'px'; p.el.style.top = y + 'px';
      if (Math.hypot(x - p.x0, y - p.y0) > RUCH) { p.x0 = x; p.y0 = y; odliczaj(); } // wyraźny ruch = od nowa
    }
    // (Re)start odliczania: potrzeba co najmniej 2 palców
    function odliczaj() {
      if (koniec) return;
      clearTimeout(timer); cancelAnimationFrame(raf);
      palce.forEach(p => p.el.querySelector('circle').setAttribute('stroke-dashoffset', '320.4'));
      info.style.opacity = palce.size ? '0' : '.75';
      if (palce.size < 2) return;
      t0 = performance.now();
      const krok = () => {
        const f = Math.min(1, (performance.now() - t0) / CZEKAJ);
        palce.forEach(p => p.el.querySelector('circle').setAttribute('stroke-dashoffset', String(320.4 * (1 - f))));
        if (f < 1) raf = requestAnimationFrame(krok);
      };
      raf = requestAnimationFrame(krok);
      timer = setTimeout(losuj, CZEKAJ);
    }
    function losuj() {
      if (koniec || palce.size < 2) return;
      koniec = true;
      const lista = [...palce.values()];
      const los = new Uint32Array(1); (window.crypto || {}).getRandomValues ? crypto.getRandomValues(los) : (los[0] = Math.floor(Math.random() * 1e9));
      const w = lista[los[0] % lista.length];
      lista.forEach(p => { if (p !== w) p.el.classList.add('out'); else p.el.classList.add('win'); });
      const fala = document.createElement('div'); fala.className = 'kz-fala';
      fala.style.background = w.kolor; fala.style.left = w.x + 'px'; fala.style.top = w.y + 'px';
      el.appendChild(fala);
      const skala = Math.hypot(Math.max(w.x, innerWidth - w.x), Math.max(w.y, innerHeight - w.y)) / 20 + 2;
      requestAnimationFrame(() => requestAnimationFrame(() => { fala.style.transform = `scale(${skala})`; }));
      const wyn = document.createElement('div'); wyn.className = 'kz-wynik';
      wyn.textContent = 'Ty zaczynasz!'; wyn.style.color = w.kolor === '#f5f5f5' || w.kolor === '#f2b705' || w.kolor === '#8bc34a' ? '#111' : '#fff';
      el.appendChild(wyn); requestAnimationFrame(() => requestAnimationFrame(() => { wyn.style.opacity = '1'; }));
      if (navigator.vibrate) try { navigator.vibrate([60, 40, 160]); } catch (e) {}
      setTimeout(() => { el.style.transition = 'opacity .35s'; el.style.opacity = '0'; setTimeout(zamknij, 350); }, PO_WYGRANEJ);
    }

    // Dotyk (telefon, tablet, ekran dotykowy)
    const tylkoTlo = e => e.target.closest && e.target.closest('.kz-x');
    // Dotyk: nasłuch na całym dokumencie, bo palce położone na okładce (przed otwarciem ekranu) wysyłają zdarzenia do okładki
    const H = [
      e => { if (tylkoTlo(e)) return; e.preventDefault(); if (koniec) return; [...e.changedTouches].forEach(t => dodaj('t' + t.identifier, t.clientX, t.clientY)); },
      e => { e.preventDefault(); if (koniec) return; [...e.changedTouches].forEach(t => przesun('t' + t.identifier, t.clientX, t.clientY)); },
      e => { if (!tylkoTlo(e) && e.cancelable) e.preventDefault(); if (!koniec) [...e.changedTouches].forEach(t => zabierz('t' + t.identifier)); }
    ];
    H.push(H[2]);
    ['touchstart', 'touchmove', 'touchend', 'touchcancel'].forEach((t, i) => document.addEventListener(t, H[i], { capture: true, passive: false }));
    if (poczatkowe && poczatkowe.length) [...poczatkowe].forEach(t => dodaj('t' + t.identifier, t.clientX, t.clientY));
    // Mysz (komputer bez dotyku): kliknięcie dodaje palec, kliknięcie w kółko je zabiera
    let nr = 0;
    el.addEventListener('mousedown', e => {
      if (koniec || tylkoTlo(e) || e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents) return;
      const blisko = [...palce.entries()].find(([, p]) => Math.hypot(p.x - e.clientX, p.y - e.clientY) < 50);
      if (blisko) zabierz(blisko[0]); else dodaj('m' + (nr++), e.clientX, e.clientY);
    });
    el.addEventListener('contextmenu', e => e.preventDefault());
  }

  App.provide('wieczor.ktoZaczyna', () => start());

  /* Skrót: 2 lub więcej palców położonych na okładce gry (kafelek, wiersz listy, karta gry, Wieczór gier)
   * od razu otwiera losowanie – palce zostają i liczą się jako gracze. Pojedyncze dotknięcie działa jak dotąd. */
  const OKLADKA = '.tile .cov, .li > img, .li > .ph, .detail .cover, img.cover';
  const naOkladce = t => { const el = t.target && t.target.closest ? t.target.closest(OKLADKA) : null; return el && !(t.target.closest('[data-bgg], button, a')) ? el : null; };
  document.addEventListener('touchstart', e => {
    if (otwarte || e.touches.length < 2) return;
    if (!/^#\/(planszowki|wieczor|rozgrywki)/.test(location.hash)) return;
    const dotk = [...e.touches];
    const okl = dotk.map(naOkladce);
    if (!okl[0] || okl.some(o => o !== okl[0])) return; // wszystkie palce na tej samej okładce
    e.preventDefault();
    start(dotk);
  }, { capture: true, passive: false });
  // okładki gier: bez menu „zapisz obraz” przy przytrzymaniu, żeby nie przeszkadzało w losowaniu
  const st = document.createElement('style');
  st.textContent = '.tile .cov img, .li > img, .detail .cover{-webkit-touch-callout:none;-webkit-user-select:none;user-select:none}';
  document.head.appendChild(st);
})();
