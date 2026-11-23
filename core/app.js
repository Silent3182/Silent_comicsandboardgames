/* Rdzeń aplikacji: rejestr modułów (zakładek), nawigacja, drobne pomocniki UI.
 * Moduł rejestruje się tak:
 *   App.registerModule({ id:'planszowki', title:'Planszówki', icon:'🎲', order:10,
 *                        render(el, params, ctx) { ... } });
 * ctx = { db: DB, ui: App.ui, go: App.go }
 * Moduł może też wystawić akcje dla innych modułów:
 *   App.provide('sprzedaz.wystaw', fn)   /   App.call('sprzedaz.wystaw', {itemType:'game', itemId})
 */
(function () {
  const modules = [];
  const services = {};
  let current = null;

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const ui = {
    esc,
    h(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; },
    toast(msg, ms = 2500) {
      const el = document.getElementById('toast');
      el.textContent = msg; el.classList.add('show');
      clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('show'), ms);
    },
    confirm(msg) { return Promise.resolve(window.confirm(msg)); },
    /* Okno dialogowe z formularzem. fields: [{name,label,type,value,options,step,placeholder}] -> obiekt lub null */
    form(title, fields, opt = {}) {
      return new Promise(resolve => {
        const dlg = document.createElement('dialog');
        dlg.className = 'dlg';
        dlg.innerHTML = `<form method="dialog"><h3>${esc(title)}</h3>${fields.map(f => {
          const v = f.value == null ? '' : f.value;
          let input;
          if (f.type === 'select') input = `<select name="${f.name}">${f.options.map(o => { const [val, lab] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(val)}" ${String(val) === String(v) ? 'selected' : ''}>${esc(lab)}</option>`; }).join('')}</select>`;
          else if (f.type === 'textarea') input = `<textarea name="${f.name}" rows="${f.rows || 3}" placeholder="${esc(f.placeholder || '')}">${esc(v)}</textarea>`;
          else if (f.type === 'checkbox') input = `<input type="checkbox" name="${f.name}" ${v ? 'checked' : ''}>`;
          else if (f.type === 'html') return `<div class="field-html">${f.html}</div>`;
          else input = `<input type="${f.type || 'text'}" name="${f.name}" value="${esc(v)}" ${f.step ? `step="${f.step}"` : ''} placeholder="${esc(f.placeholder || '')}" ${f.list ? `list="${f.list}"` : ''}>`;
          return `<label class="${f.type === 'checkbox' ? 'chk' : ''}"><span>${esc(f.label)}</span>${input}</label>`;
        }).join('')}<div class="dlg-btns"><button value="cancel" class="ghost">Anuluj</button><button value="ok" class="primary">${esc(opt.ok || 'Zapisz')}</button></div></form>`;
        document.body.appendChild(dlg);
        if (opt.onMount) opt.onMount(dlg);
        dlg.addEventListener('close', () => {
          let out = null;
          if (dlg.returnValue === 'ok') {
            out = {};
            fields.forEach(f => {
              if (!f.name) return;
              const el = dlg.querySelector(`[name="${f.name}"]`);
              if (!el) return;
              if (f.type === 'checkbox') out[f.name] = el.checked;
              else if (f.type === 'number') out[f.name] = el.value === '' ? null : Number(el.value);
              else out[f.name] = el.value.trim();
            });
          }
          dlg.remove(); resolve(out);
        });
        dlg.showModal();
      });
    },
    fmtDate(iso) { if (!iso) return ''; const d = new Date(iso); return d.toLocaleDateString('pl-PL'); },
    today() { const d = new Date(); return d.toISOString().slice(0, 10); }
  };

  /* Nawigacja: na komputerze boczny pasek, na telefonie dolny pasek z 4 głównymi zakładkami
   * (NAV_MAIN) i przyciskiem „Więcej” z resztą. Krótkie podpisy na telefon: NAV_SHORT. */
  const NAV_MAIN = ['planszowki', 'rozgrywki', 'komiksy', 'czytanie'];
  const NAV_SHORT = { czytanie: 'Czytanie', planszowki: 'Gry', ustawienia: 'Ustawienia' };
  function renderNav() {
    const nav = document.getElementById('nav');
    const isMain = m => NAV_MAIN.includes(m.id);
    let lastGroup = null;
    const btn = (m, inSheet) => {
      const group = Math.floor((m.order || 100) / 100);
      const sep = !inSheet && lastGroup !== null && group !== lastGroup ? '<div class="sep bottom"></div>' : '';
      if (!inSheet) lastGroup = group;
      return `${sep}<button data-id="${m.id}" class="${current && current.id === m.id ? 'active' : ''} ${isMain(m) ? 'pri' : 'sec'}"><span class="ico">${m.icon || '•'}</span><span class="lab">${esc(m.title)}</span><span class="lab-s">${esc(NAV_SHORT[m.id] || m.title)}</span></button>`;
    };
    const rest = modules.filter(m => !isMain(m));
    nav.innerHTML = `<div class="brand"><img src="icons/icon-192.png" alt="">Moje kolekcje</div>`
      + modules.map(m => btn(m)).join('')
      + (rest.length ? `<button class="more ${current && !isMain(current) ? 'active' : ''}" aria-label="Więcej"><span class="ico">☰</span><span class="lab-s">Więcej</span></button><div class="more-sheet">${rest.map(m => btn(m, true)).join('')}</div>` : '');
    nav.classList.remove('open');
    nav.querySelectorAll('button[data-id]').forEach(b => b.onclick = () => { nav.classList.remove('open'); App.go(b.dataset.id); });
    const more = nav.querySelector('.more');
    if (more) more.onclick = e => { e.stopPropagation(); nav.classList.toggle('open'); };
  }
  document.addEventListener('click', e => { const nav = document.getElementById('nav'); if (nav && nav.classList.contains('open') && !nav.contains(e.target)) nav.classList.remove('open'); });

  function parseHash() {
    const [id, q] = location.hash.replace(/^#\/?/, '').split('?');
    const params = Object.fromEntries(new URLSearchParams(q || ''));
    return { id, params };
  }

  async function route() {
    const { id, params } = parseHash();
    const m = modules.find(x => x.id === id) || modules[0];
    if (!m) return;
    current = m;
    renderNav();
    const main = document.getElementById('main');
    main.innerHTML = '';
    main.scrollTop = 0;
    try { await m.render(main, params, { db: DB, ui, go: App.go }); }
    catch (e) { console.error(e); main.innerHTML = `<p class="err">Błąd modułu ${esc(m.title)}: ${esc(e.message)}</p>`; }
  }

  const App = {
    ui,
    modules,
    registerModule(m) { modules.push(m); modules.sort((a, b) => (a.order || 100) - (b.order || 100)); if (App._started) renderNav(); },
    go(id, params) {
      const q = params ? '?' + new URLSearchParams(params).toString() : '';
      const h = '#/' + id + q;
      if (location.hash === h) route(); else location.hash = h;
    },
    refresh() { route(); },
    provide(name, fn) { services[name] = fn; },
    has(name) { return !!services[name]; },
    call(name, ...args) { if (!services[name]) { ui.toast('Ta funkcja jeszcze nie jest dostępna'); return; } return services[name](...args); },
    start() {
      App._started = true;
      window.addEventListener('hashchange', route);
      route();
      if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform())) navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  };
  window.App = App;
})();
