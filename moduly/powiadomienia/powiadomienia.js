/* Moduł „Powiadomienia” (🔔): przypomnienia o premierach z listy zakupów i o oddaniu pożyczonych rzeczy (+ promocje z listy życzeń).
 * - Android (APK): prawdziwe zaplanowane powiadomienia systemowe (@capacitor/local-notifications) – przychodzą też przy zamkniętej aplikacji.
 *   Plan odświeża się przy każdym uruchomieniu i przy każdej zmianie listy zakupów / wypożyczeń.
 * - Przeglądarka/Windows: przeglądarka nie umie planować powiadomień na później, więc po otwarciu aplikacji
 *   (i co 30 min, gdy jest otwarta) pokazuje te, które przypadają na dziś.
 * Ustawienia osobno dla każdego urządzenia (localStorage 'powiadomienia').
 * Usługa: App.call('powiadomienia.teraz', tytuł, treść, {go:'zakładka'}) – powiadomienie od razu.
 */
(function () {
  const esc = s => App.ui.esc(s);
  const KEY = 'powiadomienia';
  const DOMYSLNE = { wl: true, premiery: true, dzienPrzed: true, pozyczki: true, godzina: 9 };
  const ust = () => { try { return Object.assign({}, DOMYSLNE, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { return Object.assign({}, DOMYSLNE); } };
  const zapiszUst = s => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { } };
  const lsGet = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } };
  const LN = () => { const C = window.Capacitor; return C && C.isNativePlatform && C.isNativePlatform() && C.Plugins && C.Plugins.LocalNotifications; };
  const dzis = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const naDzien = (ymd, h) => { const [y, m, d] = ymd.split('-').map(Number); return new Date(y, m - 1, d, h, 0, 0); };
  const plus = (ymd, n) => { const d = naDzien(ymd, 12); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const idZ = s => { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h) % 2000000000 + 1; };

  window.IKONY = Object.assign(window.IKONY || {}, { powiadomienia: '<path class="f" d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/>' });
  window.IKONY_KOLOR = Object.assign(window.IKONY_KOLOR || {}, { powiadomienia: '#e0a100' });

  /* ---------- co i kiedy ---------- */
  async function plan() {
    const s = ust(), t = dzis(), out = [];
    if (s.premiery) {
      const lista = (await DB.all('shoppingList')).filter(x => !x.bought && x.releaseDate && x.releaseDate >= t);
      lista.forEach(x => {
        const tyt = x.title || ((x.series || '') + (x.volume != null ? ' ' + x.volume : ''));
        out.push({ key: 'prem|' + x.id + '|' + x.releaseDate, dzien: x.releaseDate, title: '📚 Premiera dziś', body: tyt + (x.price ? ` · ${(+x.price).toFixed(2).replace('.', ',')} zł` : '') + (x.publisher ? ` · ${x.publisher}` : ''), go: 'zakupy' });
        if (s.dzienPrzed && plus(x.releaseDate, -1) >= t) out.push({ key: 'prem1|' + x.id + '|' + x.releaseDate, dzien: plus(x.releaseDate, -1), title: '📚 Jutro premiera', body: tyt, go: 'zakupy' });
      });
    }
    if (s.pozyczki) {
      const loans = (await DB.all('loans')).filter(l => !l.returnedAt && l.dueAt);
      loans.forEach(l => {
        const co = `„${l.title || 'pożyczona rzecz'}”`;
        const tekst = l.direction === 'in' ? `Oddaj ${co}${l.person ? ' – ' + l.person : ''}` : `${l.person || 'Ktoś'} ma oddać ${co}`;
        if (l.dueAt >= t) {
          out.push({ key: 'poz|' + l.id + '|' + l.dueAt, dzien: l.dueAt, title: '🤝 Dziś termin oddania', body: tekst, go: 'wypozyczenia' });
          if (s.dzienPrzed && plus(l.dueAt, -1) >= t) out.push({ key: 'poz1|' + l.id + '|' + l.dueAt, dzien: plus(l.dueAt, -1), title: '🤝 Jutro termin oddania', body: tekst, go: 'wypozyczenia' });
        } else {
          // po terminie: przypomnienie przy następnym dniu (odnawia się przy każdym otwarciu aplikacji)
          out.push({ key: 'pozpo|' + l.id + '|' + t, dzien: t, title: '🤝 Minął termin oddania (' + App.ui.fmtDate(l.dueAt) + ')', body: tekst, go: 'wypozyczenia', zaleglosc: true });
        }
      });
    }
    out.forEach(x => { x.at = naDzien(x.dzien, s.godzina); });
    return out.sort((a, b) => a.at - b.at);
  }

  /* ---------- Android: planowanie ---------- */
  let kanal = false;
  async function przygotuj(pytaj) {
    const ln = LN(); if (!ln) return false;
    let p = await ln.checkPermissions();
    if (p.display !== 'granted' && pytaj) p = await ln.requestPermissions();
    if (!kanal) { try { await ln.createChannel({ id: 'kolekcje', name: 'Przypomnienia', description: 'Premiery, pożyczki, promocje', importance: 4 }); } catch (e) { } kanal = true; }
    return p.display === 'granted';
  }
  let tmr = null;
  const odswiezPozniej = () => { clearTimeout(tmr); tmr = setTimeout(() => odswiez().catch(e => console.warn('powiadomienia', e)), 1500); };
  async function odswiez() {
    const ln = LN();
    const s = ust();
    if (!ln) return pokazDzisiejsze();
    const stare = lsGet('pw.ids', []);
    if (stare.length) { try { await ln.cancel({ notifications: stare.map(id => ({ id })) }); } catch (e) { } }
    lsSet('pw.ids', []);
    if (!s.wl || !await przygotuj(false)) return;
    const teraz = Date.now();
    const pokazane = lsGet('pw.pokazane', {});
    // zaległe (po terminie): raz dziennie – o wybranej godzinie albo za minutę, jeśli godzina już minęła
    const lista = (await plan()).filter(x => !(x.zaleglosc && pokazane[x.key]))
      .map(x => { if (x.zaleglosc && x.at.getTime() <= teraz) x.at = new Date(teraz + 60000); return x; })
      .filter(x => x.at.getTime() > teraz).slice(0, 60);
    if (!lista.length) return;
    await ln.schedule({ notifications: lista.map(x => ({ id: idZ(x.key), title: x.title, body: x.body, channelId: 'kolekcje', smallIcon: 'ic_powiadomienie', schedule: { at: x.at.toISOString(), allowWhileIdle: true }, extra: { go: x.go } })) });
    lista.filter(x => x.zaleglosc).forEach(x => { pokazane[x.key] = 1; });
    lsSet('pw.pokazane', pokazane);
    lsSet('pw.ids', lista.map(x => idZ(x.key)));
  }

  /* ---------- przeglądarka: dzisiejsze po otwarciu ---------- */
  async function pokazSystemowe(title, body, go) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return false;
    try {
      const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
      if (reg) await reg.showNotification(title, { body, icon: 'icons/icon-192.png', tag: title + body, data: { go } });
      else { const n = new Notification(title, { body, icon: 'icons/icon-192.png' }); n.onclick = () => { window.focus(); if (go) App.go(go); }; }
      return true;
    } catch (e) { return false; }
  }
  async function pokazDzisiejsze() {
    const s = ust(); if (!s.wl) return;
    const t = dzis(), h = new Date().getHours();
    const pokazane = lsGet('pw.pokazane', {});
    Object.keys(pokazane).forEach(k => { const d = k.split('|').pop(); if (d < plus(t, -40)) delete pokazane[k]; });
    const teraz = (await plan()).filter(x => x.dzien === t && (h >= s.godzina || x.zaleglosc) && !pokazane[x.key]);
    for (const x of teraz) {
      if (!await pokazSystemowe(x.title, x.body, x.go)) App.ui.toast(`${x.title}: ${x.body}`, 6000);
      pokazane[x.key] = 1;
    }
    lsSet('pw.pokazane', pokazane);
  }

  async function teraz(title, body, extra = {}) {
    if (!ust().wl) return;
    const ln = LN();
    if (ln && await przygotuj(false)) {
      await ln.schedule({ notifications: [{ id: idZ(title + body + Date.now()), title, body, channelId: 'kolekcje', smallIcon: 'ic_powiadomienie', schedule: { at: new Date(Date.now() + 1500).toISOString(), allowWhileIdle: true }, extra }] });
    } else if (!await pokazSystemowe(title, body, extra.go)) App.ui.toast(`${title}: ${body}`, 6000);
  }

  /* ---------- zakładka ---------- */
  async function render(el) {
    const s = ust(), ln = LN();
    let zgoda = 'nieznana';
    if (ln) { try { zgoda = (await ln.checkPermissions()).display; } catch (e) { } }
    else zgoda = 'Notification' in window ? Notification.permission : 'brak';
    const lista = await plan();
    const chk = (k, l) => `<label class="chk"><input type="checkbox" data-k="${k}" ${s[k] ? 'checked' : ''}> <span>${l}</span></label>`;
    el.innerHTML = `
      <h2>Powiadomienia</h2>
      <div class="card">
        ${zgoda === 'granted' ? '<p>✅ Powiadomienia są włączone na tym urządzeniu.</p>' : `<p>${zgoda === 'denied' ? '⛔ Powiadomienia są zablokowane w ustawieniach ' + (ln ? 'telefonu (Ustawienia → Aplikacje → Moje kolekcje → Powiadomienia).' : 'przeglądarki (kłódka obok adresu).') : 'Powiadomienia nie są jeszcze włączone.'}</p>${zgoda !== 'denied' && zgoda !== 'brak' ? '<p><button class="primary" id="pwOn">🔔 Włącz powiadomienia</button></p>' : ''}`}
        ${chk('wl', 'Powiadomienia w ogóle')}
        ${chk('premiery', 'Premiery z listy zakupów')}
        ${chk('pozyczki', 'Termin oddania pożyczonych rzeczy')}
        ${chk('dzienPrzed', 'Także dzień wcześniej')}
        <label style="max-width:220px"><span>O której godzinie</span><select id="pwH">${[7, 8, 9, 10, 12, 16, 18, 20].map(h => `<option value="${h}" ${h === s.godzina ? 'selected' : ''}>${h}:00</option>`).join('')}</select></label>
        <p class="row"><button id="pwTest">Wyślij próbne</button></p>
        <p class="muted" style="font-size:13px">${ln ? 'Telefon dostaje je o wybranej godzinie, także gdy aplikacja jest zamknięta. Promocje z listy życzeń przychodzą od razu po sprawdzeniu cen.' : 'Na komputerze przeglądarka pokazuje powiadomienia tylko wtedy, gdy aplikacja jest otwarta (przy starcie i co 30 minut). Pewne przypomnienia daje telefon z aplikacją.'} Ustawienia dotyczą tylko tego urządzenia.</p>
      </div>
      <h3>Zaplanowane</h3>
      ${lista.length ? `<div class="list">${lista.slice(0, 40).map(x => `<div class="li" data-go="${x.go}" style="min-height:48px"><div class="main"><div class="t">${esc(x.title)}</div><div class="s">${esc(x.body)}</div></div><div class="num" style="min-width:90px;font-weight:500">${x.at.toLocaleDateString('pl-PL')}<div class="s muted">${x.at.getHours()}:00</div></div></div>`).join('')}</div>` : '<div class="empty">Nic nie jest zaplanowane. Dodaj daty premier na liście zakupów albo termin oddania przy wypożyczeniu.</div>'}`;
    el.querySelectorAll('[data-k]').forEach(i => i.onchange = () => { const n = ust(); n[i.dataset.k] = i.checked; zapiszUst(n); odswiezPozniej(); render(el); });
    el.querySelector('#pwH').onchange = e => { const n = ust(); n.godzina = +e.target.value; zapiszUst(n); odswiezPozniej(); render(el); };
    el.querySelectorAll('[data-go]').forEach(li => li.onclick = () => App.go(li.dataset.go));
    const on = el.querySelector('#pwOn');
    if (on) on.onclick = async () => {
      if (ln) await przygotuj(true); else if ('Notification' in window) await Notification.requestPermission();
      odswiezPozniej(); render(el);
    };
    el.querySelector('#pwTest').onclick = async () => {
      if (ln) await przygotuj(true); else if ('Notification' in window && Notification.permission === 'default') await Notification.requestPermission();
      await teraz('🔔 Próba', 'Tak będą wyglądać przypomnienia z Moich kolekcji', { go: 'powiadomienia' });
    };
  }

  App.registerModule({ id: 'powiadomienia', title: 'Powiadomienia', icon: '🔔', order: 905, render });
  App.provide('powiadomienia.teraz', teraz);
  App.provide('powiadomienia.odswiez', odswiezPozniej);

  DB.on('shoppingList', odswiezPozniej);
  DB.on('loans', odswiezPozniej);
  // start: Android planuje (i pyta raz o zgodę), przeglądarka pokazuje dzisiejsze
  setTimeout(async () => {
    const ln = LN();
    if (ln) {
      try {
        if (!lsGet('pw.pytano', false)) { lsSet('pw.pytano', true); await przygotuj(true); }
        ln.addListener('localNotificationActionPerformed', a => { const go = a && a.notification && a.notification.extra && a.notification.extra.go; if (go) App.go(go); });
      } catch (e) { console.warn(e); }
    } else if (navigator.serviceWorker) {
      navigator.serviceWorker.addEventListener('message', e => { if (e.data && e.data.go) App.go(e.data.go); });
    }
    odswiez().catch(e => console.warn('powiadomienia', e));
    if (!ln) setInterval(() => pokazDzisiejsze().catch(() => { }), 30 * 60000);
  }, 4000);
})();
