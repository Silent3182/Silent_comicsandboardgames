# Generuje moduly/gry-plus/dane-gry.js z publicznego zestawu danych BGG (TidyTuesday 2022-01-25: details.csv, ratings.csv).
# Użycie: python3 przygotuj.py <folder z csv> <katalog aplikacji>
import pandas as pd, json, re, ast, sys
src, repo = sys.argv[1], sys.argv[2]
d = pd.read_csv(src+'/details.csv'); r = pd.read_csv(src+'/ratings.csv')
txt = open(repo+'/moduly/planszowki/dane-bgg.js', encoding='utf-8').read()

# proste wyciągnięcie wierszy
rows=[]
for line in txt.splitlines():
    line=line.strip().rstrip(',')
    if line.startswith('[') and line.endswith(']') and line[1:2].isdigit():
        rows.append(json.loads(line))
print('kolekcja', len(rows))
L = lambda s: [] if not isinstance(s,str) else ast.literal_eval(s)
d = d.merge(r[['id','rank','bayes_average','average','users_rated','thumbnail']], on='id', how='left')
det = {int(x.id): x for x in d.itertuples()}
mine = {row[0] for row in rows}
names = {}
def idx(dic, v):
    if v not in dic: dic[v] = len(dic)
    return dic[v]
MECH, CAT, DES = {}, {}, {}
def info(x, full=False):
    o = {'m':[idx(MECH,m) for m in L(x.boardgamemechanic)], 'c':[idx(CAT,c) for c in L(x.boardgamecategory)], 'd':[idx(DES,v) for v in L(x.boardgamedesigner) if v!='(Uncredited)'],
         'p':[int(x.minplayers or 0), int(x.maxplayers or 0)], 't': int(x.playingtime or 0)}
    return o
gry = {}
for row in rows:
    bid, exp = row[0], row[1]
    if not exp and bid in det: gry[bid] = info(det[bid])
print('gry z danymi', len(gry), 'z', sum(1 for r_ in rows if not r_[1]))
# dodatki: baza dla dodatków z kolekcji
expname = {}
for x in d.itertuples():
    for e in L(x.boardgameexpansion): expname.setdefault(e.lower(), []).append(int(x.id))
baza = {}
miss=[]
for row in rows:
    if row[1]:
        c = expname.get(row[2].lower(), [])
        c2 = [b for b in c if b in mine] or c
        if c2: baza[row[0]] = c2[0]
        else:
            bases=[b for b in rows if not b[1] and row[2].lower().startswith(b[2].lower())]
            if bases: baza[row[0]]=max(bases,key=lambda b:len(b[2]))[0]
            else: miss.append(row[2])
print('dodatki z bazą', len(baza), 'bez', len(miss), miss[:15])
# lista dodatków dla posiadanych gier bazowych (bez promek)
promo = re.compile(r'promo|promocard|promo card|mini.?expansion|kickstarter|exclusive|bonus|goodie|card\b|cards\b|insert|organizer|sleeve|playmat|dice tower|boardgamegeek|bgg', re.I)
dod = {}
for bid in gry:
    ex = [e for e in L(det[bid].boardgameexpansion) if not promo.search(e)]
    if ex: dod[bid] = ex[:30]
# kandydaci do rekomendacji
cand = d[(d['rank'].fillna(0)>0) & (~d.id.isin(mine))].sort_values('rank').head(2000)
kand = []
for x in cand.itertuples():
    o = info(x); kand.append([int(x.id), x.primary, int(x.yearpublished or 0), round(float(x.bayes_average),2), int(x.rank), o['m'], o['c'], o['d'], o['p'], o['t'], (x.thumbnail or '') if isinstance(x.thumbnail,str) else ''])
inv = lambda dic: [k for k,_ in sorted(dic.items(), key=lambda kv: kv[1])]
out = {'zrodlo':'BoardGameGeek (zestaw danych TidyTuesday, stan ze stycznia 2022)', 'mech':inv(MECH), 'kat':inv(CAT), 'aut':inv(DES), 'gry':gry, 'baza':baza, 'dodatki':dod, 'kand':kand}
s = json.dumps(out, ensure_ascii=False, separators=(',',':'))
open(repo+'/moduly/gry-plus/dane-gry.js','w',encoding='utf-8').write('/* Dane o grach z BoardGameGeek (mechaniki, kategorie, autorzy, dodatki, kandydaci do rekomendacji).\n * Źródło: publiczny zestaw danych BGG z TidyTuesday (stan ze stycznia 2022) – nowsze gry mogą nie mieć danych.\n * Generuje: przygotuj.py (poza aplikacją). */\nwindow.GRY_DANE = ' + s + ';\n')
print(len(s), 'mech', len(MECH), 'kat', len(CAT), 'aut', len(DES))
