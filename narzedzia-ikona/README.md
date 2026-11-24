# Ikona aplikacji

`ikona.svg` to źródło ikony (grupa `#bg` = tło, `#fg` = rysunek; ważne elementy w kole o promieniu ~230 px od środka).
Po zmianie uruchom z katalogu repo:

    node narzedzia-ikona/generuj.js narzedzia-ikona/ikona.svg

Skrypt tworzy `icons/icon.svg`, `icons/icon-192.png`, `icons/icon-512.png`, `icons/icon-maskable-512.png`
oraz ikony Androida (zwykłe i adaptacyjne) w `android-native/res/mipmap-*`, które APK bierze przy budowie.
`propozycja-a/b/c.svg` to propozycje z 2026-11-24 (wybrana C).
