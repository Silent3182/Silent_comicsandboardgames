/* Rozmiary koszulek (sleeve'ów) na karty – wspólne dla zakładki „Przy grze” i trybu aparatu.
 * Wymiary to nominalny rozmiar KARTY w mm (koszulka danego rozmiaru jest o ~1–3 mm większa).
 * window.SLEEVE = { ROZMIARY, byId(id), nazwa(id|wpis), dopasuj(wMm, hMm) -> [{r, d, ocena}] } */
(function () {
  const ROZMIARY = [
    { id: 'mini-am', nazwa: 'Mini amerykańskie', w: 41, h: 63, kolor: '#e6c229', uwagi: 'małe karty, np. w grach Days of Wonder' },
    { id: 'mini-chim', nazwa: 'Mini Chimera', w: 43, h: 65, kolor: '#c9a227' },
    { id: 'mini-euro', nazwa: 'Mini europejskie', w: 44, h: 68, kolor: '#e0533d', uwagi: 'np. Agricola, Wsiąść do Pociągu' },
    { id: 'catan', nazwa: 'Catan', w: 54, h: 80, kolor: '#8a5a2b', uwagi: 'Osadnicy z Catanu' },
    { id: 'std-am', nazwa: 'Standard amerykańskie', w: 56, h: 87, kolor: '#2c9a57' },
    { id: 'chimera', nazwa: 'Chimera', w: 57.5, h: 89, kolor: '#14a89b' },
    { id: 'jap', nazwa: 'Japońskie (małe CCG)', w: 59, h: 86, kolor: '#8a3ffc', uwagi: 'np. Yu-Gi-Oh!' },
    { id: 'std-euro', nazwa: 'Standard europejskie', w: 59, h: 92, kolor: '#2f6fde', uwagi: 'np. Dominion' },
    { id: 'std-ccg', nazwa: 'Standard (karciane LCG/CCG)', w: 63.5, h: 88, kolor: '#4b5bd6', uwagi: 'np. Magic, Arkham Horror LCG' },
    { id: 'wonders', nazwa: '7 Cudów Świata', w: 65, h: 100, kolor: '#d98a14', uwagi: '7 Cudów Świata' },
    { id: 'sq-70', nazwa: 'Kwadrat 70×70', w: 70, h: 70, kolor: '#5d6673' },
    { id: 'tarot', nazwa: 'Tarot', w: 70, h: 120, kolor: '#b3412e' },
    { id: 'sq-80', nazwa: 'Kwadrat 80×80', w: 80, h: 80, kolor: '#3d4654' },
    { id: 'dixit', nazwa: 'Dixit', w: 80, h: 120, kolor: '#e0242f', uwagi: 'Dixit, Mysterium' }
  ];
  const byId = id => ROZMIARY.find(r => r.id === id) || null;
  const mm = v => String(Math.round(v * 10) / 10).replace('.', ',');
  const wym = r => `${mm(r.w)}×${mm(r.h)} mm`;
  /* Nazwa wpisu z gry: {size:'std-euro'} albo własny {size:'wlasny', w, h} */
  function nazwa(x) {
    if (!x) return '';
    if (typeof x === 'string') x = { size: x };
    const r = byId(x.size);
    if (r) return `${r.nazwa} (${wym(r)})`;
    if (x.w && x.h) return `Własny rozmiar (${mm(x.w)}×${mm(x.h)} mm)`;
    return 'Nieznany rozmiar';
  }
  /* Najbliższe rozmiary dla zmierzonej karty. d = łączna różnica w mm (dodatnia, gdy karta za duża). */
  function dopasuj(w, h) {
    const a = Math.min(w, h), b = Math.max(w, h);
    return ROZMIARY.map(r => {
      const dw = a - r.w, dh = b - r.h;
      const za = Math.max(dw, 0) + Math.max(dh, 0);          // ile karta wystaje ponad rozmiar
      const luz = Math.max(-dw, 0) + Math.max(-dh, 0);        // ile zostaje wolnego miejsca
      const d = Math.abs(dw) + Math.abs(dh);
      const ocena = za > 2.5 ? 'za mała' : d <= 3 ? 'pasuje' : luz <= 7 && za <= 2.5 ? 'luźno' : 'nie pasuje';
      return { r, dw, dh, d, ocena, wynik: d + za * 4 };
    }).sort((x, y) => x.wynik - y.wynik);
  }
  window.SLEEVE = { ROZMIARY, byId, nazwa, dopasuj, wym, mm };
})();
