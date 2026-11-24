"""dane.json -> moduly/komiksy/dane-mro.js + dane-komiksy.js"""
import json, sys, re
d = json.load(open(sys.argv[1])); out = sys.argv[2]
secs = d['sekcjeCzytania']; events = []
TYP = {None: 0, 'naglowek': 1, 'odsylacz': 2, 'notatka': 3}
rows = []
for it in d['kolejnoscCzytania']:
    ev = it.get('event')
    if ev and it.get('typWpisu') != 'odsylacz':
        if ev not in events: events.append(ev)
        ei = events.index(ev)
    else: ei = -1
    sec = it.get('czesc', it['sekcja'])
    ex = {k: it[k] for k in ('ocena', 'mustRead', 'typ', 'pomin', 'uwagi', 'nosnik') if k in it}
    if it.get('typWpisu') == 'odsylacz': ex['ev'] = it['event']
    rows.append([it['id'][4:], it['tytul'], 1 if it['przeczytane'] else 0, secs.index(sec), ei,
                 TYP[it.get('typWpisu')], it.get('wydaniePL') or '', ex or 0])
EGMONT = {'Marvel Now 1.0', 'Marvel Now 2.0', 'Marvel Limited', 'Marvel Classic', 'Marvel Fresh'}
STAT = {'mam': 'owned', 'nie mam': 'missing', 'pomijam': 'missing', 'czesciowo': 'missing'}
def year(s):
    m = re.search(r'(20\d\d|19\d\d)', str(s or '')); return int(m.group(1)) if m else None
comics = []
for c in d['komiksy']:
    notes = []
    if c['stan'] == 'pomijam': notes.append('W arkuszu na czerwono (nie kupuję / mam w innym wydaniu)')
    if c['stan'] == 'czesciowo': notes.append('W arkuszu na pomarańczowo (częściowo mam w innym wydaniu)')
    if c.get('notatka'): notes.append('Notatka z arkusza: ' + str(c['notatka']))
    if c.get('mamWInnymWydaniu'): notes.append('Mam w innym wydaniu: ' + c['mamWInnymWydaniu'])
    if c.get('cenaRynkowa'): notes.append(f"Cena z arkusza: {c['cenaRynkowa']} zł")
    if c.get('dataWydania'): notes.append('Data wydania: ' + str(c['dataWydania']))
    r = {'id': c['id'], 'series': c['seria'], 'volume': c.get('nr'), 'title': c.get('tytul'),
         'origTitle': c.get('tytulOryg'), 'contents': c.get('zawartosc'),
         'publisher': 'Egmont' if c['seria'] in EGMONT else 'Hachette', 'year': year(c.get('dataWydania')),
         'status': STAT[c['stan']], 'myRating': None, 'read': False, 'notes': '\n'.join(notes),
         'image': None, 'thumb': None, 'fromSheet': c['stan']}
    comics.append({k: v for k, v in r.items() if v not in (None, '')})
# --- kolekcje z list comixxy.com (kolekcje.tsv): ile tomów Marcin ma ---
MA = {'Marvel Origins': 93, 'Thorgal': 65, 'Bohaterowie i Złoczyńcy DC': 120}
SLUG = {'Marvel Origins': 'origins', 'Thorgal': 'thorgal', 'Bohaterowie i Złoczyńcy DC': 'dc'}
import datetime as dt
TODAY = dt.date.today()
shop = []; seria = None
for line in open(sys.argv[3], encoding='utf-8'):
    line = line.rstrip('\n')
    if not line: continue
    if line.startswith('#'): seria = line[1:]; continue
    nr, tyt, zaw, data = (line.split('\t') + ['', '', ''])[:4]
    nr = int(nr); d = dt.datetime.strptime(data, '%d.%m.%Y').date() if data else None
    own = nr <= MA[seria]
    r = {'id': f'kom-{SLUG[seria]}-{nr:03d}', 'series': seria, 'volume': nr, 'title': tyt,
         'contents': (('Cykl: ' + zaw) if seria == 'Thorgal' and zaw else zaw) or None, 'publisher': 'Hachette',
         'year': d.year if d else None, 'status': 'owned' if own else 'missing', 'read': False,
         'notes': f'Data wydania: {data}' + ('' if own else (' (zapowiedź)' if d and d > TODAY else '')), 'fromSheet': 'comixxy'}
    comics.append({k: v for k, v in r.items() if v not in (None, '')})
    if not own:
        shop.append({'id': f'zak-{SLUG[seria]}-{nr:03d}', 'title': f'{seria} {nr}: {tyt}', 'itemType': 'comic', 'series': seria,
                     'volume': nr, 'comicId': r['id'], 'publisher': 'Hachette', 'releaseDate': d.isoformat() if d else None,
                     'bought': False, 'notes': 'Prenumerata – czekam na przesyłkę' if seria in ('Thorgal', 'Marvel Origins') else ''})
# okładki (lubimyczytac.pl), plik okladki.json obok skryptu: {id komiksu: adres}
import os
_ok = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'okladki.json')
if os.path.exists(_ok):
    OK = json.load(open(_ok, encoding='utf-8'))
    for c in comics:
        if OK.get(c['id']) and not c.get('image'):
            c['image'] = OK[c['id']]
    print('okładki:', sum(1 for c in comics if c.get('image')))
open(out + '/dane-komiksy.js', 'w', encoding='utf-8').write(
    '/* Startowa kolekcja komiksów: zakładka MOJE KOMIKSY (zielone = mam) + listy comixxy.com (Origins, Thorgal, DC). */\n'
    'window.KOMIKSY_WERSJA=4;\nwindow.KOMIKSY_DANE=' + json.dumps(comics, ensure_ascii=False, separators=(',', ':')) + ';\n'
    'window.ZAKUPY_DANE=' + json.dumps(shop, ensure_ascii=False, separators=(',', ':')) + ';\n')
print('zakupy:', len(shop))
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from dopasuj import match_all
K = match_all(json.load(open(sys.argv[1]))['kolejnoscCzytania'], comics)
for row in rows:
    ids = K.get('mro-' + row[0])
    if ids:
        if not row[7]: row[7] = {}
        row[7]['k'] = ids
print('zeszyty dopasowane do tomów:', len(K))
D0 = json.load(open(sys.argv[1])); mro = {'zrodlo': D0['zrodlo'], 'data': D0['zaimportowano'], 'sekcje': secs, 'eventy': events, 'p': rows}
open(out + '/dane-mro.js', 'w', encoding='utf-8').write(
    '/* Master Reading Order z arkusza Marcina (wygenerowane przez importuj.py). Pola p: [id, tytuł, przeczytane w arkuszu, sekcja, event, typ 0 zeszyt/1 nagłówek/2 odsyłacz/3 notatka, wydanie PL, dodatki] */\n'
    'window.MRO_DANE=' + json.dumps(mro, ensure_ascii=False, separators=(',', ':')) + ';\n')

print(len(rows), len(events), len(comics))
