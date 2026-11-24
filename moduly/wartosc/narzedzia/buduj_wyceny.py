"""Buduje moduly/wartosc/wyceny.js z cen zebranych w przeglądarce.

Wejście (JSON, zebrane skryptem w przeglądarce na planszeo.pl i komiksopedia.pl 24.11.2026):
  gry.json      {bggId: [cena, "p"|"s", źródło]}  – ceny gier z planszeo.pl (opis w gry())
  egmont.json   {id tomu: [cena, "p"|"s"]}         – tomy Egmontu dopasowane po tytule do cen okładkowych komiksopedia.pl
  szacunki.json {bggId: cena}                      – ręczne szacunki dla gier bez ofert
Uruchom:  python3 buduj_wyceny.py <katalog z plikami JSON>
"""
import json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SRC = Path(sys.argv[1])
DATA = '2026-11-24'


def js_dane(path, var):
    txt = (ROOT / path).read_text(encoding='utf8')
    if var == 'BGG_IMPORT':
        rows = txt[txt.index('rows: [') + 6: txt.rindex(']') + 1]
        return json.loads(rows)
    i = txt.index('window.%s=' % var) + len('window.%s=' % var)
    return json.JSONDecoder().raw_decode(txt, i)[0]


# ---------- gry ----------
def gry():
    """gry.json: {bggId: [cena, pewność, źródło]} policzone w przeglądarce na planszeo.pl:
    gra dopasowana po numerze BGG; cena = mediana 3 najtańszych dostępnych ofert (pewna, gdy są ≥2 oferty);
    bez dostępnych ofert – mediana ostatnich cen (szacunkowa); bez dopasowania BGG – strona o tym samym tytule (szacunkowa).
    szacunki.json: {bggId: cena} – ręczne szacunki dla gier bez ofert i poprawki podejrzanych cen (np. edycje kolekcjonerskie)."""
    rows = js_dane('moduly/planszowki/dane-bgg.js', 'BGG_IMPORT')
    wyn = json.loads((SRC / 'gry.json').read_text())
    szac = json.loads((SRC / 'szacunki.json').read_text())
    out, raport = {}, []
    for r in rows:
        bgg, title = str(r[0]), r[2]
        if bgg in szac:
            out[bgg] = [szac[bgg], 's', 'szacunek']
        elif bgg in wyn:
            out[bgg] = wyn[bgg]
        raport.append(('GRA', title, *(out.get(bgg) or ['BRAK'])))
    return out, raport


# ---------- komiksy ----------
# Ceny okładkowe z komiksopedia.pl (sprawdzone 24.11.2026).
# Hachette: cena zależy od numeru tomu – [od tomu, do tomu, cena, pewność]; sprawdzono co 6. tom i pierwsze tomy.
HACHETTE = {
    'WKKM': [(1, 1, 14.90, 'p'), (2, 2, 29.90, 'p'), (3, 3, 39.90, 'p'), (4, 999, 39.99, 'p')],
    'Superbohaterowie Marvela': [(1, 1, 14.90, 'p'), (2, 2, 29.99, 'p'), (3, 3, 39.90, 'p'), (4, 999, 39.99, 'p')],
    'Bohaterowie i Złoczyńcy DC': [(1, 1, 14.90, 'p'), (2, 2, 29.99, 'p'), (3, 34, 39.99, 'p'), (35, 39, 39.99, 's'),
                                   (40, 64, 44.99, 'p'), (65, 69, 44.99, 's'), (70, 999, 49.99, 'p')],
    'Marvel Origins': [(1, 1, 14.90, 'p'), (2, 2, 29.99, 'p'), (3, 3, 49.99, 's'), (4, 999, 49.99, 'p')],
    'Marvel Must-Have': [(1, 1, 14.90, 'p'), (2, 2, 29.90, 'p'), (3, 3, 53.99, 's'), (4, 999, 53.99, 'p')],
    'Marvel Must-Have: Sezon pierwszy': [(1, 999, 53.99, 's')],
    'Thorgal': [(1, 1, 14.90, 'p'), (2, 2, 29.99, 'p'), (3, 3, 49.99, 's'), (4, 999, 49.99, 'p')],
    'Wielkie Pojedynki': [(1, 999, 13.99, 'p')],
}
# Typowa cena tomu – dla komiksów dodanych później i tomów bez dopasowania.
SERIE = {'WKKM': 39.99, 'Superbohaterowie Marvela': 39.99, 'Bohaterowie i Złoczyńcy DC': 49.99, 'Marvel Origins': 49.99,
         'Thorgal': 49.99, 'Marvel Must-Have': 53.99, 'Marvel Must-Have: Sezon pierwszy': 53.99, 'Wielkie Pojedynki': 13.99,
         'Marvel Now 1.0': 39.99, 'Marvel Now 2.0': 39.99, 'Marvel Fresh': 69.99, 'Marvel Classic': 99.99, 'Marvel Limited': 199.99}


