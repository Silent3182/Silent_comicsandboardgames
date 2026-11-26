/* Wygląd: wybór stylu ikon menu (A/B/C), motywu (automatyczny/jasny/ciemny) i czasu ekranu startowego.
 * Ustawienie jest zapisane w tym urządzeniu (localStorage „wyglad”), stosowane już w <head> index.html.
 * Karta „Wygląd” jest dokładana na górę zakładki Ustawienia, bez zmian w core/sync.js. */
(function () {
  const IKONY = [['wypelnione', 'A', 'Wypełnione'], ['kontur', 'B', 'Kontur'], ['kolor', 'C', 'Kolorowe']];
  const SPLASH = [['0', 'Wyłączony'], ['1', '1 s'], ['2', '2 s'], ['3', '3 s'], ['5', '5 s']];
  const STYL = [['klasyczny', 'Klasyczny'], ['kadr', 'Komiksowy (Kadr)']];
  const MOTYW = [['auto', 'Automatyczny'], ['light', 'Jasny'], ['dark', 'Ciemny']];
  function get() { try { return Object.assign({ ikony: 'kolor', motyw: 'auto', splash: '2', styl: 'klasyczny' }, JSON.parse(localStorage.getItem('wyglad') || '{}')); } catch (e) { return { ikony: 'kolor', motyw: 'auto', splash: '2', styl: 'klasyczny' }; } }
  function apply(w) {
    const h = document.documentElement;
    h.dataset.ikony = w.ikony;
    h.dataset.styl = w.styl === 'kadr' ? 'kadr' : 'klasyczny';
    if (w.motyw === 'light' || w.motyw === 'dark') h.dataset.theme = w.motyw; else delete h.dataset.theme;
    const dark = w.motyw === 'dark' || (w.motyw !== 'light' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = h.dataset.styl === 'kadr' ? (dark ? '#1a1712' : '#fff6e0') : (dark ? '#12161b' : '#1f3a5f');
  }
  function set(k, v) { const w = get(); w[k] = v; try { localStorage.setItem('wyglad', JSON.stringify(w)); } catch (e) {} apply(w); }
  apply(get());

  function card() {
    const w = get();
    const prev = id => window.ikona ? window.ikona(id) : '';
    return `<h2>Wygląd</h2>
      <div class="card wy-card">
        <div class="wy-lab">Styl aplikacji</div>
        <div class="seg wy-seg">${STYL.map(([v, l]) => `<button class="${w.styl === v ? 'on' : ''}" data-k="styl" data-v="${v}">${l}</button>`).join('')}</div>
        <div class="wy-lab" style="margin-top:16px">Ikony w menu</div>
        <div class="wy-opts">${IKONY.map(([v, lit, l]) => `<button class="wy-opt ${w.ikony === v ? 'on' : ''}" data-k="ikony" data-v="${v}"><span class="wy-prev" data-ikony="${v}">${['planszowki', 'komiksy', 'czytanie'].map(prev).join('')}</span><span class="wy-n"><b>${lit}</b> ${l}</span></button>`).join('')}</div>
        <div class="wy-lab">Motyw</div>
        <div class="seg wy-seg">${MOTYW.map(([v, l]) => `<button class="${w.motyw === v ? 'on' : ''}" data-k="motyw" data-v="${v}">${l}</button>`).join('')}</div>
        <div class="wy-lab">Ekran startowy „Kolekcja Marcina”</div>
        <div class="seg wy-seg">${SPLASH.map(([v, l]) => `<button class="${String(w.splash) === v ? 'on' : ''}" data-k="splash" data-v="${v}">${l}</button>`).join('')}</div>
        <p class="muted wy-hint">Zapisuje się w tym urządzeniu. „Automatyczny” bierze jasny lub ciemny z ustawień telefonu albo komputera. Ekran startowy zawsze zamyka się od razu po dotknięciu.</p>
      </div>`;
  }
  function bind(box) {
    box.querySelectorAll('[data-k]').forEach(b => b.onclick = () => { set(b.dataset.k, b.dataset.v); App.refresh(); });
  }

  // dołóż kartę na górę zakładki Ustawienia (owijamy jej render)
  function hook() {
    const m = (App.modules || []).find(x => x.id === 'ustawienia');
    if (!m || m._wyglad) return !!m;
    const orig = m.render; m._wyglad = true;
    m.render = async function (el, ...rest) {
      await orig.call(this, el, ...rest);
      const box = document.createElement('div'); box.innerHTML = card();
      el.prepend(...box.childNodes); bind(el.querySelector('.wy-card'));
    };
    return true;
  }
  if (!hook()) document.addEventListener('DOMContentLoaded', hook);
  if (window.matchMedia) matchMedia('(prefers-color-scheme: dark)').addEventListener && matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => apply(get()));
})();
