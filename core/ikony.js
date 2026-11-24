/* Ikony zakładek (SVG, kolor z currentColor). Klucz = id modułu. Brak klucza → emoji z registerModule.
 * Kształt z klasą "f" dostaje lekkie wypełnienie (styl duotone w style.css). */
window.IKONY = {
  planszowki: '<rect class="f" x="3.5" y="3.5" width="17" height="17" rx="4"/><circle cx="8.5" cy="8.5" r="1.3" fill="currentColor" stroke="none"/><circle cx="15.5" cy="15.5" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="15.5" cy="8.5" r="1.3" fill="currentColor" stroke="none"/><circle cx="8.5" cy="15.5" r="1.3" fill="currentColor" stroke="none"/>',
  rozgrywki: '<path class="f" d="M7.5 4h9v5.5a4.5 4.5 0 0 1-9 0z"/><path d="M7.5 6H5a3 3 0 0 0 3 4.2M16.5 6H19a3 3 0 0 1-3 4.2M12 14v3.5M8.5 20.5h7M9.5 17.5h5"/>',
  komiksy: '<path class="f" d="M5 3.5h10.5A3.5 3.5 0 0 1 19 7v13.5H8.5A3.5 3.5 0 0 1 5 17z"/><path d="M9.5 8h5a1.2 1.2 0 0 1 1.2 1.2v2.6A1.2 1.2 0 0 1 14.5 13H12l-2 1.8V13h-.5a1.2 1.2 0 0 1-1.2-1.2V9.2A1.2 1.2 0 0 1 9.5 8z"/>',
  czytanie: '<path class="f" d="M3 5.5c2.2-1 5.8-1.2 9 .8 3.2-2 6.8-1.8 9-.8v13.5c-2.2-1-5.8-1.2-9 .8-3.2-2-6.8-1.8-9-.8z"/><path d="M12 6.3v13.5M15 4.8v5l1.5-1 1.5 1v-5.3"/>',
  zakupy: '<path class="f" d="M5.5 8h13l-1 12.5h-11z"/><path d="M9 10.5V7a3 3 0 0 1 6 0v3.5"/>',
  sprzedaz: '<path class="f" d="M3.5 4.5v7l9 9 8-8-9-9h-7a1 1 0 0 0-1 1z"/><circle cx="8.2" cy="8.2" r="1.6"/>',
  ustawienia: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle class="f" cx="15" cy="7" r="2.3"/><circle class="f" cx="9" cy="17" r="2.3"/>',
  wieczor: '<path class="f" d="M4 20.5l4.5-12 7.5 7.5z"/><path d="M13 3.5l.8 2M20.5 11l-2 .8M17.5 4l-1.2 3M8.5 8.5l7.5 7.5"/>',
  postep: '<path d="M4 20h16"/><path class="f" d="M5 16l4-4.5 3 3L18.5 8V16z" stroke="none"/><path d="M5 16l4-4.5 3 3L18.5 8M15 8h3.5v3.5"/>',
  kopie: '<path class="f" d="M7 18.5a4.2 4.2 0 0 1-.6-8.4 5.8 5.8 0 0 1 11.2-1.3A4.9 4.9 0 0 1 17.5 18.5z"/><path d="M12 11.5v5M9.8 13.6 12 11.4l2.2 2.2"/>',
  kalendarz: '<rect class="f" x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M12 12.6l1 2 2.2.3-1.6 1.5.4 2.2-2-1-2 1 .4-2.2-1.6-1.5 2.2-.3z" fill="currentColor" stroke="none"/>',
  przygrze: '<rect class="f" x="4" y="5" width="10" height="14" rx="1.8" transform="rotate(-8 9 12)"/><rect x="10" y="5" width="10" height="14" rx="1.8"/><path d="M13 9h4M13 12h4"/>',
  wiecej: '<rect class="f" x="4" y="4" width="6.5" height="6.5" rx="1.8"/><rect class="f" x="13.5" y="4" width="6.5" height="6.5" rx="1.8"/><rect class="f" x="4" y="13.5" width="6.5" height="6.5" rx="1.8"/><rect class="f" x="13.5" y="13.5" width="6.5" height="6.5" rx="1.8"/>'
};
window.ikona = function (id, fallback) {
  const p = window.IKONY[id];
  const k = (window.IKONY_KOLOR || {})[id];
  return p ? `<svg class="ic" style="--ik:${k || 'currentColor'}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>` : (fallback || '•');
};
/* Kolory kafelków ikon (wariant „kolorowe”). */
window.IKONY_KOLOR = { planszowki: '#2f6fde', rozgrywki: '#e09b17', komiksy: '#e0242f', czytanie: '#2c9a57', zakupy: '#14a89b', sprzedaz: '#f06a24', wieczor: '#8a3ffc', postep: '#4b5bd6', kopie: '#0f9bd7', ustawienia: '#6b7280', kalendarz: '#d6336c', przygrze: '#b8572a', wiecej: '#3d4654' };
