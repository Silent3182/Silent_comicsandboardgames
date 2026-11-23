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

**listings** – ogłoszenia sprzedaży (wątek sprzedaży)
`itemType ('game'|'comic'), itemId, platform ('olx'|'facebook'|'vinted'|'allegro'), condition, price, shipping, title, text, status ('draft'|'active'|'sold'), soldAt, soldPrice`
Do pozycji: `const item = await DB.get(itemType==='game'?'games':'comics', itemId)`. Okładka: `item.image || item.thumb`.
