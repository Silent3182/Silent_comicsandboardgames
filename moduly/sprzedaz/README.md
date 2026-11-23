# Moduł „Sprzedaż”

Zakładka 💰 **Sprzedaż** w aplikacji Moje kolekcje: wystawianie gier i komiksów na OLX, Allegro, Vinted i Facebooku.

## Pliki
- `sprzedaz.js` – logika (bez interfejsu): tytuły i opisy po polsku, stany, propozycje cen, linki do wyszukiwania cen. Działa offline.
- `sprzedaz-ui.js` – zakładka w aplikacji: lista ogłoszeń i statystyki, wybór pozycji, edytor ogłoszenia. Rejestruje usługę `App.call('sprzedaz.wystaw', {itemType:'game'|'comic', itemId})`.
- `sprzedaz-demo.html` – samodzielna strona do wypróbowania generatora bez reszty aplikacji (otwórz w przeglądarce).

## Jak to działa
1. W karcie gry/komiksu „Wystaw na sprzedaż” (albo w zakładce: „+ Nowe ogłoszenie”).
2. Stan (5 poziomów) i gotowe „ptaszki” (kompletna, koszulki, przeczytany raz…), uwagi, opcjonalnie własne „kilka słów”.
3. Cena: przyciski otwierają wyszukiwania (Ceneo, Allegro nowe/używane, OLX, Vinted, BGG Marketplace, Egmont). Wpisujesz kilka znalezionych cen, a moduł daje 3 propozycje: szybka sprzedaż / rynkowa / maksymalna.
4. Wybór serwisu: tytuł przycinany do limitu serwisu, opis dopasowany (Facebook z emoji i hashtagami, Vinted krótko, bez ceny w treści), podpowiedź stanu i kategorii w formularzu serwisu.
5. „Kopiuj tytuł”, „Kopiuj opis”, „Otwórz serwis” → wklejasz w formularz, dodajesz zdjęcia.
6. „Oznacz jako wystawione” (pozycja dostaje status `forSale`), potem „Sprzedane!” z ceną i datą (`sold`). Statystyki: liczba i wartość wystawionych, ile sprzedano i za ile.

## Ogłoszenie zbiorcze (Facebook / forum)
Przycisk „Ogłoszenie zbiorcze (tytuł – cena)” w zakładce Sprzedaż: zaznaczasz dowolnie wiele gier/komiksów, wpisujesz ceny (podpowiadane z istniejących ogłoszeń), opcjonalnie stan przy tytule i numerację. Wynik to lista „Tytuł - 90 zł” (alfabetycznie) + suma, wysyłka i odbiór. „Oznacz zaznaczone jako wystawione” zapisuje każdą pozycję jako ogłoszenie (`platform: 'facebook'|'forum'`, `batch: true`) i ustawia status `forSale`.

## Jak liczona jest cena (założenie)
- Są ceny używanych → mediana, skorygowana o stan (punkt odniesienia: „bardzo dobry”), maks. 90% najtańszej nowej.
- Są tylko ceny nowych → % najtańszej nowej: w folii 85%, jak nowy 70%, bardzo dobry 60%, dobry 50%, dostateczny 35%.
- Szybka = −12%, maksymalna = +12%, zaokrąglenie do 5 zł.

## Założenia do potwierdzenia
- **Ceny nie są pobierane automatycznie.** Przeglądarka/PWA nie może czytać stron Ceneo, Allegro czy OLX (blokada CORS), a oficjalne API Allegro wymaga rejestracji aplikacji. Dlatego są linki + wpisanie cen. Automat wymagałby małego serwera pośredniczącego albo wersji instalowanej (np. Electron/Capacitor).
- **Ogłoszenia nie są publikowane automatycznie** – serwisy nie dają prostego API dla prywatnych sprzedających; kopiuj‑wklej jest najpewniejsze.
- Ceny paczkomatów na Facebooku (A 15,99 / B 17,99 / C 19,99 zł) to wartości przykładowe – zmień w `DOMYSLNE_USTAWIENIA` w `sprzedaz.js`. OLX, Allegro i Vinted liczą wysyłkę same.
- „Kilka słów” powstaje z danych kolekcji (gracze, czas, wiek, autor, wydawca / seria, tom, zawartość). Opisy z BGG są po angielsku, więc nie są tłumaczone automatycznie – można wpisać własne zdanie.
- Limity tytułów: OLX 70, Allegro 75, Vinted 60 znaków.

## Dane (`listings` w IndexedDB, synchronizowane)
`itemType, itemId, platform, condition, features[], notes, blurb, price, negotiable, shipping (A/B/C), city, pricesNew, pricesUsed, title, text, status ('draft'|'active'|'sold'), soldAt, soldPrice`
