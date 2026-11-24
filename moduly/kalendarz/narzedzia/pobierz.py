#!/usr/bin/env python3
"""Pobiera kalendarz konwentów z konwenty-poludniowe.pl i zapisuje wydarzenia.json (dla wersji w przeglądarce).

Strona nie ma RSS ani iCal; jej lista ładuje się z publicznego zapytania getArticles (POST), które tu czytamy.
Ten sam format tworzy aplikacja na Androidzie (moduly/kalendarz/kalendarz.js, funkcja parsujKP).
Uruchamia go co tydzień GitHub Actions (.github/workflows/kalendarz.yml); ręcznie:  python3 pobierz.py ../../../wydarzenia.json
"""
import datetime, html, json, re, sys, urllib.parse, urllib.request

KP = 'https://konwenty-poludniowe.pl'
API = KP + '/index.php?option=com_ajax&plugin=konwenty&group=ajax&format=raw&task=getArticles'


def txt(s):
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', s or ''))).strip()


def d2iso(s):
    m = re.search(r'(\d{1,2})\.(\d{1,2})\.(\d{4})', s or '')
    return f'{m[3]}-{int(m[2]):02d}-{int(m[1]):02d}' if m else ''


def parsuj(h):
    out = []
    for tr in re.findall(r'<tr[^>]*>(.*?)</tr>', h, re.S):
        c = re.findall(r'<td[^>]*>(.*?)</td>', tr, re.S)
        if len(c) < 5:
            continue
        a = re.search(r'href="(/konwenty/kalendarz/(\d+)[^"]*)"', c[1])
        daty = txt(c[0]).split(' - ')
        start = d2iso(daty[0])
        if not a or not start:
            continue
        end = d2iso(daty[1] if len(daty) > 1 else daty[0]) or start
        if end < start:
            end = start
        size = (re.search(r'title="([^"]+)"', c[2]) or [None, ''])[1]
        title = txt(c[1])
        out.append({'id': 'kp-' + a[2], 'title': title, 'start': start, 'end': end, 'city': txt(c[3]), 'kat': txt(c[4]),
                    'size': '' if size == 'brak danych' else size, 'free': 'Darmowy' in c[2],
                    'cancelled': '(Odwołane)' in title, 'url': KP + a[1]})
    return out


def main(cel):
    r = datetime.date.today().year
    body = urllib.parse.urlencode([('search_words', '')] + [('rokval[]', str(y)) for y in (r - 1, r, r + 1, r + 2)]).encode()
    req = urllib.request.Request(API, data=body, headers={
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest',
        'User-Agent': 'Mozilla/5.0 (kalendarz kolekcji)'})
    h = urllib.request.urlopen(req, timeout=60).read().decode('utf-8', 'replace')
    w = parsuj(h)
    od = (datetime.date.today() - datetime.timedelta(days=400)).isoformat()
    w = [e for e in w if e['end'] >= od]
    if len(w) < 10:
        sys.exit(f'Za mało wydarzeń ({len(w)}) – strona mogła się zmienić, nie nadpisuję pliku.')
    dane = {'zrodlo': KP + '/konwenty/kalendarz', 'pobrano': datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds'), 'wydarzenia': w}
    with open(cel, 'w', encoding='utf-8') as f:
        json.dump(dane, f, ensure_ascii=False, indent=0)
    print(f'Zapisano {len(w)} wydarzeń do {cel}')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'wydarzenia.json')
