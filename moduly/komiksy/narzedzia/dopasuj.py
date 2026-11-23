"""Dopasowanie zeszytów z kolejności czytania (MRO) do tomów kolekcji na podstawie pola 'contents'."""
import re
from collections import defaultdict

PREFIX = re.compile(r'^(?:(?:zeszyty|zeszyt|pojedyncze historie z|pojedyncza historia z|historie z|historia z|fragment z|fragmenty|oraz|materiał z|i|z|cykl:?)\s+)+', re.I)
SEG = re.compile(r"(?P<name>[A-Z0-9][^#|;()\[\]]*?)\s*(?:\((?P<y0>\d{4})\)\s*)?(?:\(\s*vol\.?\s*(?P<v1>\d+)\s*\)|,?\s*vol\.?\s*(?P<v2>\d+)\.?)?\s*(?:\((?P<y1>\d{4})\)\s*)?:?\s*"
                 r"(?P<nums>#\s*-?[\d½]+(?:\.\d+)?(?:\s*[-–]\s*\d+)?(?:\s*(?:,|&|\bi\b|oraz)\s*#?\s*\d+(?:\.\d+)?(?:\s*[-–]\s*\d+)?(?![\d\w]))*)", re.I)
YEAR = re.compile(r'\((?:[^()]*?)(19[3-9]\d|20[0-3]\d)')
DEF_YEAR = {'Marvel Origins': 1965, 'Marvel Now 1.0': 2013, 'Marvel Now 2.0': 2016, 'Marvel Fresh': 2019}

def norm(s):
    s = s.lower().replace('’', "'")
    s = re.sub(r'^the\s+', '', s)
    s = re.sub(r'\b(the|of)\b', ' ', s)
    return re.sub(r'[^a-z0-9]', '', s)

def nums(txt):
    out = []
    for part in re.split(r'\s*(?:,|&|\bi\b|oraz)\s*', txt.replace('#', ' ')):
        part = part.strip()
        m = re.match(r'^(-?\d+(?:\.\d+)?)(?:\s*[-–]\s*(\d+))?$', part)
        if not m: 
            if part == '½': out.append('0.5')
            continue
        a = m.group(1)
        if m.group(2) and '.' not in a and int(m.group(2)) - int(a) < 400:
            out += [str(i) for i in range(int(a), int(m.group(2)) + 1)]
        else: out.append(a)
    return out

def parse_contents(txt, series=None):
    """-> lista (nazwa_norm, vol|None, nr, rok|None)"""
    res = []; prev = None
    txt = txt.replace(' ', ' ')
    for m in SEG.finditer(txt):
        name = PREFIX.sub('', m.group('name').strip(' ,.:&-')).strip()
        name = re.sub(r'\s*\(\d{4}\)$', '', name)
        if not name: continue
        if re.fullmatch(r'(annual|giant-size)', name, re.I) and prev: name = prev + ' Annual'
        prev = re.sub(r'\s+annual$', '', name, flags=re.I)
        vol = m.group('v1') or m.group('v2')
        yx = m.group('y0') or m.group('y1')
        ym = YEAR.search(txt[m.end():m.end() + 60])
        year = int(yx) if yx else int(ym.group(1)) if ym else DEF_YEAR.get(series)
        for n in nums(m.group('nums')):
            res.append((norm(name), int(vol) if vol else None, n, year))
    return res

MRO_T = re.compile(r'^(?P<name>.+?)(?:\s+Vol\.?\s*(?P<vol>\d+))?\s*#\s*(?P<nr>-?[\d½]+(?:\.\d+)?)\b')

def match_all(reading, comics):
    """reading: lista dict(id,tytul); comics: lista rekordów. Zwraca {mro_id: [comic_id,...]}"""
    # 1) MRO: klucze i lata startu serii
    runyear = {}; mro = []
    for it in reading:
        m = MRO_T.match(it['tytul'])
        if not m: continue
        name = norm(re.sub(r'\s*\(\d{4}\)', '', m.group('name')))
        vol = int(m.group('vol')) if m.group('vol') else 1
        nr = m.group('nr').replace('½', '0.5')
        y = re.search(r'\((\d{4})\)', it['tytul'])
        if y and (name, vol) not in runyear: runyear[(name, vol)] = int(y.group(1))
        mro.append((it['id'], name, vol, nr))
    vols = defaultdict(set)
    for _, n, v, _ in mro: vols[n].add(v)
    # 2) indeks tomów
    idx = defaultdict(list)
    for c in comics:
        if not c.get('contents') or c.get('series') in ('Thorgal', 'Bohaterowie i Złoczyńcy DC'): continue
        for name, vol, nr, year in parse_contents(c['contents'], c.get('series')):
            cand = vols.get(name)
            if not cand and name == 'uncannyxmen': name = 'xmen'; cand = vols.get(name)
            if not cand and name == 'xmen': name = 'uncannyxmen'; cand = vols.get(name)
            if not cand and name.startswith('marvelknights'):
                name = name[len('marvelknights'):]; cand = vols.get(name)
            if not cand: continue
            if vol is not None and vol in cand: v = vol
            elif vol == 1 and len(cand) == 1: v = next(iter(cand))
            else:
                # wybór tomu serii po roku
                ys = sorted((runyear.get((name, x), 0), x) for x in cand)
                if year: 
                    ok = [x for y0, x in ys if y0 and y0 <= year + 1]
                    v = ok[-1] if ok else (1 if 1 in cand and not runyear.get((name, 1)) else None)
                elif len(cand) == 1: v = next(iter(cand))
                elif vol is None and 1 in cand: v = 1
                else: v = None
            if v is None: continue
            if c['id'] not in idx[(name, v, nr)]: idx[(name, v, nr)].append(c['id'])
    out = {}
    for mid, n, v, nr in mro:
        ids = idx.get((n, v, nr))
        if ids: out[mid] = ids
    return out
