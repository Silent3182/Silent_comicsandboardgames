#!/usr/bin/env python3
"""Pobiera zapowiedzi z egmont.pl/zapowiedzi i zapisuje zapowiedzi.json (czyta je aplikacja).

Uruchamiane co tydzień przez GitHub Actions (.github/workflows/zapowiedzi.yml).
Bez zewnętrznych bibliotek. Pozycje znane z poprzedniego pliku zachowują datę 'dodano'.
"""
import html, json, re, sys, time, urllib.request
from datetime import datetime, timezone

BASE = 'https://egmont.pl'
OUT = sys.argv[1] if len(sys.argv) > 1 else 'zapowiedzi.json'
UA = {'User-Agent': 'Mozilla/5.0 (compatible; MojeKolekcje/1.0)', 'Accept-Language': 'pl'}
MIES = {'sty': 1, 'lut': 2, 'mar': 3, 'kwi': 4, 'maj': 5, 'cze': 6, 'lip': 7, 'sie': 8, 'wrz': 9, 'paź': 10, 'paz': 10, 'lis': 11, 'gru': 12}


def get(url):
    for i in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40) as r:
                return r.read().decode('utf-8', 'replace')
        except Exception as e:
            print('blad', url, e, file=sys.stderr)
            time.sleep(5 * (i + 1))
    return ''


def txt(s):
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', s or ''))).strip()


def data_pl(s):
    m = re.search(r'(\d{1,2})\s+([a-ząćęłńóśźż]{3})\w*\.?\s+(\d{4})', s or '', re.I)
    if not m or m.group(2).lower() not in MIES:
        return ''
    return '%s-%02d-%02d' % (m.group(3), MIES[m.group(2).lower()], int(m.group(1)))


def detal(h, nazwa):
    m = re.search(re.escape(nazwa) + r'\s*</dt>\s*<dd[^>]*>(.*?)</dd>', h, re.S)
    return txt(m.group(1)) if m else ''


def lista():
    poz, seen = [], set()
    for p in range(1, 15):
        h = get(BASE + '/zapowiedzi' + ('?p=%d' % p if p > 1 else ''))
        nowe = 0
        for m in re.finditer(r'class="product-item-link"\s+href="([^"]+)"[^>]*>(.*?)</a>', h, re.S):
            url = m.group(1)
            sku = re.search(r'-(\d+)\.html', url)
            if not sku or sku.group(1) in seen:
                continue
            seen.add(sku.group(1))
            nowe += 1
            poz.append({'id': sku.group(1), 'title': txt(m.group(2)), 'url': url})
        if not nowe:
            break
        time.sleep(1)
    return poz


def main():
    try:
        stare = {x['id']: x for x in json.load(open(OUT, encoding='utf-8')).get('pozycje', [])}
    except Exception:
        stare = {}
    dzis = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    wynik = []
    for x in lista():
        h = get(x['url'])
        img = re.search(r'property="og:image"\s+content="([^"]+)"', h)
        cena = re.search(r'product:price:amount"\s+content="([\d.]+)"', h)
        x.update({
            'series': detal(h, 'Seria/Cykl'),
            'release': data_pl(detal(h, 'Data wydania')),
            'price': float(cena.group(1)) if cena else None,
            'img': img.group(1) if img else '',
            'typ': detal(h, 'Rodzaj') or '',
            'dodano': stare.get(x['id'], {}).get('dodano', dzis),
        })
        wynik.append(x)
        time.sleep(0.7)
    if not wynik:
        print('Brak pozycji - nie nadpisuję pliku', file=sys.stderr)
        sys.exit(0)
    wynik.sort(key=lambda x: (x['release'] or '9999', x['title']))
    json.dump({'zrodlo': BASE + '/zapowiedzi', 'data': dzis, 'pozycje': wynik},
              open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('zapisano', len(wynik))


if __name__ == '__main__':
    main()
