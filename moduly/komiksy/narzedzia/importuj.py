"""Import arkusza Marvel Master Reading Order.xlsx do JSON dla aplikacji Kolekcje."""
import openpyxl, json, re, sys, datetime
SRC, OUT = sys.argv[1], sys.argv[2]
wb = openpyxl.load_workbook(SRC)
GREEN = {'FF92D050', 'FF00B050'}
def fill(c):
    try:
        return c.fill.fgColor.rgb if c.fill.fill_type else None
    except Exception:
        return None
def clean(s):
    if s is None: return None
    if isinstance(s, (datetime.datetime, datetime.date)): return s.strftime('%d.%m.%Y')
    if isinstance(s, (int, float)): return s
    s = str(s).replace('\xa0', ' ').strip()
    s = re.sub(r'\[\w{1,3}\]', '', s).strip()   # przypisy z Wikipedii [12]
    return s or None

SKIP = {'Infos', 'MOJE KOMIKSY', 'Arkusz3'}
SHEET_NAMES = {'Arkusz1': 'Infinity Countdown (2018)', 'Arkusz2': 'A Fresh Start – eventy', '11a': 'Part 11a'}
MAIN = {'Part 1','Part 2','Part 3','Part 4','Part 5','Part 6','Part 7','Part 8','Part 9','Part 10','Part 11',
        'Marvel Now! Part 1','Marvel Now! Part 2','All-New, All-Different Marvel 1','All-New, All-Different Marvel 2',
        'Marvel Legacy','A Fresh Start','Ultimate','zombies','one-shot','Star Wars'}
def parent_of(name):
    m = re.match(r'Part (\d+)[a-z]$', name)
    if m: return f'Part {m.group(1)}'
    m = re.match(r'now part (\d)[a-z]$', name)
    if m: return f'Marvel Now! Part {m.group(1)}'
    m = re.match(r'all-new (\d)[a-z]$', name)
    if m: return f'All-New, All-Different Marvel {m.group(1)}'
    if name.startswith('Infinity Countdown'): return 'Marvel Legacy'
    return 'A Fresh Start'
norm = lambda s: re.sub(r'[^a-z0-9]', '', s.lower())
ISSUE = re.compile(r'#\s?-?\d|#½|#X|Annual|Vol\.|\(\d{4}\)|One-?Shot|Special|Giant-Size|\d{4}', re.I)
sheets = {}   # nazwa -> lista wpisów
order_names = []
for si, ws in enumerate(wb.worksheets):
    if ws.title in SKIP: continue
    sec = SHEET_NAMES.get(ws.title, ws.title); order_names.append(sec); items = []
    first = 2 if ws.title == 'Part 1' else 1
    for row in ws.iter_rows(min_row=first):
        cells = [c for c in row if c.value is not None]
        if not cells: continue
        tcell = row[0] if row[0].value is not None else cells[0]
        title = clean(tcell.value); title = str(title) if title is not None else None
        if not title: continue
        extra = [str(clean(c.value)) for c in cells if c is not tcell]
        it = {'id': f'mro-{si:02d}-{tcell.row:04d}', 'sekcja': sec, 'tytul': title, 'przeczytane': fill(tcell) in GREEN}
        if ws.title == 'Part 1':
            v = lambda L: clean(ws[f'{L}{tcell.row}'].value)
            it.update({k: x for k, x in {
                'wydaniePL': ' / '.join(str(x) for x in [v('C'), v('D'), v('F')] if x) or None,
                'nosnik': v('E'), 'ocena': ws[f'G{tcell.row}'].value,
                'mustRead': v('H') == 'TAK', 'typ': v('I'), 'pomin': v('J') == 'TAK',
                'uwagi': ' / '.join(str(x) for x in [v('K'), v('B')] if x) or None}.items() if x not in (None, False)})
        elif extra:
            it['wydaniePL'] = ' / '.join(extra)
        m = re.match(r'Read (.+?) here\.?$', title)
        if m: it['typWpisu'] = 'odsylacz'; it['event'] = m.group(1)
        elif title.startswith('http') or len(title) > 70 and not ISSUE.search(title[:60]): it['typWpisu'] = 'notatka'
        elif not ISSUE.search(title) and sec not in MAIN | {'Infinity Countdown (2018)'} and len(title) <= 45: it['typWpisu'] = 'naglowek'
        items.append(it)
    sheets[sec] = items
# bloki eventów z arkuszy pomocniczych
blocks = []
for sec in order_names:
    if sec in MAIN: continue
    cur = None
    for it in sheets[sec]:
        if it.get('typWpisu') == 'naglowek' or cur is None:
            cur = {'nazwa': it['tytul'], 'sekcja': sec, 'rodzic': parent_of(sec), 'wpisy': [], 'uzyty': False}; blocks.append(cur)
        cur['wpisy'].append(it)
def lcp(a, b):
    n = 0
    while n < min(len(a), len(b)) and a[n] == b[n]: n += 1
    return n
def nrm2(x): return norm(re.sub(r'\bthe\b', '', x.lower()))
def score(n, e):
    if n == e: return 1000
    if n and (n in e or e in n): return 100 + min(len(n), len(e))
    return lcp(n, e)
def match(event, parent):
    e = nrm2(event)
    for scope, thr in ((lambda b: b['rodzic'] == parent, 7), (lambda b: True, 100)):
        cand = [(score(nrm2(b['nazwa']), e), b) for b in blocks if not b['uzyty'] and scope(b)]
        if cand:
            sc, b = max(cand, key=lambda t: t[0])
            if sc >= thr: return b
    return None
