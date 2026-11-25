/* Półki ze zdjęć (25.11.2026): regały Anety i to, co na nich stało na zdjęciach z folderu „półki z grami”.
 * Przy pierwszym uruchomieniu po aktualizacji (gdy kolekcja z BGG jest już wczytana):
 *  - zakłada brakujące regały (stałe id, więc na drugim urządzeniu nie powstaną podwójne),
 *  - stawia gry na półkach (tylko te, które nie mają jeszcze zapisanego miejsca – ręcznych zmian nie rusza),
 *  - dodaje do kolekcji gry ze zdjęć, których w niej nie było (status „w kolekcji”, źródło „półki”),
 *  - gry z listy życzeń, które stoją na półce, przenosi do kolekcji.
 * Raport: ustawienie 'polkiUkladRaport', widoczny w zakładce Półki (karta „Rozmieszczenie ze zdjęć”).
 * Wiersz gry: [regał, rząd od góry, kolumna od lewej, tytuł (jak w BGG), bggId|null, dodatek 0/1, nazwa na pudełku (opcjonalnie)]
 */
(function () {
  const WERSJA = '2026-11-25';
  const REGALY = [
    { id: 'salon-regal', name: 'Regał salon', kind: 'regal', rows: 7, cols: 3, place: 'salon', order: 0, notes: 'Kolumna 1 = wąska z lewej. Najwyższa półka nad kolumnami 2–3 jest wspólna: lewa połowa = kol. 2, prawa = kol. 3.' },
    { id: 'salon-kallax-4x2', name: 'Kallax salon 4×2', kind: 'kallax', rows: 4, cols: 2, place: 'salon', order: 1 },
    { id: 'salon-kallax-4x4', name: 'Kallax salon 4×4', kind: 'kallax', rows: 4, cols: 4, place: 'salon', order: 2 },
    { id: 'przedpokoj-narozny', name: 'Regał narożny', kind: 'regal', rows: 8, cols: 1, place: 'przedpokój', order: 3 },
    { id: 'przedpokoj-maly', name: 'Regał przy drzwiach', kind: 'regal', rows: 2, cols: 1, place: 'przedpokój', order: 4 },
    { id: 'przedpokoj-szafka', name: 'Biała szafka', kind: 'regal', rows: 1, cols: 1, place: 'pokój dziecka', order: 5 },
    { id: 'szafa', name: 'Szafa', kind: 'regal', rows: 2, cols: 1, place: 'szafa', order: 6 }
  ];
  const GRY = [
    ["salon-regal", 1, 1, "Carcassonne: Towers & Thieves", 21385, 1, "Carcassonne: Wieża (Der Turm)"],
    ["salon-regal", 1, 1, "Nyet!", 1107, 0],
    ["salon-regal", 1, 2, "Boonlake", 343905, 0],
    ["salon-regal", 1, 2, "Underwater Cities", 247763, 0],
    ["salon-regal", 1, 2, "Underwater Cities: New Discoveries", 276104, 1],
    ["salon-regal", 1, 2, "Bonfire", 304420, 0],
    ["salon-regal", 1, 2, "The Prodigals Club", 181796, 0, "Klub Utracjuszy"],
    ["salon-regal", 1, 2, "Trajan", 102680, 0],
    ["salon-regal", 1, 2, "Carpe Diem", 245934, 0],
    ["salon-regal", 1, 2, "The Castles of Burgundy", 84876, 0, "Zamki Burgundii"],
    ["salon-regal", 1, 3, "Lorenzo il Magnifico", 203993, 0],
    ["salon-regal", 1, 3, "Badacze Głębin", null, 0],
    ["salon-regal", 1, 3, "Barrage: The Leeghwater Project", 263711, 1],
    ["salon-regal", 1, 3, "Barrage", 251247, 0],
    ["salon-regal", 1, 3, "Terra Mystica", 120677, 0],
    ["salon-regal", 1, 3, "Terra Mystica: Merchants of the Seas", 280885, 1, "Terra Mystica: Kupcy morscy (Obchodníci)"],
    ["salon-regal", 1, 3, "Hansa Teutonica", 43015, 0],
    ["salon-regal", 2, 1, "Age of Civilization", 264647, 0],
    ["salon-regal", 2, 1, "Archipelago: War & Peace", 154863, 1],
    ["salon-regal", 2, 2, "Citadels", 478, 0],
    ["salon-regal", 2, 2, "Viticulture Essential Edition", 183394, 0],
    ["salon-regal", 2, 2, "Dixit 2 (Quest)", 55660, 1],
    ["salon-regal", 2, 2, "Ironwood", null, 0],
    ["salon-regal", 2, 2, "Dune: Imperium", 316554, 0],
    ["salon-regal", 2, 3, "La Cosa Nostra", 151771, 0],
    ["salon-regal", 2, 3, "Witch's Brew", 34084, 0],
    ["salon-regal", 2, 3, "Zoo Tycoon: The Board Game", null, 0],
    ["salon-regal", 2, 3, "Zoo Tycoon: New Species", null, 1],
    ["salon-regal", 2, 3, "Perseverance: dodatek z Kickstartera (do części 3 i 4)", null, 1],
    ["salon-regal", 3, 1, "Micro City", null, 0],
    ["salon-regal", 3, 1, "Kingdomino Duel", 281960, 0],
    ["salon-regal", 3, 1, "Gang of Four", 3085, 0],
    ["salon-regal", 3, 1, "Neuroshima: Convoy", 120605, 0, "Neuroshima: Konwój"],
    ["salon-regal", 3, 2, "Yspahan", 22345, 0],
    ["salon-regal", 3, 2, "Vikings", 27173, 0, "Wikingowie"],
    ["salon-regal", 3, 2, "Portobello Market", 27356, 0],
    ["salon-regal", 3, 2, "Metropolys", 25568, 0],
    ["salon-regal", 3, 2, "Caylus", 18602, 0],
    ["salon-regal", 3, 2, "Puerto Rico", 3076, 0],
    ["salon-regal", 3, 2, "In the Year of the Dragon", 31594, 0],
    ["salon-regal", 3, 2, "Viticulture: Visit from the Rhine Valley", 248929, 1],
    ["salon-regal", 3, 2, "Diuna: Wojna o Arrakis – Przemytnicy", null, 1],
    ["salon-regal", 3, 3, "Irish Gauge", 161882, 0],
    ["salon-regal", 3, 3, "Paladyni Zachodniego Królestwa", 266810, 0],
    ["salon-regal", 3, 3, "Údolí králů (Dolina Królów)", null, 0],
    ["salon-regal", 3, 3, "Le Havre", 35677, 0],
    ["salon-regal", 3, 3, "Agricola", 31260, 0],
    ["salon-regal", 3, 3, "Caverna: The Cave Farmers", 102794, 0, "Caverna"],
    ["salon-regal", 3, 3, "Princes of the Renaissance: Expansion Bundle", 214924, 1, "Princes of the Renaissance"],
    ["salon-regal", 4, 1, "Rory's Story Cubes: Actions", null, 0],
    ["salon-regal", 4, 2, "Reef Route", 209850, 0],
    ["salon-regal", 4, 2, "Rory's Story Cubes", 20545, 0],
    ["salon-regal", 4, 2, "Galaxy Trucker", 31481, 0],
    ["salon-regal", 4, 2, "Shipyard", 55600, 0, "Die Werft (Shipyard)"],
    ["salon-regal", 4, 2, "Goa", 9216, 0],
    ["salon-regal", 4, 2, "Troyes", 73439, 0],
    ["salon-regal", 4, 2, "Stone Age", 34635, 0],
    ["salon-regal", 4, 2, "The Networks: Primetime", 72321, 0, "The Networks"],
    ["salon-regal", 4, 2, "The Networks: Executives", 226711, 1],
    ["salon-regal", 4, 3, "Szczury z Wistar", null, 0],
    ["salon-regal", 4, 3, "The Manhattan Project: Energy Empire", 176734, 0],
    ["salon-regal", 4, 3, "Russian Railroads", 144733, 0, "Rosyjskie Koleje"],
    ["salon-regal", 4, 3, "Russian Railroads: German Railroads", 181693, 1],
    ["salon-regal", 4, 3, "Ewakuacja", null, 0],
    ["salon-regal", 4, 3, "Projekt Gaja: Zaginiona Flota", 396802, 1],
    ["salon-regal", 4, 3, "Golem", null, 0],
    ["salon-regal", 4, 3, "Orléans", 164928, 0],
    ["salon-regal", 5, 1, "Jungle Speed", 8098, 0],
    ["salon-regal", 5, 1, "Saboteur", 9220, 0, "Sabotażysta"],
    ["salon-regal", 5, 1, "BANG!", 3955, 0],
    ["salon-regal", 5, 1, "Tichu", 215, 0],
    ["salon-regal", 5, 1, "Bohnanza", 11, 0, "Fasolki"],
    ["salon-regal", 5, 1, "The Game", null, 0],
    ["salon-regal", 5, 1, "Cockroach Salad", 32341, 0, "Karaluchy – sałatka"],
    ["salon-regal", 5, 2, "Space Dealer", 23451, 0],
    ["salon-regal", 5, 2, "Dungeon Petz", 97207, 0],
    ["salon-regal", 5, 2, "World Without End", 43528, 0, "Świat bez końca"],
    ["salon-regal", 5, 2, "Ticket to Ride: Märklin", 31627, 0],
    ["salon-regal", 5, 2, "7 Wonders", 68448, 0, "7 Cudów Świata"],
    ["salon-regal", 5, 2, "Santa Maria", 229220, 0],
    ["salon-regal", 5, 2, "Neuroshima Hex!: Rok Molocha", 21241, 1],
    ["salon-regal", 5, 3, "Shadows over Camelot", 15062, 0],
    ["salon-regal", 5, 3, "Cleopatra and the Society of Architects", 22141, 0],
    ["salon-regal", 5, 3, "Colosseum", 27746, 0],
    ["salon-regal", 5, 3, "Dead of Winter: The Long Night", 193037, 0, "Martwa Zima"],
    ["salon-regal", 5, 3, "Flamme Rouge", 199478, 0],
    ["salon-regal", 5, 3, "Mall of Horror", 16772, 0],
    ["salon-regal", 5, 3, "Hegemony", null, 0],
    ["salon-regal", 6, 2, "The Hobbit", 83629, 0, "Hobbit"],
    ["salon-regal", 6, 2, "Dominion", 36218, 0],
    ["salon-regal", 6, 2, "Neuroshima Hex", 21241, 0],
    ["salon-regal", 6, 2, "Splendor: Marvel", 293296, 0],
    ["salon-regal", 6, 2, "Bootleggers", 12477, 0],
    ["salon-regal", 6, 2, "Karak", 241477, 0],
    ["salon-regal", 6, 2, "Ra", 12, 0],
    ["salon-regal", 6, 3, "GIPF", 527, 0],
    ["salon-regal", 6, 3, "TZAAR", 31999, 0],
    ["salon-regal", 6, 3, "DVONN", 2346, 0],
    ["salon-regal", 6, 3, "PÜNCT", null, 0],
    ["salon-regal", 6, 3, "YINSH", 7854, 0],
    ["salon-regal", 6, 3, "Marvel D.A.G.G.E.R.", null, 0],
    ["salon-regal", 6, 3, "Innovation Ultimate", null, 0],
    ["salon-regal", 7, 2, "Blokus", 2453, 0],
    ["salon-regal", 7, 2, "Isle of Skye: From Chieftain to King", 176494, 0, "Wyspa Skye"],
    ["salon-regal", 7, 2, "Babilon", null, 0],
    ["salon-regal", 7, 2, "Scotland Yard", 438, 0],
    ["salon-regal", 7, 2, "Samurai", 3, 0, "Samuraj"],
    ["salon-regal", 7, 2, "El Grande", 93, 0, "El Grande (pierwsze wydanie niemieckie)"],
    ["salon-regal", 7, 2, "Emira", 18931, 0],
    ["salon-regal", 7, 2, "Confucius", 32014, 0],
    ["salon-regal", 7, 2, "Rheinländer", 111, 0],
    ["salon-regal", 7, 2, "Power Grid", 2651, 0, "Wysokie napięcie"],
    ["salon-regal", 7, 2, "Power Grid: Benelux/Central Europe", 25031, 1, "Wysokie napięcie: Benelux / Europa Środkowa"],
    ["salon-regal", 7, 2, "Power Grid: The New Power Plants – Set 1", 29416, 1, "Wysokie napięcie: Nowe elektrownie"],
    ["salon-regal", 7, 3, "Railways of Europe", 30450, 1],
    ["salon-regal", 7, 3, "Railroad Tycoon: The Boardgame", 17133, 0, "Railroad Tycoon"],
    ["salon-regal", 7, 3, "Lords of Waterdeep – dodatek", null, 1],
    ["salon-regal", 7, 3, "Lords of Waterdeep", 110327, 0],
    ["salon-regal", 7, 3, "Lords of Waterdeep: Scoundrels of Skullport", 134342, 1],
    ["salon-regal", 7, 3, "Age of Empires III: The Age of Discovery", 22545, 0, "Age of Empires III"],
    ["salon-regal", 7, 3, "Shogun: Tenno's Court", 74823, 1, "Szogun: Dwór Tenno"],
    ["salon-regal", 7, 3, "Shogun", 20551, 0],
    ["salon-kallax-4x2", 1, 1, "Robinson Crusoe: Adventure on the Cursed Island", 121921, 0, "Robinson Crusoe (edycja kolekcjonerska)"],
    ["salon-kallax-4x2", 1, 1, "Voidfall", null, 0],
    ["salon-kallax-4x2", 1, 2, "Too Many Bones", 192135, 0],
    ["salon-kallax-4x2", 1, 2, "Vast: The Crystal Caverns", 170416, 0],
    ["salon-kallax-4x2", 1, 2, "Vast: The Haunted Hallways", 284666, 1],
    ["salon-kallax-4x2", 1, 2, "Vast: Miniatures Expansion", null, 1],
    ["salon-kallax-4x2", 1, 2, "Vast: The Mysterious Manor", 252399, 0],
    ["salon-kallax-4x2", 1, 2, "Vast: The Fearsome Foes", 234757, 1],
    ["salon-kallax-4x2", 2, 1, "Legendary Encounters: An Alien Deck Building Game", 146652, 0, "Legendary Encounters: Alien"],
    ["salon-kallax-4x2", 2, 1, "Perseverance: Castaway Chronicles – Episodes 1 & 2", 256997, 0, "Perseverance: Episodes 1 & 2"],
    ["salon-kallax-4x2", 2, 2, "Galactic Cruise", null, 0],
    ["salon-kallax-4x2", 2, 2, "Eclipse: Drugi Świt Galaktyki", 246900, 0],
    ["salon-kallax-4x2", 3, 1, "Legendary Encounters: A Predator Deck Building Game", 174570, 0, "Legendary Encounters: Predator"],
    ["salon-kallax-4x2", 3, 1, "Perseverance: Episodes 3 & 4", null, 0],
    ["salon-kallax-4x2", 3, 2, "Anachrony: Infinity Box", 278292, 0],
    ["salon-kallax-4x2", 3, 2, "Marvel Zombies: Sentinel Strike", null, 0],
    ["salon-kallax-4x2", 4, 1, "Marvel Dice Throne", null, 0],
    ["salon-kallax-4x2", 4, 1, "Gloomhaven", 174430, 0],
    ["salon-kallax-4x2", 4, 2, "Descent: Legendy Mroku", null, 0],
    ["salon-kallax-4x4", 1, 1, "Wędrowcy z Południowego Tygrysu", null, 0],
    ["salon-kallax-4x4", 1, 1, "Mędrcy z Południowego Tygrysu", null, 0],
    ["salon-kallax-4x4", 1, 1, "Woodcraft", 355093, 0],
    ["salon-kallax-4x4", 1, 1, "Mille Fiori", null, 0],
    ["salon-kallax-4x4", 1, 2, "Brian Boru: High King of Ireland", 337765, 0, "Brian Boru"],
    ["salon-kallax-4x4", 1, 2, "Flamme Rouge: Peloton", 229941, 1],
    ["salon-kallax-4x4", 1, 2, "Coimbra", 245638, 0],
    ["salon-kallax-4x4", 1, 2, "Merv: The Heart of the Silk Road", 306040, 0, "Merv"],
    ["salon-kallax-4x4", 1, 2, "Tzolk'in: The Mayan Calendar", 126163, 0, "Tzolk'in"],
    ["salon-kallax-4x4", 1, 3, "Nucleum: Australia", null, 1],
    ["salon-kallax-4x4", 1, 3, "Nucleum", null, 0],
    ["salon-kallax-4x4", 1, 3, "Teotihuacan: Late Preclassic Period", 270364, 1, "Teotihuacan: Późny okres preklasyczny"],
    ["salon-kallax-4x4", 1, 3, "Teotihuacan: Shadow of Xitle", 293473, 1, "Teotihuacan: Cień Xitle"],
    ["salon-kallax-4x4", 1, 3, "Teotihuacan: City of Gods", 229853, 0, "Teotihuacan: Miasto Bogów"],
    ["salon-kallax-4x4", 1, 3, "Tekhenu: Time of Seth", 341943, 1, "Tekhenu: Czas Seta"],
    ["salon-kallax-4x4", 1, 4, "Tekhenu: Obelisk of the Sun", 297030, 0, "Tekhenu: Obelisk Słońca"],
    ["salon-kallax-4x4", 1, 4, "Tawantinsuyu: The Inca Empire", 306481, 0, "Tawantinsuyu"],
    ["salon-kallax-4x4", 1, 4, "Tabannusi: Builders of Ur", 316786, 0, "Tabannusi"],
    ["salon-kallax-4x4", 1, 4, "Tiletum", null, 0],
    ["salon-kallax-4x4", 1, 4, "Legendary Encounters: Alien Covenant", 285158, 1],
    ["salon-kallax-4x4", 2, 1, "Era Innowacji", null, 0],
    ["salon-kallax-4x4", 2, 1, "Projekt Gaja", 220308, 0],
    ["salon-kallax-4x4", 2, 1, "Zombicide: Green Horde", 224710, 0, "Zombicide: Zielona Horda"],
    ["salon-kallax-4x4", 2, 1, "Marrakech", 29223, 0],
    ["salon-kallax-4x4", 2, 2, "Bitoku", 323612, 0],
    ["salon-kallax-4x4", 2, 2, "Everdell", 199792, 0],
    ["salon-kallax-4x4", 2, 2, "Brazil: Imperial", 249277, 0],
    ["salon-kallax-4x4", 2, 2, "Terraforming Mars", 167791, 0, "Terraformacja Marsa"],
    ["salon-kallax-4x4", 2, 3, "Stronghold: Undead (Second Edition) – Kickstarter Edition", 206593, 0, "Stronghold: Undead"],
    ["salon-kallax-4x4", 2, 3, "Brass: Lancashire", 28720, 0],
    ["salon-kallax-4x4", 2, 3, "Brass: Birmingham", 224517, 0],
    ["salon-kallax-4x4", 2, 3, "Archipelago", 105551, 0],
    ["salon-kallax-4x4", 2, 4, "Great Western Trail", 193738, 0],
    ["salon-kallax-4x4", 2, 4, "Maracaibo", 276025, 0],
    ["salon-kallax-4x4", 2, 4, "Cooper Island", 269511, 0],
    ["salon-kallax-4x4", 3, 1, "Diuna: Wojna o Arrakis", null, 0],
    ["salon-kallax-4x4", 3, 1, "Ark Nova", 342942, 0],
    ["salon-kallax-4x4", 3, 2, "The 7th Continent", 180263, 0],
    ["salon-kallax-4x4", 3, 2, "Carnegie", 310873, 0],
    ["salon-kallax-4x4", 3, 3, "Age of Steam", 4098, 0],
    ["salon-kallax-4x4", 3, 3, "Praga Caput Regni", 308765, 0],
    ["salon-kallax-4x4", 3, 3, "CO₂: Second Chance", 214887, 0],
    ["salon-kallax-4x4", 3, 4, "The Gallerist", 125153, 0],
    ["salon-kallax-4x4", 3, 4, "Inventions: Ewolucja Idei", null, 0],
    ["salon-kallax-4x4", 3, 4, "Weather Machine", 237179, 0],
    ["salon-kallax-4x4", 3, 4, "Beyond the Sun", 317985, 0],
    ["salon-kallax-4x4", 4, 1, "Clash of Cultures", null, 0],
    ["salon-kallax-4x4", 4, 1, "Tyrants of the Underdark", 189932, 0],
    ["salon-kallax-4x4", 4, 2, "The 7th Citadel", null, 0],
    ["salon-kallax-4x4", 4, 2, "51. Stan: Ultimate Edition", null, 0],
    ["salon-kallax-4x4", 4, 2, "Wingspan", 266192, 0, "Na skrzydłach"],
    ["salon-kallax-4x4", 4, 3, "Speakeasy", null, 0],
    ["salon-kallax-4x4", 4, 3, "Civolution", null, 0],
    ["salon-kallax-4x4", 4, 4, "Foundations of Rome", null, 0],
    ["przedpokoj-narozny", 1, 1, "ISS Vanguard", 325494, 0],
    ["przedpokoj-narozny", 2, 1, "Rezerwat", null, 0],
    ["przedpokoj-narozny", 2, 1, "Etherfields (Polish edition)", 280794, 0, "Etherfields"],
    ["przedpokoj-narozny", 3, 1, "Aeon's End: Nowy Początek", null, 0],
    ["przedpokoj-narozny", 3, 1, "Trickerion: Collector's Edition", 255668, 0],
    ["przedpokoj-narozny", 3, 1, "Diuna: Wojna o Arrakis – Gildia Kosmiczna", null, 1],
    ["przedpokoj-narozny", 4, 1, "Marvel Zombies: Rewolucja X-Men", null, 0],
    ["przedpokoj-narozny", 4, 1, "Marvel Zombies", null, 0],
    ["przedpokoj-narozny", 5, 1, "Cthulhu: Death May Die – Season 2 Expansion", 256972, 1, "Cthulhu: Death May Die – Sezon 2"],
    ["przedpokoj-narozny", 5, 1, "Cthulhu: Death May Die", 253344, 0],
    ["przedpokoj-narozny", 5, 1, "Dragonbane", null, 0],
    ["przedpokoj-narozny", 6, 1, "Tainted Grail: Wiek Legend i Ostatni Rycerz", null, 1],
    ["przedpokoj-narozny", 6, 1, "Tainted Grail: Upadek Avalonu", 264220, 0],
    ["przedpokoj-narozny", 6, 1, "Bärenpark", 219513, 0, "Park Niedźwiedzi"],
    ["przedpokoj-narozny", 7, 1, "Marvel United: The Infinity Gauntlet", 303599, 1],
    ["przedpokoj-narozny", 7, 1, "Marvel United: Rise of the Black Panther", 302669, 1],
    ["przedpokoj-narozny", 7, 1, "Marvel United: Enter the Spider-Verse", 303600, 1],
    ["przedpokoj-narozny", 7, 1, "Marvel United: Tales of Asgard", 302668, 1],
    ["przedpokoj-narozny", 7, 1, "Marvel United", 298047, 0],
    ["przedpokoj-narozny", 7, 1, "Władca Pierścieni: Pojedynek o Śródziemie", null, 0],
    ["przedpokoj-narozny", 8, 1, "Harry Potter: Hogwarts Battle", 199042, 0],
    ["przedpokoj-narozny", 8, 1, "King of Tokyo", 70323, 0, "Potwory w Tokio"],
    ["przedpokoj-narozny", 8, 1, "Nogi za pas!", 41636, 0],
    ["przedpokoj-narozny", 8, 1, "Marvel Villainous", null, 0],
    ["przedpokoj-narozny", 8, 1, "Drako: Dragon & Dwarves", 102237, 0, "Drako"],
    ["przedpokoj-maly", 1, 1, "Marvel Zombies: Fantastic 4 – Oblężenie", null, 0],
    ["przedpokoj-maly", 1, 1, "Thanos Rising", null, 0],
    ["przedpokoj-maly", 1, 1, "Kroniki zamku Avel", 347137, 0],
    ["przedpokoj-maly", 1, 1, "Osadnicy: Narodziny Imperium", 154203, 0],
    ["przedpokoj-maly", 2, 1, "Karak II", null, 0],
    ["przedpokoj-maly", 2, 1, "Niagara", 13308, 0],
    ["przedpokoj-maly", 2, 1, "Jamaica", 28023, 0, "Jamajka"],
    ["przedpokoj-maly", 2, 1, "Zooloretto", 27588, 0],
    ["przedpokoj-szafka", 1, 1, "Władca Pierścieni: Drużyna Pierścienia", null, 0],
    ["przedpokoj-szafka", 1, 1, "Star Wars: Rebelia", 187645, 0],
    ["szafa", 1, 1, "Glory to Rome: Na chwałę Rzymu", 19857, 0, "Glory to Rome"],
    ["szafa", 1, 1, "Witchcraft", 35599, 0],
    ["szafa", 1, 1, "Septima", null, 0],
    ["szafa", 1, 1, "Circadians: Ład Chaosu", null, 0],
    ["szafa", 1, 1, "Circadians: Nowy Świt", null, 0],
    ["szafa", 1, 1, "Circadians: Heroldowie (rozszerzenie)", null, 1],
    ["szafa", 1, 1, "Dixit: Odyssey (expansion)", 138547, 1, "Dixit: Odyseja"],
    ["szafa", 1, 1, "Dixit", 39856, 0],
    ["szafa", 1, 1, "Dune: Imperium – Rise of Ix", 342031, 1, "Diuna: Imperium – Potęga Ix"],
    ["szafa", 2, 1, "Mosaic: A Story of Civilization", 329551, 0, "Mosaic: Historia Cywilizacji"],
    ["szafa", 2, 1, "Puerto Rico 1897 Special Edition", null, 0]
  ];
  window.POLKI_UKLAD = { wersja: WERSJA, regaly: REGALY, gry: GRY };

  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').replace(/Ł/g, 'l').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const slug = s => norm(s).replace(/ /g, '-').slice(0, 60);

  async function zastosuj(force) {
    if (!force && await DB.setting('polkiUklad') === WERSJA) return null;
    if (!force && !(await DB.setting('bggImported'))) return null; // najpierw kolekcja z BGG, inaczej powstałyby dublety
    const shelves = await DB.all('shelves');
    const mapa = {};
    const noweRegaly = [];
    for (const r of REGALY) {
      const ist = shelves.find(s => s.id === r.id) || shelves.find(s => norm(s.name) === norm(r.name));
      if (ist) mapa[r.id] = ist.id;
      else { noweRegaly.push(Object.assign({ cells: {} }, r)); mapa[r.id] = r.id; }
    }
    if (noweRegaly.length) await DB.putMany('shelves', noweRegaly);

    const all = await DB.all('games', { withDeleted: true });
    const zywe = all.filter(g => !g.deleted);
    const zajete = new Set(all.map(g => g.id));
    const raport = { wersja: WERSJA, data: new Date().toISOString(), regaly: noweRegaly.map(r => r.name), ustawione: 0, juzMialy: 0, dodane: [], zLista: [] };
    const zmiany = new Map();
    for (const [reg, r, c, title, bggId, dodatek, nazwa] of GRY) {
      const polka = { s: mapa[reg], r, c };
      const t = norm(title), n = norm(nazwa);
      let g = (bggId && zywe.find(x => x.bggId === bggId && norm(x.title) === t))
        || (bggId && zywe.find(x => x.bggId === bggId))
        || zywe.find(x => norm(x.title) === t || (n && norm(x.title) === n) || (window.Tytuly && Tytuly.nazwy(x).some(y => norm(y) === t || (n && norm(y) === n))));
      if (g) {
        g = zmiany.get(g.id) || g;
        const upd = Object.assign({}, g);
        let zm = false;
        if (!g.polka || !g.polka.s) { upd.polka = polka; raport.ustawione++; zm = true; } else raport.juzMialy++;
        if (g.status === 'wishlist' || g.status === 'played') { upd.status = 'owned'; raport.zLista.push(g.title); zm = true; }
        if (zm) zmiany.set(g.id, upd);
      } else {
        let id = bggId ? 'bgg-' + bggId : 'polka-' + slug(title);
        if (zajete.has(id)) id += '-p';
        zajete.add(id);
        const nowa = { id, title, bggId: bggId || null, isExpansion: !!dodatek, status: 'owned', source: 'polki', polka, tags: [], notes: nazwa && nazwa !== title ? 'Na pudełku: ' + nazwa : '' };
        zywe.push(nowa); zmiany.set(id, nowa);
        raport.dodane.push(title); raport.ustawione++;
      }
    }
    if (zmiany.size) await DB.putMany('games', [...zmiany.values()]);
    const stary = await DB.setting('polkiUkladRaport');
    if (stary && stary.wersja === WERSJA) { // ponowne uruchomienie: dopisz do pierwszego raportu
      raport.dodane = stary.dodane.concat(raport.dodane); raport.zLista = stary.zLista.concat(raport.zLista);
      raport.regaly = stary.regaly.concat(raport.regaly); raport.juzMialy = Math.max(0, raport.juzMialy - stary.ustawione);
      raport.ustawione += stary.ustawione; raport.data = stary.data;
    }
    await DB.setting('polkiUkladRaport', raport);
    await DB.setting('polkiUklad', WERSJA);
    if (window.PolkiWew) await PolkiWew.reload();
    return raport;
  }

  async function auto() {
    for (let i = 0; i < 6; i++) {
      try {
        if (await DB.setting('polkiUklad') === WERSJA) return;
        const r = await zastosuj(false);
        if (r) {
          App.ui.toast(`📍 Półki ze zdjęć: ${r.ustawione} gier na miejscach${r.dodane.length ? `, ${r.dodane.length} nowych w kolekcji` : ''}`);
          if (location.hash.includes('polki')) App.refresh();
          return;
        }
      } catch (e) { console.warn('półki ze zdjęć', e); }
      await new Promise(res => setTimeout(res, 2500));
    }
  }
  window.addEventListener('load', () => setTimeout(auto, 1500));
  App.provide('polki.uklad', zastosuj);
})();
