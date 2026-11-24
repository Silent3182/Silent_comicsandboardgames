/* Telefon: przyciski pływające (skaner, mikrofon) chowają się przy przewijaniu w dół i wracają przy przewijaniu w górę,
 * żeby nie zasłaniały treści. Klasa body.fab-schowane, style w style.css. */
(function () {
  let last = 0, tick = false;
  function pos(e) { const t = e && e.target; return t && t !== document && t.scrollTop != null && t.id === 'main' ? t.scrollTop : (window.scrollY || document.documentElement.scrollTop || 0); }
  function on(e) {
    if (tick) return; tick = true;
    requestAnimationFrame(() => {
      const y = pos(e), d = y - last;
      if (y < 40 || d < -6) document.body.classList.remove('fab-schowane');
      else if (d > 6) document.body.classList.add('fab-schowane');
      last = y; tick = false;
    });
  }
  window.addEventListener('scroll', on, { passive: true });
  document.addEventListener('scroll', on, { passive: true, capture: true });
  window.addEventListener('hashchange', () => { last = 0; document.body.classList.remove('fab-schowane'); });
})();
