# Natywne dodatki do APK (Android)

Kopiowane przez `.github/workflows/apk.yml` do projektu Capacitor przed budową:
- `java/*.java` → `app/src/main/java/pl/silent/mojekolekcje/` (MainActivity rejestruje wtyczkę `Widzet`)
- `res/**` → `app/src/main/res/`
- do `AndroidManifest.xml` dopisywany jest odbiornik widżetu `WidzetCzytanie`.

Widżet „Następny komiks”: pokazuje następną pozycję z Master Reading Order i przycisk „✓ Przeczytane”.
Aplikacja (moduly/widzet/widzet.js) wysyła do widżetu kolejkę ~40 następnych pozycji, a przy otwarciu
odbiera to, co odznaczono na widżecie, i zapisuje jako przeczytane.
