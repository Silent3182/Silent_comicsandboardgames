#!/usr/bin/env python3
"""Pobiera kolekcję Silent82 i szczegóły gier z oficjalnego API BoardGameGeek (XML API2) do pliku bgg.json.

API BGG wymaga klucza aplikacji (token z https://boardgamegeek.com/applications). Klucz bierzemy ze zmiennej
środowiskowej BGG_TOKEN (w GitHub Actions: sekret repozytorium MOJA_KOLEKCJA) – nigdy nie trafia do repozytorium.
Zgodnie z https://boardgamegeek.com/using_the_xml_api: zapytania tylko z serwera, wynik zapisany w pliku, jak najmniej zapytań.
Uruchamia go raz dziennie GitHub Actions (.github/workflows/bgg.yml); ręcznie:
    BGG_TOKEN=... python3 pobierz_bgg.py ../../../bgg.json [Silent82]

Wynik (bgg.json):
  { "pobrano": "2026-11-24T05:00:00Z", "user": "Silent82",
    "kolekcja": [ {"id", "exp", "t", "y", "own", "wish", "prev", "trade", "pre", "rating", "plays", "comment"} ],
    "gry": { "<bggId>": { "t", "y", "exp", "img", "th", "p": [min,max], "best": [od,do], "czas", "czasOd", "czasDo",
                          "wiek", "w" (ciężar), "r" (średnia ocen), "rank", "m" (mechaniki), "c" (kategorie),
                          "d" (autorzy), "wyd" (wydawcy), "baza": [id gier bazowych], "dod": [[id, nazwa] dodatków] } } }
"""
import json, os, re, sys, time, urllib.error, urllib.parse, urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

API = 'https://boardgamegeek.com/xmlapi2/'
PACZKA = 20          # BGG przyjmuje do 20 gier w jednym zapytaniu /thing
PRZERWA = 5          # sekund między zapytaniami (limit BGG)
MAX_DODATKOW = 80


def pobierz(sciezka, token, proby=8):
    url = API + sciezka
    req = urllib.request.Request(url, headers={'Authorization': 'Bearer ' + token, 'User-Agent': 'moje-kolekcje (prywatna aplikacja)'})
    for i in range(proby):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                body = r.read()
                if r.status == 202:   # kolekcja w kolejce – BGG przygotowuje dane, trzeba chwilę poczekać
                    print('  BGG przygotowuje dane (202), czekam…'); time.sleep(5 + i * 5); continue
                return ET.fromstring(body)
        except urllib.error.HTTPError as e:
            if e.code in (401, 403):
                sys.exit(f'BGG odrzuciło klucz ({e.code}). Sprawdź sekret BGG_TOKEN w repozytorium.')
            if e.code in (429, 500, 502, 503, 504):
                print(f'  BGG {e.code}, ponawiam za {10 + i * 10} s'); time.sleep(10 + i * 10); continue
            raise
        except (urllib.error.URLError, TimeoutError) as e:
            print('  błąd sieci:', e); time.sleep(10 + i * 5)
    raise SystemExit('BGG nie odpowiada – spróbuj później: ' + url)


def num(x, typ=int):
    try:
        v = typ(x)
        return v if v else None
    except (TypeError, ValueError):
        return None


def val(el, tag, typ=int):
    e = el.find(tag)
    return num(e.get('value'), typ) if e is not None else None


def kolekcja(user, token):
    wynik = {}
    for sub in ('boardgame', 'boardgameexpansion'):
        q = {'username': user, 'stats': '1', 'subtype': sub}
        if sub == 'boardgame':
            q['excludesubtype'] = 'boardgameexpansion'   # bez tego dodatki przychodzą też jako „boardgame”
        print('Kolekcja:', sub)
        root = pobierz('collection?' + urllib.parse.urlencode(q), token)
        if root.tag == 'errors' or root.find('error') is not None:
            raise SystemExit('BGG: ' + ' '.join(e.findtext('message') or '' for e in root.iter('error')))
        for it in root.findall('item'):
            gid = int(it.get('objectid'))
            st = it.find('status').attrib if it.find('status') is not None else {}
            r = it.find('stats/rating')
            wynik[gid] = {
                'id': gid, 'exp': 1 if sub == 'boardgameexpansion' else 0,
                't': it.findtext('name') or '', 'y': num(it.findtext('yearpublished')),
                'own': int(st.get('own', 0)), 'wish': int(st.get('wishlist', 0)) or int(st.get('wanttobuy', 0)),
                'prev': int(st.get('prevowned', 0)), 'trade': int(st.get('fortrade', 0)), 'pre': int(st.get('preordered', 0)),
                'rating': num(r.get('value'), float) if r is not None else None,
                'plays': num(it.findtext('numplays')) or 0, 'comment': (it.findtext('comment') or '').strip(),
            }
        time.sleep(PRZERWA)
    return list(wynik.values())


