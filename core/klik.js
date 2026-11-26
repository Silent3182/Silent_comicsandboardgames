/* „KLIK!” – krótki komiksowy wybuch po oznaczeniu zeszytu jako przeczytany (motyw „Kadr”).
 * Nie zmienia modułu komiksów: nasłuchuje kliknięć w przycisk „Przeczytane” (#czok)
 * i zaznaczeń pola przy wierszu kolejności czytania (.kx-row). Działa tylko w motywie „Kadr”. */
(function () {
  function wlaczony() { return document.documentElement.dataset.styl === 'kadr'; }
  function bum(x, y) {
    if (!wlaczony()) return;
    const el = document.createElement('div');
    el.className = 'klik-wybuch';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '<span>Klik!</span>';
    const w = window.innerWidth, h = window.innerHeight;
    el.style.left = Math.min(Math.max(x, 95), w - 95) + 'px';
    el.style.top = Math.min(Math.max(y, 80), h - 80) + 'px';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 900);
    if (navigator.vibrate) try { navigator.vibrate(18); } catch (e) {}
  }
  function srodek(el) { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('#czok');
    if (!b) return;
    const [x, y] = e.clientX || e.clientY ? [e.clientX, e.clientY] : srodek(b);
    bum(x, y - 40);
  }, true);
  document.addEventListener('change', e => {
    const t = e.target;
    if (!t || t.type !== 'checkbox' || !t.checked || !t.closest('.kx-row')) return;
    const [x, y] = srodek(t);
    bum(x + 70, y - 30);
  }, true);
  window.klikWybuch = bum;
})();