def komiksy():
    dane = js_dane('moduly/komiksy/dane-komiksy.js', 'KOMIKSY_DANE')
    egmont = json.loads((SRC / 'egmont.json').read_text())  # {id tomu: [cena, pewność]} – dopasowane po tytule
    tomy, raport = {}, []
    for c in dane:
        if c['id'] in egmont:
            v, p = egmont[c['id']]
            tomy[c['id']] = [v, p, 'komiksopedia']
            continue
        reg = HACHETTE.get(c.get('series'))
        v = c.get('volume')
        if reg and isinstance(v, int):
            for od, do, cena, p in reg:
                if od <= v <= do:
                    tomy[c['id']] = [cena, p, 'komiksopedia' if p == 'p' else 'komiksopedia-seria']
                    break
        if c['id'] not in tomy:
            raport.append(('bez ceny tomu', c.get('series'), c.get('title')))
    serie = {k: [v, 's', 'komiksopedia-seria'] for k, v in SERIE.items()}
    return tomy, serie, raport


def main():
    g, rg = gry()
    t, s, rk = komiksy()
    wyc = {
        'data': DATA,
        'zrodla': {
            'planszeo': 'planszeo.pl – cena nowej gry w sklepach',
            'planszeo-niedost': 'planszeo.pl – ostatnie ceny, gra niedostępna w sklepach',
            'planszeo-inne': 'planszeo.pl – inne wydanie tej gry',
            'szacunek': 'ostrożny szacunek (brak ofert w sklepach)',
            'komiksopedia': 'komiksopedia.pl – cena okładkowa tomu',
            'komiksopedia-seria': 'komiksopedia.pl – typowa cena okładkowa w serii',
        },
        'gry': g, 'komiksy': t, 'serie': s,
    }
    head = ('/* Propozycje wyceny kolekcji (stan na %s). Nie zmieniają danych użytkownika: moduł Wartość kolekcji\n'
            ' * używa ich tylko, gdy nie ma własnej wyceny, ceny z ogłoszenia ani ceny za tom serii.\n'
            ' * Format: [cena zł, "p" = pewna | "s" = szacunkowa, klucz źródła]. Gry po numerze BGG, komiksy po id tomu,\n'
            ' * serie = typowa cena tomu dla komiksów dodanych później. Generuje: narzedzia/buduj_wyceny.py */\n') % DATA
    body = 'window.WYCENY = ' + json.dumps(wyc, ensure_ascii=False, separators=(',', ':')).replace('],"', '],\n"') + ';\n'
    (ROOT / 'moduly/wartosc/wyceny.js').write_text(head + body, encoding='utf8')
    with open(SRC / 'raport.txt', 'w') as f:
        for r in rg + rk:
            f.write('\t'.join(map(str, r)) + '\n')
    print('gry:', len(g), '/', len(rg), ' tomy:', len(t), ' serie:', len(s))


main()
