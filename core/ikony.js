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
  wiecej: '<rect class="f" x="4" y="4" width="6.5" height="6.5" rx="1.8"/><rect class="f" x="13.5" y="4" width="6.5" height="6.5" rx="1.8"/><rect class="f" x="4" y="13.5" width="6.5" height="6.5" rx="1.8"/><rect class="f" x="13.5" y="13.5" width="6.5" height="6.5" rx="1.8"/>'
};
window.ikona = function (id, fallback) {
  const p = window.IKONY[id];
  const k = (window.IKONY_KOLOR || {})[id];
  return p ? `<svg class="ic" style="--ik:${k || 'currentColor'}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>` : (fallback || '•');
};
/* Kolory kafelków ikon (wariant „kolorowe”). */
window.IKONY_KOLOR = { planszowki: '#2f6fde', rozgrywki: '#e09b17', komiksy: '#e0242f', czytanie: '#2c9a57', zakupy: '#14a89b', sprzedaz: '#f06a24', wieczor: '#8a3ffc', postep: '#4b5bd6', kopie: '#0f9bd7', ustawienia: '#6b7280', kalendarz: '#d6336c', wiecej: '#3d4654' };

/* Ikony pozostałych funkcji (także modułów w przygotowaniu). */
Object.assign(window.IKONY, {
  start: '<path class="f" d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-4v-6h-5v6h-4A1.5 1.5 0 0 1 4 19z"/>',
  licznik: '<rect class="f" x="5" y="3" width="14" height="18" rx="2.5"/><path d="M8 7h8v3H8z"/><path d="M8.5 14h.01M12 14h.01M15.5 14h.01M8.5 17.5h.01M12 17.5h.01M15.5 17.5h.01" stroke-width="2.6"/>',
  gracze: '<circle class="f" cx="9" cy="8" r="3.5"/><path class="f" d="M2.5 20c.5-3.6 3.2-6 6.5-6s6 2.4 6.5 6z"/><path d="M15.5 4.8a3.3 3.3 0 0 1 0 6.4M18 14.5c2 .8 3.2 2.8 3.5 5.5"/>',
  wyzwania: '<circle class="f" cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><path d="m12 12 7-7M16.5 5H19v2.5"/>',
  podsumowanie: '<rect class="f" x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/><path d="m12 11.8 1 2 2.2.3-1.6 1.5.4 2.2-2-1-2 1 .4-2.2-1.6-1.5 2.2-.3z" fill="currentColor" stroke-width="1"/>',
  zegar: '<path class="f" d="M7 3.5h10M7 20.5h10M8 3.5c0 4 4 5.5 4 8.5s-4 4.5-4 8.5M16 3.5c0 4-4 5.5-4 8.5s4 4.5 4 8.5"/><path d="M9.5 18.5h5l-2.5-3z" fill="currentColor" stroke="none"/>',
  sklep: '<path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16"/><path class="f" d="M7.5 8v8M10 8v8M12.5 8v8M15 8v8M17 8v8" stroke-width="1.6"/>',
  wishlista: '<path class="f" d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.9z"/>',
  wypozyczenia: '<rect class="f" x="3" y="3" width="18" height="18" rx="4" stroke="none"/><path d="M5.5 9h12M14.5 5.5 18 9l-3.5 3.5M18.5 15h-12M9.5 11.5 6 15l3.5 3.5"/>',
  polki: '<path d="M2.5 20.5h19"/><rect class="f" x="4" y="7" width="3.6" height="13.5" rx=".8"/><rect class="f" x="8.8" y="4" width="3.6" height="16.5" rx=".8"/><path class="f" d="m14 7.4 3.4-1 3.9 13.5-3.4 1z"/><path d="M10.6 7.5v2"/>',
  wartosc: '<path class="f" d="M6.5 4h11l3.5 5-9 11L3 9z"/><path d="M3 9h18M9.5 4 8 9l4 11M14.5 4 16 9l-4 11"/>',
  skroty: '<path class="f" d="M13.5 3 5 13.5h6L10 21l9-11h-6z"/>',
  powiadomienia: '<path class="f" d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/>',
  koszulki: '<rect class="f" x="4" y="3.5" width="12" height="16" rx="1.8"/><rect x="8" y="5" width="12" height="16" rx="1.8"/><path d="M11 9.5h6M11 12.5h6M11 15.5h4"/>',
  udostepnianie: '<circle class="f" cx="17.5" cy="5.5" r="2.5"/><circle class="f" cx="6.5" cy="12" r="2.5"/><circle class="f" cx="17.5" cy="18.5" r="2.5"/><path d="m8.7 10.8 6.6-4M8.7 13.2l6.6 4"/>',
  bga: '<circle class="f" cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.4 3.6 5.2 3.6 8.5s-1.1 6.1-3.6 8.5c-2.5-2.4-3.6-5.2-3.6-8.5S9.5 5.9 12 3.5z"/>',
  forum: '<path class="f" d="M4 5.5h11a1.5 1.5 0 0 1 1.5 1.5v6a1.5 1.5 0 0 1-1.5 1.5H9l-3.5 3v-3H4A1.5 1.5 0 0 1 2.5 13V7A1.5 1.5 0 0 1 4 5.5z"/><path d="M16.5 9h3A1.5 1.5 0 0 1 21 10.5V16a1.5 1.5 0 0 1-1.5 1.5H18v2.5l-3-2.5h-3.5a1.5 1.5 0 0 1-1.5-1.5v-1"/>'
});
window.IKONY.sleeve = window.IKONY.koszulki; window.IKONY.sleeves = window.IKONY.koszulki;
window.IKONY.komikspec = window.IKONY.forum; window.IKONY['gry-planszowe'] = window.IKONY.forum;
window.IKONY.udostepnij = window.IKONY.udostepnianie; window.IKONY.wartoscKolekcji = window.IKONY.wartosc;
Object.assign(window.IKONY_KOLOR, {
  start: '#1f3f68', licznik: '#0f8f6f', gracze: '#d6457a', wyzwania: '#c98a0b', podsumowanie: '#7a4fd6',
  zegar: '#3b82c4', sklep: '#2a7f62', wishlista: '#e6a700', wypozyczenia: '#b5651d', polki: '#8b5a2b', wartosc: '#0e9fa8',
  skroty: '#f0a500', powiadomienia: '#e2553d', koszulki: '#5a67d8', sleeve: '#5a67d8', sleeves: '#5a67d8', udostepnianie: '#1d9bf0', udostepnij: '#1d9bf0',
  bga: '#3d7be0', forum: '#6c5ce7', komikspec: '#c0392b', 'gry-planszowe': '#27864a'
});
