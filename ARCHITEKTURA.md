# Moje kolekcje – architektura (wspólna dla wszystkich modułów)

## Technologia
- **PWA w czystym HTML/CSS/JS**, bez kroku budowania, zwykłe skrypty (nie moduły ES), żeby `index.html` działał także z dysku.
- Dane: **IndexedDB** przez globalny `DB` (`core/db.js`). Działa offline.
- Offline: `sw.js` cache'uje pliki aplikacji i okładki (cache-first dla obrazków).
- Instalacja: Android (Chrome → „Dodaj do ekranu głównego”) i komputer (Edge/Chrome → „Zainstaluj aplikację”). Wymaga hostingu https (plan: GitHub Pages; na razie pliki w tym folderze).
- Synchronizacja: plik `kolekcja.json` w OneDrive (`core/sync.js`). Scalanie rekord po rekordzie, wygrywa nowszy `updatedAt`. Usunięcie = `deleted:true`.

## Struktura
```
aplikacja/
  index.html          ← dopisz tu <script> swojego modułu (po core/*)
  style.css           ← wspólne style (klasy: card, row, primary, ghost, muted, grid, tile, chip, badge, toolbar)
  manifest.webmanifest, sw.js, icons/
  core/db.js  core/app.js  core/sync.js
  moduly/planszowki/planszowki.js   (ten wątek)
  moduly/komiksy/…                  (wątek komiksów)
  moduly/sprzedaz/sprzedaz.js       (wątek sprzedaży)
```
Każdy moduł dopisuje swój plik do `sw.js` (lista `FILES`) i do `index.html`.

## API
```js
App.registerModule({ id:'komiksy', title:'Komiksy', icon:'📚', order:20, render(el, params, ctx){} });
// ctx = { db: DB, ui: App.ui, go: App.go }
App.go('planszowki', {gra:'<id>'})        // nawigacja (#/planszowki?gra=…)
App.provide('sprzedaz.wystaw', fn)        // usługa dla innych modułów
App.call('sprzedaz.wystaw', {itemType:'game', itemId})  // w planszówkach jest przycisk „Wystaw na sprzedaż”
App.ui: esc, h, toast, form(title, fields) -> Promise<obj|null>, fmtDate, today

await DB.all(store) / DB.get(store,id) / DB.put(store,obj) / DB.putMany(store,arr) / DB.remove(store,id)
DB.on(store|'*', cb);  DB.setting(key[, value]);  DB.uid()
```
Nowa kolekcja w bazie = dopisz nazwę do `STORES` w `core/db.js` (wersję bazy `db.js` podnosi sam, gdy brakuje kolekcji – nie trzeba nic podbijać).

## Kolekcje (store'y) i pola
Każdy rekord ma: `id` (string), `createdAt`, `updatedAt` (ISO), `deleted` (bool).

**games** – gry planszowe
`bggId, title, year, image, thumb, minPlayers, maxPlayers, playTime, minAge, bggRating, weight, myRating (1–10), designers[], publishers[], categories[], status ('owned'|'forSale'|'sold'|'wishlist'), isExpansion, acquiredAt, pricePaid, notes, tags[]`

**plays** – rozgrywki
`gameId, date ('RRRR-MM-DD'), durationMin, location, notes, players: [{ playerId, score, win (bool), color }]`

**players** – gracze
`name, isMe (bool), color`

**comics** – komiksy (wątek komiksów)
`series, volume, title, origTitle, contents, publisher, year, status ('owned'|'missing'|'forSale'|'sold'), myRating, read (bool), notes, image, thumb`

**readingOrder** – Master Reading Order
`order (liczba), part, title, codes[], read (bool), readAt, comicId?`

**shoppingList** – lista zakupów
`title, itemType ('comic'|'game'|'other'), publisher, releaseDate, price, url, bought (bool), notes`

**loans** – wypożyczenia (moduł `moduly/wypozyczenia`)
`itemType ('game'|'comic'|'other'), itemId, title, person, direction ('out' = pożyczyłem komuś | 'in' = od kogoś), lentAt, dueAt, returnedAt, notes`

Pola dodatkowe (moduły `sklep`, `wartosc`): w **games**, **comics** i **shoppingList** `barcode` (EAN/ISBN, dla kodów czasopism 977… z numerem: `977…+05`); w **games** i **comics** `pricePaid`, `estValue` (moja wycena), `acquiredAt`. Ustawienie `wartoscSerii` = `{seria: {paid, value}}` – cena za tom dla serii komiksów.