reading = []
for sec in order_names:
    if sec not in MAIN: continue
    for it in sheets[sec]:
        reading.append(it)
        if it.get('typWpisu') == 'odsylacz':
            b = match(it['event'], sec)
            if b:
                b['uzyty'] = True
                for w in b['wpisy']: w['event'] = b['nazwa']; w['czesc'] = sec; reading.append(w)
    for b in blocks:   # niedopasowane eventy tej części – na końcu części
        if not b['uzyty'] and b['rodzic'] == sec:
            b['uzyty'] = True
            for w in b['wpisy']: w['event'] = b['nazwa']; w['czesc'] = sec; reading.append(w)
for b in blocks:
    if not b['uzyty']: print('NIEUŻYTY BLOK', b['sekcja'], b['nazwa'])
for i, it in enumerate(reading): it['kolejnosc'] = i + 1
sections = [s for s in order_names if s in MAIN]
# --- MOJE KOMIKSY ---
SERIE = {'NOW 1.0': 'Marvel Now 1.0', 'NOW 2.0': 'Marvel Now 2.0', 'MARVEL LIMITED': 'Marvel Limited',
         'MARVEL CLASSIC - KM': 'Marvel Classic', 'WIELKA KOLEKCJA KOMIKSÓW MARVELA - WKKM': 'WKKM',
         'SUPERBOHATEROWIE MARVELA - SBM': 'Superbohaterowie Marvela', 'KOLEKCJA MUST-HAVE (MH)': 'Marvel Must-Have'}
STAN = {'FF92D050': 'mam', 'FF00B050': 'mam', 'FFFFC000': 'czesciowo', 'FFFF0000': 'pomijam'}
ws = wb['MOJE KOMIKSY']; comics = []; seria = None; last = None
for row in ws.iter_rows():
    v = [clean(c.value) for c in row]
    if v[0] in SERIE and not any(v[1:]): seria = SERIE[v[0]]; continue
    if not any(v): continue
    f = fill(row[1]) or fill(row[0])
    if seria == 'Superbohaterowie Marvela':
        if v[0] is None and last:  # druga historia w tomie
            last['zawartosc'] += f' | {v[4]}: {v[5]}'; continue
        c = {'seria': seria, 'nr': v[0], 'tytul': f'{v[1]}', 'tytulOryg': v[2],
             'zawartosc': f'{v[2]}: {v[3]} | {v[4]}: {v[5]}', 'dataWydania': v[6]}
    elif seria in ('Marvel Must-Have', 'Wielkie Pojedynki', 'Marvel Must-Have: Sezon pierwszy'):
        if isinstance(row[0].value, str) and row[0].value.startswith('WP'): seria = 'Wielkie Pojedynki'
        if seria == 'Wielkie Pojedynki' or v[0] is None:
            seria = 'Wielkie Pojedynki'
            if v[0] is None and v[1] and not v[1].startswith('Wielkie'):
                last['zawartosc'] = v[1]; continue
            m = re.search(r'#(\d+): (.*)', v[1] or '')
            c = {'seria': seria, 'nr': int(m.group(1)) if m else None, 'tytul': m.group(2) if m else v[1]}
        else:
            c = {'seria': seria, 'nr': v[0], 'tytul': v[1], 'zawartosc': v[2], 'dataWydania': v[3],
                 'mamWInnymWydaniu': v[4], 'notatka': v[5]}
            if seria == 'Marvel Must-Have' and last.get('seria') == seria and isinstance(last.get('nr'), int) and v[0] < last['nr']:
                seria = c['seria'] = 'Marvel Must-Have: Sezon pierwszy'
    else:
        if v[0] is None and v[1] is None and v[2]:
            if v[2] == 'FRESH': seria = 'Marvel Fresh'; continue
            last['tytulOryg'] = (last.get('tytulOryg') or '') + ' + ' + str(v[2])
            if v[5]: last['notatka'] = ' / '.join(str(x) for x in [last.get('notatka'), v[5]] if x)
            continue
        c = {'seria': seria, 'nr': v[0], 'tytul': v[1], 'tytulOryg': v[2], 'zawartosc': v[3],
             'dataWydania': v[4], 'notatka': ' / '.join(str(x) for x in [v[5], v[7], v[8]] if x) or None,
             'cenaRynkowa': row[6].value if isinstance(row[6].value, (int, float)) else None}
    c['stan'] = STAN.get(f, 'nie mam')
    comics.append({k: x for k, x in c.items() if x is not None}); last = comics[-1]
# Arkusz3 = kopia tomów Marvel Fresh 29-109 z Wikipedii (duplikat sekcji FRESH w MOJE KOMIKSY) - pomijamy
for i, c in enumerate(comics): c['id'] = f'kom-{i+1:04d}'
json.dump({'zrodlo': 'Marvel Master Reading Order.xlsx', 'zaimportowano': datetime.date.today().isoformat(),
           'sekcjeCzytania': sections, 'kolejnoscCzytania': reading, 'komiksy': comics},
          open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
from collections import Counter
print(len(reading), 'pozycji czytania;', sum(r['przeczytane'] for r in reading), 'przeczytanych;',
      Counter(r.get('typWpisu', 'zeszyt') for r in reading))
odsy=[r for r in reading if r.get('typWpisu')=='odsylacz']
print('odsyłacze:', len(odsy))
nxt = next(r for r in reading if not r['przeczytane'] and 'typWpisu' not in r)
print('następny:', nxt['sekcja'], nxt['tytul'])
print(len(comics), 'tomów;', Counter((c['seria'], c['stan']) for c in comics))
