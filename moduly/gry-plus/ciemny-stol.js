/* Tryb ciemnego stołu: przyciemniony ekran licznika punktów i zegara tur, żeby nie raził przy grze
 * (czarne tło, przygaszone kolory, ekran nie gaśnie). Przycisk 🌙 w rogu tych dwóch zakładek.
 * Ustawienie na urządzeniu: localStorage 'ciemnyStol' = '1' | '0'. Poza licznikiem i zegarem nic nie zmienia.
 */
(function () {
  const TRASY = ['licznik', 'zegar'];
  const KEY = 'ciemnyStol';
  const wl = () => { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } };
  let lock = null;
  async function ekran(on) {
    try {
      if (on && !lock && 'wakeLock' in navigator && document.visibilityState === 'visible') { lock = await navigator.wakeLock.request('screen'); lock.addEventListener('release', () => { lock = null; }); }
      if (!on && lock) { await lock.release(); lock = null; }
    } catch (e) { /* bez blokady wygaszania – nic się nie dzieje */ }
  }
  function css() {
    if (document.getElementById('cs-css')) return;
    const s = document.createElement('style'); s.id = 'cs-css';
    s.textContent = `
#csBtn{position:fixed;right:14px;top:calc(10px + env(safe-area-inset-top));z-index:60;width:44px;height:44px;border-radius:50%;border:1px solid var(--line);background:var(--surface);font-size:20px;line-height:1;box-shadow:var(--shadow-lg,0 4px 14px rgba(0,0,0,.2));cursor:pointer;padding:0}
html:root[data-ciemny-stol]{--bg:#000;--surface:#0b0b0b;--surface2:#141414;--text:#9a8f80;--muted:#5d564d;--line:#1d1d1d;color-scheme:dark}
html[data-ciemny-stol] body{background:#000}
html[data-ciemny-stol] #main{filter:brightness(.62) saturate(.6)}
html[data-ciemny-stol] #nav{filter:brightness(.35);opacity:.6}
html[data-ciemny-stol] #csBtn{background:#111;border-color:#222;filter:brightness(.7)}
html[data-ciemny-stol] img{opacity:.7}
@media (max-width:760px){#csBtn{top:auto;right:auto;left:14px;bottom:calc(84px + env(safe-area-inset-bottom))}}
`;
    document.head.appendChild(s);
  }
  const naTrasie = () => TRASY.includes(location.hash.replace(/^#\/?/, '').split('?')[0]);
  function odswiez() {
    css();
    const h = document.documentElement;
    let b = document.getElementById('csBtn');
    if (!naTrasie()) { if (b) b.remove(); delete h.dataset.ciemnyStol; ekran(false); return; }
    if (!b) {
      b = document.createElement('button'); b.id = 'csBtn'; b.type = 'button';
      b.onclick = () => { try { localStorage.setItem(KEY, wl() ? '0' : '1'); } catch (e) {} odswiez(); App.ui.toast(wl() ? 'Ciemny stół włączony 🌙' : 'Ciemny stół wyłączony'); };
      document.body.appendChild(b);
    }
    const on = wl();
    b.textContent = on ? '☀️' : '🌙';
    b.title = on ? 'Wyłącz ciemny stół' : 'Ciemny stół – przyciemnij ekran';
    b.setAttribute('aria-label', b.title);
    if (on) h.dataset.ciemnyStol = '1'; else delete h.dataset.ciemnyStol;
    ekran(on);
  }
  window.addEventListener('hashchange', odswiez);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && naTrasie() && wl()) ekran(true); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', odswiez); else setTimeout(odswiez, 0);
  App.provide('ciemnyStol.przelacz', () => document.getElementById('csBtn') && document.getElementById('csBtn').click());
})();