Usługi: `App.call('sklep.skanuj')` (skaner → „czy mam?”), `App.call('wypozyczenia.pozycz', {itemType,itemId})`, `App.call('wypozyczenia.przycisk', button, itemType, itemId)`, `App.call('komiksy.seed')` (wczytuje startowe komiksy).

**shelves** – regały (moduł `moduly/polki`)
`name, kind ('kallax'|'regal'), rows, cols, place, notes, cells: {'r-c': 'nazwa przegródki'}, order`
Miejsce rzeczy: pole `polka = {s: id regału, r: rząd od góry, c: kolumna od lewej}` w **games** i **comics**; całe serie komiksów w ustawieniu `polkiSerii = {seria: {s,r,c}}`.
Usługi: `App.call('polki.tekst', itemType, item)` (synchronicznie, np. „Kallax salon · rząd 2, kol. 3”), `App.call('polki.html', …)`, `App.call('polki.przycisk', button, itemType, itemId)`, `App.call('polki.wybierz', itemType, itemId)`.

Lista życzeń (moduł `moduly/wishlista`): gry w **games** ze statusem `wishlist`, pola `wishPriority` (1–5 jak BGG), `plTitle`, `cenaDocelowa`, `ceny = {data, min, max, sklepy, url, hist}`, `promo`. Ceny z planszeo.pl sprawdza telefon (APK) co 3 dni.

Powiadomienia (moduł `moduly/powiadomienia`): APK – @capacitor/local-notifications (premiery z shoppingList, terminy z loans); przeglądarka – przy otwarciu. `App.call('powiadomienia.teraz', tytuł, treść, {go})`.

Widżet Androida (moduł `moduly/widzet` + natywny kod w `android-native/`, wtyczka Capacitor `Widzet`): kolejka MRO na ekranie telefonu i „✓ Przeczytane”.

**events** – kalendarz imprez (moduł `moduly/kalendarz`)
własne: `source:'own', title, start, end ('RRRR-MM-DD'), city, kind ('plansz'|'komiks'|'mieszane'|'fantastyka'|'gry'|'inne'), status ('tak'|'moze'|''), url, notes`
oznaczenia imprez z kalendarza: `id:'kp-<nr>'|'ics-…', source:'mark', status, notes, hidden`
Imprezy z konwenty-poludniowe.pl: APK czyta je sam (CapacitorHttp, ustawienie `kalendarzDane`, synchronizowane), przeglądarka bierze nowszą z wersji z telefonu i `wydarzenia.json` (odświeża co tydzień `.github/workflows/kalendarz.yml` skryptem `moduly/kalendarz/narzedzia/pobierz.py`). Ustawienia: `kalendarz` (filtry, adresy iCal), `kalendarzIcal` (pobrane kalendarze iCal).

**listings** – ogłoszenia sprzedaży (wątek sprzedaży)
`itemType ('game'|'comic'), itemId, platform ('olx'|'facebook'|'vinted'|'allegro'), condition, price, shipping, title, text, status ('draft'|'active'|'sold'), soldAt, soldPrice`
Do pozycji: `const item = await DB.get(itemType==='game'?'games':'comics', itemId)`. Okładka: `item.image || item.thumb`.

**challenges** – wyzwania (moduł `moduly/wyzwania`)
`title, type ('nxn'|'plays'|'distinct'|'shelf'|'game'|'wins'|'read'|'sold'), target, gameId, period ('month'|'year'|'custom'), from, to, archived`

Moduły gracze/licznik/wyzwania/podsumowanie (`moduly/gracze/wspolne.js` = wspólne pomocniki `window.KS`):
- **players** ma też `photo` (dataURL 160×160 JPEG) i `color`. Usługi: `App.call('gracze.avatar', player, size)`, `App.call('licznik.start', gameId)`, `App.call('wyzwania.lista')`.
- **plays** z licznika punktów mają `lowWins: true`, gdy wygrywa najmniej punktów.
- **comics**: `readAt` (data odznaczenia „przeczytane”) – liczone w wyzwaniach i podsumowaniu roku.

**priceHistory** – historia cen (moduł `moduly/historia`, zakładka 📈 Historia cen)
`itemType ('game'|'comic'|'kolekcja'), itemId, title, kind ('zakup'|'wycena'|'ogloszenie'|'sprzedaz'|'rynek'|'snap'), price, date ('RRRR-MM-DD'), platform?, note?, manual?`
Wpisy zbierają się same po zmianach w games/comics/listings/ustawieniach (id wyliczane z treści, np. `ph-zakup-<id>-<data>`, więc dwa urządzenia nie dublują). `snap-RRRR-MM-DD` = stan kolekcji dnia (`value`, `paid`, `count`), liczony usługą `App.call('wartosc.dane')` z modułu wartości.