def najlepsza(it):
    """Liczba graczy „najlepiej” z ankiety BGG, np. „Best with 3–4 players” → [3, 4]."""
    for p in it.findall('poll-summary'):
        for r in p.findall('result'):
            if r.get('name') == 'bestwith':
                n = [int(x) for x in re.findall(r'\d+', r.get('value', ''))]
                if n:
                    return [min(n), max(n)]
    return None


def szczegoly(ids, token):
    gry = {}
    ids = sorted(set(ids))
    for i in range(0, len(ids), PACZKA):
        cz = ids[i:i + PACZKA]
        print(f'Szczegóły {i + 1}–{i + len(cz)} z {len(ids)}')
        root = pobierz('thing?' + urllib.parse.urlencode({'id': ','.join(map(str, cz)), 'stats': '1'}), token)
        for it in root.findall('item'):
            gid = int(it.get('id'))
            nazwa = next((n.get('value') for n in it.findall('name') if n.get('type') == 'primary'), '')
            linki = lambda typ: [l for l in it.findall('link') if l.get('type') == typ]
            ex = linki('boardgameexpansion')
            rat = it.find('statistics/ratings')
            rank = None
            if rat is not None:
                for rk in rat.findall('ranks/rank'):
                    if rk.get('name') == 'boardgame':
                        rank = num(rk.get('value'))
            g = {
                't': nazwa, 'y': val(it, 'yearpublished', int), 'exp': 1 if it.get('type') == 'boardgameexpansion' else 0,
                'img': (it.findtext('image') or '').strip() or None, 'th': (it.findtext('thumbnail') or '').strip() or None,
                'p': [val(it, 'minplayers', int), val(it, 'maxplayers', int)], 'best': najlepsza(it),
                'czas': val(it, 'playingtime', int), 'czasOd': val(it, 'minplaytime', int), 'czasDo': val(it, 'maxplaytime', int),
                'wiek': val(it, 'minage', int),
                'w': round(val(rat, 'averageweight', float), 2) if rat is not None and val(rat, 'averageweight', float) else None,
                'r': round(val(rat, 'average', float), 2) if rat is not None and val(rat, 'average', float) else None,
                'rank': rank,
                'm': [l.get('value') for l in linki('boardgamemechanic')],
                'c': [l.get('value') for l in linki('boardgamecategory')],
                'd': [l.get('value') for l in linki('boardgamedesigner') if l.get('value') != '(Uncredited)'],
                'wyd': [l.get('value') for l in linki('boardgamepublisher')][:6],
                # w dodatku link z inbound="true" wskazuje grę bazową; w grze bazowej – jej dodatki
                'baza': [int(l.get('id')) for l in ex if l.get('inbound') == 'true'],
                'dod': [[int(l.get('id')), l.get('value')] for l in ex if l.get('inbound') != 'true'][:MAX_DODATKOW],
            }
            gry[str(gid)] = {k: v for k, v in g.items() if v not in (None, [], '', [None, None])}
        time.sleep(PRZERWA)
    return gry


def main(plik='bgg.json', user='Silent82'):
    token = os.environ.get('BGG_TOKEN', '').strip()
    if not token:
        print('Brak klucza BGG_TOKEN – pomijam (dodaj sekret w Settings › Secrets and variables › Actions).')
        return
    kol = kolekcja(user, token)
    print('Pozycji w kolekcji:', len(kol))
    if not kol:
        raise SystemExit('BGG zwróciło pustą kolekcję – nie nadpisuję pliku.')
    stare = {}
    if os.path.exists(plik):
        try:
            stare = json.load(open(plik, encoding='utf-8'))
        except ValueError:
            pass
    # Zasady BGG: jak najmniej zapytań. Szczegóły gier pobieramy codziennie tylko dla nowych pozycji,
    # a wszystkie odświeżamy raz w tygodniu (w poniedziałek) albo na żądanie (BGG_PELNE=1).
    # szczegóły tylko dla gier posiadanych, chcianych, zamówionych i na wymianę (bez „miałem kiedyś” i samych ocen)
    ids = [k['id'] for k in kol if k['own'] or k['wish'] or k['pre'] or k['trade']]
    stare_gry = stare.get('gry') or {}
    pelne = os.environ.get('BGG_PELNE') == '1' or datetime.now(timezone.utc).weekday() == 0 or not stare_gry
    nowe = ids if pelne else [i for i in ids if str(i) not in stare_gry]
    print('Szczegóły:', 'wszystkie' if pelne else f'tylko nowe ({len(nowe)})')
    gry = szczegoly(nowe, token) if nowe else {}
    if not pelne:
        gry = {**{str(i): stare_gry[str(i)] for i in ids if str(i) in stare_gry}, **gry}
    # „pobrano” zmieniamy tylko wtedy, gdy dane naprawdę się zmieniły – aplikacja po tej dacie wie, że ma coś nowego
    if stare.get('kolekcja') == kol and stare.get('gry') == gry:
        print('Bez zmian.'); return
    out = {'pobrano': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'), 'user': user, 'kolekcja': kol, 'gry': gry}
    with open(plik, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    print('Zapisano', plik, '–', len(gry), 'gier')


if __name__ == '__main__':
    main(*sys.argv[1:3])
