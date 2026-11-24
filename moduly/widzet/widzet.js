/* Widżet Androida „Następny komiks” – część JS (działa tylko w APK; natywna część w android-native/).
 * - Wysyła do widżetu kolejkę ~40 następnych pozycji Master Reading Order (tytuł, część, tom i półka).
 * - Odbiera to, co odznaczono na widżecie przyciskiem „✓ Przeczytane”, i zapisuje jako przeczytane (readingOrder, readAt = chwila kliknięcia).
 * Synchronizacja: przy starcie, przy powrocie do aplikacji i po każdej zmianie kolejności/przeczytanych.
 */
(function () {
  const W = () => {
    const C = window.Capacitor;
    if (!C || !C.isNativePlatform || !C.isNativePlatform()) return null;
    if (C.isPluginAvailable && !C.isPluginAvailable('Widzet')) return null;
    return C.Plugins && C.Plugins.Widzet;
  };
  if (!W()) return;

  let trwa = false, znowu = false;
  async function sync() {
    if (trwa) { znowu = true; return; }
    trwa = true;
    try {
      const w = W();
      // 1. odznaczone na widżecie -> przeczytane w aplikacji
      const r = await w.odbierz();
      let z = []; try { z = JSON.parse((r && r.przeczytane) || '[]'); } catch (e) { }
      if (z.length) {
        const old = new Map((await DB.all('readingOrder')).map(x => [x.id, x]));
        await DB.putMany('readingOrder', z.map(x => Object.assign({}, old.get(x.id) || {}, { id: x.id, order: x.i + 1, part: x.sec, title: x.title, read: true, readAt: x.at, skipped: false, zWidzetu: true })));
        App.ui.toast(`📖 Z widżetu: ${z.length === 1 ? '„' + z[0].title + '” przeczytane' : z.length + ' pozycji przeczytanych'}`);
        if (/^#\/(czytanie|postep)/.test(location.hash)) App.refresh();
      }
      // 2. kolejka -> widżet
      if (!App.has('komiksy.mro')) return;
      const { list, S } = await App.call('komiksy.mro');
      const dalej = list.filter(x => x.i > S.last && S.counts(x) && !S.isRead(x)).slice(0, 40);
      const out = [];
      for (const x of dalej) {
        let info = x.sec + (x.ev ? ' · ' + x.ev : '');
        const ids = S.vols(x);
        if (ids.length) {
          const k = await DB.get('comics', ids[0]);
          if (k) {
            info += ' · ' + (k.series ? k.series + (k.volume != null ? ' ' + k.volume : '') : (k.title || ''));
            const gdzie = App.has('polki.tekst') ? App.call('polki.tekst', 'comic', k) : '';
            if (gdzie) info += ' · 📍 ' + gdzie;
          }
        } else if (x.wyd) info += ' · ' + x.wyd;
        out.push({ id: x.id, i: x.i, sec: x.sec, title: x.title, info });
      }
      await w.ustaw({ lista: JSON.stringify(out) });
    } catch (e) { console.warn('widżet', e); }
    finally {
      trwa = false;
      if (znowu) { znowu = false; setTimeout(sync, 500); }
    }
  }
  let tmr = null;
  const pozniej = (ms = 2000) => { clearTimeout(tmr); tmr = setTimeout(sync, ms); };

  DB.on('readingOrder', () => pozniej());
  DB.on('settings', () => pozniej(4000));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') pozniej(300); });
  setTimeout(sync, 5000);
  App.provide('widzet.odswiez', sync);
})();