Asystent głosowy (`moduly/asystent`): polecenia po polsku (Web Speech API w przeglądarce, wtyczka `@capacitor-community/speech-recognition` w APK, zawsze też pole tekstowe). „Brass Silent 145 Andrzej 130” → podgląd rozgrywki do potwierdzenia, zwycięzca z punktów. Ksywki graczy w ustawieniu `asystentAliasy = {ksywka: playerId}` („silent” = gracz `isMe`). `App.call('asystent.wykonaj', tekst)`.

Udostępnianie (`moduly/udostepnij` + strona `kolekcja.html`): link tylko do odczytu. Dozwolone pola: tytuł, rok, bggId, dodatek, opcjonalnie ocena/partie/na sprzedaż/pożyczona/okładka, komiksy jako seria + numery. Nigdy: notatki, ceny, kody, półki, gracze, osoby z wypożyczeń, tokeny. `#k=` = spis skompresowany w linku (deflate-raw + base64url), `#g=` = sekretny Gist (token z uprawnieniem Gists w `DB.local('udostepnijToken')` albo token synchronizacji). Ustawienie `udostepnij`.


## Komunikaty i błędy
- Pytania Tak/Nie: `await App.ui.confirm('Usunąć…?')` – okno aplikacji, nie systemowe. Nie używaj `alert/confirm/prompt` przeglądarki (test to sprawdza).
- Błędy pokazuj przez `App.ui.toast(e)` albo `App.ui.toast('Nie udało się: ' + e.message)` – toast sam zamienia systemowe (angielskie) teksty na polskie. Tekst do wstawienia w stronę: `App.ui.komunikat(e)` (zwraca `null` dla anulowania, np. zamkniętego wyboru pliku).
- Nieobsłużone wyjątki i odrzucone obietnice łapie `core/app.js` i pokazuje komunikat; zakładka, która się wywróci, dostaje komunikat z „Spróbuj ponownie”.

## Wydawanie zmian (jeden wydawca)
- Wątki nie scalają same: otwierają PR i zgłaszają go wątkowi „Wydawaj i testuj wszystkie zmiany”, który scala po kolei, rozwiązuje konflikty i wydaje wersję.
- Każdy PR i każde wydanie przechodzi `node testy/test-aplikacji.js` (GitHub Actions „Testy aplikacji”; APK buduje się dopiero po zielonych testach). Nowy moduł: plik w `index.html` i `sw.js` (FILES), nowa kolekcja w `STORES` w `core/db.js` – inaczej test nie przejdzie.

**Narzędzia gier** (moduł `moduly/przy-grze`, zakładka `przygrze` „Narzędzia gier”: Koszulki, Braki, Czy się pozbyć?, Import partii)
Pola w **games**: `instrukcja` (adres), `zasady` (tekst, jedna zasada w wierszu), `sleeves: [{size, count, w?, h?, zmierzone?}]` (rozmiary z `window.SLEEVE.ROZMIARY`, `size:'wlasny'` + w/h w mm), `sleeveStatus ('none'|'partial'|'done')`, `braki: [{id, text, done, addedAt, doneAt}]`, `zostaje` (bool – wyklucza z rankingu „czy się pozbyć”), `bggPlaysPrzedImportem`.
Rozgrywki z importu: `plays.id` = `bgs-<uuid>` (BG Stats) albo `bggplay-<id>` (BGG), `plays.source`.
Usługi: `App.call('przygrze.sekcja', el, game)` (sekcja „Przy stole” na karcie gry), `App.call('przygrze.aparat', {tytul})` → `{size, w, h}` (pomiar karty aparatem; skala z karty płatniczej 85,6×54 mm), `App.call('przygrze.importPartii', tekst, {podglad})`.

