/* Wspólna baza danych aplikacji „Moje kolekcje” (IndexedDB, offline).
 * Każdy rekord: { id, createdAt, updatedAt, deleted } + pola danej kolekcji.
 * Usunięcie = deleted:true (tzw. nagrobek), żeby synchronizacja wiedziała, że rekord zniknął.
 * API (globalne DB):
 *   await DB.all(store, {withDeleted})   -> tablica rekordów
 *   await DB.get(store, id)
 *   await DB.put(store, obj)             -> zapisuje (nadaje id/updatedAt), zwraca rekord
 *   await DB.putMany(store, arr, {keepDates})
 *   await DB.remove(store, id)           -> miękkie usunięcie
 *   await DB.exportAll() / DB.mergeAll(dump) -> do synchronizacji
 *   DB.on(store|'*', cb)                 -> powiadomienie o zmianach
 */
(function () {
  const NAME = 'moje-kolekcje';
  // Wszystkie kolekcje w jednej bazie. Nowy moduł = nowa nazwa tutaj.
  // Wersji bazy nie trzeba już podbijać ręcznie: brakujące kolekcje dokładamy same (open() niżej).
  const STORES = ['games', 'plays', 'players', 'comics', 'readingOrder', 'shoppingList', 'listings', 'settings', 'loans', 'challenges', 'shelves', 'events', 'priceHistory'];

  let dbp = null;
  function open() {
    if (dbp) return dbp;
    // Otwieramy bazę w obecnej wersji; jeśli brakuje którejś kolekcji, podnosimy wersję o 1 i ją tworzymy.
    const openV = v => new Promise((res, rej) => {
      const r = v ? indexedDB.open(NAME, v) : indexedDB.open(NAME);
      r.onupgradeneeded = () => {
        const db = r.result;
        STORES.forEach(s => { if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' }); });
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    dbp = openV().then(db => {
      if (STORES.every(s => db.objectStoreNames.contains(s))) return db;
      const v = db.version + 1; db.close(); return openV(v);
    }).then(db => { db.onversionchange = () => { db.close(); dbp = null; }; return db; });
    return dbp;
  }
  function tx(store, mode, fn) {
    return open().then(db => new Promise((res, rej) => {
      const t = db.transaction(store, mode);
      const s = t.objectStore(store);
      let out;
      Promise.resolve(fn(s)).then(v => { out = v; });
      t.oncomplete = () => res(out);
      t.onerror = () => rej(t.error);
    }));
  }
  const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

  const listeners = {};
  function emit(store) {
    (listeners[store] || []).concat(listeners['*'] || []).forEach(cb => { try { cb(store); } catch (e) { console.error(e); } });
  }
  function uid() {
    return (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  }
  const now = () => new Date().toISOString();

  const DB = {
    STORES, uid,
    on(store, cb) { (listeners[store] = listeners[store] || []).push(cb); },
    async all(store, opt = {}) {
      const rows = await tx(store, 'readonly', s => req(s.getAll()));
      return opt.withDeleted ? rows : rows.filter(r => !r.deleted);
    },
    async get(store, id) {
      const r = await tx(store, 'readonly', s => req(s.get(id)));
      return r && !r.deleted ? r : null;
    },
    async put(store, obj) {
      const rec = Object.assign({}, obj);
      rec.id = rec.id || uid();
      rec.createdAt = rec.createdAt || now();
      rec.updatedAt = now();
      rec.deleted = !!rec.deleted;
      await tx(store, 'readwrite', s => req(s.put(rec)));
      emit(store);
      return rec;
    },
    async putMany(store, arr, opt = {}) {
      const t = now();
      const recs = arr.map(o => {
        const r = Object.assign({}, o);
        r.id = r.id || uid();
        r.createdAt = r.createdAt || t;
        if (!opt.keepDates || !r.updatedAt) r.updatedAt = t;
        r.deleted = !!r.deleted;
        return r;
      });
      await tx(store, 'readwrite', s => { recs.forEach(r => s.put(r)); });
      emit(store);
      return recs;
    },
    async remove(store, id) {
      const r = await tx(store, 'readonly', s => req(s.get(id)));
      if (!r) return;
      r.deleted = true; r.updatedAt = now();
      await tx(store, 'readwrite', s => req(s.put(r)));
      emit(store);
    },
    async exportAll() {
      const out = { app: 'moje-kolekcje', format: 1, exportedAt: now(), data: {} };
      for (const s of STORES) out.data[s] = await DB.all(s, { withDeleted: true });
      return out;
    },
    /* Scalanie: dla każdego id wygrywa rekord z nowszym updatedAt. Zwraca liczbę zmian lokalnych. */
    async mergeAll(dump) {
      let changed = 0;
      for (const s of STORES) {
        const incoming = (dump.data && dump.data[s]) || [];
        if (!incoming.length) continue;
        const local = await DB.all(s, { withDeleted: true });
        const map = new Map(local.map(r => [r.id, r]));
        const toPut = incoming.filter(r => { const l = map.get(r.id); return !l || (r.updatedAt || '') > (l.updatedAt || ''); });
        if (toPut.length) {
          await tx(s, 'readwrite', st => { toPut.forEach(r => st.put(r)); });
          changed += toPut.length; emit(s);
        }
      }
      return changed;
    },
    // Ustawienia jako pojedyncze rekordy {id:'klucz', value}
    async setting(key, value) {
      if (value === undefined) { const r = await DB.get('settings', key); return r ? r.value : undefined; }
      return DB.put('settings', { id: key, value });
    },
    // Lokalne (niesynchronizowane) rzeczy, np. uchwyt do pliku — osobna mini-baza
    async local(key, value) {
      const db = await new Promise((res, rej) => {
        const r = indexedDB.open(NAME + '-local', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('kv');
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
      });
      return new Promise((res, rej) => {
        const t = db.transaction('kv', value === undefined ? 'readonly' : 'readwrite');
        const s = t.objectStore('kv');
        const r = value === undefined ? s.get(key) : (value === null ? s.delete(key) : s.put(value, key));
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
      });
    }
  };
  window.DB = DB;
})();
