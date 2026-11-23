/*
 * Moduł „Sprzedaż” – generator ogłoszeń dla gier planszowych i komiksów.
 * Działa w 100% offline (czysty JavaScript, bez bibliotek).
 * Użycie: <script src="sprzedaz.js"></script>  →  window.Sprzedaz
 *         lub import przez bundler (module.exports).
 *
 * Kształt pozycji (wszystko poza "typ" i "tytul" jest opcjonalne):
 * {
 *   typ: "gra" | "komiks",
 *   tytul, tytulOryginalny, rok, wydawca,
 *   // gra:
 *   graczeMin, graczeMax, czasMin, czasMax, wiekOd, autorzy: [], mechaniki: [], bggId, jezyk,
 *   // komiks:
 *   seria, numer, scenariusz, rysunki, stron, oprawa, zawartosc,
 *   opisKrotki   // własne „kilka słów” – ma pierwszeństwo przed opisem z szablonu
 * }
 */
(function (root) {
  "use strict";

  // ---------- Platformy ----------
  // Limity długości tytułów wg regulaminów serwisów (stan na 2026 – do weryfikacji, łatwo zmienić).
  var PLATFORMY = {
    olx: {
      nazwa: "OLX", maxTytul: 70, maxOpis: 9000,
      wysylka: "Wysyłka przez Przesyłkę OLX – Paczkomat InPost (koszt po stronie kupującego, wybierany przy zakupie).",
      wystaw: "https://www.olx.pl/d/nowe-ogloszenie/"
    },
    allegro: {
      nazwa: "Allegro", maxTytul: 75, maxOpis: 40000,
      wysylka: "Wysyłka Paczkomatem InPost – koszt widoczny w ofercie. Wysyłam w ciągu 1–2 dni roboczych.",
      wystaw: "https://allegro.pl/offer/create"
    },
    vinted: {
      nazwa: "Vinted", maxTytul: 60, maxOpis: 2000,
      wysylka: "Wysyłka przez Vinted – Paczkomat InPost.",
      wystaw: "https://www.vinted.pl/items/new"
    },
    facebook: {
      nazwa: "Facebook (Marketplace / grupy)", maxTytul: 100, maxOpis: 5000,
      wysylka: null, // budowane z ustawień (koszt paczkomatu)
      wystaw: "https://www.facebook.com/marketplace/create/item"
    }
  };

  // ---------- Stany ----------
  // mnoznik = jaka część ceny NOWEGO egzemplarza to rozsądny punkt startowy, gdy brak cen używanych.
  var STANY = {
    folia:     { etykieta: "Nowy, w folii",            allegro: "Nowy",    vinted: "Nowy z metką",      mnoznik: 0.85 },
    jakNowy:   { etykieta: "Jak nowy",                 allegro: "Używany", vinted: "Nowy bez metki",    mnoznik: 0.70 },
    bardzoDobry:{ etykieta: "Bardzo dobry",            allegro: "Używany", vinted: "Bardzo dobry",      mnoznik: 0.60 },
    dobry:     { etykieta: "Dobry",                    allegro: "Używany", vinted: "Dobry",             mnoznik: 0.50 },
    dostateczny:{ etykieta: "Dostateczny (ślady użycia)", allegro: "Używany", vinted: "Zadowalający",   mnoznik: 0.35 }
  };

  // Gotowe „ptaszki” do opisu stanu.
  var CECHY_STANU = {
    gra: {
      kompletna: "Gra kompletna, wszystkie elementy policzone",
      niewypchnieta: "Żetony niewypchnięte z wyprasek",
      koszulki: "Karty w koszulkach od pierwszej rozgrywki",
      insert: "W pudełku organizer/insert",
      rozegrana1: "Rozegrana tylko raz/kilka razy",
      bezDymu: "Z domu bez zwierząt i dymu",
      polska: "Polska wersja językowa",
      dodatki: "W zestawie dodatki/promki (wypisz w uwagach)"
    },
    komiks: {
      czytany1: "Przeczytany raz, bez załamań grzbietu",
      bezPodpisow: "Bez podpisów, pieczątek i dedykacji",
      folia: "Nieczytany, w folii",
      rogi: "Lekko przetarte rogi",
      bezDymu: "Z domu bez zwierząt i dymu",
      kolekcja: "Z prywatnej kolekcji"
    }
  };

  // Gabaryty paczkomatów InPost i domyślne ceny (ZAŁOŻENIE – edytowalne w ustawieniach).
  var DOMYSLNE_USTAWIENIA = {
    paczkomatGabaryt: "B",
    paczkomatCeny: { A: 15.99, B: 17.99, C: 19.99 },
    odbiorOsobisty: true,
    miasto: "",
    zaokraglenie: 5,          // zaokrąglaj cenę do 5 zł
    hashtagi: true            // tylko Facebook
  };

  // ---------- Pomocnicze ----------
  function pusty(v) { return v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length); }
  function zakres(a, b, jedn) {
    if (pusty(a) && pusty(b)) return "";
    if (pusty(b) || a === b) return a + jedn;
    if (pusty(a)) return b + jedn;
    return a + "–" + b + jedn;
  }
  function zl(n) { return (Math.round(n * 100) / 100).toFixed(2).replace(".", ",").replace(",00", "") + " zł"; }
  function przytnij(t, max) {
    if (t.length <= max) return t;
    var cut = t.slice(0, max - 1);
    var sp = cut.lastIndexOf(" ");
    return (sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,–-]+$/, "") + "…";
  }
  function graczy(n) { return n === 1 ? "gracza" : "graczy"; }
  function mediana(arr) {
    var a = arr.filter(function (x) { return x > 0; }).sort(function (x, y) { return x - y; });
    if (!a.length) return null;
    var m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }
  function zaokraglij(c, krok) {
    krok = krok || 1;
    return Math.max(krok, Math.round(c / krok) * krok);
  }

  // ---------- „Kilka słów” o pozycji ----------
  function kilkaSlow(p) {
    if (!pusty(p.opisKrotki)) return p.opisKrotki.trim();
    var z = [];
    if (p.typ === "gra") {
      var gr = zakres(p.graczeMin, p.graczeMax, "");
      var czas = zakres(p.czasMin, p.czasMax, " min");
      var s = "Gra planszowa";
      if (gr) s += " dla " + gr + " " + graczy(p.graczeMax || p.graczeMin);
      if (czas) s += ", rozgrywka ok. " + czas;
      if (!pusty(p.wiekOd)) s += ", od " + p.wiekOd + " lat";
      z.push(s + ".");
      if (!pusty(p.autorzy)) z.push("Autor: " + [].concat(p.autorzy).join(", ") + ".");
      if (!pusty(p.mechaniki)) z.push("Mechaniki: " + [].concat(p.mechaniki).slice(0, 4).join(", ").toLowerCase() + ".");
      if (!pusty(p.wydawca)) z.push("Wydawca: " + p.wydawca + (p.rok ? " (" + p.rok + ")" : "") + ".");
      if (!pusty(p.jezyk)) z.push("Wersja językowa: " + p.jezyk + ".");
    } else {
      var s2 = "Komiks";
      if (!pusty(p.seria)) s2 += " z kolekcji/serii " + p.seria + (pusty(p.numer) ? "" : " (tom " + p.numer + ")");
      z.push(s2 + ".");
      if (!pusty(p.zawartosc)) z.push("Zawiera: " + p.zawartosc + ".");
      var tw = [];
      if (!pusty(p.scenariusz)) tw.push("scenariusz: " + p.scenariusz);
      if (!pusty(p.rysunki)) tw.push("rysunki: " + p.rysunki);
      if (tw.length) z.push(tw.join(", ").replace(/^./, function (c) { return c.toUpperCase(); }) + ".");
      var wyd = [];
      if (!pusty(p.wydawca)) wyd.push(p.wydawca + (p.rok ? " " + p.rok : ""));
      if (!pusty(p.oprawa)) wyd.push("oprawa " + p.oprawa);
      if (!pusty(p.stron)) wyd.push(p.stron + " stron");
      if (wyd.length) z.push("Wydanie: " + wyd.join(", ") + ".");
    }
    return z.join(" ");
  }

  // ---------- Tytuł ogłoszenia ----------
  function tytul(p, platforma, stanKlucz) {
    var max = PLATFORMY[platforma].maxTytul;
    var t;
    if (p.typ === "gra") {
      t = p.tytul;
      if (!pusty(p.jezyk) && /pol/i.test(p.jezyk)) t += " PL";
      t += " gra planszowa";
      if (stanKlucz === "folia") t += " NOWA w folii";
      else if (stanKlucz === "jakNowy") t += " jak nowa";
    } else {
      t = (pusty(p.seria) ? "" : p.seria + (pusty(p.numer) ? "" : " " + p.numer) + " ") + p.tytul;
      if (!pusty(p.seria) && p.tytul.indexOf(p.seria) === 0) t = p.tytul + (pusty(p.numer) ? "" : " " + p.numer);
      t += " komiks";
      if (stanKlucz === "folia") t += " w folii";
    }
    return przytnij(t.replace(/\s+/g, " ").trim(), max);
  }

  // ---------- Opis ----------
  /**
   * opcje: { platforma, stan, cechy: [klucze z CECHY_STANU], uwagi, cena, ustawienia, negocjacja }
   */
  function generujOgloszenie(p, opcje) {
    opcje = opcje || {};
    var platforma = opcje.platforma || "olx";
    var stanKlucz = opcje.stan || "bardzoDobry";
    var u = Object.assign({}, DOMYSLNE_USTAWIENIA, opcje.ustawienia || {});
    u.paczkomatCeny = Object.assign({}, DOMYSLNE_USTAWIENIA.paczkomatCeny, (opcje.ustawienia || {}).paczkomatCeny || {});
    var P = PLATFORMY[platforma];
    var stan = STANY[stanKlucz];
    var cechySlownik = CECHY_STANU[p.typ === "gra" ? "gra" : "komiks"];
    var cechy = (opcje.cechy || []).map(function (k) { return cechySlownik[k]; }).filter(Boolean);

    var fb = platforma === "facebook";
    var vinted = platforma === "vinted";
    var linie = [];

    var naglowek = p.tytul + (pusty(p.tytulOryginalny) || p.tytulOryginalny === p.tytul ? "" : " (" + p.tytulOryginalny + ")");
    if (!vinted) linie.push((fb ? (p.typ === "gra" ? "🎲 " : "📚 ") : "") + "Sprzedam: " + naglowek);
    linie.push(kilkaSlow(p));
    linie.push("");
    linie.push((fb ? "✅ " : "") + "Stan: " + stan.etykieta.toLowerCase() + ".");
    cechy.forEach(function (c) { linie.push((fb ? "• " : "- ") + c + "."); });
    if (!pusty(opcje.uwagi)) linie.push((fb ? "• " : "- ") + opcje.uwagi.trim().replace(/\.?$/, "."));
    linie.push("");

    if (!pusty(opcje.cena) && (fb || platforma === "olx")) {
      linie.push((fb ? "💰 " : "") + "Cena: " + zl(opcje.cena) + (opcje.negocjacja ? " (do negocjacji)" : "") + ".");
    }

    var wys;
    if (P.wysylka) wys = P.wysylka;
    else {
      var koszt = u.paczkomatCeny[u.paczkomatGabaryt];
      wys = "Wysyłka Paczkomatem InPost (gabaryt " + u.paczkomatGabaryt + ")" + (koszt ? " – " + zl(koszt) + " po stronie kupującego" : "") + ".";
    }
    linie.push((fb ? "📦 " : "") + wys);
    if (u.odbiorOsobisty && !vinted) linie.push("Możliwy odbiór osobisty" + (u.miasto ? " – " + u.miasto : "") + ".");
    if (!vinted) { linie.push(""); linie.push("Zapraszam do kontaktu – chętnie doślę dodatkowe zdjęcia."); }
    if (!vinted && opcje.wiecej) linie.push("Zajrzyj też do moich innych ogłoszeń – łączę wysyłkę.");

    if (fb && u.hashtagi) {
      var tagi = p.typ === "gra" ? ["#planszówki", "#gryplanszowe", "#sprzedam"] : ["#komiksy", "#komiks", "#sprzedam"];
      if (!pusty(p.seria)) tagi.push("#" + p.seria.replace(/[^\p{L}\p{N}]/gu, "").toLowerCase());
      tagi.push("#" + p.tytul.replace(/[^\p{L}\p{N}]/gu, "").toLowerCase());
      linie.push(""); linie.push(tagi.join(" "));
    }

    var opis = linie.join("\n").replace(/\n{3,}/g, "\n\n").trim();
    if (opis.length > P.maxOpis) opis = opis.slice(0, P.maxOpis - 1) + "…";

    return {
      platforma: platforma,
      platformaNazwa: P.nazwa,
      tytul: tytul(p, platforma, stanKlucz),
      opis: opis,
      cena: opcje.cena || null,
      parametry: {
        stan: platforma === "allegro" ? stan.allegro : platforma === "vinted" ? stan.vinted : stan.etykieta,
        kategoria: kategoria(p, platforma),
        wysylka: "Paczkomat InPost" + (P.wysylka ? "" : " " + u.paczkomatGabaryt)
      },
      linkWystaw: P.wystaw,
      ostrzezenia: ostrzezenia(p, opcje)
    };
  }

  function kategoria(p, platforma) {
    var gra = p.typ === "gra";
    switch (platforma) {
      case "olx": return gra ? "Dla dzieci › Zabawki › Gry planszowe (lub Hobby › Gry)" : "Muzyka i Edukacja › Książki › Komiksy";
      case "allegro": return gra ? "Dziecko › Zabawki › Gry › Planszowe" : "Kultura i rozrywka › Książki i komiksy › Komiksy";
      case "vinted": return gra ? "Rozrywka › Gry planszowe" : "Rozrywka › Książki › Komiksy";
      default: return gra ? "Zabawki i gry" : "Książki, filmy i muzyka";
    }
  }

  function ostrzezenia(p, o) {
    var w = [];
    if (pusty(o.cena)) w.push("Brak ceny – wybierz jedną z propozycji.");
    if (p.typ === "gra" && (o.cechy || []).indexOf("kompletna") < 0 && o.stan !== "folia") w.push("Nie zaznaczono, że gra jest kompletna – kupujący często o to pytają.");
    return w;
  }

  // ---------- Ceny ----------
  // Linki do wyszukiwania cen (otwierane w przeglądarce – działają zawsze, także bez kluczy API).
  function linkiCen(p) {
    var q = p.tytul + (p.typ === "gra" ? " gra planszowa" : (pusty(p.seria) ? " komiks" : " " + p.seria + (pusty(p.numer) ? "" : " " + p.numer)));
    var e = encodeURIComponent;
    var qq = e(q);
    var slug = q.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
    var l = [
      { zrodlo: "Ceneo", rodzaj: "nowe", url: "https://www.ceneo.pl/;szukaj-" + qq },
      { zrodlo: "Allegro – nowe", rodzaj: "nowe", url: "https://allegro.pl/listing?string=" + qq + "&stan=nowe&order=p" },
      { zrodlo: "Allegro – używane", rodzaj: "uzywane", url: "https://allegro.pl/listing?string=" + qq + "&stan=używane&order=p" },
      { zrodlo: "OLX", rodzaj: "uzywane", url: "https://www.olx.pl/oferty/q-" + slug + "/" },
      { zrodlo: "Vinted", rodzaj: "uzywane", url: "https://www.vinted.pl/catalog?search_text=" + qq }
    ];
    if (p.typ === "gra") {
      if (p.bggId) l.push({ zrodlo: "BGG Marketplace", rodzaj: "uzywane", url: "https://boardgamegeek.com/market/browse?objecttype=thing&objectid=" + e(p.bggId) });
      l.push({ zrodlo: "Ceneo – kategoria Gry planszowe", rodzaj: "nowe", url: "https://www.ceneo.pl/Gry_planszowe;szukaj-" + e(p.tytul) });
    } else {
      l.push({ zrodlo: "Egmont (sklep wydawcy)", rodzaj: "nowe", url: "https://egmont.pl/szukaj?query=" + e(p.tytul) });
    }
    return l;
  }

  /**
   * Proponuje 3 ceny na podstawie zebranych cen.
   * dane: { nowe: [liczby], uzywane: [liczby], stan, krok }
   * Zwraca { szybka, rynkowa, maks, podstawa, opis } lub null.
   */
  function proponujCeny(dane) {
    var stan = STANY[dane.stan || "bardzoDobry"];
    var krok = dane.krok || DOMYSLNE_USTAWIENIA.zaokraglenie;
    var mU = mediana(dane.uzywane || []);
    var nowe = (dane.nowe || []).filter(function (x) { return x > 0; });
    var minN = nowe.length ? Math.min.apply(null, nowe) : null;
    var baza, podstawa;

    if (mU) {
      // Mediana ofert używanych zakłada typowy stan „bardzo dobry” – korygujemy o różnicę stanu.
      baza = mU * (stan.mnoznik / STANY.bardzoDobry.mnoznik);
      podstawa = "mediana " + (dane.uzywane.length) + " ofert używanych (" + zl(mU) + "), skorygowana o stan";
      if (minN && baza > minN * 0.95) { baza = minN * 0.9; podstawa += ", ograniczona do 90% najtańszej nowej"; }
    } else if (minN) {
      baza = minN * stan.mnoznik;
      podstawa = Math.round(stan.mnoznik * 100) + "% najtańszej nowej (" + zl(minN) + ")";
    } else return null;

    return {
      szybka: zaokraglij(baza * 0.88, krok),
      rynkowa: zaokraglij(baza, krok),
      maks: zaokraglij(baza * 1.12, krok),
      podstawa: podstawa
    };
  }

  // ---------- Historia sprzedaży (do statystyk kolekcji) ----------
  // Zwraca rekord, który aplikacja może zapisać w bazie przy pozycji.
  function rekordOgloszenia(p, wynik, extra) {
    return Object.assign({
      pozycjaId: p.id || null,
      platforma: wynik.platforma,
      tytul: wynik.tytul,
      cena: wynik.cena,
      status: "wystawione",          // wystawione | zarezerwowane | sprzedane | wycofane
      dataWystawienia: new Date().toISOString(),
      dataSprzedazy: null,
      cenaSprzedazy: null
    }, extra || {});
  }

  // ---------- Adapter: rekord z bazy aplikacji (games/comics) → pozycja ----------
  function zRekordu(item, itemType) {
    if (!item) return null;
    if (itemType === "game") {
      return {
        typ: "gra", id: item.id, tytul: item.title, rok: item.year, bggId: item.bggId,
        graczeMin: item.minPlayers, graczeMax: item.maxPlayers, czasMin: item.playTime, czasMax: item.playTime,
        wiekOd: item.minAge, autorzy: item.designers || [], wydawca: (item.publishers || [])[0],
        opisKrotki: item.saleBlurb || ""
      };
    }
    return {
      typ: "komiks", id: item.id, tytul: item.title || item.origTitle || "", tytulOryginalny: item.origTitle,
      seria: item.series, numer: item.volume, zawartosc: item.contents, wydawca: item.publisher, rok: item.year,
      opisKrotki: item.saleBlurb || ""
    };
  }

  // ---------- Ogłoszenie zbiorcze: „tytuł – cena” ----------
  /**
   * pozycje: [{ tytul, cena, stan? (klucz STANY), uwagi? }]
   * opcje: { platforma: 'facebook'|'forum', pokazStan, numeruj, naglowek, ustawienia, negocjacja, typ: 'gra'|'komiks'|'mix' }
   * Zwraca { tekst, suma, liczba }.
   */
  function generujZbiorcze(pozycje, opcje) {
    opcje = opcje || {};
    var u = Object.assign({}, DOMYSLNE_USTAWIENIA, opcje.ustawienia || {});
    u.paczkomatCeny = Object.assign({}, DOMYSLNE_USTAWIENIA.paczkomatCeny, (opcje.ustawienia || {}).paczkomatCeny || {});
    var fb = (opcje.platforma || "facebook") === "facebook";
    var typ = opcje.typ || "gra";
    var co = typ === "komiks" ? "komiksy" : typ === "mix" ? "gry i komiksy" : "gry planszowe";
    var lista = pozycje.filter(function (x) { return x && x.tytul; })
      .slice().sort(function (a, b) { return a.tytul.localeCompare(b.tytul, "pl"); });
    var L = [];
    L.push(pusty(opcje.naglowek) ? (fb ? (typ === "komiks" ? "📚 " : "🎲 ") : "") + "Sprzedam " + co + ":" : opcje.naglowek.trim());
    L.push("");
    lista.forEach(function (x, i) {
      var t = (opcje.numeruj ? (i + 1) + ". " : "") + x.tytul;
      if (opcje.pokazStan && x.stan && STANY[x.stan]) t += " (" + STANY[x.stan].etykieta.toLowerCase() + (pusty(x.uwagi) ? "" : ", " + x.uwagi) + ")";
      else if (!pusty(x.uwagi)) t += " (" + x.uwagi + ")";
      t += " - " + (x.cena ? zl(x.cena) : "cena do uzgodnienia");
      L.push(t);
    });
    L.push("");
    if (opcje.negocjacja) L.push("Ceny do negocjacji, przy zakupie kilku pozycji rabat.");
    var koszt = u.paczkomatCeny[u.paczkomatGabaryt];
    L.push((fb ? "📦 " : "") + "Wysyłka Paczkomatem InPost" + (koszt ? " – " + zl(koszt) + " (przy kilku pozycjach jedna paczka)" : "") + ".");
    if (u.odbiorOsobisty && u.miasto) L.push("Możliwy odbiór osobisty – " + u.miasto + ".");
    L.push("Stan i zdjęcia na priv – chętnie odpowiem na pytania.");
    if (fb && u.hashtagi) L.push("", typ === "komiks" ? "#komiksy #sprzedam" : "#planszówki #gryplanszowe #sprzedam");
    var suma = lista.reduce(function (a, x) { return a + (x.cena || 0); }, 0);
    return { tekst: L.join("\n").replace(/\n{3,}/g, "\n\n").trim(), suma: suma, liczba: lista.length };
  }

  root.Sprzedaz = {
    generujZbiorcze: generujZbiorcze,
    zRekordu: zRekordu,
    PLATFORMY: PLATFORMY, STANY: STANY, CECHY_STANU: CECHY_STANU, DOMYSLNE_USTAWIENIA: DOMYSLNE_USTAWIENIA,
    generujOgloszenie: generujOgloszenie, kilkaSlow: kilkaSlow, linkiCen: linkiCen,
    proponujCeny: proponujCeny, rekordOgloszenia: rekordOgloszenia, _mediana: mediana
  };
  if (typeof module !== "undefined" && module.exports) module.exports = root.Sprzedaz;
})(typeof window !== "undefined" ? window : globalThis);