## Gry – dodatki do kolekcji (moduły `moduly/gry-plus`, od 2026-11-24)
- `dane-gry.js` = `window.GRY_DANE`: mechaniki, kategorie, autorzy, liczba graczy i czas dla gier z kolekcji (klucz = bggId), gra bazowa dodatków (`baza`), lista dodatków gier (`dodatki`), 2000 najlepszych gier BGG jako kandydaci do podpowiedzi (`kand`). Źródło: publiczny zestaw danych BGG z TidyTuesday (stan ze stycznia 2022) – BGG blokuje API bez klucza. Generuje `narzedzia/przygotuj.py`.
- `wspolne.js` = `window.GP` (info o grze, partie = aplikacja + bggPlays, gra bazowa dodatku, wymiary pudełek i Kallax, style `gp-*`).
- Zakładki: `rekomendacje` (Co kupić?), `mechaniki` (Mechaniki i autorzy), `dodatki`, `kampanie`, `wymiana` (Wymienię), `przypomnienia` (Dawno nie grane), `pudelka` (Pudełka i Kallax). `ciemny-stol.js` – przycisk 🌙 w licznik/zegar.
- Nowa kolekcja **campaigns**: `gameId, title, name, status ('trwa'|'skonczona'|'porzucona'), scenario, players [{playerId, name, character}], stickers, unlocked, notes, startedAt, log [{id, date, scenario, result, notes}]`. Rozgrywki zapisane z kampanii mają `campaignId`.
- Nowe pola **games**: `baseGameId` (gra bazowa dodatku wybrana ręcznie), `expPlayed`, `pudelko {w,l,h,zrodlo}` (cm), `wymiana`, `wymianaCena`, `wymianaUwagi`. Ustawienia: `rekoUkryte` (bggId), `wymianaTekst`.
- Usługi: `App.call('grplus.sekcja', el, gra)` (sekcja w karcie gry), `pudelka.edytuj`, `pudelka.przegroda` (zajętość w Półkach), `wymiana.przelacz`, `kampanie.nowa`.
- Kafelki Start: moduł może mieć `info()` (async, krótki tekst pod nazwą kafelka) – `core/start.js` je wywołuje.

## Wydajność, okładki offline, polskie tytuły, kopia zdjęć półek
- **Długie listy** (`core/lista.js`): `App.ui.lista(box, items, html, {porcja, klasa, przed, po})` rysuje pierwszą porcję i dokłada kolejne przy przewijaniu (zamiast „Pokaż więcej” i zamiast 1000 kafelków naraz). Kliknięcia obsługuj jednym nasłuchem na `box` (`box.onclick = e => e.target.closest(...)`), bo elementy dochodzą później. Używają: Komiksy (kafelki), Planszówki (kafelki i lista), Do czytania › Zaległe.
- **Okładki offline** (`core/okladki.js`): w przeglądarce okładki zapamiętuje `sw.js`; w APK (bez service workera) każdy `<img>` z zewnętrznym adresem najpierw szuka okładki w Cache Storage „okladki”, a po pierwszym wyświetleniu zapisuje ją tam przez CapacitorHttp. Moduły nic nie zmieniają – zwykłe `<img loading="lazy" src>`. Ustawienia › „Okładki offline”: stan, „Pobierz brakujące”, „Wyczyść”. `window.Okladki.{stan, pobierzBrakujace}`.
- **Polskie tytuły gier** (`moduly/tytuly`): słownik `window.TYTULY_PL` (tytuł BGG → „nazwa|druga”) + własne wpisy w ustawieniu `tytulyPL = {znormalizowany tytuł: [nazwy]}` (pusta lista = brak polskiej nazwy). Dodatki dziedziczą nazwę gry bazowej. API: `Tytuly.pl(gra)`, `Tytuly.nazwy(gra)`, `Tytuly.pasuje(gra, tekst)`, `await Tytuly.ustaw(tytuł, nazwy|null)`; `App.call('tytuly.karta', el, gra)`, `App.call('tytuly.edytuj', tytuł)`. Szukając gry po tytule, używaj `Tytuly.pasuje` / `Tytuly.nazwy` (wyszukiwarka, rozgrywka, licznik, asystent, zdjęcia półek, sklep, lista życzeń, import partii, Kallax).
- **Kopia zdjęć półek** (`moduly/kopia`): obrazy z `DB.local('polkaFoto:<id>')` – komputer: podfolder „Zdjęcia półek” w folderze kopii (tylko nowe, a brakujące u siebie wczytuje stamtąd), telefon: `Dokumenty/MojeKolekcje/ZdjeciaPolek` + plik `zdjecia-polek-RRRR-MM-DD.json` (`{app:'moje-kolekcje-zdjecia', zdjecia:[{id, polka, data, obraz}]}`) wysyłany do OneDrive. Nazwy plików .jpg kończą się `_<id zdjęcia>.jpg`. Przywracanie: Kopie zapasowe › „Przywróć zdjęcia półek…” (.json albo .jpg).
